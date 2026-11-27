/* ================= زبان محتوا (فارسی / English) =================
   کلید «فا | EN» در هدر می‌گوید خروجی‌های تازه‌ی هوشمند به چه زبانی ساخته شوند (app/lang.py، /api/lang).
   در حالت EN:
   - <html data-lang="en">: متن‌های محتوا خودکار چپ‌به‌راست و با فونت انگلیسی (lang.css)؛ رابط استودیو فارسی می‌ماند.
   - استوری و کاروسل با فونت تیتر و متنِ انتخاب‌شده (LANG.stack) و چپ‌به‌راست کشیده می‌شوند (stDir در story.js).
   - تقویم محتوا تعریف و هفته‌های پیج انگلیسی را نشان می‌دهد.
   «Aa» کنار کلید، فونت‌های پیج انگلیسی را انتخاب می‌کند. */

const LANG_LS = 'content-lang';
const LANG = {
  cur: 'fa', type: { head: 'montserrat', body: 'inter' }, fonts: [], pairs: [], ready: null, fontsOK: true,
  get en() { return this.cur === 'en'; },
  family(role) {
    const f = this.fonts.find(x => x.id === this.type[role]);
    return f ? f.family : role === 'head' ? 'Montserrat' : 'Inter';
  },
  stack(role) { return `"${this.family(role)}", Vazirmatn, "Apple Color Emoji", sans-serif`; },
  // فونت تیتر و متن، در همه‌ی وزن‌هایی که استوری و کاروسل به کار می‌برند؛ true یعنی بار شدند
  async loadFonts() {
    try {
      const fams = [...new Set([this.family('head'), this.family('body')])];
      const got = await Promise.all(fams.flatMap(f => [500, 600, 700, 800, 900].map(w => document.fonts.load(`${w} 40px "${f}"`, 'Hello'))));
      return (this.fontsOK = got.every(x => x.length));
    } catch { return (this.fontsOK = false); }
  },
};
window.LANG = LANG;

function langApply(d) {
  if (d) Object.assign(LANG, { cur: d.lang === 'en' ? 'en' : 'fa', type: d.type || LANG.type, fonts: d.fonts || LANG.fonts, pairs: d.pairs || LANG.pairs });
  const root = document.documentElement;
  root.dataset.lang = LANG.cur;
  root.style.setProperty('--en-head', `"${LANG.family('head')}"`);
  root.style.setProperty('--en-body', `"${LANG.family('body')}"`);
  try { localStorage.setItem(LANG_LS, JSON.stringify({ lang: LANG.cur, type: LANG.type })); } catch {}
  langPaint();
}

/* ---------- کلید هدر ---------- */
function langPaint() {
  const bar = document.querySelector('.top-in'); if (!bar) return;
  let box = document.getElementById('langBox');
  if (!box) { box = document.createElement('div'); box.id = 'langBox'; box.className = 'lang-box'; bar.appendChild(box); }
  const pop = document.getElementById('langPop');
  box.innerHTML = `
    ${LANG.en ? `<button class="lang-aa${pop ? ' on' : ''}" id="langAa" title="English fonts · فونت‌های پیج انگلیسی">Aa</button>` : ''}
    <div class="lang-sw" role="group" aria-label="زبان محتوای تازه">
      <button data-l="fa" class="${LANG.en ? '' : 'on'}" aria-pressed="${!LANG.en}" title="خروجی‌های تازه فارسی ساخته شوند">فا</button>
      <button data-l="en" class="${LANG.en ? 'on' : ''}" aria-pressed="${LANG.en}" title="Content in English: خروجی‌های تازه برای پیج انگلیسی">EN</button>
    </div>`;
}

async function langSet(l) {
  if (l === LANG.cur) return;
  const r = await post('/api/lang', { lang: l });
  if (!r.ok) return toast(r.data.error || 'ذخیره نشد');
  langApply(r.data);
  if (!LANG.en) langPopClose();
  toast(LANG.en ? 'EN · خروجی‌های تازه انگلیسی ساخته می‌شوند' : 'فا · خروجی‌های تازه فارسی ساخته می‌شوند');
  if (LANG.en) await LANG.loadFonts();
  langRerender();
}

// فقط تب‌هایی که خودشان به زبان وابسته‌اند از نو کشیده می‌شوند. کاروسل هر کدام زبان خودش را دارد؛
// متن‌های بقیه‌ی تب‌ها با CSS جهتشان را پیدا می‌کنند.
function langRerender() {
  if (typeof S === 'undefined') return;
  if (S.section === 'story') { window.stFlush?.(); $('#page').innerHTML = ''; go('story'); }
  else if (S.section === 'planner') go('planner');
  else if (S.section === 'carousel' && typeof CR !== 'undefined' && !CR.deck) go('carousel');
}

/* ---------- فونت‌های پیج انگلیسی ---------- */
const LANG_SAMPLE = { h: 'Stop waiting for the perfect moment.', b: 'Post the useful version today, then make it better next week.' };
function langPopHTML() {
  const fam = id => (LANG.fonts.find(f => f.id === id) || {}).family || 'Inter';
  const opt = role => LANG.fonts.map(f => `<option value="${f.id}" ${LANG.type[role] === f.id ? 'selected' : ''}>${esc(f.family)}</option>`).join('');
  return `<div class="lang-pop" id="langPop" role="dialog" aria-label="English fonts">
    <div class="lang-pop-h"><div><b>English fonts · فونت‌های پیج انگلیسی</b>
      <span>استوری و کاروسلِ انگلیسی با همین‌ها کشیده می‌شوند: «تیتر» برای تیتر کاروسل و متن استوری، «متن» برای متن اسلایدها.</span></div>
      <button class="x" data-lang-close aria-label="بستن">✕</button></div>
    <div class="lang-pairs">${LANG.pairs.map(p => `
      <button class="lang-pair${LANG.type.head === p.head && LANG.type.body === p.body ? ' on' : ''}" data-pair="${p.id}">
        <span class="h" style="font-family:'${fam(p.head)}'">${LANG_SAMPLE.h}</span>
        <span class="b" style="font-family:'${fam(p.body)}'">${LANG_SAMPLE.b}</span>
        <span class="n">${esc(p.name)} · ${esc(fam(p.head))}${p.head !== p.body ? ' + ' + esc(fam(p.body)) : ''}</span>
      </button>`).join('')}</div>
    <div class="lang-sel">
      <label>تیتر (Headline)<select data-role="head">${opt('head')}</select></label>
      <label>متن (Body)<select data-role="body">${opt('body')}</select></label>
    </div>
    <p class="cap-hint">${esc((LANG.fonts.find(f => f.id === LANG.type.head) || {}).note || '')}</p>
    <p class="cap-hint">همه رایگان و با مجوز OFL‌اند و از روی همین کامپیوتر بار می‌شوند؛ بدون اینترنت هم کار می‌کنند.${LANG.fontsOK ? '' : ' <b style="color:var(--warn)">فونت بار نشد؛ صفحه را تازه کن.</b>'}</p>
  </div>`;
}
function langPopOpen() {
  langPopClose();
  document.body.insertAdjacentHTML('beforeend', langPopHTML());
  langPaint();
}
function langPopClose() { const p = document.getElementById('langPop'); if (p) { p.remove(); langPaint(); } }

async function langSetType(patch) {
  const r = await post('/api/lang', { type: { ...LANG.type, ...patch } });
  if (!r.ok) return toast(r.data.error || 'ذخیره نشد');
  langApply(r.data);
  await LANG.loadFonts();
  if (document.getElementById('langPop')) langPopOpen();
  // استوری و کاروسلِ باز با فونت تازه دوباره کشیده شوند
  if (S.section === 'story' && window.stSchedule) stSchedule(true);
  if (S.section === 'carousel' && typeof CR !== 'undefined' && CR.deck && window.crRenderAll) { crRenderAll(); window.crRenderGal?.(); }
}

document.addEventListener('click', e => {
  const sw = e.target.closest('.lang-sw button');
  if (sw) return langSet(sw.dataset.l);
  if (e.target.closest('#langAa')) return document.getElementById('langPop') ? langPopClose() : langPopOpen();
  if (e.target.closest('[data-lang-close]')) return langPopClose();
  const pair = e.target.closest('[data-pair]');
  if (pair) { const p = LANG.pairs.find(x => x.id === pair.dataset.pair); if (p) langSetType({ head: p.head, body: p.body }); return; }
  const pop = document.getElementById('langPop');
  if (pop && !pop.contains(e.target)) langPopClose();
});
document.addEventListener('change', e => {
  const sel = e.target.closest('.lang-sel select');
  if (sel) langSetType({ [sel.dataset.role]: sel.value });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') langPopClose(); });

/* ---------- شروع: اول از حافظه‌ی مرورگر (بی‌پرش)، بعد از سرور ---------- */
(function langInit() {
  try { const c = JSON.parse(localStorage.getItem(LANG_LS) || 'null'); if (c && c.lang) { LANG.cur = c.lang === 'en' ? 'en' : 'fa'; if (c.type) LANG.type = c.type; } } catch {}
  langApply();
  LANG.ready = api('/api/lang').then(d => { if (d) langApply(d); return LANG.loadFonts(); }).catch(() => false);
})();
