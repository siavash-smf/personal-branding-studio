/* ================= تقویم محتوا =================
   «تعریف برنامه»: ستون‌های محتوا (با سهم هر کدام)، فرمت‌ها (تعداد در هفته، ساعت کار، هدف، ساعت انتشار)، ریتم انتشار
   (روزها، سقف پست روزانه، ظرفیت ساعتی، روز تولید، سهم فروش) و سری‌های ثابت هفتگی. plGenerate از روی همین یک هفته
   می‌چیند: هر فرمت با فاصله‌ی برابر روی روزهای انتشار، ستون‌ها به نسبت سهمشان (بزرگ‌ترین باقیمانده) و بدون تکرار
   پشت‌سرهم، و سهم فروش روی خانه‌های اعتمادسازِ آخر هفته. پیش‌نمایش و «سلامت برنامه» با هر تغییر همان لحظه عوض می‌شوند.
   «برنامه‌ی هفته»: هر خانه جابه‌جا (کشیدن و رها کردن)، قفل، ویرایش، وصل به بانک ایده یا پر شده با Claude؛
   «بازچینی» فقط خانه‌های قفل‌نشده را عوض می‌کند. خروجی: فایل تقویم (ics)، متن، CSV.
   هر زبان (کلید فا/EN هدر) یک پیج است با تعریف و هفته‌های خودش، و رابط همین تب هم به زبان همان پیج است.
   داده: /api/planner (app/planner.py). */

const PL = {
  d: null, lang: 'fa', view: 'week', week: null, today: null, plan: null, fresh: false, pseed: 7,
  tPlan: 0, tWeek: 0, pendPlan: null, pendWeek: null, poll: 0, sheet: null, drag: null, menu: false,
};
const L = (fa, en) => PL.lang === 'en' ? en : fa;
const N = n => PL.lang === 'en' ? String(n) : faNum(n);
const plH = h => PL.lang === 'en' ? String(Math.round(h * 10) / 10) : faNum(Math.round(h * 10) / 10).replace('.', '٫');
const plPad = n => String(n).padStart(2, '0');
const plISO = d => `${d.getFullYear()}-${plPad(d.getMonth() + 1)}-${plPad(d.getDate())}`;
const plDate = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const plAdd = (s, n) => { const d = plDate(s); d.setDate(d.getDate() + n); return plISO(d); };
const plStartOf = (iso, ws) => { const d = plDate(iso); d.setDate(d.getDate() - (d.getDay() - ws + 7) % 7); return plISO(d); };
const plFmtD = (iso, o) => new Intl.DateTimeFormat(PL.lang === 'en' ? 'en-US' : 'fa-IR-u-ca-persian', o).format(plDate(iso));
const PL_DAYS = { fa: ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'],
                  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };
const PL_DAYS_S = { fa: ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const plDay = (wd, short) => (short ? PL_DAYS_S : PL_DAYS)[PL.lang][wd];
const plId = p => (p || 's') + Math.random().toString(36).slice(2, 9);
const plCmp = (a, b) => a.day - b.day || String(a.time || '').localeCompare(String(b.time || ''));
const plTime = t => PL.lang === 'en' ? (t || '') : faNum(t || '');
// انتخاب ساعت ۲۴ساعته با گام نیم ساعت (input type=time در هر سیستم شکل دیگری دارد و AM/PM در کادر باریک بریده می‌شد)
function plTimeSel(attrs, cur) {
  const list = [...Array(48).keys()].map(i => `${plPad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`);
  if (cur && !list.includes(cur)) list.push(cur), list.sort();
  return `<select ${attrs} dir="ltr">${list.map(t => `<option value="${t}" ${t === cur ? 'selected' : ''}>${plTime(t)}</option>`).join('')}</select>`;
}

/* ---------- فرمت‌ها، هدف‌ها، قالب‌ها ----------
   lane: feed = پست صفحه (سقف روزانه و تعداد پست هفته را می‌سازد)؛ side = استوری، لایو و کانال (کنار پست‌ها، هر روز یکی).
   effort = ساعت کار برای یک بار (برای استوری: یک روز استوری). نقش هر فرمت از داده‌های عمومی (پایین «سلامت برنامه»). */
const PL_FORMATS = [
  { id: 'reel', lane: 'feed', effort: 3, goal: 'reach', time: '18:00', per: 3, pillar: true, icon: '▶',
    fa: ['ریلز', 'بیشترین دیده‌شدن پیش مخاطب تازه؛ موتور رشد پیج'], en: ['Reel', 'Highest reach to non-followers; your growth engine'] },
  { id: 'carousel', lane: 'feed', effort: 2, goal: 'trust', time: '15:00', per: 2, pillar: true, icon: '❐',
    fa: ['کاروسل', 'بیشترین سیو و تعامل؛ عمق و اعتماد'], en: ['Carousel', 'Most saves and engagement; depth and trust'] },
  { id: 'post', lane: 'feed', effort: 0.75, goal: 'engage', time: '12:00', per: 0, pillar: true, icon: '▢',
    fa: ['پست تک‌تصویر', 'یک حرف روشن یا یک جمله از خودت؛ سریع'], en: ['Single image', 'One clear point or a line of your own; quick'] },
  { id: 'trial', lane: 'feed', effort: 1.5, goal: 'reach', time: '20:00', per: 0, pillar: true, icon: '◇',
    fa: ['ریلز آزمایشی', 'اول فقط به غیردنبال‌کننده‌ها نشان داده می‌شود؛ برای آزمودن هوک و موضوع تازه'],
    en: ['Trial reel', 'Shown to non-followers first; test a new hook or topic safely'] },
  { id: 'collab', lane: 'feed', effort: 2.5, goal: 'reach', time: '18:00', per: 0, pillar: true, icon: '⇄',
    fa: ['پست همکاری', 'با یک پیج دیگر منتشر می‌شود و به مخاطب او هم می‌رسد'], en: ['Collab post', 'Co-published with another account; reaches their audience too'] },
  { id: 'story', lane: 'side', effort: 0.25, goal: 'connect', time: '10:00', per: 5, pillar: false, icon: '◔',
    fa: ['استوری', 'رابطه با دنبال‌کننده‌های فعلی: نظرسنجی، پشت‌صحنه، پیگیری پست‌ها'],
    en: ['Stories', 'Connection with current followers: polls, behind the scenes, follow-ups'] },
  { id: 'live', lane: 'side', effort: 1.5, goal: 'convert', time: '21:00', per: 0, pillar: true, icon: '◉',
    fa: ['لایو', 'پرسش و پاسخ زنده؛ اعتماد سریع و فرصت دعوت به پیشنهادت'], en: ['Live', 'Live Q&A; fast trust and a natural moment to invite to your offer'] },
  { id: 'broadcast', lane: 'side', effort: 0.25, goal: 'connect', time: '19:00', per: 0, pillar: false, icon: '✉',
    fa: ['کانال (Broadcast)', 'پیام مستقیم به وفادارترین‌ها؛ خبر، پیش‌نمایش، نظرسنجی'], en: ['Broadcast channel', 'A direct line to your most loyal followers; news, previews, polls'] },
];
const PL_GOALS = {
  reach:   { cta: 'send',    fa: 'دیده‌شدن', en: 'Reach' },
  trust:   { cta: 'save',    fa: 'اعتماد',   en: 'Trust' },
  engage:  { cta: 'comment', fa: 'گفت‌وگو',  en: 'Engage' },
  connect: { cta: 'reply',   fa: 'رابطه',    en: 'Connect' },
  convert: { cta: 'offer',   fa: 'فروش',     en: 'Convert' },
};
const PL_CTAS = { send: ['بفرست برای دوستت', 'Send to a friend'], save: ['سیو کن', 'Save this'], comment: ['کامنت بگذار', 'Comment'],
                  reply: ['جواب بده', 'Reply'], follow: ['فالو کن', 'Follow'], offer: ['دعوت به پیشنهاد', 'Invite to the offer'] };
const PL_STATUS = { plan: ['برنامه', 'Planned'], make: ['در تولید', 'In production'], ready: ['آماده', 'Ready'], done: ['منتشر شد', 'Published'] };
const PL_COLORS = ['#87cefa', '#ffdb58', '#ff8fa3', '#9be7a8', '#c3a6ff', '#ffb26b', '#6fe3e1', '#e8e8e8'];
// days: جایگاه روزها در ترتیب هفته (۰ = روز اول هفته)
const PL_TEMPLATES = [
  { id: 'growth', fa: ['رشد سریع', '۵ پست در هفته با محوریت ریلز، استوری ۶ روز'], en: ['Fast growth', '5 posts a week, reel-led, stories 6 days'],
    formats: { reel: 3, carousel: 2, story: 6 }, days: [0, 1, 2, 3, 4, 5], maxPerDay: 1, promo: 15 },
  { id: 'authority', fa: ['اعتبار و اعتماد', 'کاروسل‌محور برای سیو و اعتماد، با یک کانال هفتگی'], en: ['Authority', 'Carousel-led for saves and trust, plus a weekly broadcast'],
    formats: { reel: 2, carousel: 3, story: 5, broadcast: 1 }, days: [0, 1, 2, 3, 4], maxPerDay: 1, promo: 20 },
  { id: 'lean', fa: ['پایدار و سبک', '۳ پست در هفته؛ حداقلی که هنوز رشد می‌دهد'], en: ['Lean & steady', '3 posts a week; the minimum that still grows'],
    formats: { reel: 2, carousel: 1, story: 3 }, days: [0, 2, 4], maxPerDay: 1, promo: 20 },
  { id: 'launch', fa: ['هفته‌ی لانچ', 'معرفی محصول یا دوره: پرحجم، با لایو و سهم فروش بیشتر'], en: ['Launch week', 'Product or course launch: high volume, a live, more promo'],
    formats: { reel: 4, carousel: 2, post: 1, story: 7, live: 1 }, days: [0, 1, 2, 3, 4, 5, 6], maxPerDay: 2, promo: 40 },
];
const PL_SOURCES = [
  ['https://buffer.com/resources/how-often-to-post-on-instagram/', 'Buffer: How often to post (2.1M posts)'],
  ['https://buffer.com/resources/instagram-reach-engagement-analysis/', 'Buffer: Reels for reach, carousels for engagement'],
  ['https://www.socialmediatoday.com/news/instagram-shares-algorithm-insights-2025/738034/', 'Mosseri on ranking signals (2025)'],
  ['https://buffer.com/library/best-time-to-post-on-instagram', 'Buffer: Best time to post'],
];

/* ---------- تعریف برنامه ---------- */
function plDefault(lang, brandPillars) {
  const names = (brandPillars || []).filter(Boolean).slice(0, 6);
  return {
    pillars: names.map((name, i) => ({ id: 'p' + (i + 1), name, color: PL_COLORS[i % PL_COLORS.length], share: Math.round(100 / names.length) })),
    formats: PL_FORMATS.map(f => ({ id: f.id, on: f.per > 0, per: f.per, effort: f.effort, goal: f.goal, time: f.time })),
    // days بر اساس getDay (۰ = یکشنبه). فارسی: شنبه تا پنجشنبه؛ انگلیسی: دوشنبه تا شنبه (Buffer: یکشنبه ضعیف‌ترین روز است)
    rhythm: { weekStart: lang === 'en' ? 1 : 6, days: lang === 'en' ? [0, 1, 1, 1, 1, 1, 1] : [1, 1, 1, 1, 1, 0, 1],
              maxPerDay: 1, capacity: 12, prodDay: -1, promo: 20, noRepeat: true, spread: true },
    series: [], template: 'growth',
  };
}
function plNormalize(p, lang) {
  if (!p || typeof p !== 'object') return null;
  const def = plDefault(lang, []);
  const have = Array.isArray(p.formats) ? p.formats.filter(f => f && f.id) : [];
  const out = { ...def, ...p, rhythm: { ...def.rhythm, ...(p.rhythm || {}) } };
  out.pillars = Array.isArray(p.pillars) ? p.pillars.filter(x => x && x.id) : [];
  out.formats = [...def.formats.map(f => ({ ...f, ...(have.find(h => h.id === f.id) || {}) })), ...have.filter(f => f.custom)];
  out.series = Array.isArray(p.series) ? p.series.filter(x => x && x.id) : [];
  if (!Array.isArray(out.rhythm.days) || out.rhythm.days.length !== 7) out.rhythm.days = def.rhythm.days;
  return out;
}
function plFmt(id, plan = PL.plan) {
  const c = PL_FORMATS.find(f => f.id === id), p = ((plan && plan.formats) || []).find(f => f.id === id) || {};
  if (c) return { ...c, ...p, name: c[PL.lang][0], desc: c[PL.lang][1], lane: c.lane, pillar: c.pillar, icon: c.icon };
  return { id, lane: 'feed', pillar: true, effort: 1, goal: 'engage', time: '12:00', per: 0, icon: '✦', desc: '', ...p, name: p.name || id };
}
const plFormatsOn = plan => plan.formats.filter(f => f.on && +f.per > 0).map(f => plFmt(f.id, plan));
const plPil = (id, plan = PL.plan) => (plan.pillars || []).find(p => p.id === id);
const plPilName = id => (plPil(id) || {}).name || '';
const plOrder = plan => [...Array(7).keys()].map(i => (plan.rhythm.weekStart + i) % 7);   // جایگاه در هفته ← getDay

/* ---------- چیدن یک هفته ---------- */
function plRand(seed) {   // mulberry32: هر seed همیشه همان چیدمان را می‌دهد
  let a = (seed >>> 0) || 1;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function plSlot(f, day, extra) {
  return { id: plId(), day, format: f.id, pillar: null, goal: f.goal, cta: (PL_GOALS[f.goal] || PL_GOALS.engage).cta,
           time: f.time || '12:00', status: 'plan', ...(extra || {}) };
}
// keep: خانه‌های قفل‌شده که دست نمی‌خورند. خروجی: {slots, unplaced: {format: تعداد}}
function plGenerate(plan, seed, keep = [], startISO) {
  const r = plRand(seed), R = plan.rhythm, order = plOrder(plan);
  const wdOf = i => startISO ? plDate(plAdd(startISO, i)).getDay() : order[i];
  let act = [...Array(7).keys()].filter(i => R.days[wdOf(i)]);
  if (!act.length) act = [...Array(7).keys()];
  const prodPos = [...Array(7).keys()].find(i => wdOf(i) === +R.prodDay);
  const fm = plFormatsOn(plan), slots = keep.map(s => ({ ...s })), unplaced = {};
  const lane = id => plFmt(id, plan).lane, heavy = id => +plFmt(id, plan).effort >= 2;
  for (const se of plan.series || []) {   // سری‌های ثابت اول، سر روز خودشان
    const f = fm.find(x => x.id === se.format), pos = [...Array(7).keys()].find(i => wdOf(i) === +se.day);
    if (!f || pos === undefined || slots.some(s => s.series === se.id)) continue;
    slots.push(plSlot(f, pos, { series: se.id, seriesName: se.name || '', pillar: plPil(se.pillar, plan) ? se.pillar : null,
                                 fixedPillar: !!plPil(se.pillar, plan) }));
  }
  const feedOn = d => slots.filter(s => s.day === d && lane(s.format) === 'feed').length;
  const list = [...fm].sort((a, b) => (b.lane === 'feed') - (a.lane === 'feed') || b.effort - a.effort || b.per - a.per);
  list.forEach((f, fi) => {
    const need = Math.min(+f.per, f.lane === 'feed' ? 21 : 7) - slots.filter(s => s.format === f.id).length;
    if (need <= 0) return;
    const side = f.lane !== 'feed', pool = side ? [...Array(7).keys()] : act;   // استوری روزهای بی‌پست هم می‌آید
    const shift = (r() - 0.5) * 0.6 + fi * 0.37;                                 // فرمت‌ها روی هم نیفتند
    for (let k = 0; k < need; k++) {
      const ideal = ((k + 0.5) / need) * pool.length - 0.5 + shift;
      let best = null, bestC = Infinity;
      pool.forEach((d, pi) => {
        const same = slots.filter(s => s.day === d && s.format === f.id).length;
        if (side && same) return;                                                  // هر روز یک بار
        let c = Math.abs(pi - ((ideal % pool.length) + pool.length) % pool.length);
        if (!side) {
          const n = feedOn(d);
          if (n >= Math.max(1, +R.maxPerDay)) return;
          c += n * 2.2 + same * 6;
          if (R.spread && heavy(f.id) && slots.some(s => Math.abs(s.day - d) === 1 && s.format === f.id)) c += 1.2;
          if (heavy(f.id) && slots.some(s => s.day === d && lane(s.format) === 'feed' && heavy(s.format))) c += 2.5;
          if (d === prodPos) c += 0.8;                                               // روز تولید سبک‌تر بماند
        }
        c += r() * 0.35;
        if (c < bestC) { bestC = c; best = d; }
      });
      if (best === null) { unplaced[f.id] = (unplaced[f.id] || 0) + 1; continue; }
      slots.push(plSlot(f, best));
    }
  });
  plAssignPillars(plan, slots, r);
  plAssignPromo(plan, slots, r);
  return { slots: slots.sort(plCmp), unplaced };
}
// ستون‌ها به نسبت سهم (بزرگ‌ترین باقیمانده)؛ هر خانه ستونی می‌گیرد که بیشترین کسری را دارد، نه تکراری با خانه‌ی قبلی،
// و ترجیحاً ستونی که هنوز با همین فرمت نیامده.
function plAssignPillars(plan, slots, r) {
  const pils = (plan.pillars || []).filter(p => +p.share > 0 && String(p.name || '').trim());
  const target = slots.filter(s => plFmt(s.format, plan).pillar).sort(plCmp);
  if (!pils.length || !target.length) return;
  const tot = pils.reduce((a, p) => a + +p.share, 0), M = target.length;
  const raw = pils.map(p => +p.share / tot * M), cnt = raw.map(Math.floor);
  raw.map((v, i) => [v - cnt[i], i]).sort((a, b) => b[0] - a[0]).slice(0, M - cnt.reduce((a, b) => a + b, 0)).forEach(([, i]) => cnt[i]++);
  const rem = Object.fromEntries(pils.map((p, i) => [p.id, cnt[i]]));
  const fixed = s => s.locked || (s.fixedPillar && s.pillar);   // قفل‌شده‌ها (حتی بی‌ستون) دست نمی‌خورند
  const used = {};
  for (const s of target) if (fixed(s) && rem[s.pillar] !== undefined) { rem[s.pillar]--; used[s.pillar + '|' + s.format] = (used[s.pillar + '|' + s.format] || 0) + 1; }
  let prev = null;
  for (const s of target) {
    if (fixed(s)) { prev = s.pillar || prev; continue; }
    let best = pils[0], bs = -Infinity;
    for (const p of pils) {
      let sc = rem[p.id] * 10 - (rem[p.id] <= 0 ? 40 : 0) - (used[p.id + '|' + s.format] || 0) * 3 + r();
      if (plan.rhythm.noRepeat && p.id === prev) sc -= 25;
      if (sc > bs) { bs = sc; best = p; }
    }
    s.pillar = best.id; rem[best.id]--; used[best.id + '|' + s.format] = (used[best.id + '|' + s.format] || 0) + 1; prev = best.id;
  }
}
// سهم فروش (قاعده‌ی ۸۰/۲۰): روی خانه‌های اعتماد و گفت‌وگو، بیشتر آخر هفته، نه روز اول، و با فاصله از هم
function plAssignPromo(plan, slots, r) {
  const feed = slots.filter(s => plFmt(s.format, plan).lane === 'feed');
  let need = Math.round(feed.length * (+plan.rhythm.promo || 0) / 100) - feed.filter(s => s.goal === 'convert').length;
  const picked = feed.filter(s => s.goal === 'convert').map(s => s.day);
  const cand = feed.filter(s => !s.locked && s.goal !== 'convert');
  while (need-- > 0 && cand.length) {
    const sc = s => (['trust', 'engage'].includes(s.goal) ? 3 : 0) + s.day * 0.45 - (s.day === 0 ? 5 : 0)
      - (picked.some(d => Math.abs(d - s.day) <= 1) ? 4 : 0) + r() * 0.5;
    cand.sort((a, b) => sc(b) - sc(a));
    const s = cand.shift();
    s.goal = 'convert'; s.cta = 'offer'; picked.push(s.day);
  }
}

/* ---------- سلامت برنامه ---------- */
function plHealth(plan, slots, unplaced) {
  const C = [], ok = t => C.push({ lv: 'ok', t }), warn = t => C.push({ lv: 'warn', t }), bad = t => C.push({ lv: 'bad', t });
  const fm = id => plFmt(id, plan), feed = slots.filter(s => fm(s.format).lane === 'feed').sort(plCmp), n = feed.length;
  if (n < 3) warn(L(`${N(n)} پست در هفته کمتر از حد پیشنهادی است. داده‌ی Buffer از ۲٫۱ میلیون پست: ۳ تا ۵ پست در هفته رشد فالوئر را نسبت به ۱ تا ۲ پست بیش از دو برابر می‌کند.`,
    `${n} feed posts a week is below the sweet spot. Buffer's data from 2.1M posts: 3–5 posts a week more than doubles follower growth versus 1–2.`));
  else if (n <= 5) ok(L(`${N(n)} پست در هفته؛ داخل محدوده‌ی پیشنهادی ۳ تا ۵.`, `${n} feed posts a week, inside the recommended 3–5.`));
  else ok(L(`${N(n)} پست در هفته. بیشتر از ۵ هنوز به رشد کمک می‌کند، به شرطی که کیفیت نیفتد.`, `${n} feed posts a week. More than 5 still helps growth, as long as quality holds.`));
  const reach = feed.filter(s => s.goal === 'reach').length;
  reach ? ok(L(`${N(reach)} خانه برای دیده‌شدن؛ ریلز بیشترین دسترسی را به مخاطب تازه دارد.`, `${reach} slots built for reach; reels reach the most new people.`))
        : warn(L('هیچ خانه‌ای برای دیده‌شدن نیست؛ بدون ریلز مخاطب تازه کمتر به پیج می‌رسد.', 'No slot is built for reach; without reels, fewer new people find the page.'));
  const depth = feed.filter(s => s.format === 'carousel' || s.goal === 'trust').length;
  depth ? ok(L(`${N(depth)} خانه برای عمق و اعتماد؛ کاروسل‌ها بیشترین سیو و تعامل را می‌گیرند.`, `${depth} slots for depth and trust; carousels earn the most saves and engagement.`))
        : warn(L('هیچ کاروسل یا خانه‌ی اعتمادسازی نیست؛ کاروسل‌ها بیشترین سیو و تعامل را می‌گیرند.', 'No carousel or trust slot; carousels earn the most saves and engagement.'));
  const pils = (plan.pillars || []).filter(p => +p.share > 0 && String(p.name || '').trim());
  const miss = pils.filter(p => !slots.some(s => s.pillar === p.id));
  if (!pils.length) warn(L('هنوز ستون محتوایی تعریف نشده؛ برنامه بدون ستون فقط تقویم خالی است.', 'No content pillars yet; without pillars this is just an empty calendar.'));
  else if (miss.length) warn(L(`ستون ${miss.map(p => `«${esc(p.name)}»`).join('، ')} این هفته هیچ خانه‌ای ندارد.`, `Pillar ${miss.map(p => `“${esc(p.name)}”`).join(', ')} has no slot this week.`));
  else ok(L(`هر ${N(pils.length)} ستون این هفته دیده می‌شوند.`, `All ${pils.length} pillars show up this week.`));
  if (pils.length > 5) warn(L('بیشتر از ۵ ستون پیام پیج را پخش می‌کند؛ ۳ تا ۵ ستون رایج‌ترین توصیه است.', 'More than 5 pillars dilutes the page; 3–5 is the common advice.'));
  const ps = slots.filter(s => fm(s.format).pillar && s.pillar).sort(plCmp);
  let rep = 0; for (let i = 1; i < ps.length; i++) if (ps[i].pillar === ps[i - 1].pillar) rep++;
  if (rep) warn(L(`${N(rep)} بار یک ستون پشت سر هم آمده؛ تنوع مخاطب را نگه می‌دارد.`, `A pillar repeats back-to-back ${rep} time(s); variety keeps people around.`));
  else if (ps.length > 1) ok(L('هیچ ستونی پشت سر هم تکرار نشده.', 'No pillar repeats back-to-back.'));
  const conv = feed.filter(s => s.goal === 'convert').length;
  if (n && conv / n > 0.3) warn(L(`${N(Math.round(conv / n * 100))}٪ پست‌ها فروشی‌اند؛ قاعده‌ی رایج ۸۰/۲۰ است: ۸۰٪ ارزش، ۲۰٪ فروش.`, `${Math.round(conv / n * 100)}% of posts sell; the common rule is 80/20, value to promotion.`));
  else if (conv) ok(L(`${N(conv)} خانه‌ی فروش کنار ${N(n - conv)} خانه‌ی ارزش؛ نزدیک قاعده‌ی ۸۰/۲۰.`, `${conv} promo slot(s) next to ${n - conv} value slots; close to 80/20.`));
  const hrs = slots.reduce((a, s) => a + (+fm(s.format).effort || 0), 0), cap = +plan.rhythm.capacity || 0;
  if (cap && hrs > cap) bad(L(`حدود ${plH(hrs)} ساعت کار، بیشتر از ظرفیت ${plH(cap)} ساعته‌ات؛ تعداد را کم کن یا فرمت سبک‌تر بگذار تا برنامه پایدار بماند.`, `About ${plH(hrs)} hours of work, more than your ${plH(cap)}-hour capacity; cut a slot or use a lighter format so the plan lasts.`));
  else if (cap && hrs > cap * 0.85) warn(L(`حدود ${plH(hrs)} از ${plH(cap)} ساعت؛ نزدیک سقف. یک هفته‌ی شلوغ کافی است تا عقب بیفتی.`, `About ${plH(hrs)} of ${plH(cap)} hours; near the limit. One busy week and you fall behind.`));
  else if (cap) ok(L(`حدود ${plH(hrs)} ساعت از ${plH(cap)} ساعت ظرفیت.`, `About ${plH(hrs)} of ${plH(cap)} hours of capacity.`));
  const un = Object.values(unplaced || {}).reduce((a, b) => a + b, 0);
  if (un) bad(L(`${N(un)} پست جا نشد؛ روزهای انتشار یا سقف پست روزانه را بیشتر کن.`, `${un} post(s) didn't fit; add publishing days or raise the daily limit.`));
  const dd = [...new Set(feed.map(s => s.day))].sort((a, b) => a - b);
  let gap = 0; for (let i = 1; i < dd.length; i++) gap = Math.max(gap, dd[i] - dd[i - 1] - 1);
  if (gap > 2) warn(L(`${N(gap)} روز پشت سر هم بی‌پست؛ ثبات از تعداد مهم‌تر است.`, `${gap} days in a row with no post; consistency beats volume.`));
  const st = new Set(slots.filter(s => s.format === 'story').map(s => s.day)).size;
  if (st >= 4) ok(L(`${N(st)} روز استوری؛ رابطه با دنبال‌کننده‌های فعلی گرم می‌ماند.`, `${st} story days; your current followers stay warm.`));
  else warn(L(`${N(st)} روز استوری؛ استوری منظم رابطه با دنبال‌کننده‌های فعلی را گرم نگه می‌دارد.`, `${st} story days; regular stories keep current followers warm.`));
  const score = Math.max(0, 100 - C.filter(c => c.lv === 'warn').length * 8 - C.filter(c => c.lv === 'bad').length * 18);
  return { checks: C, score, n, hrs, cap, conv };
}
function plHealthHTML(h, compact) {
  const tone = h.score >= 85 ? 'ok' : h.score >= 60 ? 'warn' : 'bad';
  const list = compact ? h.checks.filter(c => c.lv !== 'ok').slice(0, 4) : h.checks;
  return `<div class="pl-health">
    <div class="pl-score ${tone}" style="--v:${h.score}"><b>${N(h.score)}</b><span>${L('سلامت برنامه', 'Plan health')}</span></div>
    <ul class="pl-checks">${list.map(c => `<li class="${c.lv}"><i>${c.lv === 'ok' ? '✓' : c.lv === 'warn' ? '!' : '×'}</i><span>${c.t}</span></li>`).join('')
      || `<li class="ok"><i>✓</i><span>${L('همه‌چیز سر جایش است.', 'Everything checks out.')}</span></li>`}</ul>
    ${compact ? '' : `<p class="pl-src">${L('منبع‌ها', 'Sources')}: ${PL_SOURCES.map(([u, t]) => `<a href="${u}" target="_blank" rel="noopener" dir="ltr">${t}</a>`).join(' · ')}.
      ${L('عددها از داده‌ی عمومی‌اند و برای هر پیج فرق می‌کنند؛ با آمار خودت بسنج.', 'These are cross-account averages; check them against your own analytics.')}</p>`}
  </div>`;
}

/* ---------- ذخیره ---------- */
const plWeekData = () => (((PL.d && PL.d.weeks) || {})[PL.lang] || {})[PL.week] || null;
function plSaved(t) { const el = $('#plSaved'); if (el) el.textContent = t; }
function plSavePlan() {
  PL.fresh = false;
  PL.pendPlan = { lang: PL.lang, plan: PL.plan };
  plSaved(L('ذخیره…', 'Saving…'));
  clearTimeout(PL.tPlan); PL.tPlan = setTimeout(plFlushPlan, 500);
}
async function plFlushPlan() {
  clearTimeout(PL.tPlan);
  const p = PL.pendPlan; if (!p) return true; PL.pendPlan = null;
  const r = await post('/api/planner/plan', p);
  if (!r.ok) { toast(r.data.error || L('ذخیره نشد', 'Not saved')); return false; }
  (PL.d.plans = PL.d.plans || {})[p.lang] = p.plan;
  if (!PL.pendPlan) plSaved(L('✓ ذخیره شد', '✓ Saved'));
  return true;
}
function plSetWeek(w) {
  const all = (PL.d.weeks = PL.d.weeks || {}), mine = (all[PL.lang] = all[PL.lang] || {});
  if (w) mine[PL.week] = w; else delete mine[PL.week];
  PL.pendWeek = { lang: PL.lang, start: PL.week, week: w || null };
  plSaved(L('ذخیره…', 'Saving…'));
  clearTimeout(PL.tWeek); PL.tWeek = setTimeout(plFlushWeek, 450);
}
async function plFlushWeek() {
  clearTimeout(PL.tWeek);
  const p = PL.pendWeek; if (!p) return true; PL.pendWeek = null;
  const r = await post('/api/planner/week', p);
  if (!r.ok) { toast(r.data.error || L('ذخیره نشد', 'Not saved')); return false; }
  if (!PL.pendWeek) plSaved(L('✓ ذخیره شد', '✓ Saved'));
  return true;
}
addEventListener('pagehide', () => {   // تغییری که هنوز در صف ۵۰۰ میلی‌ثانیه است گم نشود
  if (PL.pendPlan) navigator.sendBeacon('/api/planner/plan', JSON.stringify(PL.pendPlan));
  if (PL.pendWeek) navigator.sendBeacon('/api/planner/week', JSON.stringify(PL.pendWeek));
});

/* ---------- صفحه ---------- */
window.viewPlanner = async function viewPlanner() {
  clearTimeout(PL.poll);
  $('#page').innerHTML = '<div class="empty">در حال بارگذاری… · Loading…</div>';
  if (window.LANG && LANG.ready) await LANG.ready;
  await Promise.all([plFlushPlan(), plFlushWeek()]);
  const d = await api('/api/planner');
  if (S.section !== 'planner') return;
  if (!d) { $('#page').innerHTML = '<div class="empty">تقویم محتوا بار نشد. استودیو را ببند و دوباره باز کن.</div>'; return; }
  const lang = (window.LANG && LANG.cur) || d.lang || 'fa';
  if (lang !== PL.lang) { PL.week = null; PL.sheet = null; }
  Object.assign(PL, { d, lang, today: d.today, menu: false });
  PL.plan = plNormalize((d.plans || {})[lang], lang);
  PL.fresh = !PL.plan;
  if (!PL.plan) { PL.plan = plDefault(lang, d.pillars); PL.view = 'build'; }
  if (!PL.week) PL.week = plStartOf(d.today, PL.plan.rhythm.weekStart);
  plRender();
  if (d.job && d.job.state === 'running' && d.job.lang === lang) plPoll();
};

function plRender() {
  $('#page').innerHTML = `<div class="pl" dir="${PL.lang === 'en' ? 'ltr' : 'rtl'}" lang="${PL.lang}">
    <div class="page-head pl-head"><h2>${L('تقویم محتوا', 'Content calendar')}
        <span class="pl-page" title="${L('پیج را با کلید فا/EN بالای صفحه عوض کن', 'Switch pages with the فا/EN toggle at the top')}">${PL.lang === 'en' ? 'EN · English page' : 'فا · پیج فارسی'}</span></h2>
      <p>${L('برنامه‌ی هفتگی از روی ستون‌های محتوا و فرمت‌هایت: یک بار تعریفش کن، هر هفته بچینش، و هر خانه را به یک ایده و پست آماده برسان.',
             'A weekly plan built from your content pillars and formats: define it once, generate each week, and take every slot to an idea and a finished post.')}</p></div>
    <div class="pl-tabs">
      <button data-pl-view="week" class="${PL.view === 'week' ? 'on' : ''}">${L('برنامه‌ی هفته', 'Week plan')}</button>
      <button data-pl-view="build" class="${PL.view === 'build' ? 'on' : ''}">${L('تعریف برنامه', 'Plan builder')}</button>
      <span class="grow"></span><span class="pl-saved" id="plSaved"></span>
    </div>
    <div id="plBody"></div>
    <div id="plSheet"></div>
  </div>`;
  const wrap = $('.pl');
  wrap.addEventListener('click', plClick);
  wrap.addEventListener('input', plInput);
  wrap.addEventListener('change', plChange);
  wrap.addEventListener('dragstart', plDragStart);
  wrap.addEventListener('dragover', plDragOver);
  wrap.addEventListener('dragleave', e => { const z = e.target.closest('.pl-day'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('over'); });
  wrap.addEventListener('drop', plDrop);
  wrap.addEventListener('dragend', () => { PL.drag = null; $$('.pl-day.over').forEach(x => x.classList.remove('over')); });
  plBody();
  if (PL.sheet) plOpenSheet(PL.sheet);
}
function plBody() {
  $$('.pl-tabs [data-pl-view]').forEach(b => b.classList.toggle('on', b.dataset.plView === PL.view));
  if (PL.view === 'build') plRenderBuild(); else plRenderWeek();
}

/* ---------- برنامه‌ی هفته ---------- */
function plWeekLabel() {
  const end = plAdd(PL.week, 6);
  return `${plFmtD(PL.week, { day: 'numeric', month: 'long' })} – ${plFmtD(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}
function plRel() {
  const rel = Math.round((plDate(PL.week) - plDate(plStartOf(PL.today, PL.plan.rhythm.weekStart))) / 864e5 / 7);
  return rel === 0 ? L('این هفته', 'This week') : rel === 1 ? L('هفته‌ی بعد', 'Next week') : rel === -1 ? L('هفته‌ی قبل', 'Last week')
    : rel > 0 ? L(`${N(rel)} هفته‌ی بعد`, `In ${rel} weeks`) : L(`${N(-rel)} هفته پیش`, `${-rel} weeks ago`);
}
function plRenderWeek() {
  const body = $('#plBody'); if (!body) return;
  const w = plWeekData(), busy = plBusy();
  const prev = (((PL.d.weeks || {})[PL.lang]) || {})[plAdd(PL.week, -7)];
  const arrowPrev = PL.lang === 'en' ? '←' : '→', arrowNext = PL.lang === 'en' ? '→' : '←';
  const bar = `<div class="pl-weekbar">
    <div class="pl-nav">
      <button class="btn" data-pl="prev" title="${L('هفته‌ی قبل', 'Previous week')}">${arrowPrev}</button>
      <button class="btn" data-pl="today">${L('امروز', 'Today')}</button>
      <button class="btn" data-pl="next" title="${L('هفته‌ی بعد', 'Next week')}">${arrowNext}</button>
    </div>
    <div class="pl-wlabel"><b>${plWeekLabel()}</b><span>${plRel()}${w ? ` · ${plProgress(w)}` : ''}</span></div>
    <span class="grow"></span>
    ${w ? `<div class="pl-actions">
      <button class="btn" data-pl="shuffle" ${busy ? 'disabled' : ''} title="${L('خانه‌های قفل‌نشده دوباره چیده می‌شوند', 'Re-arranges every unlocked slot')}">⟳ ${L('بازچینی', 'Reshuffle')}</button>
      <button class="btn" data-pl="fill" ${busy ? 'disabled' : ''} title="${L('ایده‌های بانک با همان ستون روی خانه‌های خالی می‌نشینند', 'Puts matching idea-bank ideas into empty slots')}">⇣ ${L('از بانک ایده', 'From idea bank')}</button>
      <button class="btn primary" data-pl="suggest" ${busy ? 'disabled' : ''} title="${L('Claude برای خانه‌های بی‌موضوع، موضوع و هوک پیشنهاد می‌دهد', 'Claude drafts a topic and hook for every slot without one')}">✦ ${L('پیشنهاد موضوع با Claude', 'Suggest topics with Claude')}</button>
      <div class="pl-menuwrap"><button class="btn" data-pl="menu" aria-expanded="${PL.menu}">⋯</button>
        ${PL.menu ? `<div class="pl-menu">
          <button data-pl="ics">📅 ${L('فایل تقویم (ics) برای Google/Apple Calendar', 'Calendar file (.ics) for Google/Apple Calendar')}</button>
          <button data-pl="md">⧉ ${L('کپی برنامه به‌صورت متن', 'Copy the plan as text')}</button>
          <button data-pl="csv">⇩ ${L('دانلود CSV برای اکسل', 'Download CSV for Sheets/Excel')}</button>
          <button data-pl="suggest-all" ${busy ? 'disabled' : ''}>✦ ${L('پیشنهاد دوباره برای همه‌ی خانه‌های قفل‌نشده', 'Re-suggest every unlocked slot')}</button>
          <button data-pl="clear" class="danger">✕ ${L('پاک کردن برنامه‌ی این هفته', 'Delete this week’s plan')}</button>
        </div>` : ''}</div>
    </div>` : ''}
  </div>
  <div id="plJob" class="build-status" hidden></div>`;
  if (!w) {
    const pv = plGenerate(PL.plan, PL.pseed, [], PL.week), h = plHealth(PL.plan, pv.slots, pv.unplaced);
    body.innerHTML = bar + `<div class="pl-empty panel">
      <div><h3>${L('برنامه‌ی این هفته هنوز ساخته نشده', 'This week has no plan yet')}</h3>
        <p>${L(`از روی تعریف برنامه‌ات چیده می‌شود: ${N(h.n)} پست، ${N(pv.slots.filter(s => plFmt(s.format).lane !== 'feed').length)} استوری/لایو/کانال، حدود ${plH(h.hrs)} ساعت کار. بعد هر خانه را می‌شود جابه‌جا، قفل یا عوض کرد.`,
               `Built from your plan definition: ${h.n} posts, ${pv.slots.filter(s => plFmt(s.format).lane !== 'feed').length} stories/lives/broadcasts, about ${plH(h.hrs)} hours of work. You can then move, lock or change any slot.`)}</p>
        <div class="rowbar" style="margin:14px 0 0">
          <button class="btn primary" data-pl="make">${L('ساخت برنامه‌ی این هفته', 'Generate this week')}</button>
          ${prev ? `<button class="btn" data-pl="copy">${L('کپی ساختار هفته‌ی قبل', 'Copy last week’s layout')}</button>` : ''}
          <button class="btn" data-pl-view="build">${L('ویرایش تعریف', 'Edit the plan')}</button>
        </div></div>
      ${plMiniHTML(pv.slots)}
    </div>`;
    return plShowJob();
  }
  body.innerHTML = bar + `<div class="pl-grid${busy ? ' busy' : ''}">${[...Array(7).keys()].map(i => plDayHTML(w, i)).join('')}</div>
    <div class="pl-under">
      <section class="panel">${plHealthHTML(plHealth(PL.plan, w.slots || [], w.unplaced))}</section>
      <section class="panel pl-side">${plLegendHTML()}${plInsightsHTML()}</section>
    </div>`;
  plShowJob();
}
function plProgress(w) {
  const all = (w.slots || []).filter(s => plFmt(s.format).lane === 'feed'), done = all.filter(s => s.status === 'done').length;
  return L(`${N(done)} از ${N(all.length)} پست منتشر شد`, `${done} of ${all.length} posts published`);
}
const plBestDays = () => { const i = PL.d.insights; return i && i.days && i.days.length >= 3 ? i.days.slice(0, 2).filter(x => x.score > 1).map(x => x.wd) : []; };
function plDayHTML(w, i) {
  const iso = plAdd(PL.week, i), wd = plDate(iso).getDay(), R = PL.plan.rhythm;
  const slots = (w.slots || []).filter(s => s.day === i).sort(plCmp);
  const feed = slots.filter(s => plFmt(s.format).lane === 'feed'), side = slots.filter(s => plFmt(s.format).lane !== 'feed');
  const best = plBestDays().includes(wd);
  return `<section class="pl-day${iso === PL.today ? ' today' : ''}${R.days[wd] ? '' : ' off'}${+R.prodDay === wd ? ' prod' : ''}" data-day="${i}">
    <header><b>${plDay(wd)}</b><span>${plFmtD(iso, { day: 'numeric', month: 'short' })}</span>
      ${iso === PL.today ? `<i class="pl-now">${L('امروز', 'Today')}</i>` : ''}
      ${best ? `<i class="pl-best" title="${L('در آمار پیجت، پست‌های این روز بهتر از میانه دیده شده‌اند', 'In your analytics, posts on this day beat your median')}">★</i>` : ''}</header>
    ${+R.prodDay === wd ? `<div class="pl-prod">🎬 ${L('روز تولید', 'Production day')}</div>` : ''}
    <div class="pl-cards">${feed.map(plCardHTML).join('')}
      ${!feed.length && !R.days[wd] ? `<p class="pl-rest">${L('بدون پست', 'No posts')}</p>` : ''}</div>
    ${side.length ? `<div class="pl-chips">${side.map(plChipHTML).join('')}</div>` : ''}
    <button class="pl-add" data-pl="add" data-day="${i}" title="${L('افزودن خانه', 'Add a slot')}">+</button>
  </section>`;
}
function plTitle(s) {
  const idea = s.idea && (S.ideas || []).find(x => x.id === s.idea);
  return s.topic || (idea && idea.title) || '';
}
function plCardHTML(s) {
  const f = plFmt(s.format), p = plPil(s.pillar), g = PL_GOALS[s.goal] || {}, title = plTitle(s);
  return `<article class="pl-card st-${s.status || 'plan'}${s.goal === 'convert' ? ' promo' : ''}" draggable="true" data-slot="${s.id}" style="--pc:${p ? p.color : 'var(--dim2)'}" tabindex="0">
    <div class="pl-c-top"><span class="pl-fmt">${f.icon} ${esc(f.name)}</span><span class="pl-time">${plTime(s.time)}</span>
      ${s.locked ? '<span class="pl-lock" title="' + L('قفل: بازچینی به آن دست نمی‌زند', 'Locked: reshuffle leaves it alone') + '">🔒</span>' : ''}</div>
    <div class="pl-c-title${title ? '' : ' dim'}">${title ? esc(title) : L('موضوع هنوز معلوم نیست', 'No topic yet')}</div>
    <div class="pl-c-meta">${p ? `<span class="pl-pil">${esc(p.name)}</span>` : ''}<span class="pl-goal g-${s.goal}">${g[PL.lang] || ''}</span>
      ${s.seriesName ? `<span class="pl-ser">↻ ${esc(s.seriesName)}</span>` : ''}${s.idea ? '<span class="pl-idea" title="' + L('وصل به بانک ایده', 'Linked to the idea bank') + '">💡</span>' : ''}</div>
    <i class="pl-st" title="${(PL_STATUS[s.status || 'plan'] || PL_STATUS.plan)[PL.lang === 'en' ? 1 : 0]}"></i>
  </article>`;
}
function plChipHTML(s) {
  const f = plFmt(s.format), title = plTitle(s);
  return `<button class="pl-chip st-${s.status || 'plan'}" draggable="true" data-slot="${s.id}" title="${esc(title || f.desc)}">${f.icon} ${esc(f.name)}${title ? ` · <span>${esc(title)}</span>` : ''}</button>`;
}
function plLegendHTML() {
  const pils = PL.plan.pillars.filter(p => p.name);
  return `<h3>${L('راهنما', 'Legend')}</h3>
    <div class="pl-legend">${pils.map(p => `<span><i style="background:${p.color}"></i>${esc(p.name)}</span>`).join('')}</div>
    <div class="pl-legend goals">${Object.entries(PL_GOALS).map(([k, g]) => `<span class="pl-goal g-${k}">${g[PL.lang]}</span>`).join('')}</div>
    <p class="cap-hint">${L('خانه‌ها را بکش و روی روز دیگر رها کن؛ هر خانه‌ای که دستی عوض شود قفل می‌شود تا «بازچینی» به آن دست نزند. روی هر خانه بزن تا موضوع، هوک، ایده و وضعیتش را بنویسی.',
      'Drag a slot onto another day. Any slot you change by hand gets locked so Reshuffle leaves it alone. Click a slot to set its topic, hook, idea and status.')}</p>`;
}
function plInsightsHTML() {
  const i = PL.d.insights;
  if (!i) return `<h3 style="margin-top:18px">${L('روزهای خوب پیج خودت', 'Your best days')}</h3><p class="cap-hint">${L('اگر اینستاگرامت را در «تحلیل اینستاگرام» وصل کنی، این‌جا می‌بینی پست‌هایت چه روزها و ساعت‌هایی بهتر دیده شده‌اند.', 'Connect Instagram in the Analytics tab and this shows which days and hours your posts did best.')}</p>`;
  if (!i.days.length) return `<h3 style="margin-top:18px">${L('روزهای خوب پیج خودت', 'Your best days')}</h3><p class="cap-hint">${L(`هنوز داده‌ی کافی نیست (${N(i.n)} پست با آمار). چند هفته بعد دوباره نگاه کن.`, `Not enough data yet (${i.n} posts with metrics). Check back in a few weeks.`)}</p>`;
  const bar = (x, label) => `<div class="pl-ins"><span>${label}</span><i style="--w:${Math.min(100, x.score / Math.max(...i.days.map(d => d.score), ...i.hours.map(h => h.score)) * 100)}%"></i>
    <b>${N(x.score.toFixed(1))}×</b><small>${L(`${N(x.n)} پست`, `${x.n} posts`)}</small></div>`;
  return `<h3 style="margin-top:18px">${L('روزهای خوب پیج خودت', 'Your best days')}${i.username ? ` <small dir="ltr">@${esc(i.username)}</small>` : ''}</h3>
    <p class="cap-hint" style="margin-top:0">${L('بازدید هر پست نسبت به میانه‌ی همان فرمت (۱× یعنی عادی).', 'Views per post versus your median for that format (1× = typical).')}${i.n < 15 ? ' ' + L('داده هنوز کم است؛ جدی نگیر.', 'Still a small sample; take it lightly.') : ''}</p>
    ${i.days.slice(0, 4).map(x => bar(x, plDay(x.wd))).join('')}
    ${i.hours.slice(0, 2).map(x => bar(x, `${plTime(plPad(x.from) + ':00')}–${plTime(plPad(x.to % 24) + ':00')}`)).join('')}`;
}
function plMiniHTML(slots) {
  const order = [...Array(7).keys()].map(i => plDate(plAdd(PL.week || PL.today, i)).getDay());
  return `<div class="pl-mini" aria-hidden="true">${order.map((wd, i) => {
    const day = slots.filter(s => s.day === i).sort(plCmp);
    return `<div class="pl-mcol${PL.plan.rhythm.days[wd] ? '' : ' off'}"><b>${plDay(wd, true)}</b>${day.map(s => {
      const f = plFmt(s.format), p = plPil(s.pillar);
      return `<i class="${f.lane}${s.goal === 'convert' ? ' promo' : ''}" style="--pc:${p ? p.color : 'var(--dim2)'}" title="${esc(f.name)}${p ? ' · ' + esc(p.name) : ''}">${f.icon}</i>`;
    }).join('')}</div>`;
  }).join('')}</div>`;
}

/* ---------- کارهای هفته ---------- */
function plMakeWeek(slots, unplaced, seed) {
  plSetWeek({ start: PL.week, seed, slots, unplaced, created: new Date().toISOString().slice(0, 16).replace('T', ' ') });
}
function plShuffle() {
  const w = plWeekData(); if (!w) return;
  const keep = (w.slots || []).filter(s => s.locked);
  const seed = Math.floor(Math.random() * 1e9), g = plGenerate(PL.plan, seed, keep, PL.week);
  plSetWeek({ ...w, seed, slots: g.slots, unplaced: g.unplaced });
  plRenderWeek();
  toast(keep.length ? L(`✓ دوباره چیده شد؛ ${N(keep.length)} خانه‌ی قفل سر جایشان ماندند`, `✓ Reshuffled; ${keep.length} locked slot(s) stayed put`) : L('✓ دوباره چیده شد', '✓ Reshuffled'));
}
function plCopyPrev() {
  const prev = (((PL.d.weeks || {})[PL.lang]) || {})[plAdd(PL.week, -7)]; if (!prev) return;
  const slots = (prev.slots || []).map(s => ({ id: plId(), day: s.day, format: s.format, pillar: s.pillar, goal: s.goal, cta: s.cta, time: s.time,
    status: 'plan', ...(s.series ? { series: s.series, seriesName: s.seriesName } : {}) }));
  plMakeWeek(slots, {}, prev.seed || 0);
  plRenderWeek(); toast(L('✓ ساختار هفته‌ی قبل کپی شد؛ موضوع‌ها خالی‌اند', '✓ Copied last week’s layout; topics are empty'));
}
const plIdeaLang = i => (i.lang === 'en') === (PL.lang === 'en');
function plUsedIdeas() {
  const used = new Set();
  for (const w of Object.values(((PL.d.weeks || {})[PL.lang]) || {})) for (const s of w.slots || []) if (s.idea) used.add(s.idea);
  return used;
}
function plFill() {
  const w = plWeekData(); if (!w) return;
  const used = plUsedIdeas(), rank = { approved: 0, idea: 1, producing: 2 };
  const pool = (S.ideas || []).filter(i => plIdeaLang(i) && i.status !== 'done' && !used.has(i.id))
    .sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3));
  let n = 0;
  for (const s of (w.slots || []).sort(plCmp)) {
    if (s.idea || s.topic || !plFmt(s.format).pillar) continue;
    const name = plPilName(s.pillar), k = pool.findIndex(i => name && i.pillar === name);
    if (k < 0) continue;
    s.idea = pool[k].id; s.locked = true; pool.splice(k, 1); n++;
  }
  if (!n) return toast(L('ایده‌ی آزادی با ستون همین خانه‌ها در بانک ایده نیست. ایده‌ها را با «پیلر» ثبت کن، یا «پیشنهاد موضوع با Claude» را بزن.',
                         'No free idea in the bank matches these pillars. Tag ideas with a pillar, or use “Suggest topics with Claude”.'));
  plSetWeek({ ...w }); plRenderWeek();
  toast(L(`✓ ${N(n)} ایده روی خانه‌ها نشست`, `✓ ${n} idea(s) placed`));
}
const plBusy = () => { const j = PL.d && PL.d.job; return !!(j && j.state === 'running' && j.lang === PL.lang && j.week === PL.week); };
async function plSuggest(mode) {
  if (!await plFlushWeek()) return;
  const r = await post('/api/planner/suggest', { lang: PL.lang, start: PL.week, mode });
  if (!r.ok) return toast(r.data.error || L('شروع نشد', 'Could not start'));
  PL.d.job = { state: 'running', lang: PL.lang, week: PL.week, step: '' };
  PL.sheet = null; $('#plSheet').innerHTML = '';
  plRenderWeek(); plPoll();
}
function plPoll() {
  clearTimeout(PL.poll);
  PL.poll = setTimeout(async () => {
    const j = await api('/api/planner/job'); if (!j || S.section !== 'planner') return;
    PL.d.job = j;
    if (j.state === 'running') { plShowJob(); return plPoll(); }
    if (j.state === 'done') {
      const d = await api('/api/planner'); if (d) PL.d.weeks = d.weeks;
      toast(L(`✓ برای ${N(j.count || 0)} خانه موضوع پیشنهاد شد`, `✓ Topics suggested for ${j.count || 0} slot(s)`));
    }
    if (PL.view === 'week') plRenderWeek();
  }, 2000);
}
function plShowJob() {
  const box = $('#plJob'), j = PL.d.job; if (!box) return;
  const mine = j && j.lang === PL.lang && j.week === PL.week;
  if (!mine || j.state === 'idle' || j.state === 'done') { box.hidden = true; return; }
  box.hidden = false; box.className = 'build-status' + (j.state === 'error' ? ' err' : '');
  box.innerHTML = `<div class="build-step">${j.state === 'running' ? `<span class="spin"></span> ${esc(j.step || L('در حال کار…', 'Working…'))}` : '✕ ' + esc(j.error || L('خطا', 'Error'))}</div>`;
}

/* ---------- خروجی ---------- */
function plRows() {
  const w = plWeekData(); if (!w) return [];
  return (w.slots || []).slice().sort(plCmp).map(s => {
    const iso = plAdd(PL.week, s.day), f = plFmt(s.format), idea = s.idea && (S.ideas || []).find(i => i.id === s.idea);
    return { s, iso, day: plDay(plDate(iso).getDay()), date: plFmtD(iso, { day: 'numeric', month: 'long' }), fmt: f.name, pillar: plPilName(s.pillar),
             goal: (PL_GOALS[s.goal] || {})[PL.lang] || '', cta: (PL_CTAS[s.cta] || ['', ''])[PL.lang === 'en' ? 1 : 0],
             topic: s.topic || (idea && idea.title) || '', hook: s.hook || '', status: (PL_STATUS[s.status || 'plan'] || PL_STATUS.plan)[PL.lang === 'en' ? 1 : 0] };
  });
}
function plDownload(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function plICS() {
  const esc2 = t => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const enc = new TextEncoder();
  const fold = line => {   // خط‌های بیشتر از ۷۵ بایت تا می‌خورند (RFC 5545)، بی‌آنکه حرفی نصف شود
    const out = []; let cur = '', n = 0;
    for (const ch of line) {
      const b = enc.encode(ch).length;
      if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; n = 0; }
      cur += ch; n += b;
    }
    out.push(cur); return out.join('\r\n ');
  };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Content Studio//Planner//EN', 'CALSCALE:GREGORIAN',
                 'X-WR-CALNAME:' + esc2(L('برنامه‌ی محتوا', 'Content plan'))];
  for (const r of plRows()) {
    const [h, m] = String(r.s.time || '12:00').split(':');
    const desc = [r.pillar && `${L('ستون', 'Pillar')}: ${r.pillar}`, r.goal && `${L('هدف', 'Goal')}: ${r.goal}`, r.cta && `CTA: ${r.cta}`,
                  r.hook && `${L('هوک', 'Hook')}: ${r.hook}`, r.s.angle].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${PL.lang}-${PL.week}-${r.s.id}@content-studio`, `DTSTAMP:${stamp}`,
      `DTSTART:${r.iso.replace(/-/g, '')}T${plPad(+h || 0)}${plPad(+m || 0)}00`, 'DURATION:PT30M',
      'SUMMARY:' + esc2(`[${r.fmt}] ${r.topic || r.pillar || r.fmt}`), 'DESCRIPTION:' + esc2(desc), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  plDownload(`content-plan-${PL.lang}-${PL.week}.ics`, lines.map(fold).join('\r\n') + '\r\n', 'text/calendar;charset=utf-8');
}
function plMD() {
  const rows = plRows(), out = [`# ${L('برنامه‌ی محتوا', 'Content plan')} · ${plWeekLabel()}`];
  let last = '';
  for (const r of rows) {
    if (r.iso !== last) { out.push('', `## ${r.day} · ${r.date}`); last = r.iso; }
    out.push(`- ${plTime(r.s.time)} · ${r.fmt}${r.pillar ? ' · ' + r.pillar : ''} · ${r.goal}${r.topic ? ' — ' + r.topic : ''}${r.hook ? `\n  > ${r.hook}` : ''}`);
  }
  navigator.clipboard.writeText(out.join('\n')).then(() => toast(L('✓ برنامه کپی شد', '✓ Plan copied')), () => toast(L('کپی نشد', 'Copy failed')));
}
function plCSV() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = PL.lang === 'en' ? ['Date', 'Day', 'Time', 'Format', 'Pillar', 'Goal', 'CTA', 'Topic', 'Hook', 'Status']
                                : ['تاریخ', 'روز', 'ساعت', 'فرمت', 'ستون', 'هدف', 'دعوت به اقدام', 'موضوع', 'هوک', 'وضعیت'];
  const rows = plRows().map(r => [r.iso, r.day, r.s.time, r.fmt, r.pillar, r.goal, r.cta, r.topic, r.hook, r.status]);
  plDownload(`content-plan-${PL.lang}-${PL.week}.csv`, '\uFEFF' + [head, ...rows].map(x => x.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}

/* ---------- ویرایش یک خانه ---------- */
function plSlotOf(id) { const w = plWeekData(); return w && (w.slots || []).find(s => s.id === id); }
function plOpenSheet(id) {
  const s = plSlotOf(id), box = $('#plSheet');
  if (!s || !box) { PL.sheet = null; if (box) box.innerHTML = ''; return; }
  PL.sheet = id;
  const f = plFmt(s.format), iso = plAdd(PL.week, s.day), idea = s.idea && (S.ideas || []).find(i => i.id === s.idea);
  const pname = plPilName(s.pillar);
  const ideas = (S.ideas || []).filter(i => plIdeaLang(i) && i.status !== 'done' && i.id !== s.idea)
    .sort((a, b) => (b.pillar === pname) - (a.pillar === pname)).slice(0, 60);
  const fmts = [...PL.plan.formats.filter(x => x.on || x.id === s.format).map(x => plFmt(x.id))];
  const chips = (k, list, cur) => list.map(([v, t, extra]) => `<button class="pl-opt${cur === v ? ' on' : ''}" data-sh="${k}" data-v="${esc(v)}" ${extra || ''}>${t}</button>`).join('');
  const ideaStatus = idea ? ({ idea: ['خام', 'Raw'], approved: ['تأییدشده', 'Approved'], producing: ['در تولید', 'In production'], done: ['منتشرشده', 'Published'] }[idea.status] || ['', ''])[PL.lang === 'en' ? 1 : 0] : '';
  box.innerHTML = `<div class="pl-sheet-bg" data-sh="close"></div>
  <aside class="pl-sheet" role="dialog" aria-label="${L('ویرایش خانه', 'Edit slot')}">
    <div class="pl-sh-head"><b>${f.icon} ${esc(f.name)}</b><span>${plDay(plDate(iso).getDay())} ${plFmtD(iso, { day: 'numeric', month: 'long' })}</span>
      <button class="pl-x" data-sh="close" aria-label="${L('بستن', 'Close')}">✕</button></div>
    <div class="pl-sh-body">
      <label class="pl-f">${L('موضوع', 'Topic')}<input class="cap-input" data-shi="topic" value="${esc(s.topic || '')}" placeholder="${esc(idea ? idea.title : L('این پست درباره‌ی چیست؟', 'What is this post about?'))}"></label>
      <label class="pl-f">${L('هوک (جمله‌ی اول)', 'Hook (first line)')}<textarea class="cap-text" data-shi="hook" rows="2">${esc(s.hook || '')}</textarea></label>
      <label class="pl-f">${L('زاویه و یادداشت', 'Angle & notes')}<textarea class="cap-text" data-shi="angle" rows="3">${esc(s.angle || '')}</textarea></label>
      ${s.ai ? `<p class="cap-hint" style="margin-top:-4px">✦ ${L('پیشنهاد Claude؛ هر طور خواستی عوضش کن.', 'Suggested by Claude; change it however you like.')}</p>` : ''}
      <div class="pl-f"><span>${L('ستون محتوا', 'Pillar')}</span><div class="pl-opts">${chips('pillar', [['', L('بدون', 'None')], ...PL.plan.pillars.filter(p => p.name).map(p => [p.id, `<i style="background:${p.color}"></i>${esc(p.name)}`])], s.pillar || '')}</div></div>
      <div class="pl-f"><span>${L('هدف', 'Goal')}</span><div class="pl-opts">${chips('goal', Object.entries(PL_GOALS).map(([k, g]) => [k, g[PL.lang], `data-g="${k}"`]), s.goal)}</div></div>
      <div class="pl-row3">
        <label class="pl-f">${L('روز', 'Day')}<select data-shi="day">${[...Array(7).keys()].map(i => `<option value="${i}" ${i === s.day ? 'selected' : ''}>${plDay(plDate(plAdd(PL.week, i)).getDay())}</option>`).join('')}</select></label>
        <label class="pl-f">${L('ساعت', 'Time')}${plTimeSel('data-shi="time"', s.time || '')}</label>
        <label class="pl-f">${L('فرمت', 'Format')}<select data-shi="format">${fmts.map(x => `<option value="${x.id}" ${x.id === s.format ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      </div>
      <label class="pl-f">${L('دعوت به اقدام (CTA)', 'Call to action')}<select data-shi="cta">${Object.entries(PL_CTAS).map(([k, t]) => `<option value="${k}" ${k === s.cta ? 'selected' : ''}>${t[PL.lang === 'en' ? 1 : 0]}</option>`).join('')}</select></label>
      <div class="pl-f"><span>${L('وضعیت', 'Status')}</span><div class="pl-opts">${chips('status', Object.entries(PL_STATUS).map(([k, t]) => [k, t[PL.lang === 'en' ? 1 : 0]]), s.status || 'plan')}</div></div>
      <div class="pl-f pl-ideabox"><span>${L('بانک ایده', 'Idea bank')}</span>
        ${idea ? `<div class="pl-ideacard"><b>💡 ${esc(idea.title)}</b><small>${esc(idea.pillar || '')}${idea.pillar && ideaStatus ? ' · ' : ''}${esc(ideaStatus)}</small>
            <div class="rowbar" style="margin:8px 0 0"><button class="btn primary" data-sh="open">${L('باز کردن در بانک ایده', 'Open in the idea bank')}</button>
            <button class="btn" data-sh="unlink">${L('جدا کردن', 'Unlink')}</button></div></div>`
          : `<div class="rowbar" style="margin:0">
            <select data-shi="idea" class="pl-ideasel"><option value="">${L('— وصل کردن یک ایده‌ی موجود —', '— Link an existing idea —')}</option>
              ${ideas.map(i => `<option value="${esc(i.id)}">${i.pillar === pname && pname ? '★ ' : ''}${esc(String(i.title || '').slice(0, 80))}</option>`).join('')}</select>
            <button class="btn" data-sh="mkidea" ${s.topic ? '' : 'disabled'} title="${L('موضوع و هوک همین خانه به یک ایده‌ی تازه در بانک تبدیل می‌شود', 'Turns this slot’s topic and hook into a new idea in the bank')}">+ ${L('ثبت در بانک ایده', 'Save to idea bank')}</button></div>
            <p class="cap-hint">${L('بعد از ثبت، در بانک ایده «⚡ ساخت کامل» را بزن تا ریلز یا کاروسلش ساخته شود.', 'Then hit “⚡ Full build” in the idea bank to produce the reel or carousel.')}</p>`}
      </div>
    </div>
    <div class="pl-sh-foot">
      <label class="pl-check"><input type="checkbox" data-shi="locked" ${s.locked ? 'checked' : ''}> 🔒 ${L('قفل (بازچینی دست نمی‌زند)', 'Lock (reshuffle won’t touch it)')}</label>
      <span class="grow"></span>
      <button class="btn danger" data-sh="del">${L('حذف خانه', 'Delete slot')}</button>
    </div>
  </aside>`;
}
function plCloseSheet() { PL.sheet = null; const b = $('#plSheet'); if (b) b.innerHTML = ''; if (PL.view === 'week') plRenderWeek(); }
function plTouch(s, rerender) {   // هر تغییر دستی خانه را قفل می‌کند
  s.locked = true;
  const lk = $('[data-shi="locked"]'); if (lk) lk.checked = true;
  plSetWeek({ ...plWeekData() });
  if (rerender) { plRenderWeek(); plOpenSheet(s.id); }
}
async function plMakeIdea(s) {
  const text = [s.topic, s.hook, s.angle].filter(Boolean).join('\n\n');
  if (!text.trim()) return;
  const r = await post('/api/idea/capture', { kind: 'text', text, pillar: plPilName(s.pillar) });
  if (!r.ok) return toast(r.data.error || L('ثبت نشد', 'Not saved'));
  await loadState();
  s.idea = r.data.id; plTouch(s, true);
  toast(L('✓ در بانک ایده ثبت شد', '✓ Saved to the idea bank'));
}

/* ---------- رویدادها ---------- */
function plClick(e) {
  const t = e.target;
  const view = t.closest('[data-pl-view]');
  if (view) { PL.view = view.dataset.plView; PL.menu = false; return plBody(); }
  const sh = t.closest('[data-sh]');
  if (sh) return plSheetAct(sh);
  const a = t.closest('[data-pl]');
  if (a && !a.disabled) return plAct(a.dataset.pl, a);
  const b = t.closest('[data-b]');
  if (b && !b.disabled) return plBuildAct(b.dataset.b, b);
  const card = t.closest('[data-slot]');
  if (card) { PL.menu = false; return plOpenSheet(card.dataset.slot); }
  if (PL.menu && !t.closest('.pl-menuwrap')) { PL.menu = false; plRenderWeek(); }
}
function plAct(a, el) {
  const w = plWeekData();
  if (a !== 'menu') PL.menu = false;
  if (a === 'prev' || a === 'next') { PL.week = plAdd(PL.week, a === 'prev' ? -7 : 7); PL.sheet = null; $('#plSheet').innerHTML = ''; return plRenderWeek(); }
  if (a === 'today') { PL.week = plStartOf(PL.today, PL.plan.rhythm.weekStart); return plRenderWeek(); }
  if (a === 'menu') { PL.menu = !PL.menu; return plRenderWeek(); }
  if (a === 'go-week') { PL.view = 'week'; return plBody(); }
  if (a === 'make') {
    const seed = Math.floor(Math.random() * 1e9), g = plGenerate(PL.plan, seed, [], PL.week);
    if (PL.fresh) plSavePlan();
    plMakeWeek(g.slots, g.unplaced, seed); PL.view = 'week'; plBody();
    return toast(L('✓ برنامه‌ی هفته چیده شد', '✓ Week generated'));
  }
  if (a === 'copy') return plCopyPrev();
  if (a === 'shuffle') return plShuffle();
  if (a === 'fill') return plFill();
  if (a === 'suggest') return plSuggest('empty');
  if (a === 'suggest-all') return plSuggest('all');
  if (a === 'ics') { plRenderWeek(); return plICS(); }
  if (a === 'md') { plRenderWeek(); return plMD(); }
  if (a === 'csv') { plRenderWeek(); return plCSV(); }
  if (a === 'clear') {
    if (!confirm(L('برنامه‌ی این هفته (با موضوع‌ها و وضعیت‌ها) پاک شود؟ ایده‌های بانک دست نمی‌خورند.', 'Delete this week’s plan, with its topics and statuses? Ideas in the bank are not touched.'))) return plRenderWeek();
    plSetWeek(null); return plRenderWeek();
  }
  if (a === 'add' && w) {
    const fm = plFormatsOn(PL.plan).find(f => f.lane === 'feed') || plFmt('reel');
    const s = plSlot(fm, +el.dataset.day, { locked: true });
    w.slots = [...(w.slots || []), s]; plSetWeek({ ...w }); plRenderWeek(); return plOpenSheet(s.id);
  }
}
function plSheetAct(el) {
  const k = el.dataset.sh, s = plSlotOf(PL.sheet);
  if (k === 'close') return plCloseSheet();
  if (!s) return;
  const w = plWeekData();
  if (k === 'del') { w.slots = w.slots.filter(x => x.id !== s.id); plSetWeek({ ...w }); return plCloseSheet(); }
  if (k === 'pillar') { s.pillar = el.dataset.v || null; return plTouch(s, true); }
  if (k === 'goal') { s.goal = el.dataset.v; s.cta = (PL_GOALS[s.goal] || {}).cta || s.cta; return plTouch(s, true); }
  if (k === 'status') { s.status = el.dataset.v; plSetWeek({ ...w }); plRenderWeek(); return plOpenSheet(s.id); }
  if (k === 'unlink') { s.idea = null; return plTouch(s, true); }
  if (k === 'open') { const id = s.idea; plCloseSheet(); S.openIdea = id; return go('ideas'); }
  if (k === 'mkidea') return plMakeIdea(s);
}
function plInput(e) {
  const t = e.target;
  if (t.dataset.shi && ['topic', 'hook', 'angle'].includes(t.dataset.shi)) {
    const s = plSlotOf(PL.sheet); if (!s) return;
    s[t.dataset.shi] = t.value;
    const mk = $('[data-sh="mkidea"]'); if (mk) mk.disabled = !String(s.topic || '').trim();
    return plTouch(s, false);
  }
  if (t.dataset.bi) return plBuildInput(t, false);
}
function plChange(e) {
  const t = e.target, k = t.dataset.shi;
  if (k) {
    const s = plSlotOf(PL.sheet); if (!s) return;
    if (k === 'locked') { s.locked = t.checked; plSetWeek({ ...plWeekData() }); return plRenderWeek(); }
    if (k === 'day') { s.day = +t.value; return plTouch(s, true); }
    if (k === 'time') { s.time = t.value; return plTouch(s, true); }
    if (k === 'format') { s.format = t.value; return plTouch(s, true); }
    if (k === 'cta') { s.cta = t.value; return plTouch(s, false); }
    if (k === 'idea' && t.value) { s.idea = t.value; return plTouch(s, true); }
    return;
  }
  if (t.dataset.bi) return plBuildInput(t, true);
}
document.addEventListener('keydown', e => {
  if (typeof S === 'undefined' || S.section !== 'planner') return;
  if (e.key === 'Escape' && PL.sheet) return plCloseSheet();
  if (e.key === 'Enter' && e.target.matches && e.target.matches('.pl-card')) plOpenSheet(e.target.dataset.slot);
});
function plDragStart(e) {
  const c = e.target.closest('[data-slot]'); if (!c) return;
  PL.drag = c.dataset.slot; e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', PL.drag); } catch {}
}
function plDragOver(e) {
  const z = e.target.closest('.pl-day'); if (!z || !PL.drag) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'move'; z.classList.add('over');
}
function plDrop(e) {
  const z = e.target.closest('.pl-day'); if (!z || !PL.drag) return;
  e.preventDefault();
  const s = plSlotOf(PL.drag); PL.drag = null;
  if (!s) return;
  const day = +z.dataset.day;
  if (s.day !== day) { s.day = day; s.locked = true; plSetWeek({ ...plWeekData() }); }
  plRenderWeek();
}

/* ---------- تعریف برنامه ---------- */
function plRenderBuild() {
  const body = $('#plBody'); if (!body) return;
  const p = PL.plan, R = p.rhythm, order = plOrder(p), best = plBestDays(), ins = PL.d.insights;
  const tot = p.pillars.reduce((a, x) => a + (+x.share || 0), 0) || 1;
  const step = (n, title, sub, inner) => `<section class="pl-step panel"><h3><span class="pl-n">${N(n)}</span>${title}</h3>
    ${sub ? `<p class="pl-sub">${sub}</p>` : ''}${inner}</section>`;
  const opt = (v, t, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${t}</option>`;
  body.innerHTML = `<div class="pl-build">
    <div class="pl-steps">
      ${PL.fresh ? `<div class="pl-hello">${L('برای شروع، ستون‌های هسته‌ی برندت آماده‌اند. یک قالب انتخاب کن، تعداد هر فرمت را تنظیم کن و «ساخت برنامه‌ی این هفته» را بزن.',
        'Your brand-core pillars are already here, still in Persian: rename them in English for this page (they show up in your calendar and exports). Then pick a template, tune each format’s count, and hit “Generate this week”.')}</div>` : ''}
      ${step(1, L('شروع سریع', 'Quick start'), L('یک قالب، فرمت‌ها و ریتم را یک‌جا تنظیم می‌کند؛ ستون‌هایت دست نمی‌خورند. بعد هر چیزی را خواستی عوض کن.', 'A template sets formats and rhythm in one go; your pillars stay. Adjust anything afterwards.'),
        `<div class="pl-tpls">${PL_TEMPLATES.map(t => `<button class="pl-tpl${p.template === t.id ? ' on' : ''}" data-b="tpl" data-id="${t.id}"><b>${t[PL.lang][0]}</b><span>${t[PL.lang][1]}</span></button>`).join('')}</div>`)}
      ${step(2, L('ستون‌های محتوا', 'Content pillars'), L('۳ تا ۵ موضوع اصلی که پیجت همیشه درباره‌شان حرف می‌زند، و سهم هر کدام از برنامه. سهم‌ها نسبی‌اند؛ درصد خودکار حساب می‌شود.', '3–5 core themes your page always talks about, and each one’s share of the plan. Shares are relative; percentages are computed for you.'),
        `<div class="pl-mix">${p.pillars.map(x => `<i style="flex:${+x.share || 0.0001};background:${x.color}" title="${esc(x.name)}"></i>`).join('')}</div>
        <div class="pl-pils">${p.pillars.map(x => `<div class="pl-pil-row">
          <button class="pl-dot" data-b="pil-color" data-id="${x.id}" style="background:${x.color}" title="${L('رنگ', 'Color')}"></button>
          <input class="cap-input" data-bi="pil" data-k="name" data-id="${x.id}" value="${esc(x.name)}" placeholder="${L('اسم ستون', 'Pillar name')}">
          <input type="range" min="0" max="100" step="5" data-bi="pil" data-k="share" data-id="${x.id}" value="${+x.share || 0}">
          <output data-out="${x.id}">${N(Math.round((+x.share || 0) / tot * 100))}٪</output>
          <button class="pl-x" data-b="pil-del" data-id="${x.id}" title="${L('حذف', 'Remove')}">✕</button></div>`).join('')
          || `<p class="cap-hint">${L('هنوز ستونی نیست.', 'No pillars yet.')}</p>`}</div>
        <div class="rowbar" style="margin:12px 0 0">
          <button class="btn" data-b="pil-add">+ ${L('ستون تازه', 'Add pillar')}</button>
          <button class="btn" data-b="pil-equal" ${p.pillars.length > 1 ? '' : 'disabled'}>${L('سهم مساوی', 'Equal shares')}</button>
          <button class="btn" data-b="pil-brand" title="${L('ستون‌های «هسته‌ی برند» دوباره خوانده می‌شوند', 'Reload pillars from your brand core')}">${L('از هسته‌ی برند', 'From brand core')}</button>
        </div>`)}
      ${step(3, L('فرمت‌ها و تعداد در هفته', 'Formats and weekly count'), L('هر فرمت نقش خودش را دارد: ریلز برای دیده‌شدن، کاروسل برای سیو و اعتماد، استوری برای رابطه. «ساعت کار» برای حساب ظرفیت است.', 'Each format has a job: reels for reach, carousels for saves and trust, stories for connection. “Hours” feeds the capacity check.'),
        `<div class="pl-fmts">${p.formats.map(x => plFmtCardHTML(x)).join('')}</div>
        <div class="rowbar" style="margin:12px 0 0"><button class="btn" data-b="fmt-add">+ ${L('فرمت دلخواه', 'Custom format')}</button>
          <span class="cap-hint" style="margin:0">${L('مثلاً «ویدیوی یوتیوب»، «خبرنامه» یا «پست لینکدین» برای برنامه‌ی کامل.', 'For example “YouTube video”, “Newsletter” or “LinkedIn post” for a full plan.')}</span></div>`)}
      ${step(4, L('ریتم انتشار', 'Publishing rhythm'), L('روزهایی که پست می‌گذاری، سقف هر روز و ظرفیت واقعی‌ات. برنامه‌ای که با ظرفیتت جور است، دوام می‌آورد.', 'The days you post, a daily limit, and your real capacity. A plan that fits your capacity is the one that lasts.'),
        `<div class="pl-f"><span>${L('روزهای انتشار', 'Publishing days')}</span><div class="pl-days">${order.map(wd => `<button class="pl-dchip${R.days[wd] ? ' on' : ''}" data-b="day" data-wd="${wd}">${plDay(wd)}${best.includes(wd) ? ' ★' : ''}</button>`).join('')}</div>
          ${best.length ? `<p class="cap-hint">★ ${L('روزهایی که در آمار پیجت بهتر دیده شده‌اند.', 'Days that did best in your own analytics.')}</p>` : ''}</div>
        <div class="pl-grid2">
          <label class="pl-f">${L('شروع هفته', 'Week starts on')}<select data-bi="r" data-k="weekStart">${[6, 0, 1].map(v => opt(v, plDay(v), R.weekStart)).join('')}</select></label>
          <div class="pl-f"><span>${L('سقف پست در روز', 'Max posts per day')}</span><div class="pl-opts">${[1, 2, 3].map(v => `<button class="pl-opt${+R.maxPerDay === v ? ' on' : ''}" data-b="maxday" data-v="${v}">${N(v)}</button>`).join('')}</div></div>
          <label class="pl-f">${L('ظرفیت تو در هفته (ساعت)', 'Your weekly capacity (hours)')}<input class="cap-input" type="number" min="1" max="80" step="1" data-bi="r" data-k="capacity" value="${+R.capacity || 0}" dir="ltr"></label>
          <label class="pl-f">${L('روز تولید (ضبط و ساخت یک‌جا)', 'Production day (batch it)')}<select data-bi="r" data-k="prodDay">${opt(-1, L('ندارم', 'None'), R.prodDay)}${order.map(wd => opt(wd, plDay(wd), R.prodDay)).join('')}</select></label>
        </div>
        <div class="pl-f"><span>${L('سهم فروش', 'Promotional share')} <b id="plPromo">${N(+R.promo || 0)}٪</b></span>
          <input type="range" min="0" max="50" step="5" data-bi="r" data-k="promo" value="${+R.promo || 0}">
          <p class="cap-hint" style="margin-top:2px">${L('قاعده‌ی رایج ۸۰/۲۰: ۸۰٪ ارزش (آموزش، داستان، دیدگاه)، ۲۰٪ دعوت به پیشنهادت. در هفته‌ی لانچ بیشتر.', 'The common 80/20 rule: 80% value (teach, story, opinion), 20% invitation to your offer. More during a launch.')}</p></div>
        <label class="pl-check"><input type="checkbox" data-bi="r" data-k="noRepeat" ${R.noRepeat ? 'checked' : ''}> ${L('یک ستون دو بار پشت سر هم نیاید', 'Never the same pillar twice in a row')}</label>
        <label class="pl-check"><input type="checkbox" data-bi="r" data-k="spread" ${R.spread ? 'checked' : ''}> ${L('فرمت‌های سنگین (ریلز، کاروسل) روزهای پشت‌سرهم نیفتند', 'Keep heavy formats (reels, carousels) off back-to-back days')}</label>
        ${ins && ins.hours && ins.hours.length ? `<div class="pl-insline">📈 ${L(`در آمار پیجت، پست‌های ساعت ${plTime(plPad(ins.hours[0].from) + ':00')} تا ${plTime(plPad(ins.hours[0].to % 24) + ':00')} بهتر دیده شده‌اند.`, `In your analytics, posts between ${plPad(ins.hours[0].from)}:00 and ${plPad(ins.hours[0].to % 24)}:00 did best.`)}
          <button class="btn" data-b="ins-time">${L('همین ساعت برای پست‌ها', 'Use it for posts')}</button></div>` : ''}`)}
      ${step(5, L('سری‌های ثابت (اختیاری)', 'Recurring series (optional)'), L('یک برنامه‌ی ثابت هفتگی، مثل «سه‌شنبه‌های ابزار»؛ مخاطب عادت می‌کند و منتظرش می‌ماند. هر سری همیشه سر روز خودش می‌نشیند.', 'A fixed weekly show like “Tool Tuesday”; people learn to expect it. A series always lands on its own day.'),
        `<div class="pl-series">${p.series.map(x => `<div class="pl-ser-row">
          <input class="cap-input" data-bi="ser" data-k="name" data-id="${x.id}" value="${esc(x.name || '')}" placeholder="${L('اسم سری', 'Series name')}">
          <select data-bi="ser" data-k="day" data-id="${x.id}">${order.map(wd => opt(wd, plDay(wd), x.day)).join('')}</select>
          <select data-bi="ser" data-k="format" data-id="${x.id}">${p.formats.map(f => opt(f.id, esc(plFmt(f.id).name), x.format)).join('')}</select>
          <select data-bi="ser" data-k="pillar" data-id="${x.id}">${opt('', L('ستون خودکار', 'Auto pillar'), x.pillar || '')}${p.pillars.map(q => opt(q.id, esc(q.name), x.pillar || '')).join('')}</select>
          <button class="pl-x" data-b="ser-del" data-id="${x.id}">✕</button></div>`).join('')}</div>
        <div class="rowbar" style="margin:10px 0 0"><button class="btn" data-b="ser-add">+ ${L('سری ثابت', 'Add a series')}</button></div>
        ${p.series.some(x => !(p.formats.find(f => f.id === x.format) || {}).on) ? `<p class="cap-hint" style="color:var(--warn)">${L('فرمت بعضی سری‌ها خاموش است؛ آن سری‌ها چیده نمی‌شوند.', 'Some series use a format that is turned off; they won’t be placed.')}</p>` : ''}`)}
    </div>
    <aside class="pl-sum" id="plSum"></aside>
  </div>`;
  plRenderSum();
}
function plFmtCardHTML(x) {
  const f = plFmt(x.id), side = f.lane !== 'feed', max = side ? 7 : 14;
  return `<div class="pl-fcard${x.on ? ' on' : ''}">
    <div class="pl-fhead">
      <label class="pl-switch" title="${L('روشن/خاموش', 'On/off')}"><input type="checkbox" data-bi="fmt" data-k="on" data-id="${x.id}" ${x.on ? 'checked' : ''}><i></i></label>
      <div class="pl-fname">${x.custom ? `<input class="cap-input pl-cname" data-bi="fmt" data-k="name" data-id="${x.id}" value="${esc(x.name || '')}" placeholder="${L('اسم فرمت', 'Format name')}">` : `<b>${f.icon} ${esc(f.name)}</b>`}
        ${f.desc ? `<small>${esc(f.desc)}</small>` : ''}</div>
      ${x.custom ? `<button class="pl-x" data-b="fmt-del" data-id="${x.id}">✕</button>` : ''}
    </div>
    <div class="pl-fbody">
      <div class="pl-stepper"><button data-b="fmt-step" data-id="${x.id}" data-d="-1" ${+x.per <= 0 ? 'disabled' : ''}>−</button>
        <b>${N(+x.per || 0)}</b><button data-b="fmt-step" data-id="${x.id}" data-d="1" ${+x.per >= max ? 'disabled' : ''}>+</button>
        <span>${side ? L('روز در هفته', 'days / week') : L('در هفته', '/ week')}</span></div>
      <label>${L('هدف', 'Goal')}<select data-bi="fmt" data-k="goal" data-id="${x.id}">${Object.entries(PL_GOALS).map(([k, g]) => `<option value="${k}" ${x.goal === k ? 'selected' : ''}>${g[PL.lang]}</option>`).join('')}</select></label>
      <label>${L('ساعت انتشار', 'Post time')}${plTimeSel(`data-bi="fmt" data-k="time" data-id="${x.id}"`, x.time || '')}</label>
      <label>${L('ساعت کار', 'Hours')}<input type="number" min="0" max="40" step="0.25" data-bi="fmt" data-k="effort" data-id="${x.id}" value="${+x.effort || 0}" dir="ltr"></label>
    </div>
  </div>`;
}
function plRenderSum() {
  const box = $('#plSum'); if (!box) return;
  const pv = plGenerate(PL.plan, PL.pseed, [], PL.week), h = plHealth(PL.plan, pv.slots, pv.unplaced);
  const side = pv.slots.filter(s => plFmt(s.format).lane !== 'feed');
  const stories = new Set(side.filter(s => s.format === 'story').map(s => s.day)).size;
  const pct = h.cap ? Math.min(100, h.hrs / h.cap * 100) : 0;
  const pils = PL.plan.pillars.filter(p => p.name), cnt = id => pv.slots.filter(s => s.pillar === id).length;
  box.innerHTML = `<div class="pl-sum-in panel">
    <h3>${L('پیش‌نمایش زنده', 'Live preview')}</h3>
    <div class="pl-kpis">
      <div><b>${N(h.n)}</b><span>${L('پست در هفته', 'posts / week')}</span></div>
      <div><b>${N(stories)}</b><span>${L('روز استوری', 'story days')}</span></div>
      <div><b>${N(h.conv)}</b><span>${L('خانه‌ی فروش', 'promo slots')}</span></div>
    </div>
    <div class="pl-load ${h.cap && h.hrs > h.cap ? 'bad' : pct > 85 ? 'warn' : ''}"><span>${L('بار کار', 'Workload')}</span><b>${plH(h.hrs)} / ${plH(h.cap)} ${L('ساعت', 'h')}</b><i style="--w:${pct}%"></i></div>
    ${pils.length ? `<div class="pl-pmix">${pils.map(p => `<span><i style="background:${p.color}"></i>${esc(p.name)} <b>${N(cnt(p.id))}</b></span>`).join('')}</div>` : ''}
    ${plMiniHTML(pv.slots)}
    ${plHealthHTML(h, true)}
    <button class="btn primary pl-go" data-pl="${plWeekData() ? 'go-week' : 'make'}">${plWeekData() ? L('برو به برنامه‌ی این هفته', 'Go to this week') : L('ساخت برنامه‌ی این هفته', 'Generate this week')}</button>
    ${plWeekData() ? `<p class="cap-hint">${L('این هفته برنامه دارد؛ برای اعمال تعریف تازه، آن‌جا «بازچینی» را بزن (خانه‌های قفل می‌مانند).', 'This week already has a plan; use Reshuffle there to apply the new definition (locked slots stay).')}</p>` : ''}
  </div>`;
}
function plBuildAct(a, el) {
  const p = PL.plan, id = el.dataset.id;
  if (a === 'tpl') {
    const t = PL_TEMPLATES.find(x => x.id === id); if (!t) return;
    for (const f of p.formats) if (!f.custom) { const n = t.formats[f.id] || 0; f.per = n; f.on = n > 0; }
    const order = plOrder(p); p.rhythm.days = [0, 0, 0, 0, 0, 0, 0]; t.days.forEach(i => { p.rhythm.days[order[i]] = 1; });
    Object.assign(p.rhythm, { maxPerDay: t.maxPerDay, promo: t.promo }); p.template = id;
  } else if (a === 'pil-add') {
    const used = new Set(p.pillars.map(x => x.color));
    p.pillars.push({ id: plId('p'), name: '', color: PL_COLORS.find(c => !used.has(c)) || PL_COLORS[p.pillars.length % PL_COLORS.length], share: 20 });
  } else if (a === 'pil-del') {
    p.pillars = p.pillars.filter(x => x.id !== id);
    p.series.forEach(x => { if (x.pillar === id) x.pillar = ''; });
  } else if (a === 'pil-color') {
    const x = p.pillars.find(q => q.id === id); if (x) x.color = PL_COLORS[(PL_COLORS.indexOf(x.color) + 1) % PL_COLORS.length];
  } else if (a === 'pil-equal') {
    const v = Math.round(100 / Math.max(1, p.pillars.length)); p.pillars.forEach(x => { x.share = v; });
  } else if (a === 'pil-brand') {
    const have = new Set(p.pillars.map(x => x.name));
    const add = (PL.d.pillars || []).filter(n => n && !have.has(n));
    if (!add.length) return toast(L('همه‌ی ستون‌های هسته‌ی برند همین حالا این‌جا هستند.', 'All brand-core pillars are already here.'));
    add.forEach(name => p.pillars.push({ id: plId('p'), name, color: PL_COLORS[p.pillars.length % PL_COLORS.length], share: 20 }));
  } else if (a === 'fmt-step') {
    const f = p.formats.find(x => x.id === id); if (!f) return;
    const max = plFmt(id).lane !== 'feed' ? 7 : 14;
    f.per = Math.max(0, Math.min(max, (+f.per || 0) + +el.dataset.d)); f.on = f.per > 0; p.template = '';
  } else if (a === 'fmt-add') {
    p.formats.push({ id: plId('x'), custom: true, name: '', on: true, per: 1, effort: 1, goal: 'engage', time: '12:00' });
  } else if (a === 'fmt-del') {
    p.formats = p.formats.filter(x => x.id !== id);
  } else if (a === 'day') {
    const wd = +el.dataset.wd; p.rhythm.days[wd] = p.rhythm.days[wd] ? 0 : 1; p.template = '';
  } else if (a === 'maxday') {
    p.rhythm.maxPerDay = +el.dataset.v;
  } else if (a === 'ser-add') {
    const f = p.formats.find(x => x.on && plFmt(x.id).lane === 'feed') || p.formats[0];
    p.series.push({ id: plId('r'), name: '', day: plOrder(p)[1], format: f ? f.id : 'reel', pillar: '' });
  } else if (a === 'ser-del') {
    p.series = p.series.filter(x => x.id !== id);
  } else if (a === 'ins-time') {
    const h = PL.d.insights.hours[0], t = `${plPad(h.from)}:30`;
    p.formats.forEach(f => { if (plFmt(f.id).lane === 'feed') f.time = t; });
    toast(L(`✓ ساعت انتشار پست‌ها ${plTime(t)} شد`, `✓ Post times set to ${t}`));
  } else return;
  plSavePlan();
  const y = window.scrollY; plRenderBuild(); window.scrollTo(0, y);
}
// ورودی‌های تعریف: تایپ فقط پیش‌نمایش را تازه می‌کند (فوکِ ورودی نمی‌پرد)؛ change ساختار را هم از نو می‌کشد
function plBuildInput(t, changed) {
  const p = PL.plan, k = t.dataset.k, id = t.dataset.id, kind = t.dataset.bi;
  const val = t.type === 'checkbox' ? t.checked : t.type === 'number' || t.type === 'range' ? +t.value : t.value;
  if (kind === 'pil') {
    const x = p.pillars.find(q => q.id === id); if (!x) return;
    x[k] = k === 'name' ? String(val).slice(0, 80) : val;
    if (k === 'share') {
      const tot = p.pillars.reduce((a, q) => a + (+q.share || 0), 0) || 1;
      p.pillars.forEach(q => { const o = $(`output[data-out="${q.id}"]`); if (o) o.textContent = `${N(Math.round((+q.share || 0) / tot * 100))}٪`; });
      $$('.pl-mix i').forEach((el, i) => { if (p.pillars[i]) el.style.flex = (+p.pillars[i].share || 0.0001); });
    }
  } else if (kind === 'fmt') {
    const x = p.formats.find(q => q.id === id); if (!x) return;
    if (k === 'on') { x.on = val; if (val && !(+x.per > 0)) x.per = 1; }
    else x[k] = k === 'name' ? String(val).slice(0, 60) : val;
  } else if (kind === 'r') {
    p.rhythm[k] = ['weekStart', 'prodDay'].includes(k) ? +val : val;
    if (k === 'promo') { const o = $('#plPromo'); if (o) o.textContent = `${N(val)}٪`; }
    if (k === 'weekStart') PL.week = plStartOf(PL.today, +val);
  } else if (kind === 'ser') {
    const x = p.series.find(q => q.id === id); if (!x) return;
    x[k] = k === 'day' ? +val : k === 'name' ? String(val).slice(0, 60) : val;
  }
  plSavePlan();
  if (changed && (t.tagName === 'SELECT' || t.type === 'checkbox')) { const y = window.scrollY; plRenderBuild(); window.scrollTo(0, y); }
  else plRenderSum();
}
