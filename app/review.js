/* ================= مرور ماهانه =================
   کارنامه‌ی ۳۰ روز (تقویم، اینستاگرام، آبشار محتوا، ایده‌ها، تجربه‌ها، صدای مخاطب + عددهای دستی)، هدف‌ها با پیشرفت،
   و «مرور با Claude» که می‌گوید چه کار کرد و چه نکرد و یادگیری پیشنهاد می‌دهد. یادگیری‌های تأییدشده در brand/learnings.md
   می‌نشینند و همه‌ی بخش‌های هوشمند استودیو آن را می‌خوانند. داده: /api/review (app/review.py). */

const RV = { d: null, open: null, poll: 0, addT: false };
const rvNum = v => v === null || v === undefined ? '—' : faNum(Math.round(+v).toLocaleString('en'));
const rvDelta = (cur, prev) => {
  if (cur == null || prev == null || !prev) return '';
  const p = Math.round((cur - prev) / prev * 100);
  return `<em class="${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${faNum(Math.abs(p))}٪</em>`;
};
const rvDate = iso => { try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long' }).format(new Date(iso + 'T12:00')); } catch { return iso; } };

window.viewReview = async function viewReview() {
  const d = await api('/api/review');
  if (!d) { $('#page').innerHTML = '<div class="empty">مرور ماهانه بار نشد.</div>'; return; }
  RV.d = d; if (RV.open && !d.reviews.some(r => r.id === RV.open)) RV.open = null;
  rvRender();
  if (d.job.state === 'running') rvPoll();
};

function rvRender() {
  const d = RV.d, last = d.reviews[0];
  const ago = last ? Math.round((Date.parse(d.today) - Date.parse(last.created.slice(0, 10))) / 864e5) : null;
  $('#page').innerHTML = `
    <div class="page-head"><h2>مرور ماهانه</h2>
      <p>کارنامه‌ی ۳۰ روز، هدف‌هایت، و چیزهایی که یاد گرفتی؛ یادگیری‌ها به همه‌ی بخش‌های استودیو برمی‌گردند</p></div>
    ${RV.open ? rvReviewHTML(d.reviews.find(r => r.id === RV.open)) : `
    <section class="panel rv-live">
      <div class="rv-h"><h3>۳۰ روز اخیر <small>${esc(rvDate(d.live.from))} تا ${esc(rvDate(d.live.to))}</small></h3>
        <span class="rv-when ${ago === null || ago >= 28 ? 'due' : ''}">${ago === null ? 'هنوز مروری ثبت نشده' : `آخرین مرور: ${faNum(ago)} روز پیش`}${ago === null || ago >= 28 ? ' · وقتش است' : ''}</span></div>
      ${rvScoreHTML(d.live)}
      <div class="rv-manual"><h4>عددهایی که فقط خودت می‌دانی <button class="au-more" id="rvMEdit">ویرایش فهرست</button></h4>
        <div class="rv-mgrid">${d.manual_metrics.map((m, i) => `<label>${esc(m)}<input class="cap-input" data-rvm="${esc(m)}" inputmode="numeric" placeholder="—"></label>`).join('') || '<p class="cap-hint">فهرست خالی است.</p>'}</div>
        <div id="rvMList" hidden><textarea class="cap-text" id="rvMText" style="min-height:90px">${esc(d.manual_metrics.join('\n'))}</textarea>
          <div class="rowbar" style="margin-top:8px"><span class="cap-hint" style="margin:0">هر خط یک عدد (مثلاً «درآمد این ماه»، «تماس فروش»).</span><span class="grow"></span><button class="btn" id="rvMSave">ذخیره‌ی فهرست</button></div></div>
      </div>
      <label class="rv-note">یادداشت این ماه (اختیاری)<textarea class="cap-text" id="rvNote" placeholder="اتفاق خاصی افتاد؟ سفر، بیماری، لانچ، تغییر هدف… Claude این را هم در نظر می‌گیرد."></textarea></label>
      <div class="rowbar" style="margin:12px 0 0"><span class="cap-hint" style="margin:0">کارنامه همین حالا ثبت می‌شود و Claude از رویش می‌گوید چه کار کرد و چه نکرد.</span>
        <span class="grow"></span><button class="btn primary" id="rvNew" ${d.job.state === 'running' ? 'disabled' : ''}>ثبت مرور و تحلیل با Claude</button></div>
      <div id="rvJob" class="build-status" hidden></div>
    </section>`}
    <div class="cards2 rv-cols">
      <section class="panel">${rvTargetsHTML()}</section>
      <section class="panel"><h3>یادگیری‌های ثابت</h3>
        ${d.pinned.length ? `<ul class="rv-pins">${d.pinned.map(p => `<li>${esc(p)} <button class="del" data-unpin="${esc(p)}" title="برداشتن">✕</button></li>`).join('')}</ul>`
          : '<p class="cap-hint">هر یادگیری‌ای را که همیشه درست است، در یک مرور «📌» بزن تا این‌جا بماند.</p>'}
        ${d.md ? '<details class="rv-md"><summary>متنی که بخش‌های هوشمند می‌خوانند (brand/learnings.md)</summary><div class="md">' + md(d.md) + '</div></details>' : ''}
      </section>
    </div>
    <section class="panel rv-hist"><h3>مرورهای قبلی</h3>
      ${d.reviews.length ? d.reviews.map(r => `<button class="rv-row ${RV.open === r.id ? 'on' : ''}" data-rvopen="${r.id}">
        <b>${esc(rvDate(r.to))}</b><span>${r.score.instagram ? `${faNum(r.score.instagram.posts)} پست · ` : ''}${faNum(r.score.published)} منتشرشده · ${faNum(r.score.ideas.created)} ایده</span>
        <span class="grow"></span>${r.approved ? '<i class="rv-ok">✓ تأییدشده</i>' : r.draft ? '<i>پیش‌نویس</i>' : '<i>بدون تحلیل</i>'}</button>`).join('')
        : '<p class="cap-hint">هنوز مروری نیست.</p>'}
    </section>`;
  rvWire();
}

/* ---------- کارنامه ---------- */
function rvScoreHTML(s) {
  const ig = s.instagram, plan = s.plan || {}, wf = s.waterfall || {};
  const planRows = Object.entries(plan).map(([lang, p]) => `<div class="rv-bar"><span>تقویم ${lang === 'en' ? 'پیج انگلیسی' : 'پیج فارسی'}</span>
    <div class="rv-track"><i style="width:${Math.min(100, Math.round(p.done / p.planned * 100))}%"></i></div><b>${faNum(p.done)} از ${faNum(p.planned)}</b></div>`).join('');
  return `<div class="stats rv-stats">
      ${ig ? `<div class="stat"><b>${rvNum(ig.posts)}</b><span>پست اینستاگرام${ig.prev_posts != null ? ` (قبل: ${faNum(ig.prev_posts)})` : ''}</span></div>
      <div class="stat"><b>${rvNum(ig.views)} ${rvDelta(ig.views, ig.prev_views)}</b><span>بازدید</span></div>
      <div class="stat"><b>${rvNum(ig.follows)} ${rvDelta(ig.follows, ig.prev_follows)}</b><span>فالوور تازه${ig.followers != null ? ` · کل ${rvNum(ig.followers)}` : ''}</span></div>
      <div class="stat"><b>${rvNum(ig.shares)} / ${rvNum(ig.saved)}</b><span>فرستادن / سیو</span></div>`
      : `<div class="stat rv-noig"><b>—</b><span>اینستاگرام وصل نیست؛ کارنامه بدون آمار پیج است. <a href="?s=analytics" data-go="analytics">وصل کن</a></span></div>`}
      <div class="stat"><b>${rvNum(s.published)}</b><span>منتشرشده (همه‌ی پلتفرم‌ها)</span></div>
      <div class="stat"><b>${rvNum(s.ideas.created)}</b><span>ایده‌ی تازه${s.ideas.with_reel ? ` · ${faNum(s.ideas.with_reel)} با ریلز` : ''}</span></div>
    </div>
    ${planRows ? `<div class="rv-plan">${planRows}</div>` : '<p class="cap-hint">در این ۳۰ روز خانه‌ای در تقویم محتوا نبود.</p>'}
    <div class="rv-chips">
      ${Object.entries(wf.by_platform || {}).map(([p, n]) => `<span>${esc(p)}: ${faNum(n)}</span>`).join('')}
      ${wf.scheduled ? `<span>${faNum(wf.scheduled)} قطعه‌ی آبشار هنوز منتشر نشده</span>` : ''}
      <span>بانک تجربه: ${faNum(s.experience.added)} تازه${s.experience.ritual ? ' · مرور ماهانه ✓' : ''}</span>
      <span>صدای مخاطب: ${faNum(s.audience.sources)} منبع · ${faNum(s.audience.new_insights)} بینش تازه</span>
    </div>
    ${ig && ig.top.length ? `<div class="rv-posts"><div><h4>بهترین‌ها (نسبت به میانه‌ی خودت)</h4>${ig.top.map(rvPostHTML).join('')}</div>
      ${ig.bottom.length ? `<div><h4>ضعیف‌ترین‌ها</h4>${ig.bottom.map(rvPostHTML).join('')}</div>` : ''}</div>` : ''}`;
}
const rvPostHTML = p => `<a class="rv-post" ${p.link ? `href="${esc(p.link)}" target="_blank" rel="noopener"` : ''}>
  <b>${p.ratio != null ? faNum(p.ratio) + '×' : '—'}</b><span>${esc(p.hook || '(بدون کپشن)')}</span><small>${esc(p.type || '')} · ${esc(rvDate(p.date))} · ${rvNum(p.views)} بازدید</small></a>`;

/* ---------- هدف‌ها ---------- */
function rvTargetsHTML() {
  const d = RV.d;
  return `<div class="rv-h"><h3>هدف‌ها</h3><span class="grow"></span><button class="btn" id="rvTAdd">${RV.addT ? 'بستن' : '+ هدف تازه'}</button></div>
    ${RV.addT ? `<div class="rv-tform">
      <input class="cap-input" id="rvTL" placeholder="اسم هدف، مثلاً «۱۰ هزار فالوور»">
      <div class="idea-edit-row"><label>سنجه<select id="rvTM">${Object.entries(d.auto).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
        <label>عدد هدف<input class="cap-input" id="rvTV" inputmode="numeric"></label>
        <label>تا تاریخ<input type="date" class="cap-input" id="rvTB"></label>
        <label id="rvTCw" hidden>الان<input class="cap-input" id="rvTC" inputmode="numeric"></label></div>
      <div class="rowbar" style="margin:8px 0 0"><span class="grow"></span><button class="btn primary" id="rvTSave">افزودن</button></div></div>` : ''}
    ${d.targets.length ? d.targets.map(t => {
      const pct = t.value != null && t.target ? Math.min(100, Math.round(t.value / t.target * 100)) : null;
      return `<div class="rv-target"><div class="rv-tt"><b>${esc(t.label)}</b><span>${rvNum(t.value)} از ${rvNum(t.target)}${t.by ? ` · تا ${esc(rvDate(t.by))}` : ''}</span>
          ${t.metric === 'manual' ? `<button class="au-more" data-tcur="${t.id}">به‌روز کن</button>` : ''}<button class="del" data-tdel="${t.id}" title="حذف">✕</button></div>
        <div class="rv-track"><i style="width:${pct ?? 0}%"></i></div><small>${pct === null ? 'هنوز داده‌ای نیست' : faNum(pct) + '٪'} · ${esc(d.auto[t.metric] || '')}</small></div>`;
    }).join('') : (RV.addT ? '' : '<p class="cap-hint">هدف فصل را بگذار (مثلاً «۱۲ پست در ماه» یا «۵۰ مشترک خبرنامه»)؛ پیشرفتش خودکار یا با عدد دستی حساب می‌شود و Claude در مرور به آن نگاه می‌کند.</p>')}`;
}

/* ---------- یک مرور ---------- */
function rvReviewHTML(r) {
  const dr = r.draft || {}, running = RV.d.job.state === 'running' && RV.d.job.rid === r.id;
  const pairs = (xs, cls) => (xs || []).map(x => `<li class="${cls}"><b>${esc(x.point)}</b><small>${esc(x.evidence)}</small></li>`).join('');
  return `<section class="panel rv-one">
    <div class="detail-bar"><button class="btn" id="rvBack">→ برگشت</button><span class="grow"></span>
      <button class="btn" id="rvRe" ${running ? 'disabled' : ''}>${r.draft ? 'تحلیل دوباره' : 'تحلیل با Claude'}</button>
      <button class="btn danger" id="rvDel">حذف</button></div>
    <h3>مرور ${esc(rvDate(r.to))} <small>${esc(rvDate(r.from))} تا ${esc(rvDate(r.to))}</small></h3>
    <div id="rvJob" class="build-status" hidden></div>
    ${rvScoreHTML(r.score)}
    ${Object.keys(r.manual || {}).length ? `<div class="rv-chips">${Object.entries(r.manual).filter(([, v]) => v).map(([k, v]) => `<span>${esc(k)}: ${esc(faNum(v))}</span>`).join('')}</div>` : ''}
    ${r.note ? `<p class="rv-notep">«${esc(r.note)}»</p>` : ''}
    ${r.draft ? `
      <p class="rv-sum">${esc(dr.summary || '')}</p>
      <div class="cards2"><div><h4>چه کار کرد</h4><ul class="rv-pairs">${pairs(dr.worked, 'ok')}</ul></div>
        <div><h4>چه کار نکرد</h4><ul class="rv-pairs">${pairs(dr.didnt, 'no')}</ul></div></div>
      ${(dr.experiments || []).length ? `<h4>آزمایش‌ها</h4><ul class="rv-pairs">${dr.experiments.map(e => `<li><b>${esc(e.test)}</b><small>سنجش: ${esc(e.measure)}</small></li>`).join('')}</ul>` : ''}
      <div class="rv-learn">
        <h4>یادگیری‌ها <small>هر خط یکی؛ بعد از تأیید به همه‌ی بخش‌های استودیو می‌رسد</small></h4>
        <textarea class="cap-text" id="rvL">${esc((dr.learnings || []).join('\n'))}</textarea>
        <div class="rv-pinrow">${(dr.learnings || []).map(l => `<button class="au-more" data-pin="${esc(l)}" title="به یادگیری‌های ثابت اضافه شود">📌 ${esc(l.slice(0, 50))}${l.length > 50 ? '…' : ''}</button>`).join('')}</div>
        <h4>تمرکز ۳۰ روز بعد</h4>
        <textarea class="cap-text" id="rvF">${esc((dr.focus || []).join('\n'))}</textarea>
        <div class="rowbar" style="margin:12px 0 0">${r.approved ? `<i class="rv-ok">✓ تأیید شده در ${esc(rvDate(r.approved))}</i>` : ''}<span class="grow"></span>
          <button class="btn" id="rvSave">ذخیره</button>
          <button class="btn primary" id="rvOk">${r.approved ? 'ذخیره و به‌روز کردن یادگیری‌ها' : 'تأیید و افزودن به یادگیری‌ها'}</button></div>
      </div>` : running ? '' : '<div class="empty">هنوز تحلیل نشده. «تحلیل با Claude» را بزن.</div>'}
  </section>`;
}

/* ---------- رویدادها ---------- */
function rvWire() {
  const d = RV.d, on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  rvShowJob();
  $$('[data-rvopen]').forEach(b => b.onclick = () => { RV.open = RV.open === b.dataset.rvopen ? null : b.dataset.rvopen; rvRender(); window.scrollTo(0, 0); });
  on('rvBack', () => { RV.open = null; rvRender(); });
  on('rvMEdit', () => { $('#rvMList').hidden = !$('#rvMList').hidden; });
  on('rvMSave', async () => {
    const r = await post('/api/review/metrics', { metrics: $('#rvMText').value.split('\n') });
    if (!r.ok) return toast('ذخیره نشد'); viewReview();
  });
  on('rvNew', async () => {
    const manual = {}; $$('[data-rvm]').forEach(i => manual[i.dataset.rvm] = enNum(i.value.trim()));
    const r = await post('/api/review/new', { manual, note: $('#rvNote').value });
    if (!r.ok) return toast(r.data.error || 'نشد');
    if (r.data.warn) toast(r.data.warn);
    RV.open = r.data.id; await viewReview(); rvPoll();
  });
  on('rvRe', async () => {
    const r = await post('/api/review/analyze', { id: RV.open });
    if (!r.ok) return toast(r.data.error || 'نشد');
    RV.d.job = { state: 'running', rid: RV.open }; rvRender(); rvPoll();
  });
  on('rvDel', async () => {
    if (!confirm('این مرور حذف شود؟ اگر تأیید شده بود، یادگیری‌هایش از فایل یادگیری‌ها هم برمی‌دارد.')) return;
    await post('/api/review/delete', { id: RV.open }); RV.open = null; viewReview();
  });
  const saveDraft = async approved => {
    const lines = id => $('#' + id).value.split('\n').map(s => s.trim()).filter(Boolean);
    const body = { id: RV.open, draft: { learnings: lines('rvL'), focus: lines('rvF') } };
    if (approved) body.approved = true;
    const r = await post('/api/review/save', body);
    if (!r.ok) return toast(r.data.error || 'ذخیره نشد');
    toast(approved ? '✓ یادگیری‌ها به همه‌ی بخش‌های استودیو رسید' : '✓ ذخیره شد'); viewReview();
  };
  on('rvSave', () => saveDraft(false));
  on('rvOk', () => saveDraft(true));
  $$('#rvL, #rvF, #rvNote').forEach(ta => { fitHeight(ta); ta.addEventListener('input', () => fitHeight(ta)); });
  $$('[data-pin]').forEach(b => b.onclick = async () => {
    const r = await post('/api/review/pin', { text: b.dataset.pin });
    if (r.ok) { toast('📌 به یادگیری‌های ثابت اضافه شد'); viewReview(); }
  });
  $$('[data-unpin]').forEach(b => b.onclick = async () => {
    const r = await post('/api/review/pin', { text: b.dataset.unpin, remove: true });
    if (r.ok) viewReview();
  });
  on('rvTAdd', () => { RV.addT = !RV.addT; rvRender(); });
  const tm = $('#rvTM'); if (tm) tm.onchange = () => { $('#rvTCw').hidden = tm.value !== 'manual'; };
  on('rvTSave', async () => {
    const t = { label: $('#rvTL').value, metric: $('#rvTM').value, target: enNum($('#rvTV').value), by: $('#rvTB').value, current: enNum(($('#rvTC') || {}).value || '0') };
    const r = await post('/api/review/target', { target: t });
    if (!r.ok) return toast(r.data.error || 'نشد');
    RV.addT = false; viewReview();
  });
  $$('[data-tdel]').forEach(b => b.onclick = async () => {
    if (!confirm('این هدف حذف شود؟')) return;
    await post('/api/review/target', { remove: true, id: b.dataset.tdel }); viewReview();
  });
  $$('[data-tcur]').forEach(b => b.onclick = async () => {
    const t = d.targets.find(x => x.id === b.dataset.tcur); if (!t) return;
    const v = prompt(`«${t.label}» الان چند است؟`, t.value ?? ''); if (v === null) return;
    await post('/api/review/target', { target: { ...t, current: enNum(v) } }); viewReview();
  });
}
function rvShowJob() {
  const j = RV.d.job, box = $('#rvJob'); if (!box) return;
  const mine = !RV.open || j.rid === RV.open;
  if (!mine || j.state === 'idle' || j.state === 'done') { box.hidden = true; return; }
  box.hidden = false; box.className = 'build-status' + (j.state === 'error' ? ' err' : '');
  box.innerHTML = `<div class="build-step">${j.state === 'running' ? `<span class="spin"></span> ${esc(j.step || 'در حال تحلیل…')}` : '✕ ' + esc(j.error || 'خطا')}</div>`;
}
function rvPoll() {
  clearInterval(RV.poll);
  RV.poll = setInterval(async () => {
    if (S.section !== 'review') return clearInterval(RV.poll);
    const j = await api('/api/review/job'); if (!j) return;
    RV.d.job = j; rvShowJob();
    if (j.state !== 'running') { clearInterval(RV.poll); if (j.state === 'done') toast('✓ تحلیل آماده است'); viewReview(); }
  }, 3000);
}
