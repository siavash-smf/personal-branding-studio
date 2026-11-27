"""صدای مخاطب: حرف واقعی مخاطب‌ها از دایرکت، کامنت، تماس، ویس، اسکرین‌شات و فایل؛ و بینش‌هایی که از آن بیرون می‌آید.

دو مرحله:
1. منبع (source): هر ورودی یک منبع است. صدا رونویسی می‌شود (Gemini؛ تماس با برچسب گوینده)، اسکرین‌شات خوانده می‌شود
   (Gemini، بدون اسم و آیدی)، فایل متنی خوانده می‌شود، کامنت‌های اینستاگرام از API می‌آیند (اگر دسترسی‌اش داده شده).
   صف پردازش یک رشته‌ی پشت‌صحنه است؛ چند فایل را می‌شود یک‌جا داد.
2. استخراج (mine): Claude از منبع‌های تازه درد، خواسته، سؤال، تردید و تعریف را با «عین جمله‌ی مخاطب» بیرون می‌کشد و
   با بینش‌های قبلی یکی می‌کند. هر نقل‌قول این‌جا با متن منبع مقایسه می‌شود؛ نقل‌قولی که عیناً در منبع نیست دور ریخته
   می‌شود (قانون CLAUDE.md: نقل‌قول نساز). شمارش هر بینش = تعداد منبع‌های جدایی که آن را گفته‌اند.

از هر بینش: → بانک ایده (محتوایی که همین سؤال/درد/تردید را جواب می‌دهد)، → هسته‌ی برند (به‌صورت پیش‌نویسی که کاربر
تأیید می‌کند)، و تعریف‌ها → بانک تجربه (نتیجه‌ی مشتری، «هنوز اجازه نگرفته‌ام»).

data/audience.json = {"v": 1, "sources": [...], "insights": [...], "seen_comments": [...]}
data/audience/<sid>.txt   متن هر منبع (جدا، چون رونویسی یک تماس ده‌ها هزار حرف است)
data/audience/files/      فایل خامِ در صف؛ صدا بعد از رونویسی پاک می‌شود و فقط متنش می‌ماند
brand/audience-voice.md   خلاصه برای ایجنت‌ها (knowledge.py)
"""
import json, re, shutil, subprocess, tempfile, threading, time, zipfile
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
import ai_models as am
import brand as bc
import experience as xp
import knowledge as kn
import lang as lg
import settings as cfg
import voice

APP = Path(__file__).resolve().parent
ROOT = APP.parent
DATA = ROOT / "data"
FILE = DATA / "audience.json"
DIR = DATA / "audience"
FILES = DIR / "files"
MD = ROOT / "brand" / "audience-voice.md"
IDEAS = DATA / "ideas"
STATIC = {"/audience.js": ("audience.js", "text/javascript; charset=utf-8"),
          "/audience.css": ("audience.css", "text/css; charset=utf-8")}
LOCK = threading.Lock()
QLOCK = threading.Lock()
WORKER = {"on": False, "sid": "", "step": ""}
MJOB = {"state": "idle", "step": "", "error": "", "added": 0, "merged": 0, "dropped": 0}

AUDIO_EXT = (".m4a", ".mp3", ".wav", ".mp4", ".mov", ".aac", ".ogg", ".opus", ".webm", ".flac")
IMAGE_EXT = tuple(voice.IMG_MIME)
TEXT_EXT = (".txt", ".md", ".csv", ".json", ".pdf", ".docx", ".doc", ".rtf", ".html")
MAX_UPLOAD = 400 * 1024 * 1024
MAX_SOURCE = 60000           # حرف از هر منبع که به Claude می‌رسد
BATCH = 90000                # حرف در هر فراخوانی استخراج

CHANNELS = {"dm": "دایرکت", "comment": "کامنت", "call": "تماس فروش یا مشاوره", "class": "جلسه یا کلاس",
            "survey": "نظرسنجی و فرم", "email": "ایمیل و پیام", "voice": "ویس خودم بعد از گفت‌وگو", "other": "دیگر"}
TYPES = {
    "pain":      {"label": "درد و مشکل",        "brand": "pains",      "goal": "نشان بده این درد را دقیق می‌فهمی و یک قدم عملی و واقعی برای کمتر شدنش بده"},
    "desire":    {"label": "خواسته",            "brand": "goals",      "goal": "نشان بده رسیدن به این خواسته چطور ممکن است و قدم اولش چیست"},
    "question":  {"label": "سؤال",              "brand": "objections", "goal": "همین سؤال را روشن، کامل و عملی جواب بده؛ هوک خودِ سؤال با کلمه‌های مخاطب است"},
    "objection": {"label": "تردید و مانع خرید", "brand": "objections", "goal": "این تردید را صادقانه جواب بده، بدون فشار فروش؛ اگر به محصولی در هسته‌ی برند مربوط است، طبق قواعد CTA به آن وصل کن"},
    "praise":    {"label": "تعریف و نتیجه",     "brand": None,         "goal": "یک case study یا اثبات از همین نتیجه بساز؛ فقط با اجازه‌ی خود آن آدم و بدون اسم مگر اجازه داده باشد"},
}
SRC_STATE = {"queued": "در صف", "working": "در حال پردازش", "ready": "آماده‌ی استخراج", "mined": "استخراج‌شده", "error": "خطا"}


# ---------- فایل ----------
def load():
    try:
        d = json.loads(FILE.read_text(encoding="utf-8"))
        if isinstance(d, dict):
            for k in ("sources", "insights", "seen_comments"):
                d.setdefault(k, [])
            return d
    except Exception:
        pass
    return {"v": 1, "sources": [], "insights": [], "seen_comments": []}


def _save(d):
    d["v"] = 1
    DATA.mkdir(exist_ok=True)
    tmp = FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(FILE)
    _write_md(d)


def _src(d, sid):
    return next((s for s in d["sources"] if s.get("id") == sid), None)


def src_text(sid):
    try:
        return (DIR / f"{sid}.txt").read_text(encoding="utf-8")
    except Exception:
        return ""


def _set_text(sid, text):
    DIR.mkdir(parents=True, exist_ok=True)
    (DIR / f"{sid}.txt").write_text(text, encoding="utf-8")


def _safe_id(s):
    return isinstance(s, str) and re.fullmatch(r"[a-z]\d{10,20}", s or "") is not None


def fa(n):
    return str(n).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


REDACT = [(re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[ایمیل]"),
          (re.compile(r"(?<![\w@])@[A-Za-z0-9._]{3,30}"), "@…"),
          (re.compile(r"(?:\+|00)?(?:98|0)?9\d{2}[\s-]?\d{3}[\s-]?\d{4}|(?:\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}"), "[شماره]"),
          (re.compile(r"(?:\+|00)?(?:۹۸|۰)?۹[۰-۹]{2}[\s-]?[۰-۹]{3}[\s-]?[۰-۹]{4}"), "[شماره]")]


def redact(text):
    """ایمیل، آیدی و شماره‌ی تلفن پیش از ذخیره پاک می‌شوند؛ اسم را نمی‌شود با الگو گرفت و به کاربر گفته می‌شود."""
    for rx, rep in REDACT:
        text = rx.sub(rep, text)
    return text


# ---------- brand/audience-voice.md ----------
MD_HEAD = """# صدای مخاطب

> این فایل خودکار از تب «صدای مخاطب» در Content Studio ساخته می‌شود؛ دستی ویرایشش نکن.

**قانون ایجنت‌ها:** این‌ها حرف واقعی مخاطب‌هاست، از دایرکت، کامنت، تماس و پیام. جمله‌های داخل «» عین کلمه‌های خود
مخاطب‌اند؛ هوک و زبان محتوا را به این کلمه‌ها نزدیک کن، نه به زبان مارکتینگ. عدد «n منبع» یعنی در n گفت‌وگو یا منبع
جدا آمده؛ آمار کل مخاطب نیست و نباید به‌شکل درصد یا «بیشتر مخاطب‌ها» گفته شود. این نقل‌قول‌ها را به اسم کسی منتشر
نکن؛ «تعریف و نتیجه» فقط با اجازه‌ی خود آن آدم در محتوای منتشرشدنی می‌آید. این‌ها تجربه‌ی مخاطب است، نه صاحب پیج:
خطاب به مخاطب بگو («سه ماهه رزومه می‌فرستی؟»)، ولی هرگز از زبان اول‌شخص صاحب پیج («سه ماه رزومه فرستادم») ننویس.
"""


def _write_md(d):
    ins = [i for i in d.get("insights") or [] if isinstance(i, dict) and not i.get("hidden")]
    out = [MD_HEAD]
    budget = 8000
    for t, meta in TYPES.items():
        rows = sorted([i for i in ins if i.get("type") == t], key=lambda i: -len(set(i.get("sources") or [])))[:15]
        if not rows:
            continue
        out += [f"## {meta['label']}", ""]
        for i in rows:
            qs = " ".join(f"«{q['q']}»" for q in (i.get("quotes") or [])[:2])
            line = f"- **{i.get('text')}** ({fa(len(set(i.get('sources') or [])))} منبع)" + (f" — {qs}" if qs else "")
            if i.get("answer"):
                line += f"\n  جواب صاحب پیج: {i['answer']}"
            if budget - len(line) < 0:
                break
            budget -= len(line)
            out.append(line)
        out.append("")
    MD.parent.mkdir(exist_ok=True)
    if len(out) == 1:
        if MD.exists():
            MD.unlink()
        return
    tmp = MD.with_suffix(".md.tmp")
    tmp.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")
    tmp.replace(MD)


# ---------- ورودی‌ها ----------
def new_source(kind, channel, title, text="", file=None, speakers=False):
    sid = f"s{int(time.time() * 1000)}"
    time.sleep(0.002)    # شناسه‌ی یکتا وقتی چند فایل پشت سر هم می‌آیند
    s = {"id": sid, "kind": kind, "channel": channel if channel in CHANNELS else "other",
         "title": (title or "").strip()[:200], "created": time.strftime("%Y-%m-%d %H:%M"),
         "state": "ready" if text else "queued", "chars": len(text)}
    if file:
        s["file"] = file
    if speakers:
        s["speakers"] = True
    if text:
        _set_text(sid, text)
    with LOCK:
        d = load()
        d["sources"].insert(0, s)
        _save(d)
    if not text:
        kick()
    return s


def file_text(path):
    """متن یک فایل متنی (مثل بانک ایده در server.py)."""
    ext = path.suffix.lower()
    if ext in (".txt", ".md", ".csv", ".json"):
        return path.read_text(encoding="utf-8", errors="replace")
    if ext == ".pdf" and shutil.which("pdftotext"):
        r = subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=120)
        return r.stdout
    if ext == ".docx":
        import html as _html
        with zipfile.ZipFile(path) as z:
            xml = z.read("word/document.xml").decode("utf-8", "replace")
        paras = re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S)
        return "\n".join(_html.unescape("".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p))) for p in paras).strip()
    if ext in (".doc", ".rtf", ".html") and shutil.which("textutil"):
        r = subprocess.run(["textutil", "-convert", "txt", "-stdout", str(path)], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=120)
        return r.stdout
    raise RuntimeError("متن این فایل خوانده نشد" + ("؛ برای PDF برنامه‌ی pdftotext لازم است." if ext == ".pdf" else "."))


def handle_upload(h):
    """POST /api/audience/upload?name=&channel=&title=&speakers=1 — بدنه خودِ فایل است، نه JSON (تماس یک ساعته بزرگ است)."""
    q = parse_qs(urlparse(h.path).query)
    name = unquote(q.get("name", [""])[0])
    ext = Path(name).suffix.lower()
    n = int(h.headers.get("Content-Length") or 0)
    if ext not in AUDIO_EXT + IMAGE_EXT + TEXT_EXT or not 0 < n <= MAX_UPLOAD:
        if 0 < n <= 64 * 1024:
            h.rfile.read(n)
        h.close_connection = True
        return h._json({"error": "این نوع فایل قبول نمی‌شود (صوت، ویدیو، اسکرین‌شات، PDF، Word یا متن)، یا از ۴۰۰ مگابایت بزرگ‌تر است."}, 400)
    FILES.mkdir(parents=True, exist_ok=True)
    stem = f"u{int(time.time() * 1000)}"
    part = FILES / f"{stem}{ext}.part"
    left = n
    with open(part, "wb") as f:
        while left > 0:
            chunk = h.rfile.read(min(4 * 1024 * 1024, left))
            if not chunk:
                break
            f.write(chunk)
            left -= len(chunk)
    if left:
        part.unlink(missing_ok=True)
        return h._json({"error": "آپلود نیمه‌کاره ماند."}, 400)
    final = FILES / f"{stem}{ext}"
    part.replace(final)
    kind = "audio" if ext in AUDIO_EXT else "image" if ext in IMAGE_EXT else "file"
    channel = q.get("channel", ["other"])[0]
    title = unquote(q.get("title", [""])[0]) or Path(name).stem
    s = new_source(kind, channel, title, file=final.name,
                   speakers=kind == "audio" and q.get("speakers", [""])[0] == "1")
    return h._json({"ok": True, "source": s})


# ---------- صف پردازش ----------
def kick():
    with QLOCK:
        if WORKER["on"]:
            return
        WORKER["on"] = True
    threading.Thread(target=_work, daemon=True).start()


def _work():
    try:
        while True:
            with LOCK:
                d = load()
                s = next((x for x in reversed(d["sources"]) if x.get("state") == "queued"), None)
                if not s:
                    return
                s["state"] = "working"
                _save(d)
            with QLOCK:
                WORKER.update(sid=s["id"], step="")
            text, err = "", ""
            f = FILES / str(s.get("file") or "")
            try:
                if not s.get("file") or not f.is_file():
                    raise RuntimeError("فایل این منبع پیدا نشد.")
                if s["kind"] == "audio":
                    _wstep("رونویسی صدا با Gemini…")
                    text = voice.transcribe_long(f, speakers=bool(s.get("speakers")),
                                                 progress=lambda n, t: _wstep(f"رونویسی تکه‌ی {fa(n)} از {fa(t)}…"))
                elif s["kind"] == "image":
                    _wstep("خواندن اسکرین‌شات با Gemini…")
                    text = voice.read_image(f)
                else:
                    text = file_text(f)
                text = redact((text or "").strip())
                if not text:
                    err = "متنی از این منبع بیرون نیامد."
            except RuntimeError as e:
                err = str(e)[:300]
            except Exception as e:
                err = f"خطا: {str(e)[:200]}"
            if text and not err:
                _set_text(s["id"], text)
                if s["kind"] == "audio":       # صدای تماس حساس و بزرگ است؛ متنش کافی است
                    f.unlink(missing_ok=True)
            with LOCK:
                d = load()
                x = _src(d, s["id"])
                if x:
                    if err:
                        x.update(state="error", error=err)
                    else:
                        x.update(state="ready", chars=len(text))
                        x.pop("error", None)
                        if x["kind"] != "audio":
                            f.unlink(missing_ok=True)
                            x.pop("file", None)
                        else:
                            x.pop("file", None)
                    _save(d)
    finally:
        with QLOCK:
            WORKER.update(on=False, sid="", step="")
        # اگر در همین لحظه منبع تازه‌ای آمد که kick آن را ندید
        with LOCK:
            pending = any(x.get("state") == "queued" for x in load()["sources"])
        if pending:
            kick()


def _wstep(t):
    with QLOCK:
        WORKER["step"] = t


def resume():
    """موقع شروع سرور: منبعی که وسط پردازش مانده بود دوباره به صف برمی‌گردد."""
    with LOCK:
        d = load()
        stuck = [s for s in d["sources"] if s.get("state") == "working"]
        for s in stuck:
            s["state"] = "queued"
        if stuck:
            _save(d)
        pending = any(s.get("state") == "queued" for s in d["sources"])
    if pending:
        kick()


# ---------- کامنت‌های اینستاگرام ----------
def import_comments(posts=20):
    """کامنت‌های پست‌های اخیر (از data/instagram/raw.json) ← یک منبع. کامنت‌هایی که قبلاً آمده‌اند تکرار نمی‌شوند.
    دسترسی instagram_business_manage_comments لازم است؛ بدون آن Meta خطا می‌دهد و همین را به کاربر می‌گوییم."""
    import instagram as ig
    if not ig.token():
        return 400, {"error": "اینستاگرام وصل نیست. اول از تب «تحلیل اینستاگرام» وصلش کن."}
    try:
        raw = json.loads(ig.RAW.read_text(encoding="utf-8"))
    except Exception:
        return 400, {"error": "هنوز داده‌ای از اینستاگرام نیست. در «تحلیل اینستاگرام» یک بار «همگام‌سازی» بزن."}
    me = str(raw.get("username") or "").lower()
    media = sorted([m for m in raw.get("media") or [] if m.get("id")], key=lambda m: m.get("timestamp") or "", reverse=True)[:posts]
    with LOCK:
        seen = set(load().get("seen_comments") or [])
    lines, new_ids = [], []
    for m in media:
        try:
            res = ig.call(f"/{m['id']}/comments", {"fields": "id,text,username", "limit": 50})
        except ig.GraphError as e:
            if e.code in (10, 200) or "permission" in str(e).lower():
                return 400, {"error": "توکن فعلی اینستاگرام اجازه‌ی خواندن کامنت‌ها را ندارد. در Meta دسترسی "
                                      "instagram_business_manage_comments را اضافه کن و توکن تازه بساز (راهنمای «وصل کردن اینستاگرام»، بخش دسترسی‌ها). "
                                      "تا آن موقع، اسکرین‌شات کامنت‌ها را در زبانه‌ی «فایل» بده.", "perm": True}
            return 400, {"error": f"اینستاگرام جواب نداد: {str(e)[:160]}"}
        cap = re.sub(r"\s+", " ", str(m.get("caption") or ""))[:80]
        got = []
        for c in res.get("data") or []:
            if c.get("id") in seen or str(c.get("username") or "").lower() == me:
                continue
            t = re.sub(r"\s+", " ", str(c.get("text") or "")).strip()
            if len(t) >= 3:
                got.append("• " + t)
            new_ids.append(c.get("id"))
        if got:
            lines += [f"## پست: {cap or m['id']}", *got, ""]
    if not lines:
        with LOCK:
            d = load()
            d["seen_comments"] = (list(seen) + new_ids)[-5000:]
            _save(d)
        return 200, {"ok": True, "count": 0}
    s = new_source("instagram", "comment", f"کامنت‌های {fa(len(media))} پست اخیر", text=redact("\n".join(lines)))
    with LOCK:
        d = load()
        d["seen_comments"] = (list(seen) + new_ids)[-5000:]
        _save(d)
    return 200, {"ok": True, "count": sum(1 for l in lines if l.startswith("• ")), "source": s}


# ---------- استخراج بینش ----------
MINE_PROMPT = """تو تحلیلگر «صدای مخاطب» برای __OWNER__ هستی. کارت پیدا کردن حرف واقعی مخاطب‌هایش است، با کلمه‌های خود آن‌ها.

هسته‌ی برند او (فقط برای این‌که مخاطب و محصولاتش را بشناسی؛ چیزی از این‌جا به حرف مخاطب اضافه نکن):
<<<BRAND
__BRAND__
BRAND>>>

بینش‌هایی که از قبل داریم (شناسه · نوع · متن):
__INSIGHTS__

منبع‌های تازه. در تماس‌ها، دایرکت‌ها و جلسه‌ها یکی از طرف‌ها خود صاحب پیج است؛ حرف او بینش مخاطب نیست. خطی که با
«[صاحب پیج]» شروع می‌شود حرف خود اوست. در رونویسی تماس، گوینده‌ای که سؤال می‌پرسد، مشکل می‌گوید یا تردید دارد معمولاً
مخاطب است و کسی که توضیح می‌دهد و پیشنهاد می‌کند صاحب پیج. منبعِ «ویس خودم بعد از گفت‌وگو» تعریف خود صاحب پیج از
حرف‌های مخاطب است؛ از آن بینش بگیر ولی quote فقط جایی که جمله‌ی مخاطب را عیناً نقل کرده.
__SOURCES__

از حرف‌های مخاطب‌ها (نه صاحب پیج) این‌ها را بیرون بکش:
- pain: دردی، مشکلی یا ترسی که دارد
- desire: چیزی که در نهایت می‌خواهد
- question: سؤالی که می‌پرسد (صریح یا ضمنی)
- objection: چیزی که جلوی خرید، شروع یا اعتمادش را می‌گیرد (قیمت، وقت، «به درد من نمی‌خورد»، تجربه‌ی بد قبلی…)
- praise: تعریف یا نتیجه‌ای که از کار صاحب پیج گفته

برای هر مورد یک ردیف:
- type: یکی از pain، desire، question، objection، praise
- text: یک جمله‌ی کوتاه که بینش را با زبان خود مخاطب خلاصه می‌کند، نه با زبان مارکتینگ.
- match: اگر همین بینش در فهرست «از قبل داریم» هست، شناسه‌اش؛ وگرنه null. فقط وقتی یکی بدان که واقعاً همان حرف است.
- sid: شناسه‌ی منبعی که این حرف در آن آمده.
- quote: عین جمله‌ی مخاطب از همان منبع، کلمه‌به‌کلمه کپی‌شده (حداکثر حدود ۳۰ کلمه)، بی هیچ تغییری. تکه‌ای انتخاب کن که
  اسم، آیدی یا شماره‌ی کسی در آن نیست. اگر چنین تکه‌ای نبود، "".

قواعد:
- اگر یک حرف در چند منبع آمده، برای هر منبع یک ردیف جدا بده. برای بینش تازه‌ای که در چند منبع آمده، text را در همه‌ی
  ردیف‌ها دقیقاً یکسان بنویس.
- هیچ چیزی که در منبع‌ها نیست نساز. حرف کلی و بدیهی («می‌خواهد موفق شود») ننویس؛ دنبال حرف مشخص باش.
- زبان text همان زبان غالب منبع‌هاست؛ quote به زبان خود منبع.

خروجی: فقط یک JSON معتبر بین یک خط <<<AU و یک خط AU>>>، بدون هیچ توضیح دیگری:
<<<AU
{"items": [{"type": "question", "text": "...", "match": null, "sid": "s...", "quote": "..."}]}
AU>>>

هیچ سؤالی نپرس."""


def _norm(s):
    s = str(s or "").lower().replace("ي", "ی").replace("ك", "ک").replace("ۀ", "ه").replace("ة", "ه")
    s = s.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789"))
    return re.sub(r"[\W_]+", "", s)


def mjob():
    with QLOCK:
        return dict(MJOB)


def _mset(**kw):
    with QLOCK:
        MJOB.update(kw)


def run_mine(sids):
    try:
        added = merged = dropped = 0
        todo = list(sids)
        batches = []
        while todo:
            cur, size = [], 0
            while todo and (not cur or size + min(len(src_text(todo[0])), MAX_SOURCE) <= BATCH):
                sid = todo.pop(0)
                cur.append(sid)
                size += min(len(src_text(sid)), MAX_SOURCE)
            batches.append(cur)
        brand = (bc.MD_F.read_text(encoding="utf-8") if bc.MD_F.exists() else "(هسته‌ی برند هنوز ساخته نشده)")[:12000]
        for n, batch in enumerate(batches, 1):
            _mset(step=f"Claude دارد حرف مخاطب‌ها را می‌خواند… ({fa(n)} از {fa(len(batches))})" if len(batches) > 1
                  else "Claude دارد حرف مخاطب‌ها را می‌خواند… (یکی دو دقیقه)")
            with LOCK:
                d = load()
                ins = [i for i in d["insights"] if not i.get("hidden")]
                meta = {s["id"]: s for s in d["sources"]}
            ins_lines = "\n".join(f"- {i['id']} · {i['type']} · {i['text']}" for i in ins[:300]) or "(هنوز هیچ)"
            src_block = "\n\n".join(
                f"<<<SOURCE {sid} · کانال: {CHANNELS.get(meta.get(sid, {}).get('channel'), 'دیگر')} · {meta.get(sid, {}).get('title', '')}\n"
                f"{src_text(sid)[:MAX_SOURCE]}\nSOURCE>>>" for sid in batch)
            prompt = (MINE_PROMPT.replace("__OWNER__", cfg.owner_line()).replace("__BRAND__", brand)
                      .replace("__INSIGHTS__", ins_lines).replace("__SOURCES__", src_block))
            data, err = xp.claude_json(prompt, "audience", "AU", timeout=1500)
            if data is None:
                return _mset(state="error", error="استخراج ناتمام ماند. " + err)
            texts = {sid: _norm(src_text(sid)) for sid in batch}
            now = time.strftime("%Y-%m-%d")
            with LOCK:
                d = load()
                by_id = {i["id"]: i for i in d["insights"]}
                fresh = {}
                k = 0
                for x in data.get("items") or []:
                    if not isinstance(x, dict) or x.get("type") not in TYPES or x.get("sid") not in texts:
                        continue
                    text = str(x.get("text") or "").strip()[:400]
                    if not text:
                        continue
                    q = str(x.get("quote") or "").strip().strip("«»\"'")[:400]
                    if q and (len(_norm(q)) < 4 or _norm(q) not in texts[x["sid"]]):
                        q, dropped = "", dropped + 1      # نقل‌قولی که عیناً در منبع نیست
                    tgt = by_id.get(x.get("match")) if x.get("match") else None
                    if tgt is None:
                        key = (x["type"], _norm(text))
                        tgt = fresh.get(key)
                        if tgt is None:
                            k += 1
                            tgt = {"id": f"a{int(time.time() * 1000)}{k:03d}", "type": x["type"], "text": text,
                                   "sources": [], "quotes": [], "created": now}
                            d["insights"].append(tgt)
                            by_id[tgt["id"]] = tgt
                            fresh[key] = tgt
                            added += 1
                    else:
                        merged += 1
                    if x["sid"] not in tgt["sources"]:
                        tgt["sources"].append(x["sid"])
                    if q and all(_norm(q) != _norm(o["q"]) for o in tgt["quotes"]) and len(tgt["quotes"]) < 8:
                        tgt["quotes"].append({"q": q, "sid": x["sid"]})
                    tgt["updated"] = now
                    tgt.pop("hidden", None)
                for sid in batch:
                    s = _src(d, sid)
                    if s:
                        s["state"] = "mined"
                _save(d)
        _mset(state="done", step="", added=added, merged=merged, dropped=dropped)
    except subprocess.TimeoutExpired:
        _mset(state="error", error="زمان تمام شد.")
    except Exception as e:
        _mset(state="error", error=f"خطا: {e}")


# ---------- خروجی‌ها ----------
def _ins(d, iid):
    return next((i for i in d["insights"] if i.get("id") == iid), None)


def to_idea(iid):
    with LOCK:
        d = load()
        i = _ins(d, iid)
        if not i:
            return 404, {"error": "این بینش پیدا نشد."}
        meta = TYPES[i["type"]]
        n = len(set(i.get("sources") or []))
        lines = ["# ایده از صدای مخاطب", "", f"- **نوع:** {meta['label']}", f"- **چند بار:** در {fa(n)} منبع جدا", "",
                 f"## حرف مخاطب", "", i["text"], ""]
        if i.get("quotes"):
            lines += ["## عین جمله‌های مخاطب‌ها", ""] + [f"> {q['q']}" for q in i["quotes"][:5]] + [""]
        if i.get("answer"):
            lines += ["## جواب خود من", "", i["answer"], ""]
        lines += ["## کار این محتوا", "", meta["goal"] + ".", "",
                  "> هوک را با کلمه‌های خود مخاطب بساز. اسم یا جزئیات شناسایی‌کننده‌ی کسی را نیاور و نقل‌قول را به اسم کسی نسبت نده."]
        nid = f"i{int(time.time() * 1000)}"
        (IDEAS / nid).mkdir(parents=True, exist_ok=True)
        (IDEAS / nid / "raw.md").write_text("\n".join(lines), encoding="utf-8")
        rec = {"id": nid, "title": i["text"][:120], "pillar": "", "status": "idea", "score": None,
               "source": {"kind": "audience", "ref": iid},
               "note": f"از صدای مخاطب · {meta['label']} · {fa(n)} منبع" + (" · فقط با اجازه منتشر شود" if i["type"] == "praise" else ""),
               **({"lang": "en"} if lg.current() == "en" else {}),
               "created": time.strftime("%Y-%m-%d"), "steps": {}}
        with cfg.IDEAS_LOCK:
            f = DATA / "ideas.json"
            try:
                ideas = json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                ideas = []
            f.write_text(json.dumps([rec] + ideas, ensure_ascii=False, indent=2), encoding="utf-8")
        i.setdefault("sent", {})["idea"] = nid
        _save(d)
    return 200, {"ok": True, "id": nid}


def to_brand(iid, answer):
    """بینش ← جواب پرسش‌نامه‌ی هسته‌ی برند، به‌صورت «پیش‌نویس از صدای مخاطب» که کاربر در تب هسته‌ی برند تأییدش می‌کند."""
    with LOCK:
        d = load()
        i = _ins(d, iid)
        if not i:
            return 404, {"error": "این بینش پیدا نشد."}
        fid = TYPES[i["type"]]["brand"]
        if not fid:
            return 400, {"error": "تعریف‌ها به بانک تجربه می‌روند، نه هسته‌ی برند."}
        answer = (answer or i.get("answer") or "").strip()
        if fid == "objections" and not answer:
            return 400, {"error": "اول جواب خودت را به این تردید یا سؤال بنویس؛ هسته‌ی برند جواب را از تو می‌خواهد، نه از Claude."}
        fields = bc.load()["fields"]
        cur = (fields.get(fid) or {}).get("v") or []
        cur = list(cur) if isinstance(cur, list) else []
        if fid == "objections":
            doubt = (i["quotes"][0]["q"] if i.get("quotes") else i["text"])
            cur.append({"doubt": doubt, "answer": answer})
            i["answer"] = answer
        else:
            if any(_norm(x) == _norm(i["text"]) for x in cur if isinstance(x, str)):
                return 409, {"error": "این مورد همین حالا در هسته‌ی برند هست."}
            cur.append(i["text"])
        upd = {fid: {"v": cur, "at": time.strftime("%Y-%m-%d"), "src": "صدای مخاطب",
                     "note": f"«{i['text'][:120]}» از صدای مخاطب اضافه شد."}}
        # «زبان خود مخاطب»: عین جمله‌ها هم کنارش
        words_new = [q["q"] for q in (i.get("quotes") or [])[:2]]
        wcur = (fields.get("words") or {}).get("v") or []
        wcur = list(wcur) if isinstance(wcur, list) else []
        wadd = [w for w in words_new if all(_norm(w) != _norm(x) for x in wcur if isinstance(x, str))]
        if wadd:
            upd["words"] = {"v": wcur + wadd, "at": time.strftime("%Y-%m-%d"), "src": "صدای مخاطب",
                            "note": f"{fa(len(wadd))} جمله‌ی عین مخاطب از صدای مخاطب اضافه شد."}
        ok, res = bc.save({**fields, **upd}, list(upd))
        if not ok:
            return 400, res
        i.setdefault("sent", {})["brand"] = time.strftime("%Y-%m-%d")
        _save(d)
    return 200, {"ok": True, "field": fid, "words": len(wadd)}


def to_experience(iid):
    with LOCK:
        d = load()
        i = _ins(d, iid)
        if not i or i["type"] != "praise":
            return 400, {"error": "فقط «تعریف و نتیجه» به بانک تجربه می‌رود."}
        text = i["text"] + ("\n\n" + "\n".join(f"«{q['q']}»" for q in i["quotes"][:3]) if i.get("quotes") else "")
    code, res = xp.handle_post("/api/experience/item", {"item": {
        "kind": "win", "title": i["text"][:70], "text": text, "who": "یکی از مخاطب‌ها", "consent": "ask"}})
    if code == 200:
        with LOCK:
            d = load()
            x = _ins(d, iid)
            if x:
                x.setdefault("sent", {})["experience"] = res["item"]["id"]
                _save(d)
    return code, res


# ---------- مسیرها ----------
def payload():
    d = load()
    with QLOCK:
        w = dict(WORKER)
    import instagram as ig
    return {"sources": d["sources"], "insights": d["insights"], "channels": CHANNELS, "types": TYPES,
            "states": SRC_STATE, "worker": w, "job": mjob(), "gemini": bool(cfg.gemini_key()),
            "ig": bool(ig.token()), "ffmpeg": bool(shutil.which("ffmpeg"))}


def handle_get(p, q):
    """(code, payload, ctype) — ctype=None یعنی payload جیسون است."""
    if p in STATIC:
        name, ctype = STATIC[p]
        return 200, (APP / name).read_bytes(), ctype
    if p == "/api/audience":
        return 200, payload(), None
    if p == "/api/audience/source":
        sid = q.get("id", [""])[0]
        if not _safe_id(sid):
            return 400, {"error": "bad id"}, None
        return 200, {"text": src_text(sid)}, None
    return None


def handle_post(p, body):
    if not p.startswith("/api/audience"):
        return None
    if p == "/api/audience/text":
        t = str(body.get("text") or "").strip()
        if len(t) < 10:
            return 400, {"error": "متن خیلی کوتاه است."}
        if len(t) > 400_000:
            return 400, {"error": "متن خیلی بلند است؛ چند تکه کن."}
        s = new_source("text", body.get("channel"), body.get("title") or t.split("\n")[0][:60], text=redact(t))
        return 200, {"ok": True, "source": s}
    if p == "/api/audience/source/delete":
        sid = body.get("id")
        if not _safe_id(sid):
            return 400, {"error": "bad id"}
        with LOCK:
            d = load()
            s = _src(d, sid)
            if not s:
                return 404, {"error": "پیدا نشد"}
            if s.get("state") == "working":
                return 409, {"error": "این منبع در حال پردازش است؛ کمی صبر کن."}
            d["sources"] = [x for x in d["sources"] if x.get("id") != sid]
            if s.get("file"):
                (FILES / s["file"]).unlink(missing_ok=True)
            (DIR / f"{sid}.txt").unlink(missing_ok=True)
            _save(d)
        return 200, {"ok": True}
    if p == "/api/audience/source/retry":
        with LOCK:
            d = load()
            s = _src(d, body.get("id"))
            if not s or s.get("state") != "error" or not s.get("file"):
                return 400, {"error": "این منبع را نمی‌شود دوباره پردازش کرد."}
            s["state"] = "queued"; s.pop("error", None)
            _save(d)
        kick()
        return 200, {"ok": True}
    if p == "/api/audience/mine":
        with LOCK:
            d = load()
            ids = [s["id"] for s in reversed(d["sources"])
                   if s.get("state") == "ready" or (body.get("all") and s.get("state") == "mined")]
        if not ids:
            return 400, {"error": "منبع تازه‌ای برای استخراج نیست."}
        with QLOCK:
            if MJOB["state"] == "running":
                return 409, {"error": "یک استخراج در حال اجراست."}
            MJOB.update(state="running", step="", error="", added=0, merged=0, dropped=0)
        threading.Thread(target=run_mine, args=(ids,), daemon=True).start()
        return 200, {"ok": True, "count": len(ids)}
    if p == "/api/audience/insight":
        with LOCK:
            d = load()
            i = _ins(d, body.get("id"))
            if not i:
                return 404, {"error": "پیدا نشد"}
            if isinstance(body.get("text"), str) and body["text"].strip():
                i["text"] = body["text"].strip()[:400]
            if isinstance(body.get("answer"), str):
                i["answer"] = body["answer"].strip()[:3000]
            if "hidden" in body:
                i["hidden"] = bool(body["hidden"])
            _save(d)
        return 200, {"ok": True, "insight": i}
    if p == "/api/audience/to-idea":
        return to_idea(body.get("id"))
    if p == "/api/audience/to-brand":
        return to_brand(body.get("id"), body.get("answer"))
    if p == "/api/audience/to-experience":
        return to_experience(body.get("id"))
    if p == "/api/audience/instagram":
        return import_comments(min(max(int(body.get("posts") or 20), 1), 50))
    return 404, {"error": "not found"}
