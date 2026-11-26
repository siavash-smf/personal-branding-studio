/* ضبط صدا در مرورگر، مشترک بین «بانک تجربه» و «صدای مخاطب».
   mountRecorder(box, {max, hint}) دکمه‌ی ضبط را در box می‌سازد و یک شیء برمی‌گرداند:
   .blob (بعد از پایان ضبط)، .busy() (در حال ضبط؟)، .stop()، .discard()، .payload() ← {filename, data} برای فرستادن.
   ظاهرش همان کلاس‌های .rec در style.css است (مثل ضبط ویس بانک ایده). */
(function () {
  const fmt = s => `${faNum(Math.floor(s / 60))}:${faNum(String(Math.floor(s % 60)).padStart(2, '0'))}`;
  let LIVE = null;   // فقط یک ضبط در هر لحظه؛ صفحه که از نو کشیده شود، ضبط قبلی بسته می‌شود

  window.mountRecorder = function (box, opt = {}) {
    if (LIVE) LIVE.discard();
    const max = opt.max || 1800, hint = opt.hint || 'دکمه را بزن و حرف بزن.';
    box.innerHTML = `<div class="rec">
      <button class="rec-btn" type="button" title="شروع ضبط"><span class="rec-dot"></span></button>
      <div class="rec-info"><b class="r-state">آماده‌ی ضبط</b><span class="r-time">۰:۰۰</span>
        <span class="cap-hint r-hint">${esc(hint)}</span></div>
      <audio controls hidden></audio></div>`;
    const btn = box.querySelector('.rec-btn'), stEl = box.querySelector('.r-state'),
          tEl = box.querySelector('.r-time'), hEl = box.querySelector('.r-hint'), au = box.querySelector('audio');
    const R = { mr: null, chunks: [], blob: null, t0: 0, timer: null, stream: null, dead: false };

    async function start() {
      try {
        R.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      } catch (e) {
        stEl.textContent = 'دسترسی به میکروفون داده نشد';
        hEl.textContent = 'در تنظیمات مرورگر اجازه‌ی میکروفون را برای این صفحه روشن کن.';
        return;
      }
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      const mime = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
      R.chunks = []; R.blob = null; R.dead = false;
      R.mr = new MediaRecorder(R.stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : {});
      R.mr.ondataavailable = e => e.data.size && R.chunks.push(e.data);
      R.mr.onstop = () => {
        R.stream.getTracks().forEach(t => t.stop());
        btn.classList.remove('on'); clearInterval(R.timer);
        if (R.dead) return;
        R.blob = new Blob(R.chunks, { type: R.mr.mimeType || 'audio/webm' });
        au.src = URL.createObjectURL(R.blob); au.hidden = false;
        stEl.textContent = 'ضبط شد';
        hEl.textContent = `${fmt((Date.now() - R.t0) / 1000)} · ${faNum((R.blob.size / 1e6).toFixed(1))} مگابایت`;
        if (opt.onDone) opt.onDone(R.blob);
      };
      R.mr.start(250); R.t0 = Date.now(); LIVE = api;
      btn.classList.add('on'); stEl.textContent = 'در حال ضبط…';
      hEl.textContent = 'برای پایان دوباره دکمه را بزن.'; au.hidden = true;
      clearInterval(R.timer);
      R.timer = setInterval(() => {
        const s = (Date.now() - R.t0) / 1000; tEl.textContent = fmt(s);
        if (s > max) stop();
      }, 250);
    }
    function stop() { if (R.mr && R.mr.state === 'recording') R.mr.stop(); }
    const api = {
      get blob() { return R.blob; },
      busy: () => !!(R.mr && R.mr.state === 'recording'),
      stop,
      discard() { R.dead = true; stop(); if (LIVE === api) LIVE = null; },
      async payload() {
        if (api.busy()) { stop(); await new Promise(r => setTimeout(r, 400)); }
        if (!R.blob) return null;
        const ext = R.blob.type.includes('mp4') ? 'm4a' : R.blob.type.includes('ogg') ? 'ogg' : 'webm';
        const data = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(R.blob); });
        return { filename: `voice-${Date.now()}.${ext}`, data };
      },
    };
    btn.onclick = () => (api.busy() ? stop() : start());
    return api;
  };
})();
