/* ================= صدای مخاطب =================
   ورودی: ویس، فایل (ضبط تماس، اسکرین‌شات دایرکت و کامنت، PDF و Word)، متن چسبانده‌شده، کامنت‌های اینستاگرام.
   هر ورودی یک «منبع» است و در صف پشت‌صحنه به متن تبدیل می‌شود؛ «استخراج بینش» Claude را روی منبع‌های تازه اجرا می‌کند.
   بینش‌ها (درد، خواسته، سؤال، تردید، تعریف) با تعداد منبع و عین جمله‌های مخاطب؛ هر کدام ← بانک ایده / هسته‌ی برند / بانک تجربه.
   داده: /api/audience (app/audience.py). */

const AU = { d: null, tab: 'voice', type: 'all', poll: 0, rec: null, open: {}, srcOpen: false, answering: null, files: [], text: '', title: '' };

window.viewAudience = async function viewAudience() {
  const d = await api('/api/audience');
  if (!d) { $('#page').innerHTML = '<div class="empty">صدای مخاطب بار نشد.</div>'; return; }
  AU.d = d; auRender(); auMaybePoll();
};

const auN = i => new Set(i.sources || []).size;
const auBusy = () => AU.d.worker.on || AU.d.job.state === 'running';

function auRender() {
  const d = AU.d, T = d.types;
  const ins = d.insights.filter(i => !i.hidden);
  const list = (AU.type === 'all' ? ins : ins.filter(i => i.type === AU.type)).slice().sort((a, b) => auN(b) - auN(a));
  const ready = d.sources.filter(s => s.state === 'ready').length;
  const queued = d.sources.filter(s => s.state === 'queued' || s.state === 'working').length;
  $('#page').innerHTML = `
    <div class="page-head"><h2>صدای مخاطب</h2>
      <p>حرف واقعی مخاطب‌هایت از دایرکت، کامنت، تماس و ویس؛ دردها، سؤال‌ها و تردیدهایشان با کلمه‌های خودشان</p></div>
    <section class="panel au-add">
      <div class="cap-tabs">
        <button data-at="voice" class="${AU.tab === 'voice' ? 'on' : ''}">🎙 ویس</button>
        <button data-at="file" class="${AU.tab === 'file' ? 'on' : ''}">فایل و اسکرین‌شات</button>
        <button data-at="text" class="${AU.tab === 'text' ? 'on' : ''}">متن</button>
        <button data-at="ig" class="${AU.tab === 'ig' ? 'on' : ''}">کامنت‌های اینستاگرام</button>
      </div>
      <div id="auIn"></div>
      <p class="cap-hint au-privacy">این متن‌ها برای رونویسی و خواندن به Gemini و Claude فرستاده می‌شوند. ایمیل، آیدی و شماره‌ی تلفن خودکار پاک می‌شوند؛ اسم آدم‌ها را خودت پیش از ثبت پاک کن. صدای تماس بعد از رونویسی پاک می‌شود و فقط متنش می‌ماند.</p>
    </section>
    <section class="panel au-sources">
      <div class="au-shead">
        <button class="au-toggle" id="auSrcT">${AU.srcOpen ? '▾' : '◂'} منبع‌ها (${faNum(d.sources.length)})</button>
        ${queued ? `<span class="au-q"><span class="spin"></span> ${faNum(queued)} در صف${d.worker.step ? ' · ' + esc(d.worker.step) : ''}</span>` : ''}
        <span class="grow"></span>
        <button class="btn primary" id="auMine" ${ready && d.job.state !== 'running' ? '' : 'disabled'}>استخراج بینش از ${faNum(ready)} منبع تازه</button>
      </div>
      <div id="auJob" class="build-status" hidden></div>
      <div id="auSrc" ${AU.srcOpen ? '' : 'hidden'}>${d.sources.map(auSrcHTML).join('') || '<p class="cap-hint">هنوز منبعی نیست.</p>'}</div>
    </section>
    <div class="filters">
      <button data-ty="all" class="${AU.type === 'all' ? 'on' : ''}">همه (${faNum(ins.length)})</button>
      ${Object.entries(T).map(([k, m]) => `<button data-ty="${k}" class="${AU.type === k ? 'on' : ''}">${esc(m.label)} (${faNum(ins.filter(i => i.type === k).length)})</button>`).join('')}
    </div>
    <div id="auList">${list.length ? list.map(auInsHTML).join('') :
      `<div class="empty">${ins.length ? 'در این دسته بینشی نیست.' : 'هنوز بینشی نیست. چند منبع اضافه کن (مثلاً اسکرین‌شات ده دایرکت، یا ضبط یک تماس) و «استخراج بینش» را بزن.'}</div>`}</div>`;
  auInput(); auShowJob();
  $$('[data-at]').forEach(b => b.onclick = () => { AU.tab = b.dataset.at; auRender(); });
  $$('[data-ty]').forEach(b => b.onclick = () => { AU.type = b.dataset.ty; auRender(); });
  $('#auSrcT').onclick = () => { AU.srcOpen = !AU.srcOpen; auRender(); };
  $('#auMine').onclick = async () => {
    const r = await post('/api/audience/mine', {});
    if (!r.ok) return toast(r.data.error || 'شروع نشد');
    AU.d.job = { state: 'running', step: '' }; auRender(); auMaybePoll();
  };
  auWireSources(); auWireInsights();
}

/* ---------- ورودی ---------- */
function auChannelSel(def) {
  return `<label class="au-ch">کجا شنیدی؟<select id="auCh">${Object.entries(AU.d.channels).map(([k, l]) =>
    `<option value="${k}" ${k === def ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
}
function auInput() {
  const box = $('#auIn'), g = AU.d.gemini;
  const noKey = g ? '' : '<p class="cap-hint" style="color:var(--warn)">رونویسی صدا و خواندن اسکرین‌شات کلید Gemini می‌خواهد (تب تنظیمات). متن و فایل‌های متنی بدون آن هم کار می‌کنند.</p>';
  if (AU.tab === 'voice') {
    box.innerHTML = `<p class="au-lead">بعد از یک تماس یا جلسه، حرف‌هایی را که شنیدی همان‌طور که یادت هست تعریف کن («می‌گفت…»، «پرسید…»). یا با اجازه‌ی طرف، گفت‌وگو را روی بلندگو ضبط کن.</p>
      <div id="auRec"></div>
      <div class="rowbar">${auChannelSel('voice')}
        <label class="xp-check"><input type="checkbox" id="auSp"> گفت‌وگوی دو نفره است (گوینده‌ها جدا شوند)</label>
        <span class="grow"></span><button class="btn primary" id="auGo">ثبت</button></div>${noKey}`;
    AU.rec = mountRecorder($('#auRec'), { max: 3600, hint: 'تا ۶۰ دقیقه.' });
    $('#auCh').onchange = () => { $('#auSp').checked = ['call', 'class'].includes($('#auCh').value); };
    $('#auGo').onclick = async () => {
      if (AU.rec.busy()) { AU.rec.stop(); await new Promise(r => setTimeout(r, 400)); }
      const b = AU.rec.blob; if (!b) return toast('هنوز چیزی ضبط نشده');
      const ext = b.type.includes('mp4') ? 'm4a' : b.type.includes('ogg') ? 'ogg' : 'webm';
      const sp = $('#auSp').checked, ch = $('#auCh').value;
      AU.rec.discard();
      await auUpload([new File([b], `voice-${Date.now()}.${ext}`, { type: b.type })], ch, '', sp);
    };
  } else if (AU.tab === 'file') {
    box.innerHTML = `<div id="auDrop" class="drop"><b>${AU.files.length ? AU.files.map(f => esc(f.name)).join('، ') : 'فایل‌ها را این‌جا رها کن (چندتا با هم)'}</b>
        <span>${AU.files.length ? faNum(AU.files.length) + ' فایل' : 'ضبط تماس (m4a، mp3، mp4) · اسکرین‌شات دایرکت و کامنت · PDF · Word · متن'}</span>
        <input type="file" id="auFile" multiple hidden></div>
      <div class="rowbar" style="margin-top:12px">${auChannelSel('dm')}
        <label class="xp-check"><input type="checkbox" id="auSp"> فایل‌های صوتی گفت‌وگوی دو نفره‌اند</label>
        <span class="grow"></span><button class="btn primary" id="auGo">ثبت</button></div>${noKey}`;
    xpDrop2($('#auDrop'), $('#auFile'), fs => { AU.files = fs; auInput(); });
    $('#auCh').onchange = () => { $('#auSp').checked = ['call', 'class'].includes($('#auCh').value); };
    $('#auGo').onclick = async () => {
      if (!AU.files.length) return toast('فایلی انتخاب نشده');
      await auUpload(AU.files, $('#auCh').value, '', $('#auSp').checked); AU.files = [];
    };
  } else if (AU.tab === 'text') {
    box.innerHTML = `<textarea id="auText" class="cap-text" placeholder="دایرکت‌ها، کامنت‌ها، پیام‌های تلگرام، جواب نظرسنجی یا یادداشت‌های یک تماس را این‌جا بچسبان…&#10;&#10;اگر حرف خودت هم لای پیام‌هاست، اول آن خط‌ها بنویس [صاحب پیج]">${esc(AU.text)}</textarea>
      <div class="rowbar" style="margin-top:12px">${auChannelSel('dm')}
        <input id="auTitle" class="cap-input au-title" placeholder="عنوان (اختیاری)" value="${esc(AU.title)}">
        <span class="grow"></span><button class="btn primary" id="auGo">ثبت</button></div>`;
    const ta = $('#auText'); fitHeight(ta);
    ta.addEventListener('input', () => { fitHeight(ta); AU.text = ta.value; });
    $('#auTitle').addEventListener('input', e => AU.title = e.target.value);
    $('#auGo').onclick = async () => {
      const r = await post('/api/audience/text', { text: ta.value, channel: $('#auCh').value, title: $('#auTitle').value });
      if (!r.ok) return toast(r.data.error || 'ثبت نشد');
      AU.text = AU.title = ''; toast('✓ ثبت شد'); viewAudience();
    };
  } else {
    box.innerHTML = AU.d.ig ? `<p class="au-lead">کامنت‌های تازه‌ی پست‌های اخیرت (کامنت‌هایی که قبلاً آمده‌اند تکرار نمی‌شوند). کامنت‌های خودت کنار گذاشته می‌شوند و آیدی کسی ذخیره نمی‌شود.</p>
      <div class="rowbar"><label class="au-ch">چند پست اخیر؟<select id="auPosts">${[10, 20, 30, 50].map(n => `<option value="${n}" ${n === 20 ? 'selected' : ''}>${faNum(n)}</option>`).join('')}</select></label>
        <span class="grow"></span><button class="btn primary" id="auGo">گرفتن کامنت‌ها</button></div>
      <p class="cap-hint">این کار دسترسی <code>instagram_business_manage_comments</code> را لازم دارد. اگر توکنت آن را ندارد، استودیو می‌گوید چه کنی؛ تا آن موقع اسکرین‌شات کامنت‌ها را در «فایل و اسکرین‌شات» بده.</p>`
      : `<p class="au-lead">اینستاگرام وصل نیست. از تب <a href="?s=analytics" data-go="analytics">تحلیل اینستاگرام</a> وصلش کن، یا اسکرین‌شات کامنت‌ها را در «فایل و اسکرین‌شات» بده.</p>`;
    const go = $('#auGo');
    if (go) go.onclick = async () => {
      go.disabled = true; go.textContent = 'در حال گرفتن…';
      const r = await post('/api/audience/instagram', { posts: +$('#auPosts').value });
      go.disabled = false; go.textContent = 'گرفتن کامنت‌ها';
      if (!r.ok) return auNote(r.data.error || 'نشد', true);
      if (!r.data.count) return auNote('کامنت تازه‌ای نبود.');
      toast(`✓ ${faNum(r.data.count)} کامنت ثبت شد`); viewAudience();
    };
  }
}
function auNote(msg, err) {
  const box = $('#auJob'); box.hidden = false;
  box.className = 'build-status' + (err ? ' err' : '');
  box.innerHTML = `<div class="build-step">${err ? '✕ ' : ''}${esc(msg)}</div>`;
}
function xpDrop2(drop, fin, pick) {          // مثل xpDrop در experience.js، ولی چند فایل
  drop.onclick = () => fin.click();
  fin.onchange = () => fin.files.length && pick([...fin.files]);
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const fs = [...e.dataTransfer.files]; if (fs.length) pick(fs); });
}
async function auUpload(files, channel, title, speakers) {
  const go = $('#auGo'); if (go) go.disabled = true;
  let ok = 0;
  for (const [n, f] of files.entries()) {
    if (go) go.textContent = files.length > 1 ? `آپلود ${faNum(n + 1)} از ${faNum(files.length)}…` : 'آپلود…';
    const qs = new URLSearchParams({ name: f.name, channel, title, speakers: speakers ? '1' : '' });
    try {
      const r = await fetch('/api/audience/upload?' + qs, { method: 'POST', body: f });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.error || `«${f.name}» ثبت نشد`); continue; }
      ok++;
    } catch { toast(`«${f.name}» ثبت نشد`); }
  }
  if (ok) { toast(`✓ ${faNum(ok)} منبع در صف پردازش`); AU.srcOpen = true; }
  viewAudience();
}

/* ---------- منبع‌ها ---------- */
function auSrcHTML(s) {
  const st = AU.d.states[s.state] || s.state;
  const kind = { audio: '🎙', image: '🖼', file: '📄', text: '✎', instagram: '💬' }[s.kind] || '•';
  return `<div class="au-src ${s.state}">
    <span class="au-k">${kind}</span>
    <div class="au-sm"><b>${esc(s.title || '—')}</b>
      <span>${esc(AU.d.channels[s.channel] || '')} · ${esc(s.created || '')}${s.chars ? ' · ' + faNum(s.chars.toLocaleString('en')) + ' حرف' : ''}${s.speakers ? ' · دو نفره' : ''}</span>
      ${s.error ? `<span class="au-err">${esc(s.error)}</span>` : ''}
      <div class="au-stext" id="st-${s.id}" hidden></div></div>
    <span class="au-st">${s.state === 'working' ? '<span class="spin"></span> ' : ''}${esc(st)}</span>
    ${s.chars ? `<button class="del" data-sview="${s.id}" title="دیدن متن">👁</button>` : ''}
    ${s.state === 'error' && s.file ? `<button class="del" data-sretry="${s.id}" title="دوباره">↻</button>` : ''}
    <button class="del" data-sdel="${s.id}" title="حذف">✕</button></div>`;
}
function auWireSources() {
  $$('[data-sview]').forEach(b => b.onclick = async () => {
    const el = $('#st-' + b.dataset.sview);
    if (!el.hidden) { el.hidden = true; return; }
    const r = await api('/api/audience/source?id=' + b.dataset.sview);
    el.textContent = (r && r.text) || '(خالی)'; el.hidden = false;
  });
  $$('[data-sdel]').forEach(b => b.onclick = async () => {
    if (!confirm('این منبع و متنش حذف شود؟ بینش‌هایی که از آن آمده‌اند می‌مانند.')) return;
    const r = await post('/api/audience/source/delete', { id: b.dataset.sdel });
    if (!r.ok) return toast(r.data.error || 'حذف نشد');
    viewAudience();
  });
  $$('[data-sretry]').forEach(b => b.onclick = async () => {
    const r = await post('/api/audience/source/retry', { id: b.dataset.sretry });
    if (!r.ok) return toast(r.data.error || 'نشد');
    viewAudience();
  });
}

/* ---------- بینش‌ها ---------- */
function auInsHTML(i) {
  const T = AU.d.types[i.type] || { label: i.type }, n = auN(i), sent = i.sent || {};
  const qs = i.quotes || [], open = AU.open[i.id];
  const brandBtn = i.type === 'praise'
    ? `<button class="btn" data-ixp="${i.id}" ${sent.experience ? 'disabled' : ''}>${sent.experience ? '✓ در بانک تجربه' : '→ بانک تجربه'}</button>`
    : `<button class="btn" data-ibr="${i.id}" ${sent.brand ? 'disabled' : ''} title="به‌صورت پیش‌نویس به پرسش‌نامه‌ی هسته‌ی برند اضافه می‌شود">${sent.brand ? '✓ در هسته‌ی برند' : '→ هسته‌ی برند'}</button>`;
  return `<article class="au-ins t-${i.type}">
    <div class="au-n" title="در ${faNum(n)} منبع جدا آمده">${faNum(n)}<small>منبع</small></div>
    <div class="au-body">
      <h4>${esc(i.text)}</h4>
      ${qs.length ? `<div class="au-quotes">${(open ? qs : qs.slice(0, 2)).map(q => `<q>${esc(q.q)}</q>`).join('')}
        ${qs.length > 2 ? `<button class="au-more" data-imore="${i.id}">${open ? 'کمتر' : `${faNum(qs.length - 2)} جمله‌ی دیگر`}</button>` : ''}</div>` : ''}
      ${i.answer ? `<p class="au-ans"><b>جواب تو:</b> ${esc(i.answer)}</p>` : ''}
      ${AU.answering === i.id ? `<div class="au-answer"><textarea class="cap-text" id="auAns" placeholder="جواب صادقانه‌ی خودت به این ${esc(T.label)}…">${esc(i.answer || '')}</textarea>
        <div class="rowbar" style="margin:8px 0 0"><button class="btn" id="auAnsX">انصراف</button><span class="grow"></span>
        <button class="btn primary" id="auAnsGo">ذخیره و افزودن به هسته‌ی برند</button></div></div>` : ''}
      <div class="idea-meta"><span class="pill">${esc(T.label)}</span>${i.created ? `<span>${esc(i.created)}</span>` : ''}
        ${sent.idea ? '<span style="color:var(--up)">✓ در بانک ایده</span>' : ''}</div>
    </div>
    <div class="au-act">
      <button class="btn primary" data-iidea="${i.id}" title="ایده‌ی محتوایی که همین را جواب می‌دهد">→ بانک ایده</button>
      ${brandBtn}
      <button class="del" data-ihide="${i.id}" title="کنار بگذار">✕</button>
    </div></article>`;
}
function auWireInsights() {
  $$('[data-imore]').forEach(b => b.onclick = () => { AU.open[b.dataset.imore] = !AU.open[b.dataset.imore]; auRender(); });
  $$('[data-iidea]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const r = await post('/api/audience/to-idea', { id: b.dataset.iidea });
    if (!r.ok) { b.disabled = false; return toast(r.data.error || 'نشد'); }
    toast('✓ به بانک ایده رفت'); await loadState(); viewAudience();
  });
  $$('[data-ixp]').forEach(b => b.onclick = async () => {
    const r = await post('/api/audience/to-experience', { id: b.dataset.ixp });
    if (!r.ok) return toast(r.data.error || 'نشد');
    toast('✓ به بانک تجربه رفت؛ اجازه‌ی انتشار را آن‌جا مشخص کن'); viewAudience();
  });
  $$('[data-ibr]').forEach(b => b.onclick = async () => {
    const i = AU.d.insights.find(x => x.id === b.dataset.ibr);
    if (['question', 'objection'].includes(i.type) && !i.answer) { AU.answering = i.id; auRender(); $('#auAns').focus(); return; }
    auToBrand(i.id, i.answer || '');
  });
  const go = $('#auAnsGo');
  if (go) {
    go.onclick = () => auToBrand(AU.answering, $('#auAns').value);
    $('#auAnsX').onclick = () => { AU.answering = null; auRender(); };
  }
  $$('[data-ihide]').forEach(b => b.onclick = async () => {
    const r = await post('/api/audience/insight', { id: b.dataset.ihide, hidden: true });
    if (!r.ok) return toast('نشد');
    AU.d.insights = AU.d.insights.map(x => x.id === b.dataset.ihide ? r.data.insight : x); toast('کنار گذاشته شد'); auRender();
  });
}
async function auToBrand(id, answer) {
  const r = await post('/api/audience/to-brand', { id, answer });
  if (!r.ok) return toast(r.data.error || 'نشد');
  AU.answering = null;
  toast('✓ به‌صورت پیش‌نویس در هسته‌ی برند نشست؛ آن‌جا تأییدش کن' + (r.data.words ? ` (+${faNum(r.data.words)} جمله در «زبان خود مخاطب»)` : ''));
  viewAudience();
}

/* ---------- وضعیت کارها ---------- */
function auShowJob() {
  const j = AU.d.job, box = $('#auJob'); if (!box) return;
  if (j.state === 'running') {
    box.hidden = false; box.className = 'build-status';
    box.innerHTML = `<div class="build-step"><span class="spin"></span> ${esc(j.step || 'در حال استخراج…')}</div>`;
  } else if (j.state === 'error') {
    box.hidden = false; box.className = 'build-status err';
    box.innerHTML = `<div class="build-step">✕ ${esc(j.error || 'خطا')}</div>`;
  } else box.hidden = true;
}
function auMaybePoll() {
  if (!auBusy()) return;
  clearInterval(AU.poll);
  const was = AU.d.job.state;
  AU.poll = setInterval(async () => {
    if (S.section !== 'audience') return clearInterval(AU.poll);
    const d = await api('/api/audience'); if (!d) return;
    const done = was === 'running' && d.job.state !== 'running';
    const typing = AU.answering || (document.activeElement && /TEXTAREA|INPUT/.test(document.activeElement.tagName));
    AU.d = d;
    if (done && d.job.state === 'done')
      toast(`✓ ${faNum(d.job.added)} بینش تازه · ${faNum(d.job.merged)} به بینش‌های قبلی اضافه شد` +
            (d.job.dropped ? ` · ${faNum(d.job.dropped)} نقل‌قولِ نادرست کنار رفت` : ''));
    const holding = AU.tab === 'voice' && AU.rec && (AU.rec.busy() || AU.rec.blob);   // ضبطِ ثبت‌نشده نباید پاک شود
    if (!typing && !holding) auRender();
    if (!auBusy()) clearInterval(AU.poll);
  }, 2500);
}
