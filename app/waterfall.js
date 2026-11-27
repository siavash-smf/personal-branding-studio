/* ================= آبشار محتوا =================
   داخل صفحه‌ی هر ایده (بانک ایده): از همان ایده یک بسته برای اینستاگرام (ریلز، کاروسل، استوری، پست)، لینکدین، X،
   یوتیوب و خبرنامه. هر قطعه: کپی، ویرایش، بازنویسی با نظر، تاریخ انتشار و «منتشر شد»؛ کاروسل در تب کاروسل باز می‌شود،
   استوری در تب استوری، ریلز در تله‌پرامپتر، و قطعه‌های اینستاگرامی با یک دکمه در هفته‌ی تقویم محتوا می‌نشینند.
   داده: /api/waterfall (app/waterfall.py). */

const WF = { id: null, d: null, poll: 0, opts: false, edit: null, regen: null };
const WF_GROUPS = [['Instagram', 'اینستاگرام'], ['LinkedIn', 'لینکدین'], ['X', 'X'], ['YouTube', 'یوتیوب'], ['Newsletter', 'خبرنامه']];

window.mountWaterfall = async function (box, it) {
  if (!box || !it) return;
  WF.id = it.id; WF.box = box; WF.edit = WF.regen = null;
  const d = await api('/api/waterfall?id=' + encodeURIComponent(it.id));
  if (!d || WF.id !== it.id) return;
  WF.d = d; WF.opts = !d.wf; wfRender();
  if (d.job.state === 'running' && d.job.id === it.id) wfPoll();
};

function wfRender() {
  const d = WF.d, wf = d.wf, box = WF.box; if (!box || !document.body.contains(box)) return;
  const running = d.job.state === 'running' && d.job.id === WF.id;
  box.innerHTML = `<section class="panel wf">
    <div class="wf-head"><h3>🌊 آبشار محتوا</h3>
      <span class="wf-sub">${wf ? `${faNum(wf.assets.length)} قطعه · ${esc(wf.lang === 'en' ? 'English' : 'فارسی')} · ${esc(faNum(wf.created || ''))}` : 'همین ایده، برای همه‌ی پلتفرم‌ها'}</span>
      <span class="grow"></span>
      ${wf ? `<button class="btn" id="wfMd">⇩ همه (.md)</button><button class="btn" id="wfAgain">${WF.opts ? 'بستن' : 'ساخت دوباره'}</button>` : ''}
    </div>
    ${WF.opts || !wf ? wfOptsHTML(running) : ''}
    <div id="wfJob" class="build-status" hidden></div>
    ${wf ? WF_GROUPS.map(([p, l]) => {
      const as = wf.assets.filter(a => d.types[a.type] && d.types[a.type].platform === p);
      return as.length ? `<div class="wf-group"><h4>${l}</h4><div class="wf-grid">${as.map(wfCardHTML).join('')}</div></div>` : '';
    }).join('') : ''}
  </section>`;
  wfShowJob();
  const g = $('#wfGo', box); if (g) g.onclick = wfGenerate;
  const a = $('#wfAgain', box); if (a) a.onclick = () => { WF.opts = !WF.opts; wfRender(); };
  const m = $('#wfMd', box); if (m) m.onclick = wfDownload;
  wfWire(box);
}

function wfOptsHTML(running) {
  const d = WF.d, P = d.prefs;
  return `<div class="wf-opts">
    <p class="wf-lead">یک ایده، چند قالب: هر قطعه به زبان و اندازه‌ی پلتفرم خودش، با تجربه‌ی خودت و حرف مخاطب‌هایت. بهتر است اول «تحلیل» و «جستجوی وب» این ایده انجام شده باشد؛ عددها فقط از پژوهش می‌آیند.</p>
    <div class="wf-checks">${Object.entries(d.types).map(([k, t]) => `
      <label class="wf-check"><input type="checkbox" data-wft="${k}" ${P[k] ? 'checked' : ''}>
        <span>${esc(t.label)}<small>${esc(t.platform)}</small></span>
        ${t.max > 1 ? `<select data-wfn="${k}">${[...Array(t.max).keys()].map(i => `<option value="${i + 1}" ${(P[k] || 3) === i + 1 ? 'selected' : ''}>${faNum(i + 1)} تا</option>`).join('')}</select>` : ''}
      </label>`).join('')}</div>
    <div class="rowbar" style="margin:12px 0 0">
      <label class="au-ch">زبان<select id="wfLang"><option value="fa" ${d.lang === 'fa' ? 'selected' : ''}>فارسی</option><option value="en" ${d.lang === 'en' ? 'selected' : ''}>English</option></select></label>
      <span class="grow"></span>
      ${d.wf ? '<span class="cap-hint" style="margin:0">بسته‌ی فعلی کنار گذاشته می‌شود (waterfall.prev.json).</span>' : ''}
      <button class="btn primary" id="wfGo" ${running ? 'disabled' : ''}>ساخت بسته</button>
    </div></div>`;
}

/* ---------- کارت هر قطعه ---------- */
const wfJoin = a => (a || []).join('\n\n');
function wfText(a) {          // متن کامل قطعه برای کپی
  const v = a.data;
  switch (a.type) {
    case 'reels': return `${v.title}\n\nهوک: ${v.hook}\n\n${v.script}\n\nمتن روی تصویر: ${v.onscreen}\n\nکپشن:\n${v.caption}\n${v.hashtags}`;
    case 'carousel': return v.slides.map((s, i) => `اسلاید ${i + 1}: ${s.title}\n${s.body}`).join('\n\n') + `\n\nکپشن:\n${v.caption}\n${v.hashtags}`;
    case 'stories': return v.frames.map((f, i) => `استوری ${i + 1}:\n${f}`).join('\n\n') + (v.sticker ? `\n\nاستیکر: ${v.sticker}` : '');
    case 'post': return `روی تصویر: ${v.image_text}\n\n${v.caption}\n${v.hashtags}`;
    case 'linkedin': return v.text;
    case 'x': return v.posts.join('\n\n---\n\n');
    case 'youtube': return `عنوان‌ها:\n${v.titles.map(t => '- ' + t).join('\n')}\n\nتامبنیل: ${v.thumbnail}\n\nهوک:\n${v.hook}\n\n` +
      v.chapters.map((c, i) => `${i + 1}. ${c.title}\n${c.points.map(p => '   - ' + p).join('\n')}`).join('\n') + `\n\nCTA: ${v.cta}\n\nتوضیحات:\n${v.description}`;
    case 'newsletter': return `عنوان‌ها:\n${v.subjects.map(t => '- ' + t).join('\n')}\nPreheader: ${v.preheader}\n\n${v.body}`;
  }
  return '';
}
function wfBody(a) {
  const v = a.data, p = s => `<p class="wf-p">${esc(s)}</p>`;
  switch (a.type) {
    case 'reels': return `<b class="wf-t">${esc(v.title)}</b><div class="hook"><em>هوک</em>${esc(v.hook)}</div>${p(v.script)}
      ${v.onscreen ? `<p class="wf-meta">روی تصویر: ${esc(v.onscreen)}</p>` : ''}<details><summary>کپشن</summary>${p(v.caption + '\n' + v.hashtags)}</details>`;
    case 'carousel': return `<b class="wf-t">${esc(v.title || '')}</b><ol class="wf-slides">${v.slides.map(s => `<li><b>${esc(s.title.replace(/\*\*/g, ''))}</b>${s.body ? ' — ' + esc(s.body.replace(/\*\*/g, '')) : ''}</li>`).join('')}</ol>
      <details><summary>کپشن</summary>${p(v.caption + '\n' + v.hashtags)}</details>`;
    case 'stories': return `<ol class="wf-slides">${v.frames.map(f => `<li>${esc(f.replace(/\*\*/g, ''))}</li>`).join('')}</ol>${v.sticker ? `<p class="wf-meta">استیکر: ${esc(v.sticker)}</p>` : ''}`;
    case 'post': return `<div class="hook"><em>روی تصویر</em>${esc(v.image_text)}</div>${p(v.caption + '\n' + v.hashtags)}`;
    case 'linkedin': return p(v.text);
    case 'x': return `<ol class="wf-slides wf-x">${v.posts.map(t => `<li>${esc(t)}<small>${faNum([...t].length)}</small></li>`).join('')}</ol>`;
    case 'youtube': return `<ul class="wf-titles">${v.titles.map(t => `<li>${esc(t)}</li>`).join('')}</ul><p class="wf-meta">تامبنیل: ${esc(v.thumbnail)}</p>
      <div class="hook"><em>۳۰ ثانیه‌ی اول</em>${esc(v.hook)}</div><ol class="wf-slides">${v.chapters.map(c => `<li><b>${esc(c.title)}</b>${c.points.length ? ': ' + esc(c.points.join(' · ')) : ''}</li>`).join('')}</ol>
      <details><summary>توضیحات و CTA</summary>${p(v.cta + '\n\n' + v.description)}</details>`;
    case 'newsletter': return `<ul class="wf-titles">${v.subjects.map(t => `<li>${esc(t)}</li>`).join('')}</ul><p class="wf-meta">${esc(v.preheader)}</p><div class="md wf-md">${md(v.body)}</div>`;
  }
  return '';
}
// فیلدهای متنی که همین‌جا ویرایش می‌شوند (کاروسل و یوتیوب در ویرایشگر خودشان یا با بازنویسی)
const WF_EDIT = { reels: ['title', 'hook', 'script', 'onscreen', 'caption', 'hashtags'], stories: ['frames', 'sticker'],
  post: ['image_text', 'caption', 'hashtags'], linkedin: ['text'], x: ['posts'], newsletter: ['subjects', 'preheader', 'body'] };
const WF_FL = { title: 'عنوان', hook: 'هوک', script: 'متن', onscreen: 'روی تصویر', caption: 'کپشن', hashtags: 'هشتگ‌ها', frames: 'فریم‌ها (با خط --- جدا کن)',
  sticker: 'استیکر', image_text: 'روی تصویر', text: 'متن', posts: 'پست‌ها (با خط --- جدا کن)', subjects: 'عنوان‌های ایمیل (با خط --- جدا کن)', preheader: 'Preheader', body: 'متن (Markdown)' };

function wfCardHTML(a) {
  const t = WF.d.types[a.type], v = a.data, ed = WF.edit === a.aid, rg = WF.regen === a.aid;
  const fields = WF_EDIT[a.type] || [];
  const tools = {
    reels: `<button class="btn" data-wfa="tp" data-aid="${a.aid}">▶ تله‌پرامپتر</button>`,
    carousel: `<button class="btn" data-wfa="deck" data-aid="${a.aid}">${a.deck ? 'باز کردن کاروسل' : 'ساخت در کاروسل'}</button>`,
    stories: `<button class="btn" data-wfa="story" data-aid="${a.aid}">باز کردن در استوری</button>`,
  }[a.type] || '';
  return `<article class="wf-card${a.done ? ' done' : ''}" data-aid="${a.aid}">
    <div class="wf-chead"><b>${esc(t.label)}</b>${a.done ? `<span class="wf-done">✓ منتشر شد</span>` : a.slot ? `<span class="wf-in">در تقویم</span>` : ''}<span class="grow"></span>
      <button class="del" data-wfa="copy" data-aid="${a.aid}" title="کپی">⧉</button>
      ${fields.length ? `<button class="del" data-wfa="edit" data-aid="${a.aid}" title="ویرایش">✎</button>` : ''}
      <button class="del" data-wfa="regen" data-aid="${a.aid}" title="بازنویسی با Claude">↻</button>
      <button class="del" data-wfa="del" data-aid="${a.aid}" title="حذف">✕</button></div>
    ${ed ? `<div class="wf-edit">${fields.map(f => `<label>${WF_FL[f]}<textarea class="cap-text" data-wff="${f}">${esc(Array.isArray(v[f]) ? v[f].join('\n---\n') : v[f] || '')}</textarea></label>`).join('')}
        <div class="rowbar"><button class="btn" data-wfa="edit-x" data-aid="${a.aid}">انصراف</button><span class="grow"></span><button class="btn primary" data-wfa="edit-ok" data-aid="${a.aid}">ذخیره</button></div></div>`
      : `<div class="wf-body">${wfBody(a)}</div>`}
    ${rg ? `<div class="wf-edit"><textarea class="cap-text" id="wfNote" placeholder="چه چیزی عوض شود؟ مثلاً: کوتاه‌تر، با داستان مصاحبه‌ی خودم شروع کن، لحن خودمانی‌تر… (خالی = نسخه‌ی تازه)"></textarea>
        <div class="rowbar"><button class="btn" data-wfa="regen-x" data-aid="${a.aid}">انصراف</button><span class="grow"></span><button class="btn primary" data-wfa="regen-ok" data-aid="${a.aid}">بازنویسی</button></div></div>` : ''}
    <div class="wf-foot">${tools}
      <span class="grow"></span>
      <input type="date" class="wf-date" data-wfdate="${a.aid}" value="${esc(a.date || '')}" title="تاریخ انتشار">
      ${t.ig ? `<button class="btn" data-wfa="plan" data-aid="${a.aid}" title="یک خانه‌ی قفل‌شده در همان روزِ تقویم محتوا">→ تقویم</button>` : ''}
      <label class="xp-check" title="منتشر شد"><input type="checkbox" data-wfdone="${a.aid}" ${a.done ? 'checked' : ''}> منتشر شد</label>
    </div></article>`;
}

function wfWire(box) {
  $$('[data-wfa]', box).forEach(b => b.onclick = () => wfAct(b.dataset.wfa, b.dataset.aid));
  $$('[data-wfdate]', box).forEach(inp => inp.onchange = () => wfPatch(inp.dataset.wfdate, { date: inp.value }, false));
  $$('[data-wfdone]', box).forEach(c => c.onchange = () => wfPatch(c.dataset.wfdone, { done: c.checked }));
  $$('.wf-edit textarea', box).forEach(ta => { fitHeight(ta); ta.addEventListener('input', () => fitHeight(ta)); });
}
const wfA = aid => WF.d.wf.assets.find(a => a.aid === aid);
async function wfPatch(aid, body, redraw = true) {
  const r = await post('/api/waterfall/asset', { id: WF.id, aid, ...body });
  if (!r.ok) { toast(r.data.error || 'ذخیره نشد'); return false; }
  WF.d.wf = r.data.wf; if (redraw) wfRender(); else toast('✓ ذخیره شد');
  return true;
}
async function wfAct(k, aid) {
  const a = wfA(aid); if (!a) return;
  if (k === 'copy') return navigator.clipboard.writeText(wfText(a)).then(() => toast('✓ کپی شد'), () => toast('کپی نشد'));
  if (k === 'edit') { WF.edit = aid; WF.regen = null; return wfRender(); }
  if (k === 'edit-x' || k === 'regen-x') { WF.edit = WF.regen = null; return wfRender(); }
  if (k === 'edit-ok') {
    const data = { ...a.data };
    $$(`.wf-card[data-aid="${aid}"] [data-wff]`, WF.box).forEach(ta => {
      const f = ta.dataset.wff;
      data[f] = Array.isArray(a.data[f]) ? ta.value.split(/\n\s*---+\s*\n/).map(s => s.trim()).filter(Boolean) : ta.value;
    });
    if (await wfPatch(aid, { data })) { WF.edit = null; wfRender(); toast('✓ ذخیره شد'); }
    return;
  }
  if (k === 'del') { if (confirm('این قطعه از بسته حذف شود؟')) wfPatch(aid, { delete: true }); return; }
  if (k === 'regen') { WF.regen = aid; WF.edit = null; wfRender(); const n = $('#wfNote'); if (n) n.focus(); return; }
  if (k === 'regen-ok') {
    const r = await post('/api/waterfall/regen', { id: WF.id, aid, note: ($('#wfNote') || {}).value || '' });
    if (!r.ok) return toast(r.data.error || 'شروع نشد');
    WF.regen = null; WF.d.job = { state: 'running', id: WF.id, step: '' }; wfRender(); return wfPoll();
  }
  if (k === 'tp') {
    const v = a.data, body = `**${v.hook}**\n\n${v.script}`;
    return tpOpenScript({ title: v.title || 'ریلز', body, secs: Math.round(body.split(/\s+/).length / 160 * 60) });
  }
  if (k === 'deck') {
    const r = await post('/api/waterfall/carousel', { id: WF.id, aid });
    if (!r.ok) return toast(r.data.error || 'نشد');
    CR.openId = r.data.deck; return go('carousel');
  }
  if (k === 'story') { window.ST_PENDING = a.data.frames; return go('story'); }
  if (k === 'plan') {
    const date = ($(`[data-wfdate="${aid}"]`, WF.box) || {}).value;
    if (!date) return toast('اول تاریخ انتشار را انتخاب کن');
    const r = await post('/api/waterfall/plan', { id: WF.id, aid, date });
    if (!r.ok) return toast(r.data.error || 'نشد');
    a.slot = { week: r.data.week, id: r.data.slot }; a.date = date; wfRender();
    toast('✓ در تقویم محتوا نشست (قفل‌شده). بقیه‌ی هفته را با «بازچینی» بچین.');
  }
}

/* ---------- ساخت و وضعیت ---------- */
async function wfGenerate() {
  const types = {};
  $$('[data-wft]', WF.box).forEach(c => {
    const k = c.dataset.wft, n = $(`[data-wfn="${k}"]`, WF.box);
    types[k] = c.checked ? (n ? +n.value : 1) : 0;
  });
  const r = await post('/api/waterfall/generate', { id: WF.id, types, lang: $('#wfLang').value });
  if (!r.ok) return toast(r.data.error || 'شروع نشد');
  WF.d.job = { state: 'running', id: WF.id, step: '' }; WF.opts = false; wfRender(); wfPoll();
}
function wfPoll() {
  clearInterval(WF.poll);
  const id = WF.id;
  WF.poll = setInterval(async () => {
    if (WF.id !== id || !WF.box || !document.body.contains(WF.box)) return clearInterval(WF.poll);
    const d = await api('/api/waterfall?id=' + encodeURIComponent(id)); if (!d) return;
    WF.d.job = d.job; wfShowJob();
    if (d.job.state !== 'running') {
      clearInterval(WF.poll); WF.d = d;
      if (d.job.state === 'done') { toast('✓ بسته آماده است'); WF.opts = false; }
      wfRender();
    }
  }, 3000);
}
function wfShowJob() {
  const j = WF.d.job, box = $('#wfJob', WF.box); if (!box) return;
  if (j.id !== WF.id || j.state === 'idle' || j.state === 'done') { box.hidden = true; return; }
  box.hidden = false; box.className = 'build-status' + (j.state === 'error' ? ' err' : '');
  box.innerHTML = `<div class="build-step">${j.state === 'running' ? `<span class="spin"></span> ${esc(j.step || 'در حال ساخت…')}` : '✕ ' + esc(j.error || 'خطا')}</div>`;
}
function wfDownload() {
  const wf = WF.d.wf, it = S.ideas.find(i => i.id === WF.id) || {};
  const out = [`# آبشار محتوا: ${it.title || ''}`, ''];
  for (const [p, l] of WF_GROUPS) for (const a of wf.assets.filter(a => WF.d.types[a.type].platform === p))
    out.push(`## ${l} · ${WF.d.types[a.type].label}`, '', wfText(a), '');
  const url = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/markdown;charset=utf-8' }));
  const el = document.createElement('a'); el.href = url; el.download = `waterfall-${WF.id}.md`; el.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
