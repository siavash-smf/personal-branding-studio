"""زبان محتوا: فارسی یا English.

یک کلید در هدر استودیو (فا / EN) می‌گوید خروجی‌های تازه به چه زبانی ساخته شوند؛ برای وقتی که
صاحب استودیو پیج انگلیسی هم دارد. ذخیره در data/settings.json («content_lang» و «en_type»).

- هر claude که محتوا می‌سازد `*lang.claude_args()` را به خط فرمانش اضافه می‌کند. در حالت فارسی
  هیچ آرگومانی اضافه نمی‌شود (رفتار قبلی دست نمی‌خورد)؛ در حالت انگلیسی یک --append-system-prompt
  می‌گوید محتوا انگلیسی نوشته شود ولی عنوان‌ها، برچسب‌ها و کلیدهای JSON قالب عیناً بمانند، چون
  استودیو آن‌ها را می‌خواند (مثلاً «**امتیاز:**» در استودیو ریلز).
- چیزی که زبان خودش را دارد (کاروسل، ریلز ساخته‌شده) زبانش را نگه می‌دارد و `claude_args(lang)` می‌گیرد.
- ترجمه‌ی یوتیوب همیشه فارسی است و تدوین ویدیو هنوز به این کلید وصل نیست.
- فونت‌های انگلیسی (لاتین، متغیر، OFL) در app/fonts/en/ هستند و استوری و کاروسل در حالت انگلیسی با آن‌ها
  کشیده می‌شوند؛ کاربر یک فونت تیتر و یک فونت متن انتخاب می‌کند.
"""
from pathlib import Path
import settings as cfg

APP = Path(__file__).resolve().parent
FONTS = APP / "fonts" / "en"
LANGS = ("fa", "en")

STATIC = {"/lang.js": ("lang.js", "text/javascript; charset=utf-8"),
          "/lang.css": ("lang.css", "text/css; charset=utf-8")}

# family: اسم CSS؛ file: در app/fonts/en؛ wght: بازه‌ی وزن فایل متغیر
FONT_LIST = [
    {"id": "inter",      "family": "Inter",            "file": "Inter-Variable.woff2",           "wght": "100 900", "kind": "sans",
     "note": "Clean and neutral; reads well at any size"},
    {"id": "montserrat", "family": "Montserrat",       "file": "Montserrat-Variable.woff2",      "wght": "100 900", "kind": "sans",
     "note": "Bold geometric headlines; a classic on Instagram"},
    {"id": "playfair",   "family": "Playfair Display", "file": "PlayfairDisplay-Variable.woff2", "wght": "400 900", "kind": "serif",
     "note": "Editorial serif; premium and elegant"},
    {"id": "oswald",     "family": "Oswald",           "file": "Oswald-Variable.woff2",          "wght": "200 700", "kind": "condensed",
     "note": "Condensed and loud; big statements, short lines"},
    {"id": "fraunces",   "family": "Fraunces",         "file": "Fraunces-Variable.woff2",        "wght": "100 900", "kind": "serif",
     "note": "Warm, soft serif with personality"},
    {"id": "space",      "family": "Space Grotesk",    "file": "SpaceGrotesk-Variable.woff2",    "wght": "300 700", "kind": "sans",
     "note": "Techy and modern; great for AI and product topics"},
]
FONT_IDS = {f["id"] for f in FONT_LIST}
# جفت‌های آماده؛ head = تیتر و متن استوری، body = متن اسلاید کاروسل
PAIRS = [
    {"id": "modern",    "name": "Modern",    "head": "montserrat", "body": "inter"},
    {"id": "editorial", "name": "Editorial", "head": "playfair",   "body": "inter"},
    {"id": "loud",      "name": "Loud",      "head": "oswald",     "body": "inter"},
    {"id": "warm",      "name": "Warm",      "head": "fraunces",   "body": "inter"},
    {"id": "tech",      "name": "Tech",      "head": "space",      "body": "space"},
    {"id": "clean",     "name": "Clean",     "head": "inter",      "body": "inter"},
]
DEFAULT_TYPE = {"head": "montserrat", "body": "inter"}

CONTENT_EN = """# Output language: ENGLISH (this overrides every language instruction in the prompt)

The studio owner is creating content for their English-language Instagram page. Everything you write for this task \
(titles, hooks, scripts, captions, CTAs, hashtags, slide and story text, idea titles, topic suggestions, analysis, \
research notes and reports) must be in natural, native-level English, written the way a native English-speaking \
creator would say it. Do not translate Persian phrasing word for word; rewrite idioms, examples and cultural references \
so they land with an English-speaking audience.

- Wherever the instructions ask for Persian (for example "فارسی", "فارسی محاوره‌ای", "به فارسی", a Persian title, \
Persian hashtags, a Persian explanation of an English term), apply the same intent in English: conversational spoken \
English for scripts, clean written English for captions, English hashtags only. Use Gregorian dates only (no Solar \
Hijri dates) and Western digits (0-9).
- Keep the required output format exactly. File names, Markdown section headings, bold field labels, fixed markers \
and JSON keys must stay character-for-character as the instructions write them, even when they are in Persian \
(for example «## تایتل», «**امتیاز:**», «**تایتل:**», «# 🎬 ریلز ۱ —», <<<REEL … REEL>>>). The studio parses them. \
Only the content you write under or after them is in English.
- The brand core still governs everything: tone, audience, pillars, red lines, forbidden claims and CTA rules. When its \
examples or ready-made CTA lines are in Persian, adapt them into English with the same meaning and intent.
- Same honesty rules: never invent numbers, sources or quotes. Prefer English-language sources for an English audience.
- Exception: a file or section that is explicitly a Persian translation for the owner to read \
(such as 01-متن-کامل-فارسی.md) stays in Persian."""

CHAT_EN = """# Content language: ENGLISH

The owner is currently working on their English-language Instagram page. Keep talking with them in whatever language \
they write to you, but write every piece of content you draft (hooks, scripts, captions, CTAs, hashtags, slide or story \
text, and the title and text of any idea you hand to the idea bank) in natural, native-level English for an \
English-speaking audience. Keep every fixed marker and JSON key of the blocks you emit exactly as your instructions \
specify (for example <<<IDEA … IDEA>>>)."""


def current():
    v = cfg.load().get("content_lang")
    return v if v in LANGS else "fa"


def type_choice():
    t = cfg.load().get("en_type")
    t = t if isinstance(t, dict) else {}
    return {k: t.get(k) if t.get(k) in FONT_IDS else DEFAULT_TYPE[k] for k in DEFAULT_TYPE}


def claude_args(lang=None, kind="content"):
    """آرگومان‌های اضافه‌ی claude برای زبان محتوا. lang=None یعنی کلید هدر؛ فارسی = هیچ."""
    lang = lang if lang in LANGS else current()
    if lang != "en":
        return []
    return ["--append-system-prompt", CHAT_EN if kind == "chat" else CONTENT_EN]


def payload():
    return {"lang": current(), "type": type_choice(), "fonts": FONT_LIST, "pairs": PAIRS}


def handle_get(p, q):
    """(code, payload, ctype) — ctype=None یعنی payload جیسون است."""
    if p in STATIC:
        name, ctype = STATIC[p]
        return 200, (APP / name).read_bytes(), ctype
    if p.startswith("/fonts/en/"):
        name = p[len("/fonts/en/"):]
        f = FONTS / name
        if name not in {x["file"] for x in FONT_LIST} or not f.is_file():
            return 404, {"error": "not found"}, None
        return 200, f.read_bytes(), "font/woff2"
    if p == "/api/lang":
        return 200, payload(), None
    return None


def handle_post(p, body):
    if p == "/api/lang":
        patch = {}
        if "lang" in body:
            if body["lang"] not in LANGS:
                return 400, {"error": "bad lang"}
            patch["content_lang"] = body["lang"]
        t = body.get("type")
        if isinstance(t, dict):
            clean = {k: v for k, v in t.items() if k in DEFAULT_TYPE and v in FONT_IDS}
            if clean:
                patch["en_type"] = {**type_choice(), **clean}
        if not patch:
            return 400, {"error": "nothing to save"}
        cfg.save(patch)
        return 200, {"ok": True, **payload()}
    return None
