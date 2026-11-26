"""بانک تجربه: داستان‌ها، نظرها، اشتباه‌ها، نتیجه‌ی مشتری‌ها و اتفاق‌های این روزهای صاحب استودیو.

هسته‌ی برند می‌گوید او کیست؛ این‌جا ماده‌ی خامی است که محتوا را «مال خودش» می‌کند (قانون CLAUDE.md:
محتوا با حرف و تجربه‌ی خود صاحب پیج ساخته می‌شود). دو راه ورود:
- دستی: یک تجربه را با فرم ثبت کن.
- مرور ماهانه: به چند سؤال با ویس (یا متن) جواب بده؛ Claude تکه‌های قابل استفاده را جدا و دسته‌بندی می‌کند،
  و تو انتخاب می‌کنی کدام‌ها به بانک بروند. Claude فقط جدا می‌کند و چیزی اضافه نمی‌کند.

data/experience.json = {"v": 1, "items": [...], "draft": {"text": "", "proposals": [...]}, "ritual_at": "YYYY-MM-DD"}
هر ذخیره، brand/experience.md را از نو می‌سازد (knowledge.py آن را کنار هسته‌ی برند به همه‌ی پرامپت‌ها می‌رساند).
"""
import base64, json, re, subprocess, tempfile, threading, time
from pathlib import Path
import ai_models as am
import brand as bc
import lang as lg
import settings as cfg
import voice

APP = Path(__file__).resolve().parent
ROOT = APP.parent
DATA = ROOT / "data"
FILE = DATA / "experience.json"
MD = ROOT / "brand" / "experience.md"
IDEAS = DATA / "ideas"
STATIC = {"/experience.js": ("experience.js", "text/javascript; charset=utf-8"),
          "/experience.css": ("experience.css", "text/css; charset=utf-8"),
          "/recorder.js": ("recorder.js", "text/javascript; charset=utf-8")}
LOCK = threading.Lock()
JLOCK = threading.Lock()
JOB = {"state": "idle", "kind": "", "step": "", "error": ""}

KINDS = {
    "story":   {"label": "داستان و تجربه",   "hint": "اتفاقی که برای خودت افتاد؛ صحنه، آدم‌ها، حس، نتیجه"},
    "opinion": {"label": "نظر و زاویه‌ی دید", "hint": "چیزی که باور داری و خیلی‌ها قبول ندارند، با دلیلش"},
    "lesson":  {"label": "اشتباه و درس",      "hint": "جایی که اشتباه کردی و چیزی که از آن یاد گرفتی"},
    "win":     {"label": "نتیجه‌ی مشتری",     "hint": "مشتری یا شاگردی که به نتیجه رسید: قبل، بعد، و چه کرد"},
    "now":     {"label": "این روزها",         "hint": "روی چه کاری هستی، چه می‌خوانی، چه می‌سازی؛ زود کهنه می‌شود"},
}
CONSENT = {"ask": "هنوز اجازه نگرفته‌ام", "anon": "فقط بدون اسم", "named": "با اسم مجاز است"}
RITUAL = [
    "این ماه چه اتفاقی برایت افتاد که هنوز به آن فکر می‌کنی؟",
    "با کدام حرف رایج در حوزه‌ات مخالفی، و چرا؟",
    "چه اشتباهی کردی و چه یاد گرفتی؟",
    "کدام مشتری یا شاگردت به نتیجه رسید؟ قبل و بعدش چه بود؟",
    "این روزها روی چه کاری هستی؟ چه می‌خوانی، چه می‌سازی؟",
]
FIELDS = ("kind", "title", "text", "when", "pillar", "who", "consent")
MAX_TEXT = 6000
AUDIO_EXT = (".m4a", ".mp3", ".wav", ".mp4", ".mov", ".aac", ".ogg", ".opus", ".webm", ".flac")


# ---------- فایل ----------
def load():
    try:
        d = json.loads(FILE.read_text(encoding="utf-8"))
        if isinstance(d, dict):
            d.setdefault("items", [])
            d.setdefault("draft", {})
            return d
    except Exception:
        pass
    return {"v": 1, "items": [], "draft": {}}


def _save(d):
    d["v"] = 1
    DATA.mkdir(exist_ok=True)
    tmp = FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(FILE)
    _write_md(d)


def _clean(x, old=None):
    """فیلدهای مجاز یک تجربه، کوتاه‌شده. old = نسخه‌ی قبلی برای ویرایش."""
    it = dict(old or {})
    for k in FIELDS:
        if isinstance(x.get(k), str):
            it[k] = x[k].strip()[:MAX_TEXT if k == "text" else 300]
    if it.get("kind") not in KINDS:
        it["kind"] = "story"
    if it["kind"] == "win":
        if it.get("consent") not in CONSENT:
            it["consent"] = "ask"
    else:
        it.pop("who", None); it.pop("consent", None)
    if not it.get("title"):
        it["title"] = (it.get("text") or "").split("\n")[0][:70]
    return it


# ---------- brand/experience.md ----------
MD_HEAD = """# بانک تجربه

> این فایل خودکار از تب «بانک تجربه» در Content Studio ساخته می‌شود؛ دستی ویرایشش نکن.

**قانون ایجنت‌ها:** این‌ها تجربه‌ها، نظرها و اتفاق‌های واقعیِ خود صاحب پیج‌اند، با کلمه‌های خودش. وقتی محتوا
به مثال، داستان یا اثبات نیاز دارد، اول از همین‌جا بردار و بگو از کدام تکه (شناسه‌ی داخل کروشه) استفاده کردی.
جزئیاتی که این‌جا نیامده (اسم، عدد، زمان، نتیجه) را به آن‌ها اضافه نکن و تجربه‌ای از طرف او نساز.
«نتیجه‌ی مشتری»: «فقط بدون اسم» یعنی هیچ اسم یا جزئیات شناسایی‌کننده‌ای نیاید؛ «هنوز اجازه نگرفته‌ام» یعنی
اصلاً در محتوای منتشرشدنی نیاید تا اجازه گرفته شود. «این روزها» زود کهنه می‌شود؛ تاریخش را ببین.
"""


def _write_md(d):
    items = [i for i in d.get("items") or [] if isinstance(i, dict)]
    out = [MD_HEAD]
    budget = 8000
    for k, meta in KINDS.items():
        rows = [i for i in items if i.get("kind") == k]
        if not rows:
            continue
        out += [f"## {meta['label']}", ""]
        for i in rows:            # جدیدترین اول (ترتیب فهرست)
            bits = [f"[{i.get('id')}]", f"**{i.get('title') or ''}**"]
            if i.get("when"):
                bits.append(f"({i['when']})")
            if i.get("pillar"):
                bits.append(f"· پیلر: {i['pillar']}")
            if k == "win":
                bits.append(f"· {i.get('who') or 'مشتری'} · اجازه: {CONSENT.get(i.get('consent'), CONSENT['ask'])}")
            line = " ".join(bits) + "\n  " + re.sub(r"\s*\n\s*", " ", (i.get("text") or "").strip())[:1200]
            if budget - len(line) < 0:
                out.append("- (بقیه به خاطر طول متن نیامده؛ در تب «بانک تجربه» هست.)")
                break
            budget -= len(line)
            out.append("- " + line)
        out.append("")
    MD.parent.mkdir(exist_ok=True)
    if len(out) == 1:            # بانک خالی: فایلی که فقط قانون دارد به پرامپت‌ها نمی‌رود
        if MD.exists():
            MD.unlink()
        return
    tmp = MD.with_suffix(".md.tmp")
    tmp.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")
    tmp.replace(MD)


# ---------- کار پس‌زمینه: رونویسی و جدا کردن ----------
def job():
    with JLOCK:
        return dict(JOB)


def _jset(**kw):
    with JLOCK:
        JOB.update(kw)


def _start(kind, target, *args):
    with JLOCK:
        if JOB["state"] == "running":
            return False
        JOB.update(state="running", kind=kind, step="", error="")
    threading.Thread(target=target, args=args, daemon=True).start()
    return True


def run_transcribe(path):
    try:
        _jset(step="در حال رونویسی صدا با Gemini…")
        text = voice.transcribe_long(path, progress=lambda n, t: _jset(step=f"رونویسی تکه‌ی {fa(n)} از {fa(t)}…")).strip()
        if not text:
            return _jset(state="error", error="متنی برنگشت؛ شاید صدا ساکت بوده.")
        with LOCK:
            d = load()
            old = (d["draft"].get("text") or "").strip()
            d["draft"]["text"] = (old + "\n\n" + text).strip() if old else text
            _save(d)
        _jset(state="done", step="")
    except RuntimeError as e:
        _jset(state="error", error=str(e)[:300])
    except Exception as e:
        _jset(state="error", error=f"خطا: {e}")
    finally:
        try:
            Path(path).unlink()
        except OSError:
            pass


EXTRACT_PROMPT = """تو دستیار «بانک تجربه»ی __OWNER__ هستی. متن زیر حرف‌های خود اوست، معمولاً رونویسی ویسی که در
جواب به این سؤال‌ها ضبط کرده (محاوره‌ای، با تکرار و مکث):
__RITUAL__

کارت فقط این است: تکه‌هایی را که به درد محتوا می‌خورند جدا و دسته‌بندی کنی. چیزی نمی‌نویسی که او نگفته.

دسته‌ها (kind):
- story: اتفاقی که برای خودش افتاده
- opinion: نظری که دارد، مخصوصاً خلاف جریان، با دلیلی که خودش گفته
- lesson: اشتباهی که کرده و درسی که گرفته
- win: نتیجه‌ای که یک مشتری یا شاگرد گرفته
- now: کاری که این روزها رویش است، چیزی که می‌خواند یا می‌سازد

قواعد:
- هیچ جزئیاتی، عددی، اسمی، زمانی یا نتیجه‌ای اضافه نکن که در متن نیست. اگر چیزی مبهم است، مبهم بماند.
- text: با کلمه‌ها و لحن خودش، فقط مرتب‌شده (تکرار، مکث و «اِ…» حذف). معنی عوض نشود. حداکثر حدود ۱۲۰ کلمه.
- title: عنوان کاری کوتاه (حداکثر ۱۰ کلمه).
- when: اگر زمانش را گفته، همان؛ وگرنه "".
- pillar: یکی از این پیلرها اگر روشن است که به آن می‌خورد، وگرنه "": __PILLARS__
- win: who = توصیف بدون اسم (مثلاً «یکی از شاگردهای دوره»). اسم آدم‌ها را هرگز ننویس، حتی اگر گفته.
- هر حرف مستقل یک تکه است؛ دو داستان را یکی نکن. تکه‌ای که به درد محتوا نمی‌خورد (سلام، حرف‌های فنی ضبط) را کنار بگذار.
- زبان هر تکه همان زبانی است که گفته شده؛ ترجمه نکن.

متن:
<<<TEXT
__TEXT__
TEXT>>>

خروجی: فقط یک JSON معتبر بین یک خط <<<XP و یک خط XP>>>، بدون هیچ توضیح دیگری:
<<<XP
{"items": [{"kind": "story", "title": "...", "text": "...", "when": "", "pillar": "", "who": ""}]}
XP>>>

هیچ سؤالی نپرس."""


def _json_block(text, tag):
    t = text or ""
    i = t.find("<<<" + tag)
    if i >= 0:
        j = t.find(tag + ">>>", i + 3 + len(tag))
        t = t[i + 3 + len(tag): j if j >= 0 else None]
    t = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", t.strip())
    for cand in (t, t[t.find("{"): t.rfind("}") + 1] if "{" in t else ""):
        try:
            v = json.loads(cand)
            if isinstance(v, dict):
                return v
        except Exception:
            pass
    return None


def claude_json(prompt, step, tag, timeout=900):
    """یک فراخوانی claude بیرون از پوشه‌ی استودیو، بدون ابزار؛ (dict یا None, پیام خطا).
    مثل کاروسل و تقویم: هسته‌ی برند (اگر لازم است) داخل خود پرامپت است."""
    cmd = [cfg.claude_bin(), "-p", "--output-format", "json", "--model", am.get(step),
           "--no-session-persistence", "--safe-mode", "--tools", ""]
    r = subprocess.run(cmd, input=prompt, cwd=tempfile.gettempdir(), capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=timeout)
    try:
        res = (json.loads(r.stdout).get("result") or "").strip()
    except Exception:
        res = ""
    data = _json_block(res, tag) if res else None
    if r.returncode != 0 or data is None:
        return None, (r.stderr or r.stdout or "")[-200:]
    return data, ""


def run_extract(text):
    try:
        _jset(step="Claude دارد تکه‌ها را جدا می‌کند… (معمولاً کمتر از یک دقیقه)")
        prompt = (EXTRACT_PROMPT.replace("__OWNER__", cfg.owner_line())
                  .replace("__RITUAL__", "\n".join(f"- {q}" for q in RITUAL))
                  .replace("__PILLARS__", "، ".join(bc.pillar_names()))
                  .replace("__TEXT__", text[:60000]))
        data, err = claude_json(prompt, "experience", "XP")
        got = [_clean(x) for x in (data or {}).get("items") or [] if isinstance(x, dict) and str(x.get("text") or "").strip()]
        if data is None:
            return _jset(state="error", error="جدا کردن ناتمام ماند. " + err)
        if not got:
            return _jset(state="error", error="تکه‌ی قابل استفاده‌ای در این متن پیدا نشد.")
        with LOCK:
            d = load()
            for n, x in enumerate(got):
                x["pid"] = f"p{int(time.time() * 1000)}{n}"
            d["draft"]["proposals"] = got
            _save(d)
        _jset(state="done", step="")
    except subprocess.TimeoutExpired:
        _jset(state="error", error="زمان تمام شد.")
    except Exception as e:
        _jset(state="error", error=f"خطا: {e}")


# ---------- ایده ----------
def to_idea(xid):
    with LOCK:
        d = load()
        it = next((i for i in d["items"] if i.get("id") == xid), None)
        if not it:
            return 404, {"error": "این تجربه پیدا نشد."}
        if it.get("kind") == "win" and it.get("consent", "ask") == "ask":
            note = "اجازه‌ی این مشتری هنوز گرفته نشده؛ تا اجازه نگیری منتشرش نکن."
        else:
            note = "از بانک تجربه"
        iid = f"i{int(time.time() * 1000)}"
        lines = ["# ایده از بانک تجربه", "", f"- **نوع:** {KINDS[it['kind']]['label']}"]
        if it.get("when"):
            lines.append(f"- **زمان:** {it['when']}")
        if it.get("kind") == "win":
            lines += [f"- **چه کسی:** {it.get('who') or 'مشتری'}",
                      f"- **اجازه‌ی انتشار:** {CONSENT.get(it.get('consent'), CONSENT['ask'])}"]
        lines += [f"- **شناسه در بانک تجربه:** {xid}", "", "## حرف خود من", "", it.get("text") or "", "",
                  "> این تجربه‌ی واقعی خود من است. ریلز را دور همین بساز و جزئیاتی به آن اضافه نکن."]
        (IDEAS / iid).mkdir(parents=True, exist_ok=True)
        (IDEAS / iid / "raw.md").write_text("\n".join(lines), encoding="utf-8")
        rec = {"id": iid, "title": it.get("title") or "تجربه", "pillar": it.get("pillar") if it.get("pillar") in bc.pillar_names() else "",
               "status": "idea", "score": None, "source": {"kind": "experience", "ref": xid}, "note": note,
               **({"lang": "en"} if lg.current() == "en" else {}),
               "created": time.strftime("%Y-%m-%d"), "steps": {}}
        with cfg.IDEAS_LOCK:
            f = DATA / "ideas.json"
            try:
                ideas = json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                ideas = []
            f.write_text(json.dumps([rec] + ideas, ensure_ascii=False, indent=2), encoding="utf-8")
        it.setdefault("used", []).append(iid)
        _save(d)
    return 200, {"ok": True, "id": iid}


def fa(n):
    return str(n).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def save_upload(body, prefix):
    """فایل صوتیِ base64 از مرورگر ← فایل موقت. (Path یا None, خطا)."""
    name = str(body.get("filename") or "voice.webm")
    ext = Path(name).suffix.lower()
    if ext not in AUDIO_EXT:
        return None, "فقط فایل صوتی یا ویدیویی قبول می‌شود."
    try:
        blob = base64.b64decode(str(body.get("data") or "").split(",")[-1])
    except Exception:
        return None, "فایل خوانده نشد."
    if len(blob) < 1000:
        return None, "صدا خالی است."
    fd, tmp = tempfile.mkstemp(prefix=prefix, suffix=ext)
    with open(fd, "wb") as fh:
        fh.write(blob)
    return Path(tmp), ""


# ---------- مسیرها ----------
def payload():
    d = load()
    return {"items": d["items"], "draft": d["draft"], "ritual_at": d.get("ritual_at") or "",
            "kinds": KINDS, "consent": CONSENT, "ritual": RITUAL, "pillars": bc.pillar_names(),
            "job": job(), "gemini": bool(cfg.gemini_key()), "today": time.strftime("%Y-%m-%d")}


def handle_get(p, q):
    """(code, payload, ctype) — ctype=None یعنی payload جیسون است."""
    if p in STATIC:
        name, ctype = STATIC[p]
        return 200, (APP / name).read_bytes(), ctype
    if p == "/api/experience":
        return 200, payload(), None
    if p == "/api/experience/job":
        return 200, job(), None
    return None


def handle_post(p, body):
    if not p.startswith("/api/experience"):
        return None
    if p == "/api/experience/item":
        x = body.get("item")
        if not isinstance(x, dict) or not str(x.get("text") or "").strip():
            return 400, {"error": "متن تجربه خالی است."}
        with LOCK:
            d = load()
            xid = str(x.get("id") or "")
            old = next((i for i in d["items"] if i.get("id") == xid), None) if xid else None
            if xid and not old:
                return 404, {"error": "این تجربه پیدا نشد."}
            it = _clean(x, old)
            it["updated"] = time.strftime("%Y-%m-%d")
            if not old:
                it.update(id=f"x{int(time.time() * 1000)}", created=it["updated"], source=x.get("source") if x.get("source") in ("manual", "ritual") else "manual")
                d["items"].insert(0, it)
            else:
                old.clear(); old.update(it)
            _save(d)
        return 200, {"ok": True, "item": it}
    if p == "/api/experience/delete":
        with LOCK:
            d = load()
            n = len(d["items"])
            d["items"] = [i for i in d["items"] if i.get("id") != body.get("id")]
            if len(d["items"]) == n:
                return 404, {"error": "پیدا نشد"}
            _save(d)
        return 200, {"ok": True}
    if p == "/api/experience/to-idea":
        return to_idea(str(body.get("id") or ""))
    if p == "/api/experience/draft":
        t = body.get("text")
        if not isinstance(t, str) or len(t) > 200_000:
            return 400, {"error": "bad text"}
        with LOCK:
            d = load()
            d["draft"]["text"] = t
            _save(d)
        return 200, {"ok": True}
    if p == "/api/experience/proposal/drop":
        with LOCK:
            d = load()
            d["draft"]["proposals"] = [x for x in d["draft"].get("proposals") or [] if x.get("pid") != body.get("pid")]
            _save(d)
        return 200, {"ok": True}
    if p == "/api/experience/accept":
        xs = body.get("items")
        if not isinstance(xs, list) or not xs:
            return 400, {"error": "چیزی انتخاب نشده."}
        with LOCK:
            d = load()
            now = time.strftime("%Y-%m-%d")
            added = []
            for n, x in enumerate(xs):
                if isinstance(x, dict) and str(x.get("text") or "").strip():
                    it = _clean(x)
                    it.pop("pid", None)
                    it.update(id=f"x{int(time.time() * 1000)}{n}", created=now, updated=now, source="ritual")
                    added.append(it)
            d["items"] = added + d["items"]
            taken = {x.get("pid") for x in xs if isinstance(x, dict)}
            d["draft"]["proposals"] = [x for x in d["draft"].get("proposals") or [] if x.get("pid") not in taken]
            if not d["draft"]["proposals"] and body.get("clear"):
                d["draft"]["text"] = ""
            d["ritual_at"] = now
            _save(d)
        return 200, {"ok": True, "added": len(added)}
    if p == "/api/experience/transcribe":
        if not cfg.gemini_key():
            return 400, {"error": "رونویسی صدا کلید Gemini می‌خواهد؛ از تب «تنظیمات» واردش کن."}
        path, err = save_upload(body, "xp-")
        if not path:
            return 400, {"error": err}
        if not _start("transcribe", run_transcribe, str(path)):
            path.unlink(missing_ok=True)
            return 409, {"error": "یک کار دیگر در حال اجراست."}
        return 200, {"ok": True}
    if p == "/api/experience/extract":
        t = str(body.get("text") or "").strip()
        if len(t) < 40:
            return 400, {"error": "متن خیلی کوتاه است؛ کمی بیشتر بگو یا بنویس."}
        with LOCK:
            d = load()
            d["draft"]["text"] = t
            _save(d)
        if not _start("extract", run_extract, t):
            return 409, {"error": "یک کار دیگر در حال اجراست."}
        return 200, {"ok": True}
    return 404, {"error": "not found"}
