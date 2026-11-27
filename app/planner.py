"""تقویم محتوا: تعریف برنامه‌ی هفتگی (ستون‌های محتوا × فرمت‌ها × ریتم انتشار) و برنامه‌ی هر هفته.

چیدن برنامه (کدام فرمت چه روزی، کدام ستون در کدام خانه) در مرورگر انجام می‌شود (app/planner.js) تا با هر
تغییر تعریف، پیش‌نمایش همان لحظه عوض شود. این‌جا فقط ذخیره است، به‌علاوه‌ی:
- آمار روزها و ساعت‌های خوب از تحلیل اینستاگرام (data/instagram/dataset.json، اگر وصل باشد)،
- پیشنهاد موضوع برای خانه‌های یک هفته با Claude (هسته‌ی برند داخل پرامپت، بیرون از پوشه‌ی استودیو).

هر زبان یک پیج است (پیج فارسی، پیج انگلیسی)، هر کدام تعریف و هفته‌های خودش:
data/planner.json = {"v": 1, "plans": {"fa": {...}, "en": {...}}, "weeks": {"fa": {"YYYY-MM-DD": {...}}, "en": {...}}}
کلید هر هفته تاریخ روز اول آن هفته است.
"""
import json, re, subprocess, tempfile, threading, time
from datetime import date, timedelta
from pathlib import Path
import ai_models as am
import brand as bc
import knowledge as kn
import lang as lg
import settings as cfg

APP = Path(__file__).resolve().parent
ROOT = APP.parent
DATA = ROOT / "data"
FILE = DATA / "planner.json"
IDEAS_FILE = DATA / "ideas.json"
IG_DATASET = DATA / "instagram" / "dataset.json"
BRAND_MD = ROOT / "brand" / "brand-core.md"
STATIC = {"/planner.js": ("planner.js", "text/javascript; charset=utf-8"),
          "/planner.css": ("planner.css", "text/css; charset=utf-8")}
LOCK = threading.Lock()
JLOCK = threading.Lock()
JOB = {"state": "idle", "lang": "", "week": "", "step": "", "error": "", "count": 0}
WEEK_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
MAX_JSON = 400_000

DAY_NAMES = {"fa": ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه"],   # date.weekday(): دوشنبه = ۰
             "en": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]}
GOALS = {"fa": {"reach": "دیده‌شدن (مخاطب تازه)", "trust": "اعتماد و سیو", "engage": "گفت‌وگو و کامنت",
                "connect": "رابطه با دنبال‌کننده‌ها", "convert": "فروش و تبدیل"},
         "en": {"reach": "reach (new audience)", "trust": "trust and saves", "engage": "conversation and comments",
                "connect": "connection with followers", "convert": "conversion"}}
# اسم فرمت‌های آماده (planner.js: PL_FORMATS)؛ فرمت دلخواه اسم خودش را در تعریف دارد
FORMAT_NAMES = {"fa": {"reel": "ریلز", "carousel": "کاروسل", "post": "پست تک‌تصویر", "trial": "ریلز آزمایشی (Trial reel)",
                       "collab": "پست همکاری (Collab)", "story": "استوری", "live": "لایو", "broadcast": "کانال (Broadcast)"},
                "en": {"reel": "Reel", "carousel": "Carousel", "post": "Single image post", "trial": "Trial reel",
                       "collab": "Collab post", "story": "Stories", "live": "Live", "broadcast": "Broadcast channel"}}
CTAS = {"fa": {"send": "فرستادن برای یک دوست", "save": "سیو کردن", "comment": "کامنت گذاشتن", "reply": "جواب دادن به استوری",
               "follow": "فالو کردن", "offer": "دعوت به پیشنهاد/محصول"},
        "en": {"send": "send it to a friend", "save": "save it", "comment": "leave a comment", "reply": "reply to the story",
               "follow": "follow", "offer": "invite to the offer"}}


# ---------- فایل ----------
def load():
    try:
        d = json.loads(FILE.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _save(d):
    d["v"] = 1
    DATA.mkdir(exist_ok=True)
    tmp = FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(FILE)


def _small(obj):
    try:
        return len(json.dumps(obj, ensure_ascii=False)) < MAX_JSON
    except Exception:
        return False


def job_status():
    with JLOCK:
        return dict(JOB)


def busy(lang, week):
    j = job_status()
    return j["state"] == "running" and j["lang"] == lang and j["week"] == week


# ---------- آمار اینستاگرام ----------
def insights():
    """روزها و بازه‌های ساعتی که پست‌ها بهتر از میانه‌ی خودشان دیده شده‌اند. معیار: views_vs_median
    (بازدید هر پست تقسیم بر میانه‌ی همان فرمت در ۹۰ روز اخیر)، تا ریلز و پست با هم مقایسه‌پذیر باشند."""
    try:
        ds = json.loads(IG_DATASET.read_text(encoding="utf-8"))
    except Exception:
        return None
    posts = [p for p in ds.get("posts") or []
             if p.get("has_metrics") and isinstance(p.get("views_vs_median"), (int, float)) and p.get("weekday") is not None]
    if len(posts) < 6:
        return {"n": len(posts), "username": ds.get("username"), "days": [], "hours": []}

    def group(key):
        g = {}
        for p in posts:
            k = key(p)
            if k is not None:
                g.setdefault(k, []).append(p["views_vs_median"])
        return g

    days = [{"wd": (wd + 1) % 7, "n": len(v), "score": round(sum(v) / len(v), 2)}   # weekday پایتون ← getDay جاوااسکریپت
            for wd, v in group(lambda p: p["weekday"]).items() if len(v) >= 2]
    hours = [{"from": h, "to": h + 3, "n": len(v), "score": round(sum(v) / len(v), 2)}
             for h, v in group(lambda p: None if p.get("hour") is None else p["hour"] // 3 * 3).items() if len(v) >= 2]
    return {"n": len(posts), "username": ds.get("username"), "synced": ds.get("generated_at"),
            "days": sorted(days, key=lambda x: -x["score"]), "hours": sorted(hours, key=lambda x: -x["score"])}


# ---------- پیشنهاد موضوع با Claude ----------
SUGGEST_PROMPT = """تو استراتژیست محتوای اینستاگرام __OWNER__ هستی و برنامه‌ی محتوای یک هفته‌ی او را با هم می‌چینید.

هسته‌ی برند او این است. «خط قرمزها»، ادعاهای ممنوع و قواعد CTA قانون‌اند، نه سلیقه:
<<<BRAND
__BRAND__
BRAND>>>

پیج: __PAGE__

ایده‌هایی که همین حالا در بانک ایده دارد. اگر یکی به خانه‌ای می‌خورد، همان را با شناسه‌اش بیاور تا دوباره‌کاری نشود:
__IDEAS__

خانه‌های این هفته (شناسه · روز · فرمت · ستون محتوا · هدف · دعوت به اقدام):
__SLOTS__

کار: برای هر کدام از این خانه‌ها یک موضوع مشخص پیشنهاد بده.
- موضوع به ستون، فرمت و هدف همان خانه بخورد: ریلز برای دیده‌شدن پیش مخاطب تازه (هوکی که در سه ثانیه‌ی اول نگه دارد و ارزش فرستادن برای یک دوست را داشته باشد)، کاروسل برای عمق و سیو شدن، پست تک‌تصویر برای یک حرف روشن، استوری و کانال برای رابطه و گفت‌وگو با دنبال‌کننده‌های فعلی، لایو برای پرسش و پاسخ، و خانه‌ی «فروش» برای دعوت به پیشنهاد او، دقیقاً طبق قواعد CTA هسته‌ی برند.
- موضوع‌های هفته تکراری نباشند و با هم یک روایت بسازند: محتوای دیده‌شدن مخاطب تازه بیاورد، محتوای بعدی همان حرف را عمیق‌تر کند، و خانه‌ی فروش روی اعتمادی بنشیند که در همین هفته ساخته شده.
- فقط چیزی که با حرف، تجربه و تخصص خود او ساخته می‌شود؛ از طرف او ادعایی نساز. هیچ عدد، آمار یا نقل‌قولی نساز.
- topic: عنوان کاری کوتاه (حداکثر حدود ۱۲ کلمه). hook: جمله‌ی اولی که گفته یا نوشته می‌شود. angle: یک جمله که زاویه و حرف اصلی را می‌گوید. idea: شناسه‌ی ایده‌ی بانک اگر همان را پیشنهاد دادی، وگرنه null.
__LANG_RULE__

خروجی: فقط یک JSON معتبر بین یک خط <<<PLAN و یک خط PLAN>>>، بدون هیچ توضیح دیگری:
<<<PLAN
{"slots": [{"id": "...", "topic": "...", "hook": "...", "angle": "...", "idea": null}]}
PLAN>>>

هیچ سؤالی نپرس."""

LANG_RULE = {"fa": "- فارسی محاوره‌ای و با صدای خود او (بخش «صدا و لحن» هسته‌ی برند).",
             "en": "- topic، hook و angle را به انگلیسیِ طبیعی و بومی برای مخاطب انگلیسی‌زبان بنویس."}


def _ideas():
    try:
        v = json.loads(IDEAS_FILE.read_text(encoding="utf-8"))
        return v if isinstance(v, list) else []
    except Exception:
        return []


def _brand():
    try:
        return kn.brand_plus(BRAND_MD.read_text(encoding="utf-8")[:30000])   # + بانک تجربه، صدای مخاطب، یادگیری‌ها
    except Exception:
        return "(هسته‌ی برند هنوز ساخته نشده؛ با همین اطلاعات کار کن و کلی‌گویی نکن.)"


def _json_block(text):
    t = text or ""
    i = t.find("<<<PLAN")
    if i >= 0:
        j = t.find("PLAN>>>", i + 7)
        t = t[i + 7: j if j >= 0 else None]
    t = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", t.strip())
    for cand in (t, t[t.find("{"): t.rfind("}") + 1] if "{" in t else ""):
        try:
            v = json.loads(cand)
            if isinstance(v, dict):
                return v
        except Exception:
            pass
    return None


def _slot_lines(lang, start, plan, week, ids):
    fmts = {f.get("id"): f for f in plan.get("formats") or [] if isinstance(f, dict)}
    pils = {p.get("id"): p for p in plan.get("pillars") or [] if isinstance(p, dict)}
    d0 = date.fromisoformat(start)
    out = []
    for s in week.get("slots") or []:
        if s.get("id") not in ids:
            continue
        day = d0 + timedelta(days=int(s.get("day") or 0))
        f = fmts.get(s.get("format")) or {}
        p = pils.get(s.get("pillar")) or {}
        goal = GOALS[lang].get(s.get("goal"), s.get("goal") or "")
        cta = CTAS[lang].get(s.get("cta"), s.get("cta") or "")
        extra = (" · " + ("فروش" if lang == "fa" else "promo")) if s.get("promo") else ""
        series = f" · سری ثابت «{s['seriesName']}»" if s.get("seriesName") else ""
        out.append(f"- {s['id']} · {DAY_NAMES[lang][day.weekday()]} {day.isoformat()} · {f.get('name') or FORMAT_NAMES[lang].get(s.get('format'), s.get('format'))}"
                   f" · {p.get('name') or '—'} · {goal} · {cta}{extra}{series}")
    return "\n".join(out)


def run_suggest(lang, start, mode):
    try:
        d = load()
        plan = ((d.get("plans") or {}).get(lang)) or {}
        week = (((d.get("weeks") or {}).get(lang)) or {}).get(start) or {}
        slots = week.get("slots") or []
        ids = {s["id"] for s in slots if isinstance(s, dict) and s.get("id") and
               (mode == "all" and not s.get("locked") or mode != "all" and not s.get("topic") and not s.get("idea"))}
        if not ids:
            with JLOCK:
                JOB.update(state="error", error="خانه‌ی خالی‌ای برای پیشنهاد نیست." if lang == "fa" else "No empty slots to fill.")
            return
        ideas = [i for i in _ideas() if isinstance(i, dict) and i.get("status") != "done"
                 and ((i.get("lang") == "en") == (lang == "en"))][:40]
        idea_lines = "\n".join(f"- {i.get('id')} · {i.get('pillar') or '—'} · {str(i.get('title') or '')[:120]}" for i in ideas) or "(هیچ)"
        handle = cfg.handle_at()
        page = ("پیج فارسی" + (f" ({handle})" if handle else "")) if lang == "fa" else \
            "پیج انگلیسی‌زبان او (محتوا به انگلیسی، برای مخاطب انگلیسی‌زبان)"
        prompt = (SUGGEST_PROMPT.replace("__OWNER__", cfg.owner_line()).replace("__BRAND__", _brand())
                  .replace("__PAGE__", page).replace("__IDEAS__", idea_lines)
                  .replace("__SLOTS__", _slot_lines(lang, start, plan, week, ids)).replace("__LANG_RULE__", LANG_RULE[lang]))
        with JLOCK:
            JOB.update(step="Claude دارد موضوع‌ها را می‌چیند… (معمولاً کمتر از یک دقیقه)" if lang == "fa"
                       else "Claude is drafting topics… (usually under a minute)")
        # بیرون از پوشه‌ی استودیو و با --safe-mode: هسته‌ی برند داخل خود پرامپت است (مثل کاروسل)
        cmd = [cfg.claude_bin(), "-p", "--output-format", "json", "--model", am.get("planner"),
               "--no-session-persistence", "--safe-mode", "--tools", "", *lg.claude_args(lang)]
        r = subprocess.run(cmd, input=prompt, cwd=tempfile.gettempdir(), capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=900)
        try:
            res = (json.loads(r.stdout).get("result") or "").strip()
        except Exception:
            res = ""
        data = _json_block(res) if res else None
        got = {str(x.get("id")): x for x in (data or {}).get("slots") or [] if isinstance(x, dict)}
        if r.returncode != 0 or not got:
            with JLOCK:
                JOB.update(state="error", error=("پیشنهاد ناتمام ماند. " if lang == "fa" else "Suggestion did not finish. ")
                           + (r.stderr or "")[-200:])
            return
        known = {i.get("id") for i in _ideas() if isinstance(i, dict)}
        n = 0
        with LOCK:   # روی آخرین نسخه‌ی روی دیسک؛ صفحه در این مدت این هفته را ذخیره نمی‌کند (busy)
            d = load()
            week = (((d.get("weeks") or {}).get(lang)) or {}).get(start)
            for s in (week or {}).get("slots") or []:
                x = got.get(s.get("id"))
                if not x or s.get("id") not in ids:
                    continue
                for k in ("topic", "hook", "angle"):
                    if isinstance(x.get(k), str) and x[k].strip():
                        s[k] = x[k].strip()[:600]
                if x.get("idea") in known and not s.get("idea"):
                    s["idea"] = x["idea"]
                s["ai"] = True
                n += 1
            if week is not None:
                week["updated"] = time.strftime("%Y-%m-%d %H:%M")
                _save(d)
        with JLOCK:
            JOB.update(state="done", step="", count=n)
    except subprocess.TimeoutExpired:
        with JLOCK:
            JOB.update(state="error", error="زمان تمام شد." if lang == "fa" else "Timed out.")
    except Exception as e:
        with JLOCK:
            JOB.update(state="error", error=f"خطا: {e}")


# ---------- افزودن از بیرون (آبشار محتوا) ----------
# هدف و دعوت به اقدامِ پیش‌فرض هر فرمت؛ همان PL_FORMATS و PL_GOALS در planner.js
FMT_DEFAULT = {"reel": ("reach", "send", "18:00"), "carousel": ("trust", "save", "15:00"),
               "post": ("engage", "comment", "12:00"), "story": ("connect", "reply", "10:00")}


def add_slot(lang, date_iso, fmt, topic, hook, angle, idea, note=""):
    """یک خانه‌ی قفل‌شده در هفته‌ای که date_iso در آن است. بازچینی هفته خانه‌های قفل‌شده را نگه می‌دارد.
    هفته از روز اول برنامه‌ی همان پیج شروع می‌شود (rhythm.weekStart، شماره‌گذاری getDay جاوااسکریپت)."""
    if lang not in lg.LANGS or fmt not in FMT_DEFAULT:
        return 400, {"error": "bad format"}
    try:
        day = date.fromisoformat(date_iso)
    except ValueError:
        return 400, {"error": "تاریخ نامعتبر"}
    with LOCK:
        d = load()
        plan = (d.get("plans") or {}).get(lang) or {}
        ws = ((plan.get("rhythm") or {}).get("weekStart"))
        ws = ws if isinstance(ws, int) and 0 <= ws <= 6 else (1 if lang == "en" else 6)
        js = (day.weekday() + 1) % 7                      # getDay: یکشنبه = ۰
        start = day - timedelta(days=(js - ws + 7) % 7)
        key = start.isoformat()
        if busy(lang, key):
            return 409, {"error": "Claude همین حالا دارد این هفته را پر می‌کند؛ چند ثانیه بعد دوباره بزن."}
        week = d.setdefault("weeks", {}).setdefault(lang, {}).setdefault(key, {"slots": []})
        goal, cta, tm = FMT_DEFAULT[fmt]
        sid = "s" + str(int(time.time() * 1000))[-9:]
        week.setdefault("slots", []).append({
            "id": sid, "day": (day - start).days, "format": fmt, "pillar": None, "goal": goal, "cta": cta, "time": tm,
            "status": "plan", "topic": (topic or "")[:600], "hook": (hook or "")[:600], "angle": (angle or "")[:600],
            "idea": idea or None, "locked": True, "note": note[:200]})
        week["updated"] = time.strftime("%Y-%m-%d %H:%M")
        _save(d)
    return 200, {"ok": True, "week": key, "slot": sid}


# ---------- مسیرها ----------
def handle_get(p, q):
    """(code, payload, ctype) — ctype=None یعنی payload جیسون است."""
    if p in STATIC:
        name, ctype = STATIC[p]
        return 200, (APP / name).read_bytes(), ctype
    if p == "/api/planner":
        d = load()
        return 200, {"plans": d.get("plans") or {}, "weeks": d.get("weeks") or {}, "pillars": bc.pillar_names(),
                     "lang": lg.current(), "job": job_status(), "insights": insights(),
                     "today": date.today().isoformat()}, None
    if p == "/api/planner/job":
        return 200, job_status(), None
    return None


def handle_post(p, body):
    lang = body.get("lang")
    if not p.startswith("/api/planner"):
        return None
    if lang not in lg.LANGS:
        return 400, {"error": "bad lang"}
    if p == "/api/planner/plan":
        plan = body.get("plan")
        if not isinstance(plan, dict) or not _small(plan):
            return 400, {"error": "bad plan"}
        with LOCK:
            d = load()
            plan["updated"] = time.strftime("%Y-%m-%d %H:%M")
            d.setdefault("plans", {})[lang] = plan
            _save(d)
        return 200, {"ok": True, "updated": plan["updated"]}
    if p == "/api/planner/week":
        start, week = str(body.get("start") or ""), body.get("week")
        if not WEEK_RE.fullmatch(start) or (week is not None and (not isinstance(week, dict) or not _small(week))):
            return 400, {"error": "bad week"}
        if busy(lang, start):
            return 409, {"error": "Claude همین حالا دارد این هفته را پر می‌کند؛ چند ثانیه صبر کن." if lang == "fa"
                         else "Claude is filling this week right now; wait a few seconds."}
        with LOCK:
            d = load()
            weeks = d.setdefault("weeks", {}).setdefault(lang, {})
            if week is None:
                weeks.pop(start, None)
            else:
                week["updated"] = time.strftime("%Y-%m-%d %H:%M")
                weeks[start] = week
            _save(d)
        return 200, {"ok": True}
    if p == "/api/planner/suggest":
        start, mode = str(body.get("start") or ""), "all" if body.get("mode") == "all" else "empty"
        if not WEEK_RE.fullmatch(start):
            return 400, {"error": "bad week"}
        with JLOCK:
            if JOB["state"] == "running":
                return 409, {"error": "یک پیشنهاد در حال ساخت است." if lang == "fa" else "A suggestion is already running."}
            JOB.update(state="running", lang=lang, week=start, step="", error="", count=0)
        threading.Thread(target=run_suggest, args=(lang, start, mode), daemon=True).start()
        return 200, {"ok": True}
    return 404, {"error": "not found"}
