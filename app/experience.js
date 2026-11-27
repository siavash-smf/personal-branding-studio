/* ================= بانک تجربه =================
   داستان‌ها، نظرها، اشتباه‌ها، نتیجه‌ی مشتری‌ها و «این روزها»ی صاحب استودیو؛ ماده‌ی خامی که محتوا را مال خودش می‌کند.
   «مرور ماهانه»: به چند سؤال با ویس یا متن جواب بده ← رونویسی (Gemini) ← Claude تکه‌ها را جدا می‌کند ← انتخاب و افزودن.
   هر تجربه با یک دکمه به بانک ایده می‌رود. داده: /api/experience (app/experience.py). */

const XP = { d: null, tab: 'voice', filter: 'all', edit: null, rec: null, poll: 0, tDraft: 0, file: null };

window.viewExperience = async function viewExperience() {
  const d = await api('/api/experience');
  if (!d) { $('#page').innerHTML = '<div class="empty">بانک تجربه بار نشد.</div>'; return; }
  XP.d = d; xpRender();
  if (d.job && d.job.state === 'running') xpPoll();
};

const xpDays = iso => iso ? Math.round((Date.parse(XP.d.today) - Date.parse(iso)) / 864e5) : null;

function xpRender() {
  const d = XP.d, K = d.kinds;
  const count = k => d.items.filter(i => i.kind === k).length;
  const list = XP.filter === 'all' ? d.items : d.items.filter(i => i.kind === XP.filter);
  const ago = xpDays(d.ritual_at);
  const due = ago === null || ago >= 30;
  $('#page').innerHTML = `
    <div class="page-head"><h2>بانک تجربه</h2>
      <p>داستان‌ها، نظرها، اشتباه‌ها و نتیجه‌های واقعی تو؛ همه‌ی بخش‌های هوشمند استودیو از این‌ها مثال و داستان برمی‌دارند</p></div>
    <section class="panel xp-ritual${due ? ' due' : ''}">
      <div class="xp-rhead"><h3>مرور ماهانه</h3>
        <span class="xp-when">${ago === null ? 'هنوز مرور نکرده‌ای' : ago === 0 ? 'آخرین مرور: امروز' : `آخرین مرور: ${faNum(ago)} روز پیش`}${due ? ' · وقتش است' : ''}</span></div>
      <p class="xp-lead">یک بار در ماه، ده دقیقه به این سؤال‌ها با صدای خودت جواب بده. لازم نیست مرتب حرف بزنی؛ Claude تکه‌ها را جدا می‌کند و تو انتخاب می‌کنی کدام بماند.</p>
      <ol class="xp-q">${d.ritual.map(q => `<li>${esc(q)}</li>`).join('')}</ol>
      <div class="cap-tabs">
        <button data-xt="voice" class="${XP.tab === 'voice' ? 'on' : ''}">🎙 ضبط ویس</button>
        <button data-xt="file" class="${XP.tab === 'file' ? 'on' : ''}">فایل صوتی</button>
        <button data-xt="text" class="${XP.tab === 'text' ? 'on' : ''}">متن${(d.draft.text || '').trim() ? ' ●' : ''}</button>
      </div>
      <div id="xpIn"></div>
      <div id="xpJob" class="build-status" hidden></div>
      <div id="xpProps"></div>
    </section>
    <div class="rowbar xp-bar">
      <div class="filters" style="margin:0">
        <button data-xf="all" class="${XP.filter === 'all' ? 'on' : ''}">همه (${faNum(d.items.length)})</button>
        ${Object.entries(K).map(([k, m]) => `<button data-xf="${k}" class="${XP.filter === k ? 'on' : ''}">${esc(m.label)} (${faNum(count(k))})</button>`).join('')}
      </div>
      <span class="grow"></span>
      <button class="btn primary" id="xpAdd">+ تجربه‌ی تازه</button>
    </div>
    <div id="xpForm"></div>
    <div id="xpList">${list.length ? list.map(xpItemHTML).join('') :
      `<div class="empty">${d.items.length ? 'در این دسته چیزی نیست.' : 'بانک تجربه خالی است. با «مرور ماهانه» شروع کن، یا یک تجربه را دستی ثبت کن.'}</div>`}</div>`;
  xpInput(); xpProps(); xpShowJob(d.job);
  $$('[data-xt]').forEach(b => b.onclick = () => { XP.tab = b.dataset.xt; xpRender(); });
  $$('[data-xf]').forEach(b => b.onclick = () => { XP.filter = b.dataset.xf; xpRender(); });
  $('#xpAdd').onclick = () => { XP.edit = 'new'; xpForm(); };
  $$('#xpList [data-xedit]').forEach(b => b.onclick = () => { XP.edit = b.dataset.xedit; xpForm(); });
  $$('#xpList [data-xdel]').forEach(b => b.onclick = async () => {
    if (!confirm('این تجربه حذف شود؟')) return;
    const r = await post('/api/experience/delete', { id: b.dataset.xdel });
    if (!r.ok) return toast(r.data.error || 'حذف نشد');
    XP.d.items = XP.d.items.filter(i => i.id !== b.dataset.xdel); toast('حذف شد'); xpRender();
  });
  $$('#xpList [data-xidea]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const r = await post('/api/experience/to-idea', { id: b.dataset.xidea });
    if (!r.ok) { b.disabled = false; return toast(r.data.error || 'نشد'); }
    toast('✓ به بانک ایده رفت'); await loadState(); viewExperience();
  });
  $$('#xpList .xp-text').forEach(p => p.onclick = () => p.classList.toggle('open'));
  if (XP.edit) xpForm();
}

function xpItemHTML(i) {
  const K = XP.d.kinds[i.kind] || { label: i.kind };
  const used = (i.used || []).length;
  const consent = i.kind === 'win' ? `<span class="${i.consent === 'ask' || !i.consent ? 'xp-warn' : ''}">${esc(i.who || 'مشتری')} · ${esc(XP.d.consent[i.consent || 'ask'])}</span>` : '';
  return `<article class="idea xp-item">
    <div class="idea-main">
      <h4>${esc(i.title)}</h4>
      <p class="xp-text" title="برای دیدن کامل بزن">${esc(i.text)}</p>
      <div class="idea-meta">
        <span class="pill">${esc(K.label)}</span>
        ${i.when ? `<span>${esc(i.when)}</span>` : ''}
        ${i.pillar ? `<span>${esc(i.pillar)}</span>` : ''}
        ${consent}
        ${used ? `<span style="color:var(--up)">در ${faNum(used)} ایده</span>` : ''}
        <span>${i.source === 'ritual' ? 'مرور ماهانه' : 'دستی'} · ${esc(i.created || '')}</span>
      </div>
    </div>
    <div class="idea-side xp-side">
      <button class="btn" data-xidea="${i.id}" title="یک ایده‌ی تازه در بانک ایده با همین تجربه">→ بانک ایده</button>
      <div><button class="del" data-xedit="${i.id}" title="ویرایش">✎</button><button class="del" data-xdel="${i.id}" title="حذف">✕</button></div>
    </div>
  </article>`;
}

/* ---------- فرم افزودن / ویرایش ---------- */
function xpFieldsHTML(x, pre) {
  const d = XP.d;
  const pills = d.pillars.includes(x.pillar) || !x.pillar ? d.pillars : [x.pillar, ...d.pillars];
  return `
    <div class="idea-edit-row">
      <label>نوع<select data-k="kind">${Object.entries(d.kinds).map(([k, m]) => `<option value="${k}" ${k === x.kind ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>
      <label>کِی <input data-k="when" class="cap-input" value="${esc(x.when || '')}" placeholder="مثلاً آبان ۱۴۰۵"></label>
      <label>پیلر<select data-k="pillar"><option value="">—</option>${pills.map(p => `<option ${p === x.pillar ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
    </div>
    <label>عنوان<input data-k="title" class="cap-input" value="${esc(x.title || '')}" placeholder="یک عنوان کاری کوتاه"></label>
    <label>متن، با کلمه‌های خودت<textarea data-k="text" class="cap-text" placeholder="${esc((d.kinds[x.kind] || d.kinds.story).hint)}">${esc(x.text || '')}</textarea></label>
    <div class="idea-edit-row xp-win" ${x.kind === 'win' ? '' : 'hidden'}>
      <label>چه کسی (بدون اسم کامل)<input data-k="who" class="cap-input" value="${esc(x.who || '')}" placeholder="مثلاً یکی از شاگردهای دوره‌ی پاییز"></label>
      <label>اجازه‌ی انتشار<select data-k="consent">${Object.entries(d.consent).map(([k, l]) => `<option value="${k}" ${k === (x.consent || 'ask') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    </div>`;
}
function xpRead(box) {
  const x = {};
  $$('[data-k]', box).forEach(el => x[el.dataset.k] = el.value);
  return x;
}
function xpWire(box) {
  const kind = $('[data-k="kind"]', box), ta = $('[data-k="text"]', box);
  kind.onchange = () => {
    $('.xp-win', box).hidden = kind.value !== 'win';
    ta.placeholder = XP.d.kinds[kind.value].hint;
  };
  fitHeight(ta); ta.addEventListener('input', () => fitHeight(ta));
}
function xpForm() {
  const box = $('#xpForm'); if (!box) return;
  const x = XP.edit === 'new' ? { kind: XP.filter !== 'all' ? XP.filter : 'story' } : XP.d.items.find(i => i.id === XP.edit);
  if (!x) { XP.edit = null; box.innerHTML = ''; return; }
  box.innerHTML = `<section class="panel idea-edit xp-form">
    <h3>${XP.edit === 'new' ? 'تجربه‌ی تازه' : 'ویرایش تجربه'}</h3>
    ${xpFieldsHTML(x)}
    <div class="rowbar"><button class="btn" id="xpCancel">انصراف</button><span class="grow"></span>
      <button class="btn primary" id="xpSave">ذخیره</button></div></section>`;
  xpWire(box);
  box.scrollIntoView({ block: 'nearest' });
  $('#xpCancel').onclick = () => { XP.edit = null; box.innerHTML = ''; };
  $('#xpSave').onclick = async () => {
    const it = xpRead(box);
    if (!it.text.trim()) return toast('متن خالی است');
    if (XP.edit !== 'new') it.id = XP.edit;
    $('#xpSave').disabled = true;
    const r = await post('/api/experience/item', { item: it });
    if (!r.ok) { $('#xpSave').disabled = false; return toast(r.data.error || 'ذخیره نشد'); }
    XP.edit = null; toast('✓ ذخیره شد'); viewExperience();
  };
}

/* ---------- ورودی مرور ماهانه ---------- */
function xpInput() {
  const box = $('#xpIn'), busy = XP.d.job && XP.d.job.state === 'running';
  if (XP.tab === 'voice') {
    box.innerHTML = `<div id="xpRec"></div>
      <div class="rowbar"><span class="cap-hint" style="margin:0">تا ۳۰ دقیقه. صدای بلند تکه‌تکه رونویسی می‌شود.${XP.d.gemini ? '' : ' <b style="color:var(--warn)">رونویسی کلید Gemini می‌خواهد (تب تنظیمات).</b>'}</span>
        <span class="grow"></span><button class="btn primary" id="xpTr" ${busy ? 'disabled' : ''}>رونویسی</button></div>`;
    XP.rec = mountRecorder($('#xpRec'), { max: 1800, hint: 'دکمه را بزن و به سؤال‌ها جواب بده.' });
    $('#xpTr').onclick = async () => xpTranscribe(await XP.rec.payload());
  } else if (XP.tab === 'file') {
    box.innerHTML = `<div id="xpDrop" class="drop"><b>${XP.file ? esc(XP.file.name) : 'ویس یا فایل صوتی را اینجا رها کن'}</b>
        <span>${XP.file ? faNum((XP.file.size / 1048576).toFixed(1)) + ' مگابایت' : 'm4a · mp3 · ogg · wav · فایل ویدیو'}</span><input type="file" id="xpFile" accept="audio/*,video/*" hidden></div>
      <div class="rowbar" style="margin-top:12px"><span class="grow"></span><button class="btn primary" id="xpTr" ${busy ? 'disabled' : ''}>رونویسی</button></div>`;
    xpDrop($('#xpDrop'), $('#xpFile'), f => { XP.file = f; xpInput(); });
    $('#xpTr').onclick = async () => {
      if (!XP.file) return toast('فایلی انتخاب نشده');
      if (XP.file.size > 60 * 1048576) return toast('فایل از ۶۰ مگابایت بزرگ‌تر است');
      const data = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(XP.file); });
      xpTranscribe({ filename: XP.file.name, data });
    };
  } else {
    box.innerHTML = `<textarea id="xpText" class="cap-text" ${busy ? 'disabled' : ''} placeholder="جواب‌هایت را این‌جا بنویس، یا رونویسی ویس این‌جا می‌آید و می‌توانی اصلاحش کنی…">${esc(XP.d.draft.text || '')}</textarea>
      <div class="rowbar" style="margin-top:12px"><span class="cap-hint" id="xpSaved" style="margin:0"></span><span class="grow"></span>
        <button class="btn primary" id="xpEx" ${busy ? 'disabled' : ''}>جدا کردن تکه‌ها با Claude</button></div>`;
    const ta = $('#xpText');
    fitHeight(ta);
    ta.addEventListener('input', () => {
      fitHeight(ta); XP.d.draft.text = ta.value; $('#xpSaved').textContent = 'در حال ذخیره…';
      clearTimeout(XP.tDraft);
      XP.tDraft = setTimeout(async () => {
        const r = await post('/api/experience/draft', { text: ta.value });
        const s = $('#xpSaved'); if (s) s.textContent = r.ok ? '✓ پیش‌نویس ذخیره شد' : 'ذخیره نشد';
      }, 600);
    });
    $('#xpEx').onclick = async () => {
      clearTimeout(XP.tDraft);
      const r = await post('/api/experience/extract', { text: ta.value });
      if (!r.ok) return toast(r.data.error || 'شروع نشد');
      xpPoll();
    };
  }
}
function xpDrop(drop, fin, pick) {
  drop.onclick = () => fin.click();
  fin.onchange = () => fin.files[0] && pick(fin.files[0]);
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) pick(f); });
}
async function xpTranscribe(payload) {
  if (!payload) return toast('هنوز چیزی ضبط نشده');
  const r = await post('/api/experience/transcribe', payload);
  if (!r.ok) return toast(r.data.error || 'شروع نشد');
  XP.file = null; xpPoll();
}
function xpPoll() {
  clearInterval(XP.poll);
  $$('#xpTr, #xpEx').forEach(b => b.disabled = true);
  XP.poll = setInterval(async () => {
    const j = await api('/api/experience/job'); if (!j) return;
    if (S.section !== 'experience') return clearInterval(XP.poll);
    xpShowJob(j);
    if (j.state !== 'running') {
      clearInterval(XP.poll);
      if (j.state === 'done') {
        if (j.kind === 'transcribe') { XP.tab = 'text'; toast('✓ رونویسی شد؛ متن را ببین و «جدا کردن» را بزن'); }
        else toast('✓ تکه‌ها آماده‌اند؛ انتخاب کن کدام‌ها بمانند');
      }
      viewExperience();
    }
  }, 2000);
}
function xpShowJob(j) {
  const box = $('#xpJob'); if (!box) return;
  if (!j || j.state === 'idle' || j.state === 'done') { box.hidden = true; return; }
  box.hidden = false;
  box.className = 'build-status' + (j.state === 'error' ? ' err' : '');
  box.innerHTML = `<div class="build-step">${j.state === 'running' ? `<span class="spin"></span> ${esc(j.step || 'در حال کار…')}` : '✕ ' + esc(j.error || 'خطا')}</div>`;
}

/* ---------- پیشنهادهای Claude ---------- */
function xpProps() {
  const box = $('#xpProps'), ps = XP.d.draft.proposals || [];
  if (!ps.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="xp-props">
    <h3>${faNum(ps.length)} تکه پیدا شد</h3>
    <p class="cap-hint" style="margin:0 0 12px">هر کدام را اصلاح کن؛ تیک آن‌هایی را که نمی‌خواهی بردار. Claude فقط جدا کرده و چیزی اضافه نکرده، ولی باز هم بخوان.</p>
    ${ps.map(p => `<div class="xp-prop idea-edit" data-pid="${p.pid}">
      <div class="xp-prop-top"><label class="xp-check"><input type="checkbox" checked> نگه دار</label><span class="grow"></span>
        <button class="del" data-pdrop="${p.pid}" title="کنار بگذار">✕</button></div>
      ${xpFieldsHTML(p)}</div>`).join('')}
    <div class="rowbar" style="margin-top:14px"><label class="xp-check"><input type="checkbox" id="xpClear" checked> بعد از افزودن، متن پیش‌نویس پاک شود</label>
      <span class="grow"></span><button class="btn primary" id="xpAccept">افزودن به بانک تجربه</button></div></div>`;
  $$('.xp-prop', box).forEach(xpWire);
  $$('[data-pdrop]', box).forEach(b => b.onclick = async () => {
    await post('/api/experience/proposal/drop', { pid: b.dataset.pdrop });
    XP.d.draft.proposals = ps.filter(p => p.pid !== b.dataset.pdrop); xpProps();
  });
  $('#xpAccept').onclick = async () => {
    const items = $$('.xp-prop', box).filter(el => $('input[type=checkbox]', el).checked)
      .map(el => ({ ...xpRead(el), pid: el.dataset.pid }));
    if (!items.length) return toast('چیزی انتخاب نشده');
    const r = await post('/api/experience/accept', { items, clear: $('#xpClear').checked });
    if (!r.ok) return toast(r.data.error || 'نشد');
    toast(`✓ ${faNum(r.data.added)} تجربه اضافه شد`); viewExperience();
  };
}
