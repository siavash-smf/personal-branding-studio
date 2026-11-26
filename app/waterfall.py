"""آبشار محتوا: یک ایده (یا یک ضبط بلند که در بانک ایده رونویسی شده) ← یک بسته‌ی هماهنگ برای همه‌ی پلتفرم‌ها.

ریلز با چند زاویه، کاروسل، استوری، پست تک‌تصویر، لینکدین، X، طرح ویدیوی یوتیوب و خبرنامه، همه از همان حرف و همان
تجربه، هر کدام به زبان پلتفرم خودش. هر قطعه در ویرایشگر خودش باز می‌شود (کاروسل ← تب کاروسل، استوری ← تب استوری،
ریلز ← تله‌پرامپتر) و قطعه‌های اینستاگرامی با یک دکمه در هفته‌ی تقویم محتوا می‌نشینند.

data/ideas/<id>/waterfall.json = {"lang", "created", "updated", "assets": [{"aid", "type", "data", "date", "done", "deck", "slot"}]}
data/waterfall.json             = {"types": {...}}  آخرین انتخاب کاربر برای بسته‌ی بعدی
"""
import json, re, secrets, threading, time
from pathlib import Path
import ai_models as am
import brand as bc
import carousel as cr
import experience as xp
import knowledge as kn
import lang as lg
import planner as pl
import settings as cfg

APP = Path(__file__).resolve().parent
ROOT = APP.parent
DATA = ROOT / "data"
IDEAS = DATA / "ideas"
PREFS = DATA / "waterfall.json"
STATIC = {"/waterfall.js": ("waterfall.js", "text/javascript; charset=utf-8"),
          "/waterfall.css": ("waterfall.css", "text/css; charset=utf-8")}
LOCK = threading.Lock()
JLOCK = threading.Lock()
JOB = {"state": "idle", "id": "", "step": "", "error": ""}

# n: چند تا (فقط ریلز)؛ ig: قالب تقویم محتوا اگر اینستاگرامی است
TYPES = {
    "reels":      {"label": "ریلز",            "platform": "Instagram", "ig": "reel",     "max": 5,
                   "shape": '[{"title": "...", "hook": "...", "script": "...", "onscreen": "...", "caption": "...", "hashtags": "..."}]',
                   "rule": "ریلز ۳۰ تا ۴۵ ثانیه‌ای، هر کدام با زاویه‌ی جدا از همین ایده (نه تکرار هم و نه تکرار ریلزی که قبلاً ساخته شده). hook: جمله‌ی سه ثانیه‌ی اول؛ script: متن کامل گفتاری برای ضبط؛ onscreen: متن کوتاه روی تصویر؛ caption: کپشن با خط اول قوی؛ hashtags: ۳ تا ۵ هشتگ مرتبط."},
    "carousel":   {"label": "کاروسل",          "platform": "Instagram", "ig": "carousel",
                   "shape": '{"title": "...", "slides": [{"title": "...", "body": "..."}], "caption": "...", "hashtags": "..."}',
                   "rule": "۶ تا ۹ اسلاید: اسلاید اول قلاب (فقط title کوتاه)، وسط هر اسلاید یک حرف، اسلاید آخر جمع‌بندی و دعوت به اقدام طبق قواعد CTA. body هر اسلاید حداکثر حدود ۳۵ کلمه؛ کلمه‌ی کلیدی را با **…** تأکید کن."},
    "stories":    {"label": "استوری",          "platform": "Instagram", "ig": "story",
                   "shape": '{"frames": ["...", "..."], "sticker": "..."}',
                   "rule": "۳ تا ۵ فریم پشت سر هم برای دنبال‌کننده‌های فعلی؛ هر فریم حداکثر حدود ۲۵ کلمه، صمیمی و با صدای خود او. یک کلمه یا عبارت هر فریم را با **…** تأکید کن. sticker: یک استیکر تعاملی (نظرسنجی یا سؤال) با متن دقیقش."},
    "post":       {"label": "پست تک‌تصویر",    "platform": "Instagram", "ig": "post",
                   "shape": '{"image_text": "...", "caption": "...", "hashtags": "..."}',
                   "rule": "image_text: یک جمله‌ی روشن و به‌یادماندنی از همین ایده برای روی تصویر (حداکثر ۲۰ کلمه)؛ caption: توضیح و دعوت به گفت‌وگو."},
    "linkedin":   {"label": "لینکدین",         "platform": "LinkedIn",
                   "shape": '{"text": "..."}',
                   "rule": "پست متنی لینکدین، حدود ۱۲۰۰ تا ۱۸۰۰ حرف: دو خط اول قبل از «بیشتر» باید نگه دارد، پاراگراف‌های یک‌تا‌دوخطی، لحن حرفه‌ای‌تر از اینستاگرام ولی همان صدای خود او، تجربه یا درس مشخص، یک سؤال آخر برای گفت‌وگو، حداکثر ۳ هشتگ آخر متن."},
    "x":          {"label": "X (توییتر)",      "platform": "X",
                   "shape": '{"posts": ["...", "..."]}',
                   "rule": "یک رشته (thread) ۴ تا ۷ پستی؛ هر پست حداکثر ۲۷۰ حرف و مستقل خواندنی. پست اول قلاب است و بدون «🧵» و شماره. بدون هشتگ."},
    "youtube":    {"label": "یوتیوب",          "platform": "YouTube",
                   "shape": '{"titles": ["...", "...", "..."], "thumbnail": "...", "hook": "...", "chapters": [{"title": "...", "points": ["..."]}], "cta": "...", "description": "..."}',
                   "rule": "طرح یک ویدیوی ۸ تا ۱۲ دقیقه‌ای (نه متن کامل): سه عنوان پیشنهادی، متن کوتاه تامبنیل (حداکثر ۴ کلمه)، hook سی ثانیه‌ی اول به‌صورت متن گفتاری، ۴ تا ۶ فصل با نکته‌های گفتنی، دعوت به اقدام، و توضیحات ویدیو."},
    "newsletter": {"label": "خبرنامه",         "platform": "Newsletter",
                   "shape": '{"subjects": ["...", "...", "..."], "preheader": "...", "body": "..."}',
                   "rule": "یک نامه‌ی شخصی ۴۰۰ تا ۷۰۰ کلمه‌ای به مشترک‌ها: سه پیشنهاد عنوان ایمیل، preheader، و body به Markdown؛ یک حرف اصلی، یک داستان یا تجربه، یک کار عملی، و یک دعوت به اقدام."},
}
DEFAULT_TYPES = {"reels": 3, "carousel": 1, "stories": 1, "post": 0, "linkedin": 1, "x": 1, "youtube": 0, "newsletter": 1}


# ---------- فایل ----------
def _safe(iid):
    return isinstance(iid, str) and re.fullmatch(r"i\d{10,20}", iid) is not None


def wpath(iid):
    return IDEAS / iid / "waterfall.json"


def load(iid):
    try:
        d = json.loads(wpath(iid).read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else None
    except Exception:
        return None


def _save(iid, d):
    d["updated"] = time.strftime("%Y-%m-%d %H:%M")
    tmp = wpath(iid).with_suffix(".json.tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(wpath(iid))


def prefs():
    try:
        t = json.loads(PREFS.read_text(encoding="utf-8")).get("types")
        if isinstance(t, dict):
            return {k: _count(k, t.get(k, DEFAULT_TYPES[k])) for k in TYPES}
    except Exception:
        pass
    return dict(DEFAULT_TYPES)


def _count(k, v):
    try:
        v = int(v)
    except Exception:
        v = 0
    return max(0, min(v, TYPES[k].get("max", 1)))


def idea(iid):
    try:
        ideas = json.loads((DATA / "ideas.json").read_text(encoding="utf-8"))
    except Exception:
        ideas = []
    return next((i for i in ideas if isinstance(i, dict) and i.get("id") == iid), None)


def all_waterfalls():
    """برای «مرور ماهانه»: همه‌ی بسته‌ها با شناسه‌ی ایده."""
    out = []
    if IDEAS.is_dir():
        for f in IDEAS.glob("*/waterfall.json"):
            d = load(f.parent.name)
            if d:
                out.append((f.parent.name, d))
    return out


# ---------- ساخت با Claude ----------
GEN_PROMPT = """تو تیم محتوای __OWNER__ هستی و از یک ایده‌ی او یک «آبشار محتوا» می‌سازی: همان حرف، برای چند پلتفرم،
هر کدام به زبان و قالب طبیعی همان پلتفرم. این‌ها پیش‌نویس‌اند؛ خودش می‌خواند و تأیید می‌کند.

هسته‌ی برند و دانش زنده‌ی او (بانک تجربه، صدای مخاطب، یادگیری‌ها). «خط قرمزها»، ادعاهای ممنوع و قواعد CTA قانون‌اند:
<<<BRAND
__BRAND__
BRAND>>>

ایده و هرچه تا الان درباره‌اش ساخته شده:
__SOURCE__

قواعد مشترک:
- همه‌ی قطعه‌ها یک حرف اصلی را می‌گویند ولی تکرار کپی‌شده‌ی هم نیستند؛ هر پلتفرم زاویه، طول و لحن خودش را دارد.
- مثال و داستان را از تجربه‌ی خود او (ورودی ایده یا بانک تجربه) بردار و بگو از کدام. تجربه، عدد، نقل‌قول یا ادعایی از
  طرف او نساز. هر عددی که از پژوهش می‌آوری همان عدد پژوهش است با منبعش در جمله (مثلاً «طبق گزارش …»).
- هوک‌ها به کلمه‌های خود مخاطب (صدای مخاطب) نزدیک باشند، نه زبان مارکتینگ.
- اول‌شخص («من…»، «سال ۹۸ فرستادم…») فقط برای چیزی که خودش در ورودی ایده یا بانک تجربه گفته، و جزئیاتش (مدت، تعداد،
  نتیجه) دقیقاً همان که گفته. حرف‌ها و دردهای «صدای مخاطب» مال مخاطب‌اند: می‌شود خطاب به مخاطب گفتشان («سه ماهه
  رزومه می‌فرستی؟») ولی هرگز به تجربه‌ی خود او تبدیل نمی‌شوند. این در عنوان‌ها، هوک‌ها و موضوع ایمیل هم صدق می‌کند.
- دعوت به اقدام فقط طبق قواعد و کتابخانه‌ی CTA هسته‌ی برند؛ اگر تعریف نشده، دعوت ساده به گفت‌وگو.
__LANG_RULE__

این قطعه‌ها را بساز:
__WANT__

خروجی: فقط یک JSON معتبر بین یک خط <<<WF و یک خط WF>>>، بدون هیچ توضیح دیگری. کلیدها دقیقاً همین‌ها:
<<<WF
__SHAPE__
WF>>>
خط تازه‌ی داخل متن‌ها را با \\n بنویس. هیچ سؤالی نپرس."""

REGEN_PROMPT = """تو تیم محتوای __OWNER__ هستی. یک قطعه از «آبشار محتوا»ی یک ایده را بازنویسی می‌کنی.

هسته‌ی برند و دانش زنده‌ی او. «خط قرمزها»، ادعاهای ممنوع و قواعد CTA قانون‌اند:
<<<BRAND
__BRAND__
BRAND>>>

ایده:
__SOURCE__

قطعه‌ی فعلی (__LABEL__ برای __PLATFORM__):
<<<CUR
__CUR__
CUR>>>

قالب این قطعه: __RULE__
__NOTE__
همان قواعد: تجربه، عدد، نقل‌قول یا ادعایی از طرف او نساز؛ CTA فقط طبق هسته‌ی برند.
- اول‌شخص («من…»، «سال ۹۸ فرستادم…») فقط برای چیزی که خودش در ورودی ایده یا بانک تجربه گفته، و جزئیاتش (مدت، تعداد،
  نتیجه) دقیقاً همان که گفته. حرف‌ها و دردهای «صدای مخاطب» مال مخاطب‌اند: می‌شود خطاب به مخاطب گفتشان («سه ماهه
  رزومه می‌فرستی؟») ولی هرگز به تجربه‌ی خود او تبدیل نمی‌شوند. این در عنوان‌ها، هوک‌ها و موضوع ایمیل هم صدق می‌کند.
__LANG_RULE__

خروجی: فقط یک JSON معتبر بین یک خط <<<WF و یک خط WF>>> به همین شکل:
<<<WF
{"__KEY__": __SHAPE__}
WF>>>
خط تازه‌ی داخل متن‌ها را با \\n بنویس. هیچ سؤالی نپرس."""

LANG_RULE = {"fa": "- فارسی، با صدای خود او (بخش «صدا و لحن» هسته‌ی برند): اینستاگرام و X محاوره‌ای، لینکدین و خبرنامه نوشتاریِ گرم.",
             "en": "- Write every piece in natural, native-level English for an English-speaking audience."}


def source_block(iid):
    it = idea(iid) or {}
    d = IDEAS / iid
    parts = [f"عنوان: {it.get('title', '')}" + (f" · پیلر: {it['pillar']}" if it.get("pillar") else "")]
    for f, tag, note, cap in (("raw.md", "RAW", "ورودی خام خود او؛ حرف اصلی همین است", 20000),
                              ("brief.md", "BRIEF", "دستورالعمل خود او؛ بر بقیه اولویت دارد", 4000),
                              ("analysis.md", "ANALYSIS", "تحلیل", 8000),
                              ("research.md", "RESEARCH", "پژوهش با منبع؛ فقط عددهای همین‌جا مجازند", 16000),
                              ("reel.md", "REEL", "ریلزی که قبلاً ساخته شده؛ زاویه‌اش را تکرار نکن", 8000)):
        try:
            t = (d / f).read_text(encoding="utf-8").strip()
        except Exception:
            continue
        if t:
            parts.append(f"<<<{tag} ({note})\n{t[:cap]}\n{tag}>>>")
    return "\n\n".join(parts)


def brand():
    try:
        b = bc.MD_F.read_text(encoding="utf-8")[:30000]
    except Exception:
        b = "(هسته‌ی برند هنوز ساخته نشده؛ با همین اطلاعات کار کن و کلی‌گویی نکن.)"
    return kn.brand_plus(b)


def _shape(types):
    return "{" + ", ".join(f'"{k}": {TYPES[k]["shape"]}' for k in types) + "}"


def _want(types):
    out = []
    for k, n in types.items():
        t = TYPES[k]
        head = f"- {k} ({t['label']} برای {t['platform']})" + (f": دقیقاً {n} تا" if k == "reels" else "")
        out.append(f"{head}\n  {t['rule']}")
    return "\n".join(out)


def _clean(k, v):
    """خروجی Claude ← شکل امن همان قطعه؛ None اگر خالی یا خراب است."""
    s = lambda x, n=6000: str(x or "").strip()[:n]
    if k == "reels":
        return None   # ریلزها جدا به چند قطعه تبدیل می‌شوند
    if not isinstance(v, dict):
        return None
    if k == "carousel":
        slides = [{"title": s(x.get("title"), 300), "body": s(x.get("body"), 1200)} for x in v.get("slides") or [] if isinstance(x, dict)]
        return {"title": s(v.get("title"), 200), "slides": slides[:12], "caption": s(v.get("caption")), "hashtags": s(v.get("hashtags"), 400)} if slides else None
    if k == "stories":
        fr = [s(x, 600) for x in v.get("frames") or [] if str(x or "").strip()]
        return {"frames": fr[:8], "sticker": s(v.get("sticker"), 300)} if fr else None
    if k == "post":
        return {"image_text": s(v.get("image_text"), 400), "caption": s(v.get("caption")), "hashtags": s(v.get("hashtags"), 400)} if v.get("caption") or v.get("image_text") else None
    if k == "linkedin":
        return {"text": s(v.get("text"), 4000)} if v.get("text") else None
    if k == "x":
        ps = [s(x, 400) for x in v.get("posts") or [] if str(x or "").strip()]
        return {"posts": ps[:12]} if ps else None
    if k == "youtube":
        ch = [{"title": s(c.get("title"), 200), "points": [s(p, 400) for p in c.get("points") or [] if str(p or "").strip()][:8]}
              for c in v.get("chapters") or [] if isinstance(c, dict)]
        return {"titles": [s(x, 200) for x in v.get("titles") or [] if str(x or "").strip()][:5], "thumbnail": s(v.get("thumbnail"), 100),
                "hook": s(v.get("hook"), 2000), "chapters": ch[:10], "cta": s(v.get("cta"), 600), "description": s(v.get("description"), 3000)} if ch else None
    if k == "newsletter":
        return {"subjects": [s(x, 200) for x in v.get("subjects") or [] if str(x or "").strip()][:5],
                "preheader": s(v.get("preheader"), 300), "body": s(v.get("body"), 12000)} if v.get("body") else None
    return None


def _reel(x):
    if not isinstance(x, dict) or not str(x.get("script") or "").strip():
        return None
    s = lambda k, n=6000: str(x.get(k) or "").strip()[:n]
    return {"title": s("title", 200), "hook": s("hook", 600), "script": s("script"), "onscreen": s("onscreen", 400),
            "caption": s("caption"), "hashtags": s("hashtags", 400)}


def _assets(data, types):
    out = []
    for k in types:
        if k == "reels":
            for x in (data.get("reels") or [])[:types["reels"]]:
                r = _reel(x)
                if r:
                    out.append({"aid": "w" + secrets.token_hex(4), "type": "reels", "data": r})
        else:
            v = _clean(k, data.get(k))
            if v:
                out.append({"aid": "w" + secrets.token_hex(4), "type": k, "data": v})
    return out


def _jset(**kw):
    with JLOCK:
        JOB.update(kw)


def run_generate(iid, types, lang):
    try:
        _jset(step="Claude دارد بسته را می‌سازد… (معمولاً ۲ تا ۴ دقیقه)")
        prompt = (GEN_PROMPT.replace("__OWNER__", cfg.owner_line()).replace("__BRAND__", brand())
                  .replace("__SOURCE__", source_block(iid)).replace("__LANG_RULE__", LANG_RULE[lang])
                  .replace("__WANT__", _want(types)).replace("__SHAPE__", _shape(types)))
        data, err = _ask(prompt, lang)
        if data is None:
            return _jset(state="error", error="ساخت بسته ناتمام ماند. " + err)
        assets = _assets(data, types)
        if not assets:
            return _jset(state="error", error="خروجی Claude قابل خواندن نبود؛ یک بار دیگر امتحان کن.")
        with LOCK:
            old = load(iid)
            if old and old.get("assets"):      # بسته‌ی قبلی کنار گذاشته می‌شود، پاک نمی‌شود
                wpath(iid).with_name("waterfall.prev.json").write_text(json.dumps(old, ensure_ascii=False, indent=2), encoding="utf-8")
            _save(iid, {"lang": lang, "created": time.strftime("%Y-%m-%d %H:%M"), "types": types, "assets": assets})
        _jset(state="done", step="")
    except Exception as e:
        _jset(state="error", error=f"خطا: {e}")


def run_regen(iid, aid, note):
    try:
        d = load(iid) or {}
        a = next((x for x in d.get("assets") or [] if x.get("aid") == aid), None)
        if not a:
            return _jset(state="error", error="این قطعه پیدا نشد.")
        lang = d.get("lang") or "fa"
        k = a["type"]
        t = TYPES[k]
        shape = t["shape"][1:-1] if k == "reels" else t["shape"]          # یک ریلز، نه فهرست
        _jset(step=f"Claude دارد «{t['label']}» را بازنویسی می‌کند…")
        prompt = (REGEN_PROMPT.replace("__OWNER__", cfg.owner_line()).replace("__BRAND__", brand())
                  .replace("__SOURCE__", source_block(iid)).replace("__LABEL__", t["label"]).replace("__PLATFORM__", t["platform"])
                  .replace("__CUR__", json.dumps(a["data"], ensure_ascii=False, indent=1)).replace("__RULE__", t["rule"])
                  .replace("__NOTE__", f"\nنظر خود او برای این بازنویسی (بر بقیه اولویت دارد): {note}\n" if note else "\nنسخه‌ی تازه و بهتری بنویس.\n")
                  .replace("__LANG_RULE__", LANG_RULE[lang]).replace("__KEY__", k).replace("__SHAPE__", shape))
        data, err = _ask(prompt, lang)
        v = (data or {}).get(k)
        v = _reel(v[0] if isinstance(v, list) and v else v) if k == "reels" else _clean(k, v)
        if not v:
            return _jset(state="error", error="بازنویسی ناتمام ماند. " + err)
        with LOCK:
            d = load(iid) or {}
            for x in d.get("assets") or []:
                if x.get("aid") == aid:
                    x["prev"] = x["data"]
                    x["data"] = v
            _save(iid, d)
        _jset(state="done", step="")
    except Exception as e:
        _jset(state="error", error=f"خطا: {e}")


def _ask(prompt, lang):
    # بیرون از پوشه‌ی استودیو و بدون ابزار؛ هسته‌ی برند داخل خود پرامپت است (مثل کاروسل). زبان: lg.claude_args(lang)
    import subprocess, tempfile
    cmd = [cfg.claude_bin(), "-p", "--output-format", "json", "--model", am.get("waterfall"),
           "--no-session-persistence", "--safe-mode", "--tools", "", *lg.claude_args(lang)]
    try:
        r = subprocess.run(cmd, input=prompt, cwd=tempfile.gettempdir(), capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=1500)
    except subprocess.TimeoutExpired:
        return None, "زمان تمام شد."
    try:
        res = (json.loads(r.stdout).get("result") or "").strip()
    except Exception:
        res = ""
    data = xp._json_block(res, "WF") if res else None
    if r.returncode != 0 or data is None:
        return None, (r.stderr or r.stdout or "")[-200:]
    return data, ""


# ---------- خروجی‌ها ----------
def make_carousel(iid, aid):
    with LOCK:
        d = load(iid) or {}
        a = next((x for x in d.get("assets") or [] if x.get("aid") == aid and x.get("type") == "carousel"), None)
        if not a:
            return 404, {"error": "این کاروسل پیدا نشد."}
        if a.get("deck") and cr.load(a["deck"]):
            return 200, {"ok": True, "deck": a["deck"], "existing": True}
        v = a["data"]
        slides = [cr.new_slide(cr.md_to_html(s["title"]), cr.md_to_html(s["body"])) for s in v["slides"]]
        deck = cr.create(v.get("title") or "", {"kind": "idea", "idea": iid, "waterfall": aid}, slides)
        deck.update(caption=v.get("caption") or "", hashtags=v.get("hashtags") or "", lang=d.get("lang") or "fa")
        with cr.LOCK:
            cr._write(deck)
        a["deck"] = deck["id"]
        _save(iid, d)
    return 200, {"ok": True, "deck": deck["id"]}


def to_planner(iid, aid, date_iso):
    with LOCK:
        d = load(iid) or {}
        a = next((x for x in d.get("assets") or [] if x.get("aid") == aid), None)
        if not a:
            return 404, {"error": "این قطعه پیدا نشد."}
        fmt = TYPES[a["type"]].get("ig")
        if not fmt:
            return 400, {"error": "فقط قطعه‌های اینستاگرامی به تقویم محتوا می‌روند؛ برای بقیه تاریخ انتشار را همین‌جا بگذار."}
        v = a["data"]
        topic = v.get("title") or v.get("image_text") or (v.get("frames") or [""])[0] or (idea(iid) or {}).get("title", "")
        hook = v.get("hook") or (v["slides"][0]["title"] if a["type"] == "carousel" and v.get("slides") else "")
        code, res = pl.add_slot(d.get("lang") or "fa", date_iso, fmt, topic, hook,
                                (idea(iid) or {}).get("title", ""), iid, note=f"آبشار محتوا · {TYPES[a['type']]['label']}")
        if code != 200:
            return code, res
        a["slot"] = {"week": res["week"], "id": res["slot"]}
        a["date"] = date_iso
        _save(iid, d)
    return 200, {"ok": True, **res}


# ---------- مسیرها ----------
def handle_get(p, q):
    """(code, payload, ctype) — ctype=None یعنی payload جیسون است."""
    if p in STATIC:
        name, ctype = STATIC[p]
        return 200, (APP / name).read_bytes(), ctype
    if p == "/api/waterfall":
        iid = q.get("id", [""])[0]
        if not _safe(iid):
            return 400, {"error": "bad id"}, None
        with JLOCK:
            j = dict(JOB)
        types = {k: {"label": t["label"], "platform": t["platform"], "ig": bool(t.get("ig")), "max": t.get("max", 1)} for k, t in TYPES.items()}
        it = idea(iid) or {}
        return 200, {"wf": load(iid), "types": types, "prefs": prefs(), "job": j,
                     "lang": "en" if it.get("lang") == "en" else "fa", "today": time.strftime("%Y-%m-%d")}, None
    return None


def handle_post(p, body):
    if not p.startswith("/api/waterfall"):
        return None
    iid = body.get("id")
    if not _safe(iid) or not (IDEAS / iid).is_dir():
        return 400, {"error": "این ایده پیدا نشد."}
    if p in ("/api/waterfall/generate", "/api/waterfall/regen"):
        if p.endswith("generate"):
            t = body.get("types") if isinstance(body.get("types"), dict) else {}
            types = {k: _count(k, t.get(k, 0)) for k in TYPES}
            types = {k: n for k, n in types.items() if n}
            if not types:
                return 400, {"error": "دست‌کم یک قالب را انتخاب کن."}
            PREFS.write_text(json.dumps({"types": {k: _count(k, t.get(k, 0)) for k in TYPES}}, ensure_ascii=False, indent=2), encoding="utf-8")
            lang = body.get("lang") if body.get("lang") in lg.LANGS else "fa"
            target, args = run_generate, (iid, types, lang)
        else:
            target, args = run_regen, (iid, str(body.get("aid") or ""), str(body.get("note") or "").strip()[:2000])
        with JLOCK:
            if JOB["state"] == "running":
                return 409, {"error": "یک ساخت دیگر در حال اجراست."}
            JOB.update(state="running", id=iid, step="", error="")
        threading.Thread(target=target, args=args, daemon=True).start()
        return 200, {"ok": True}
    if p == "/api/waterfall/asset":
        with LOCK:
            d = load(iid)
            a = next((x for x in (d or {}).get("assets") or [] if x.get("aid") == body.get("aid")), None)
            if not a:
                return 404, {"error": "این قطعه پیدا نشد."}
            if isinstance(body.get("data"), dict):
                k = a["type"]
                v = _reel(body["data"]) if k == "reels" else _clean(k, body["data"])
                if not v:
                    return 400, {"error": "این قطعه خالی شد؛ ذخیره نشد."}
                a["data"] = v
            if "date" in body:
                dt = str(body.get("date") or "")
                if dt and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", dt):
                    return 400, {"error": "تاریخ نامعتبر"}
                a["date"] = dt
            if "done" in body:
                a["done"] = time.strftime("%Y-%m-%d") if body.get("done") else ""
            if body.get("delete"):
                d["assets"] = [x for x in d["assets"] if x is not a]
            _save(iid, d)
        return 200, {"ok": True, "wf": d}
    if p == "/api/waterfall/carousel":
        return make_carousel(iid, body.get("aid"))
    if p == "/api/waterfall/plan":
        dt = str(body.get("date") or "")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", dt):
            return 400, {"error": "تاریخ را انتخاب کن."}
        return to_planner(iid, body.get("aid"), dt)
    return 404, {"error": "not found"}
