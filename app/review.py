"""مرور ماهانه: کارنامه‌ی ۳۰ روز، هدف‌ها، و یادگیری‌هایی که به همه‌ی بخش‌های استودیو برمی‌گردند.

کارنامه از داده‌هایی که استودیو همین حالا دارد ساخته می‌شود (هیچ عددی حدس زده نمی‌شود):
- تقویم محتوا (data/planner.json): چند خانه برنامه‌ریزی شد و چندتا «منتشر شد»
- تحلیل اینستاگرام (data/instagram/dataset.json، اگر وصل است): پست‌ها، بازدید، فالوور، بهترین و ضعیف‌ترین پست‌ها
- آبشار محتوا: قطعه‌هایی که برای لینکدین، X، یوتیوب و خبرنامه «منتشر شد» خورده‌اند
- بانک ایده، بانک تجربه، صدای مخاطب: چه چیزی تازه آمد
- عددهای دستی که فقط خود کاربر می‌داند (سرنخ فروش، مشتری تازه، مشترک خبرنامه…)

«تحلیل با Claude» از روی همین کارنامه می‌گوید چه کار کرد، چه نکرد، و چند یادگیری و تمرکز ماه بعد پیشنهاد می‌دهد؛
هر حرفش باید به عددی از کارنامه تکیه کند. کاربر اصلاح و تأیید می‌کند ← brand/learnings.md (knowledge.py) که
ایده‌ساز، ریلز، کاروسل، تقویم، مشاور و تحلیلگر می‌خوانند. این همان حلقه‌ی بازخورد است.

data/review.json = {"v": 1, "reviews": [...], "targets": [...], "pinned": [...], "manual_metrics": [...]}
"""
import json, re, secrets, threading, time
from datetime import date, timedelta
from pathlib import Path
import ai_models as am
import experience as xp
import settings as cfg
import waterfall as wfl

APP = Path(__file__).resolve().parent
ROOT = APP.parent
DATA = ROOT / "data"
FILE = DATA / "review.json"
MD = ROOT / "brand" / "learnings.md"
STATIC = {"/review.js": ("review.js", "text/javascript; charset=utf-8"),
          "/review.css": ("review.css", "text/css; charset=utf-8")}
LOCK = threading.Lock()
JLOCK = threading.Lock()
JOB = {"state": "idle", "rid": "", "step": "", "error": ""}
DEFAULT_MANUAL = ["دایرکت یا سرنخ فروش", "مشتری یا شاگرد تازه", "مشترک خبرنامه"]
AUTO = {"ig_followers": "فالوور اینستاگرام (الان)", "ig_posts": "پست اینستاگرام در ۳۰ روز", "ig_views": "بازدید اینستاگرام در ۳۰ روز",
        "published": "محتوای منتشرشده در ۳۰ روز (همه‌ی پلتفرم‌ها)", "ideas": "ایده‌ی تازه در ۳۰ روز", "manual": "عدد دستی"}
TYPE_FA = {"REEL": "ریلز", "CAROUSEL": "کاروسل", "IMAGE": "پست", "VIDEO": "ویدیو", "reel": "ریلز", "carousel": "کاروسل", "image": "پست", "post": "پست"}


# ---------- فایل ----------
def load():
    try:
        d = json.loads(FILE.read_text(encoding="utf-8"))
        if isinstance(d, dict):
            for k in ("reviews", "targets", "pinned"):
                d.setdefault(k, [])
            d.setdefault("manual_metrics", list(DEFAULT_MANUAL))
            return d
    except Exception:
        pass
    return {"v": 1, "reviews": [], "targets": [], "pinned": [], "manual_metrics": list(DEFAULT_MANUAL)}


def _save(d):
    d["v"] = 1
    DATA.mkdir(exist_ok=True)
    tmp = FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(FILE)
    _write_md(d)


def _j(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return default


def _in(day, a, b):
    return isinstance(day, str) and a <= day[:10] < b


# ---------- کارنامه ----------
def scorecard(start, end):
    """start تا end (end خودش بیرون). همه‌ی عددها از داده‌ی روی دیسک."""
    a, b = start.isoformat(), end.isoformat()
    n_days = (end - start).days
    pa, pb = (start - timedelta(days=n_days)).isoformat(), a
    out = {"from": a, "to": (end - timedelta(days=1)).isoformat(), "days": n_days}

    # تقویم محتوا
    plan = {}
    pdata = _j(DATA / "planner.json", {})
    for lang, weeks in ((pdata.get("weeks") or {}).items() if isinstance(pdata.get("weeks"), dict) else []):
        row = {"planned": 0, "done": 0, "by_format": {}}
        for wk, w in (weeks or {}).items():
            try:
                w0 = date.fromisoformat(wk)
            except ValueError:
                continue
            for s in (w or {}).get("slots") or []:
                day = (w0 + timedelta(days=int(s.get("day") or 0))).isoformat()
                if not _in(day, a, b):
                    continue
                f = row["by_format"].setdefault(s.get("format") or "?", [0, 0])
                row["planned"] += 1; f[0] += 1
                if s.get("status") == "done":
                    row["done"] += 1; f[1] += 1
        if row["planned"]:
            plan[lang] = row
    out["plan"] = plan

    # اینستاگرام
    ds = _j(DATA / "instagram" / "dataset.json", None)
    if isinstance(ds, dict) and ds.get("posts") is not None:
        posts = [p for p in ds.get("posts") or [] if _in(p.get("date"), a, b)]
        prev = [p for p in ds.get("posts") or [] if _in(p.get("date"), pa, pb)]
        days = ds.get("account_days") or []
        tot = lambda rows, k: sum((r.get(k) or 0) for r in rows)
        cur_d = [x for x in days if _in(x.get("date"), a, b)]
        prev_d = [x for x in days if _in(x.get("date"), pa, pb)]
        by = {}
        for p in posts:
            t = TYPE_FA.get(p.get("type"), p.get("type") or "?")
            by[t] = by.get(t, 0) + 1
        ranked = sorted([p for p in posts if isinstance(p.get("views_vs_median"), (int, float))], key=lambda p: -p["views_vs_median"])
        brief = lambda p: {"hook": (p.get("hook") or "")[:140], "type": TYPE_FA.get(p.get("type"), p.get("type")), "date": p.get("date"),
                           "views": p.get("views"), "shares": p.get("shares"), "saved": p.get("saved"),
                           "ratio": p.get("views_vs_median"), "link": p.get("permalink")}
        out["instagram"] = {
            "username": ds.get("username"), "synced": (ds.get("generated_at") or "")[:10],
            "followers": (ds.get("summary") or {}).get("followers"),
            "posts": len(posts), "by_type": by, "prev_posts": len(prev),
            "views": tot(cur_d, "views") if cur_d else None, "prev_views": tot(prev_d, "views") if prev_d else None,
            "reach": tot(cur_d, "reach") if cur_d else None,
            "follows": tot(cur_d, "follows") if cur_d else None, "prev_follows": tot(prev_d, "follows") if prev_d else None,
            "unfollows": tot(cur_d, "unfollows") if cur_d else None,
            "shares": tot(posts, "shares"), "saved": tot(posts, "saved"),
            "days_with_data": len(cur_d),
            "top": [brief(p) for p in ranked[:3]], "bottom": [brief(p) for p in ranked[max(3, len(ranked) - 3):][::-1]],   # هیچ پستی در هر دو فهرست نمی‌آید
        }
    else:
        out["instagram"] = None

    # آبشار محتوا (همه‌ی پلتفرم‌ها)
    wf = {"done": 0, "by_platform": {}, "scheduled": 0}
    for iid, d in wfl.all_waterfalls():
        for x in d.get("assets") or []:
            plat = wfl.TYPES.get(x.get("type"), {}).get("platform", "?")
            if _in(x.get("done"), a, b):
                wf["done"] += 1
                wf["by_platform"][plat] = wf["by_platform"].get(plat, 0) + 1
            elif not x.get("done") and _in(x.get("date"), a, b):
                wf["scheduled"] += 1
    out["waterfall"] = wf

    # بانک ایده، بانک تجربه، صدای مخاطب
    ideas = _j(DATA / "ideas.json", [])
    new = [i for i in ideas if isinstance(i, dict) and _in(i.get("created"), a, b)]
    src = {}
    for i in new:
        k = (i.get("source") or {}).get("kind") or "text"
        src[k] = src.get(k, 0) + 1
    out["ideas"] = {"created": len(new), "by_source": src,
                    "with_reel": sum(1 for i in new if (i.get("steps") or {}).get("produce"))}
    exp = _j(DATA / "experience.json", {})
    out["experience"] = {"added": sum(1 for i in exp.get("items") or [] if _in(i.get("created"), a, b)),
                         "ritual": exp.get("ritual_at") if _in(exp.get("ritual_at"), a, b) else None}
    aud = _j(DATA / "audience.json", {})
    ins = [i for i in aud.get("insights") or [] if not i.get("hidden")]
    out["audience"] = {"sources": sum(1 for s in aud.get("sources") or [] if _in(s.get("created"), a, b)),
                       "new_insights": sum(1 for i in ins if _in(i.get("created"), a, b)),
                       "top": [{"type": i.get("type"), "text": i.get("text"), "n": len(set(i.get("sources") or []))}
                               for i in sorted(ins, key=lambda i: -len(set(i.get("sources") or [])))[:6]]}
    # «منتشرشده» برای هدف‌ها: خانه‌های «منتشر شد» تقویم + قطعه‌های آبشار که بیرون از اینستاگرام منتشر شدند
    # (قطعه‌ی اینستاگرامیِ آبشار که در تقویم هم هست دو بار شمرده نمی‌شود: فقط پلتفرم‌های غیر اینستاگرام)
    out["published"] = sum(r["done"] for r in plan.values()) + sum(n for p, n in wf["by_platform"].items() if p != "Instagram")
    return out


def window(end=None):
    end = end or date.today() + timedelta(days=1)
    return end - timedelta(days=30), end


def auto_value(metric, sc):
    ig = sc.get("instagram") or {}
    return {"ig_followers": ig.get("followers"), "ig_posts": ig.get("posts") if ig else None, "ig_views": ig.get("views"),
            "published": sc.get("published"), "ideas": (sc.get("ideas") or {}).get("created")}.get(metric)


# ---------- brand/learnings.md ----------
MD_HEAD = """# یادگیری‌ها

> این فایل خودکار از تب «مرور ماهانه» در Content Studio ساخته می‌شود؛ دستی ویرایشش نکن.

**قانون ایجنت‌ها:** این‌ها را صاحب پیج از عملکرد واقعی محتوای قبلی‌اش یاد گرفته و تأیید کرده. وقتی ایده، هوک، قالب یا
زمان انتشار انتخاب می‌کنی، این‌ها را در نظر بگیر و اگر خلافشان پیشنهاد می‌دهی، بگو چرا. نمونه‌ها کوچک‌اند؛ این‌ها
راهنما هستند، نه قانون مطلق (قانون‌ها در هسته‌ی برند است). عددهای این فایل را در محتوای منتشرشدنی نیاور.
"""


def _write_md(d):
    approved = [r for r in d.get("reviews") or [] if r.get("approved")][-3:][::-1]
    out = [MD_HEAD]
    if d.get("pinned"):
        out += ["## یادگیری‌های ثابت", ""] + [f"- {x}" for x in d["pinned"]] + [""]
    for n, r in enumerate(approved):
        dr = r.get("draft") or {}
        out += [f"## مرور {r.get('to', r['id'])} (۳۰ روز)", ""]
        out += [f"- {x}" for x in dr.get("learnings") or []]
        if n == 0 and dr.get("focus"):
            out += ["", "**تمرکز ماه بعد:**"] + [f"- {x}" for x in dr["focus"]]
        if n == 0 and dr.get("experiments"):
            out += ["", "**آزمایش‌ها:**"] + [f"- {e.get('test')} — سنجش: {e.get('measure')}" for e in dr["experiments"] if isinstance(e, dict)]
        out.append("")
    MD.parent.mkdir(exist_ok=True)
    if len(out) == 1:
        if MD.exists():
            MD.unlink()
        return
    tmp = MD.with_suffix(".md.tmp")
    tmp.write_text("\n".join(out).rstrip()[:9000] + "\n", encoding="utf-8")
    tmp.replace(MD)


# ---------- تحلیل با Claude ----------
REVIEW_PROMPT = """تو مدیر محتوای __OWNER__ هستی و با او مرور ماهانه‌ی محتوایش را انجام می‌دهی: ۳۰ روز گذشته چه شد، چرا،
و ماه بعد روی چه تمرکز کند.

هسته‌ی برند او (برای شناختن هدف‌ها و مخاطب):
<<<BRAND
__BRAND__
BRAND>>>

کارنامه‌ی این ۳۰ روز (JSON؛ همه‌ی عددها از داده‌ی واقعی استودیو؛ null یعنی داده نیست):
<<<SCORE
__SCORE__
SCORE>>>

عددهای دستی که خودش وارد کرده:
__MANUAL__

هدف‌هایش و پیشرفت فعلی:
__TARGETS__

یادگیری‌های قبلی که تأیید کرده:
__PREV__

آخرین گزارش تحلیلگر اینستاگرام (اگر هست):
__REPORT__

یادداشت خودش برای این مرور:
__NOTE__

کار:
- summary: سه جمله‌ی روشن: این ماه در یک نگاه.
- worked: ۲ تا ۴ چیزی که کار کرد؛ هر کدام با evidence که دقیقاً به عددی از کارنامه اشاره کند.
- didnt: ۲ تا ۴ چیزی که کار نکرد یا عقب ماند (مثلاً فاصله‌ی برنامه تا انتشار، هدفی که عقب است)، با evidence.
- learnings: ۳ تا ۵ یادگیری که از این به بعد به کار بیاید، هر کدام یک جمله‌ی دستوری و مشخص («ریلزهایی که هوکشان سؤال
  مستقیم مخاطب است…»)، نه حرف کلی. فقط چیزی که داده‌ی این کارنامه نشانش می‌دهد.
- focus: ۳ کار مشخص برای ۳۰ روز بعد.
- experiments: ۱ تا ۲ آزمایش، هر کدام با test (چه کار متفاوتی) و measure (با کدام عدد کارنامه سنجیده می‌شود).

قواعد:
- هیچ عددی نساز و عددی را گرد نکن که معنی‌اش عوض شود. اگر داده‌ای نیست، بگو نیست؛ حدس نزن.
- اگر نمونه کوچک است (مثلاً کمتر از ۶ پست، یا اینستاگرام وصل نیست)، صریح بگو و یادگیری را محتاطانه بنویس.
- «جواب ندادن» را شکست شخصی جلوه نده؛ لحن یک مدیر محتوای صادق و هم‌تیمی.
- فارسی، روشن و کوتاه.

خروجی: فقط یک JSON معتبر بین یک خط <<<RV و یک خط RV>>>، بدون هیچ توضیح دیگری:
<<<RV
{"summary": "...", "worked": [{"point": "...", "evidence": "..."}], "didnt": [{"point": "...", "evidence": "..."}],
 "learnings": ["..."], "focus": ["..."], "experiments": [{"test": "...", "measure": "..."}]}
RV>>>
هیچ سؤالی نپرس."""


def _targets_lines(d, sc):
    out = []
    for t in d.get("targets") or []:
        cur = t.get("current") if t.get("metric") == "manual" else auto_value(t.get("metric"), sc)
        out.append(f"- {t.get('label')}: هدف {t.get('target')}" + (f" تا {t['by']}" if t.get("by") else "") + f"؛ الان {cur if cur is not None else 'نامعلوم'}")
    return "\n".join(out) or "(هدفی تعریف نشده)"


def _latest_report():
    rep = DATA / "instagram" / "reports"
    try:
        f = max(rep.glob("*.md"), key=lambda p: p.stat().st_mtime)
        return f.read_text(encoding="utf-8")[:5000]
    except Exception:
        return "(نیست)"


def run_review(rid):
    try:
        with LOCK:
            d = load()
            r = next((x for x in d["reviews"] if x["id"] == rid), None)
        if not r:
            return _jset(state="error", error="این مرور پیدا نشد.")
        _jset(step="Claude دارد کارنامه را می‌خواند… (یکی دو دقیقه)")
        import brand as bc
        try:
            brand = bc.MD_F.read_text(encoding="utf-8")[:14000]
        except Exception:
            brand = "(هسته‌ی برند هنوز ساخته نشده)"
        prev = [x for x in d["pinned"]] + [l for x in d["reviews"] if x.get("approved") and x["id"] != rid
                                            for l in (x.get("draft") or {}).get("learnings") or []][-10:]
        manual = "\n".join(f"- {k}: {v}" for k, v in (r.get("manual") or {}).items() if str(v).strip()) or "(هیچ)"
        prompt = (REVIEW_PROMPT.replace("__OWNER__", cfg.owner_line()).replace("__BRAND__", brand)
                  .replace("__SCORE__", json.dumps(r["score"], ensure_ascii=False, indent=1))
                  .replace("__MANUAL__", manual).replace("__TARGETS__", _targets_lines(d, r["score"]))
                  .replace("__PREV__", "\n".join(f"- {x}" for x in prev) or "(هنوز هیچ)")
                  .replace("__REPORT__", _latest_report()).replace("__NOTE__", r.get("note") or "(هیچ)"))
        data, err = xp.claude_json(prompt, "review", "RV", timeout=1200)
        if data is None:
            return _jset(state="error", error="تحلیل ناتمام ماند. " + err)
        s = lambda x, n=600: str(x or "").strip()[:n]
        pairs = lambda k: [{"point": s(x.get("point")), "evidence": s(x.get("evidence"))} for x in data.get(k) or [] if isinstance(x, dict) and x.get("point")][:6]
        draft = {"summary": s(data.get("summary"), 1200), "worked": pairs("worked"), "didnt": pairs("didnt"),
                 "learnings": [s(x, 400) for x in data.get("learnings") or [] if str(x or "").strip()][:6],
                 "focus": [s(x, 400) for x in data.get("focus") or [] if str(x or "").strip()][:5],
                 "experiments": [{"test": s(x.get("test"), 400), "measure": s(x.get("measure"), 300)} for x in data.get("experiments") or [] if isinstance(x, dict) and x.get("test")][:3]}
        with LOCK:
            d = load()
            r = next((x for x in d["reviews"] if x["id"] == rid), None)
            if r:
                r["draft"] = draft
                r.pop("approved", None)
                _save(d)
        _jset(state="done", step="")
    except Exception as e:
        _jset(state="error", error=f"خطا: {e}")


def _jset(**kw):
    with JLOCK:
        JOB.update(kw)


# ---------- مسیرها ----------
def payload():
    d = load()
    a, b = window()
    sc = scorecard(a, b)
    targets = []
    for t in d["targets"]:
        cur = t.get("current") if t.get("metric") == "manual" else auto_value(t.get("metric"), sc)
        targets.append({**t, "value": cur})
    with JLOCK:
        j = dict(JOB)
    last = d["reviews"][-1]["id"] if d["reviews"] else ""
    return {"live": sc, "reviews": d["reviews"][::-1], "targets": targets, "pinned": d["pinned"],
            "manual_metrics": d["manual_metrics"], "auto": AUTO, "job": j, "today": date.today().isoformat(),
            "last": last, "md": MD.read_text(encoding="utf-8") if MD.exists() else ""}


def handle_get(p, q):
    if p in STATIC:
        name, ctype = STATIC[p]
        return 200, (APP / name).read_bytes(), ctype
    if p == "/api/review":
        return 200, payload(), None
    if p == "/api/review/job":
        with JLOCK:
            return 200, dict(JOB), None
    return None


def handle_post(p, body):
    if not p.startswith("/api/review"):
        return None
    if p == "/api/review/new":
        manual = body.get("manual") if isinstance(body.get("manual"), dict) else {}
        a, b = window()
        rid = date.today().isoformat() + "-" + secrets.token_hex(2)
        with LOCK:
            d = load()
            r = {"id": rid, "from": a.isoformat(), "to": (b - timedelta(days=1)).isoformat(), "score": scorecard(a, b),
                 "manual": {str(k)[:80]: str(v)[:40] for k, v in manual.items()}, "note": str(body.get("note") or "")[:3000],
                 "created": time.strftime("%Y-%m-%d %H:%M")}
            d["reviews"].append(r)
            d["reviews"] = d["reviews"][-36:]
            _save(d)
        with JLOCK:
            if JOB["state"] == "running":
                return 200, {"ok": True, "id": rid, "queued": False, "warn": "یک تحلیل دیگر در حال اجراست؛ مرور ثبت شد، بعداً «تحلیل با Claude» را بزن."}
            JOB.update(state="running", rid=rid, step="", error="")
        threading.Thread(target=run_review, args=(rid,), daemon=True).start()
        return 200, {"ok": True, "id": rid}
    if p == "/api/review/analyze":
        rid = str(body.get("id") or "")
        with LOCK:
            if not any(r["id"] == rid for r in load()["reviews"]):
                return 404, {"error": "این مرور پیدا نشد."}
        with JLOCK:
            if JOB["state"] == "running":
                return 409, {"error": "یک تحلیل در حال اجراست."}
            JOB.update(state="running", rid=rid, step="", error="")
        threading.Thread(target=run_review, args=(rid,), daemon=True).start()
        return 200, {"ok": True}
    if p == "/api/review/save":
        rid, dr = str(body.get("id") or ""), body.get("draft")
        with LOCK:
            d = load()
            r = next((x for x in d["reviews"] if x["id"] == rid), None)
            if not r:
                return 404, {"error": "این مرور پیدا نشد."}
            if isinstance(dr, dict):
                lst = lambda k: [str(x).strip()[:400] for x in dr.get(k) or [] if str(x or "").strip()][:8]
                r["draft"] = {**(r.get("draft") or {}), "learnings": lst("learnings"), "focus": lst("focus")}
            if isinstance(body.get("manual"), dict):
                r["manual"] = {str(k)[:80]: str(v)[:40] for k, v in body["manual"].items()}
            if "approved" in body:
                if body["approved"] and not (r.get("draft") or {}).get("learnings"):
                    return 400, {"error": "اول دست‌کم یک یادگیری بنویس."}
                r["approved"] = time.strftime("%Y-%m-%d") if body["approved"] else ""
                if not r["approved"]:
                    r.pop("approved")
            _save(d)
        return 200, {"ok": True, "review": r}
    if p == "/api/review/delete":
        with LOCK:
            d = load()
            d["reviews"] = [x for x in d["reviews"] if x["id"] != body.get("id")]
            _save(d)
        return 200, {"ok": True}
    if p == "/api/review/pin":
        txt = str(body.get("text") or "").strip()[:400]
        with LOCK:
            d = load()
            if body.get("remove"):
                d["pinned"] = [x for x in d["pinned"] if x != txt]
            elif txt and txt not in d["pinned"]:
                d["pinned"].append(txt)
            _save(d)
        return 200, {"ok": True, "pinned": d["pinned"]}
    if p == "/api/review/target":
        t = body.get("target")
        with LOCK:
            d = load()
            if body.get("remove"):
                d["targets"] = [x for x in d["targets"] if x.get("id") != body.get("id")]
            elif isinstance(t, dict):
                if t.get("metric") not in AUTO or not str(t.get("label") or "").strip():
                    return 400, {"error": "اسم و نوع هدف را مشخص کن."}
                try:
                    tv = float(str(t.get("target")).replace(",", ""))
                except ValueError:
                    return 400, {"error": "عدد هدف نامعتبر است."}
                by = str(t.get("by") or "")
                if by and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", by):
                    by = ""
                clean = {"id": t.get("id") or "t" + secrets.token_hex(3), "label": str(t["label"]).strip()[:80],
                         "metric": t["metric"], "target": tv, "by": by}
                if t["metric"] == "manual":
                    try:
                        clean["current"] = float(str(t.get("current") or 0).replace(",", ""))
                    except ValueError:
                        clean["current"] = 0
                d["targets"] = [x for x in d["targets"] if x.get("id") != clean["id"]] + [clean]
            _save(d)
        return 200, {"ok": True}
    if p == "/api/review/metrics":
        ms = [str(x).strip()[:80] for x in body.get("metrics") or [] if str(x or "").strip()][:10]
        with LOCK:
            d = load()
            d["manual_metrics"] = ms
            _save(d)
        return 200, {"ok": True}
    return 404, {"error": "not found"}
