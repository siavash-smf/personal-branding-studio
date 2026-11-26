"""دانش زنده‌ی صاحب استودیو، کنار هسته‌ی برند.

هسته‌ی برند (brand/brand-core.md) می‌گوید او کیست و چه قواعدی دارد؛ این فایل‌ها می‌گویند این روزها چه
تجربه کرده، مخاطبش چه می‌گوید و محتوای قبلی چه یادش داده. هر کدام را تب خودش خودکار می‌سازد:

    brand/experience.md       تب «بانک تجربه» (experience.py)
    brand/audience-voice.md   تب «صدای مخاطب» (audience.py)
    brand/learnings.md        تب «مرور ماهانه» (review.py)

ایجنت‌هایی که در پوشه‌ی استودیو اجرا می‌شوند این‌ها را از روی CLAUDE.md می‌خوانند. کارهایی که بیرون از پوشه
اجرا می‌شوند (کاروسل، تقویم، مشاور، ایده‌های ترجمه) هسته‌ی برند را داخل پرامپت می‌گذارند؛ آن‌ها به‌جای
خواندن مستقیم brand-core.md از brand_plus() استفاده می‌کنند تا این دانش هم همراهش برود.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
FILES = ("experience.md", "audience-voice.md", "learnings.md")
PER_FILE = 9000      # هر فایل خودش هم سقف دارد؛ این فقط برای اطمینان است


def extra():
    """متن همه‌ی فایل‌های دانشِ موجود، پشت سر هم. اگر هیچ‌کدام نبود: رشته‌ی خالی."""
    parts = []
    for name in FILES:
        f = BRAND / name
        try:
            t = f.read_text(encoding="utf-8").strip()
        except Exception:
            continue
        if t:
            parts.append(t[:PER_FILE])
    return "\n\n---\n\n".join(parts)


def brand_plus(brand_md):
    """هسته‌ی برند + دانش زنده. هسته‌ی برند اول می‌آید چون قانون است؛ بقیه ماده‌ی خام‌اند."""
    x = extra()
    return (brand_md or "") + ("\n\n---\n\n" + x if x else "")
