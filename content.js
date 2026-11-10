(() => {
  if (globalThis.__mcqLens) return;
  globalThis.__mcqLens = true;
  let enabled = false, busy = false, timer, generation = 0, interval = 10000;
  let answered = null, placed = [], crop = null, status = 'Off', retryAt = 0, selecting = false;
  const host = document.createElement('div');
  host.id = 'mcq-lens-overlay';
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none';
  const root = host.attachShadow({ mode: 'closed' });
  // Hide icon: Lucide "eye-off" (ISC licence, https://lucide.dev).
  root.innerHTML = `<style>
    :host{--bg:#fff;--text:#111;--muted:#5f5f5c;--line:#e8e8e6;--mark:#1f9d55;--warn:#b7791f;font:13px/1.5 'Segoe UI Variable Text','Segoe UI',system-ui,-apple-system,sans-serif;color:var(--text)}
    @media (prefers-color-scheme:dark){:host{--bg:#161616;--text:#ededed;--muted:#a0a0a0;--line:#2a2a2a;--mark:#3ecf7a;--warn:#e0a84a}}
    .hud{position:fixed;right:16px;bottom:16px;width:min(320px,calc(100vw - 32px));box-sizing:border-box;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.12);pointer-events:auto;font:13px/1.5 'Segoe UI Variable Text','Segoe UI',system-ui,-apple-system,sans-serif}
    .top{display:flex;align-items:center;justify-content:space-between}.name{font-weight:600}.status{margin-top:2px;font-size:12px;color:var(--muted)}
    .reason{max-height:150px;overflow:auto;font-size:12.5px;scrollbar-width:thin}.reason:not(:empty){margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}.reason p{margin:0 0 8px;color:var(--muted)}.reason p:last-child{margin:0}.reason strong{color:var(--text);font-weight:600}
    button{font:500 12px/1 'Segoe UI Variable Text','Segoe UI',system-ui,sans-serif;border:1px solid var(--line);background:transparent;border-radius:6px;padding:7px 10px;cursor:pointer;color:var(--text)}button:hover{border-color:var(--muted)}button:focus-visible{outline:2px solid var(--text);outline-offset:2px}
    #hide{display:grid;place-items:center;border:0;padding:4px;border-radius:6px;color:var(--muted)}#hide:hover{color:var(--text);background:color-mix(in srgb,var(--text) 6%,transparent)}
    .report{margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}.report textarea{box-sizing:border-box;width:100%;min-height:64px;font:12.5px/1.5 'Segoe UI',system-ui,sans-serif;color:var(--text);background:transparent;border:1px solid var(--line);border-radius:8px;padding:8px;resize:vertical}.report textarea:focus{outline:none;border-color:var(--muted)}.report label{display:flex;gap:8px;align-items:center;font-size:12px;margin:8px 0;color:var(--muted)}.report .buttons{display:flex;gap:6px}#send{background:var(--text);border-color:var(--text);color:var(--bg)}
    .box{position:fixed;box-sizing:border-box;border-radius:50%;border:2.5px solid var(--mark);background:transparent;box-shadow:0 0 0 3px color-mix(in srgb,var(--mark) 20%,transparent);pointer-events:none}.box.low{border-color:var(--warn);box-shadow:0 0 0 3px color-mix(in srgb,var(--warn) 20%,transparent)}
    .region{position:fixed;box-sizing:border-box;border:1.5px dashed var(--mark);border-radius:8px;pointer-events:none}.veil{position:fixed;inset:0;pointer-events:auto;cursor:crosshair;background:rgba(0,0,0,.3);touch-action:none}.selection{position:fixed;border:2px solid #fff;border-radius:6px;background:rgba(255,255,255,.1);pointer-events:none}.hint{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:var(--bg);color:var(--text);border:1px solid var(--line);padding:10px 16px;border-radius:10px;font:13px 'Segoe UI',system-ui,sans-serif;pointer-events:none}
  </style><div id="marks"></div><div class="hud" hidden><div class="top"><span class="name">MCQ Lens</span><button id="hide" aria-label="Hide the reasoning" title="Hide (Alt+Shift+Y)"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg></button></div><div class="status" role="status"></div><div class="reason"></div><form class="report" hidden><textarea id="note" maxlength="2000" placeholder="What went wrong? (no personal details)"></textarea><label><input id="shot" type="checkbox"> Include a screenshot of the question area</label><div class="buttons"><button id="send" type="submit">Send report</button><button id="cancel" type="button">Cancel</button></div></form></div>`;
  const marks = root.querySelector('#marks'), hud = root.querySelector('.hud'), reasons = root.querySelector('.reason');
  const setStatus = text => { status = text; root.querySelector('.status').textContent = text; };
  // A short log of what the extension did, sent with bug reports. Steps only: never question text or page content.
  const started = Date.now(), events = [];
  const log = (type, detail = '') => { events.push({ t: Date.now() - started, type, detail: String(detail).slice(0, 200) }); if (events.length > 40) events.shift(); };
  const report = fields => chrome.runtime.sendMessage({ type: 'REPORT', report: { site: location.hostname, events: [...events], ...fields } }).catch(() => ({}));
  // Limits and superseded scans are normal operation, not bugs.
  const EXPECTED = ['daily', 'rate', 'busy', 'superseded', 'throttle', 'cancelled', 'paused'];
  const clear = () => { marks.replaceChildren(); reasons.replaceChildren(); placed = []; };
  const send = message => chrome.runtime.sendMessage(message);
  // Whole-page text, used only locally: unlike the visible area it does not change when the user scrolls.
  const docText = () => (document.body || document.documentElement).innerText.slice(0, 200000);
  const questionKey = questions => JSON.stringify(questions.map(q => [q.question, q.options.map(o => o.text)]));
  // Highlights follow their option on the page (or their page position) instead of forcing a re-read.
  // The mark is one ring: around the option's own radio button when it has one, else at the option's left edge.
  function reposition() {
    for (const mark of placed) {
      const radio = mark.radio?.isConnected && mark.radio.getBoundingClientRect();
      const r = radio && radio.width ? radio : mark.target?.isConnected ? mark.target.getBoundingClientRect() : { left: mark.x - scrollX, top: mark.y - scrollY, width: mark.w, height: mark.h };
      // A ring with a clear centre, so the user's own selection in the radio stays visible.
      const size = radio && radio.width ? Math.max(radio.width, radio.height) + 10 : 18;
      const x = radio && radio.width ? r.left + r.width / 2 : r.left + 16, y = r.top + r.height / 2;
      mark.box.style.cssText = `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px`;
    }
  }
  function schedule(delay = interval) {
    clearTimeout(timer);
    if (enabled) timer = setTimeout(scan, delay);
  }
  function invalidate() {
    generation++; answered = null; clear();
    send({ type: 'CANCEL' }).catch(() => {});
  }
  function stop() {
    enabled = false; selecting = false; invalidate(); clearTimeout(timer); host.remove(); status = 'Off';
    root.querySelectorAll('.veil,.selection,.hint').forEach(el => el.remove());
  }

  async function snapshot() {
    host.style.display = 'none';
    try {
      // Wait for the hidden overlays to leave the compositor before capture.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const response = await send({ type: 'CAPTURE' });
      if (response.paused || !response.image) return response;
      // A bitmap from the raw bytes: Firefox marks a canvas drawn from a data: <img> in a content script as insecure.
      const bytes = Uint8Array.from(atob(response.image.split(',')[1]), c => c.charCodeAt(0));
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const area = crop || { x: 0, y: 0, w: innerWidth, h: innerHeight };
      const scaleX = image.width / innerWidth, scaleY = image.height / innerHeight;
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(1600, Math.round(area.w * scaleX));
      canvas.height = Math.max(1, Math.round(canvas.width * area.h / area.w));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, area.x * scaleX, area.y * scaleY, area.w * scaleX, area.h * scaleY, 0, 0, canvas.width, canvas.height);
      const thumb = document.createElement('canvas');
      thumb.width = 320; thumb.height = 180;
      const tctx = thumb.getContext('2d', { willReadFrequently: true });
      tctx.drawImage(canvas, 0, 0, 320, 180);
      return { image: canvas.toDataURL('image/jpeg', 0.9).split(',')[1], pixels: tctx.getImageData(0, 0, 320, 180).data, area };
    } finally { host.style.display = ''; }
  }
  function same(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    let difference = 0;
    for (let i = 0; i < a.length; i += 4) {
      difference += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    }
    // Ignore tiny compositor noise, not meaningful changes to option text.
    return difference / (a.length / 4 * 3) < 0.12;
  }
  function readPageQuestions(area) {
    const visible = element => {
      const r = element.getBoundingClientRect(), style = getComputedStyle(element);
      return r.width > 0 && r.height > 0 && style.visibility === 'visible' && style.display !== 'none' && r.left >= area.x && r.top >= area.y && r.right <= area.x + area.w && r.bottom <= area.y + area.h;
    };
    const controls = [...document.querySelectorAll('input[type="radio"],[role="radio"]')].filter(element => visible(element.closest('label') || element));
    if (controls.length < 2 || controls.length > 10) return;
    const first = controls[0], group = first.closest('fieldset,[role="radiogroup"]');
    if (controls.some(element => group ? !group.contains(element) : element.name !== first.name || element.form !== first.form)) return;
    const fullGroup = [...document.querySelectorAll('input[type="radio"],[role="radio"]')].filter(element => group ? group.contains(element) : element.name === first.name && element.form === first.form);
    if (fullGroup.some(element => !visible(element.labels?.[0] || element.closest('label') || element))) return;
    const labels = controls.map(element => element.labels?.[0] || element.closest('label') || (element.matches('[role="radio"]') ? element : null));
    if (labels.some(element => !element || !visible(element)) || new Set(labels).size !== labels.length) return;
    let container = group || first.parentElement;
    while (container && (!labels.every(label => container.contains(label)) || !container.querySelector('h1,h2,h3,h4,[role="heading"],legend'))) container = container.parentElement;
    // A short legend usually describes the controls; look one level up for the question.
    if (container === group && group.parentElement.querySelector('h1,h2,h3,h4,[role="heading"]')) container = group.parentElement;
    if (!container || container.querySelector('img,canvas,svg,math,mjx-container')) return;
    const headings = [...container.querySelectorAll('h1,h2,h3,h4,[role="heading"],legend')].filter(element => visible(element) && (element.compareDocumentPosition(labels[0]) & Node.DOCUMENT_POSITION_FOLLOWING));
    if (!headings.length) return;
    const heading = headings.filter(element => element.tagName !== 'LEGEND').at(-1) || headings.at(-1);
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT), parts = [];
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!node.textContent.trim() || parent.closest('script,style,noscript,button,nav,label') || labels.some(label => label.contains(node))) continue;
      if (!(heading.contains(node) || (heading.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) || !(node.compareDocumentPosition(labels[0]) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      if (!visible(parent)) continue;
      parts.push(node.textContent.trim());
    }
    const question = parts.join('\n');
    if (question.length < 15 || question.length > 12000) return;
    const options = labels.map(element => {
      const r = element.getBoundingClientRect();
      return { text: element.innerText.trim(), box: [(r.top - area.y) / area.h * 1000, (r.left - area.x) / area.w * 1000, (r.bottom - area.y) / area.h * 1000, (r.right - area.x) / area.w * 1000] };
    });
    if (options.some(option => !option.text) || new Set(options.map(option => option.text)).size !== options.length) return;
    return [{ question, selectionMode: 'single', options }];
  }
  function render(questions, area, origin) {
    clear();
    let count = 0;
    for (const q of questions) {
      const paragraph = document.createElement('p');
      const title = document.createElement('strong');
      title.textContent = q.answers.length ? `${q.answers.map(a => a.text).join(' / ')} · ${q.confidence} confidence` : 'No reliable suggestion';
      paragraph.append(title, document.createElement('br'), document.createTextNode(q.explanation));
      reasons.append(paragraph);
      for (const answer of q.answers) {
        const [top, left, bottom, right] = answer.box;
        const predicted = { x: area.x + left / 1000 * area.w, y: area.y + top / 1000 * area.h, w: (right - left) / 1000 * area.w, h: (bottom - top) / 1000 * area.h };
        const normalize = value => value.replace(/\s+/g, ' ').trim().toLowerCase();
        const withoutLabel = value => normalize(value).replace(/^(?:option\s+)?[a-h][.)\]:-]\s*/i, '');
        const matches = [...document.querySelectorAll('label,[role="radio"],[role="option"],.option,.answer-option,[data-option],li,button')].flatMap(element => {
          const text = normalize(element.innerText || element.textContent || '');
          if (!text || (text !== normalize(answer.text) && withoutLabel(text) !== withoutLabel(answer.text))) return [];
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height || rect.right <= area.x || rect.left >= area.x + area.w || rect.bottom <= area.y || rect.top >= area.y + area.h) return [];
          const distance = Math.hypot(rect.left + rect.width / 2 - predicted.x - predicted.w / 2, rect.top + rect.height / 2 - predicted.y - predicted.h / 2);
          return [{ element, distance }];
        }).sort((a, b) => a.distance - b.distance);
        const box = document.createElement('div');
        box.className = `box${q.confidence === 'high' ? '' : ' low'}`;
        const target = matches[0]?.element;
        const radio = target && (target.matches('input[type="radio"],[role="radio"]') ? target : target.querySelector('input[type="radio"],[role="radio"]'));
        placed.push({ box, target, radio, x: predicted.x + origin.x, y: predicted.y + origin.y, w: predicted.w, h: predicted.h });
        box.title = q.confidence === 'high' ? 'Suggested answer' : `Suggested answer (${q.confidence} confidence)`;
        marks.append(box); count++;
      }
    }
    reposition();
    setStatus(count ? `${count} suggested option${count === 1 ? '' : 's'} · watching for changes` : 'No complete, answerable MCQ found. Watching…');
    return status;
  }
  async function scan() {
    if (!enabled || busy || selecting) return;
    if (Date.now() < retryAt) { schedule(retryAt - Date.now()); return; }
    busy = true;
    let delay = interval;
    const version = generation, area = crop || { x: 0, y: 0, w: innerWidth, h: innerHeight }, origin = { x: scrollX, y: scrollY };
    const text = docText(), url = location.href, extracted = readPageQuestions(area), key = extracted ? questionKey(extracted) : null;
    // How far the view moved since the last answer, in screens.
    const shift = answered ? Math.max(Math.abs(answered.origin.x - origin.x) / innerWidth, Math.abs(answered.origin.y - origin.y) / innerHeight) : 0;
    try {
      // Same question: scrolling, clicking elsewhere or a ticking timer never re-asks.
      if (answered && answered.url === url && ((key && key === answered.key) || (answered.text === text && shift < 0.5 && (answered.key || shift > 0)))) {
        answered.text = text; reposition(); setStatus(answered.status); log('same-question', key ? 'page text' : 'text unchanged'); return;
      }
      let shot;
      if (!key) {
        shot = await snapshot();
        if (!enabled || version !== generation) return;
        // A tab that is not on screen cannot be photographed: keep the current answer and try again later, quietly.
        if (shot.paused) { log('waiting', 'capture: tab not on screen'); return; }
        if (shot.error) throw Object.assign(new Error(shot.error), { stage: 'capture' });
        // Image or canvas questions: unchanged pixels at the same scroll position mean the same question.
        if (answered && !answered.key && answered.url === url && shift === 0 && same(answered.pixels, shot.pixels)) { answered.text = text; setStatus(answered.status); log('same-question', 'pixels'); return; }
      }
      clear(); setStatus('Reading question and checking the answer…');
      const asked = Date.now();
      log('ask', key ? `page text, ${extracted[0].options.length} options` : `screenshot ${Math.round(area.w)}x${Math.round(area.h)}${crop ? ' (area)' : ''}`);
      const response = await send({ type: 'SOLVE', image: shot?.image || '', extractedQuestions: extracted });
      if (!enabled || version !== generation) return;
      if (response.error) {
        retryAt = Date.now() + (response.retryMs || 10000); setStatus(response.error);
        log('error', `${response.stage || 'service'}/${response.reason || response.status || '-'} after ${Date.now() - asked} ms`);
        if (!EXPECTED.includes(response.reason)) report({ kind: 'auto', stage: response.stage || 'service', reason: response.reason || String(response.status || ''), message: response.error });
        return;
      }
      // Reject the answer if the question changed while it was being worked out.
      let changed = location.href !== url;
      if (!changed && key) { const after = readPageQuestions(area); changed = after ? questionKey(after) !== key : docText() !== text; }
      else if (!changed && scrollX === origin.x && scrollY === origin.y) {
        const current = await snapshot();
        if (!enabled || version !== generation) return;
        changed = docText() !== text && Boolean(current.pixels) && !same(shot.pixels, current.pixels);
      } else if (!changed) changed = docText() !== text;
      if (changed) { setStatus('Question changed while reading. Scanning again…'); log('question-changed', 'while answering'); delay = 250; return; }
      answered = { key, text: docText(), url, origin, pixels: shot?.pixels };
      answered.status = render(response.questions || [], area, origin);
      log('answer', `${(response.questions || []).reduce((n, q) => n + q.answers.length, 0)} suggestion(s) in ${Date.now() - asked} ms`);
    } catch (error) {
      if (enabled && version === generation) {
        clear(); answered = null; setStatus(error.message || 'Could not scan this tab. Re-enable the extension.'); retryAt = Date.now() + 10000;
        log('error', `${error.stage || 'extension'}: ${error.message}`);
        report({ kind: 'auto', stage: error.stage || 'extension', reason: 'exception', message: `${error.message} @ ${(error.stack || '').split('\n')[1]?.trim().slice(0, 160) || '-'}` });
      }
    } finally { busy = false; schedule(retryAt > Date.now() ? retryAt - Date.now() : delay); }
  }
  function chooseArea() {
    if (!enabled || selecting) return;
    selecting = true; invalidate();
    const veil = document.createElement('div'); veil.className = 'veil';
    const selection = document.createElement('div'); selection.className = 'selection';
    const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = 'Drag around the question and ALL options. Escape cancels.';
    root.append(veil, selection, hint);
    let start;
    const cleanup = () => { veil.remove(); selection.remove(); hint.remove(); document.removeEventListener('keydown', escape, true); selecting = false; schedule(200); };
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); cleanup(); } };
    document.addEventListener('keydown', escape, true);
    veil.onpointerdown = event => { start = { x: event.clientX, y: event.clientY }; veil.setPointerCapture(event.pointerId); };
    veil.onpointermove = event => {
      if (!start) return;
      selection.style.cssText = `left:${Math.min(start.x, event.clientX)}px;top:${Math.min(start.y, event.clientY)}px;width:${Math.abs(start.x - event.clientX)}px;height:${Math.abs(start.y - event.clientY)}px`;
    };
    veil.onpointerup = event => {
      if (!start) return;
      const next = { x: Math.min(start.x, event.clientX), y: Math.min(start.y, event.clientY), w: Math.abs(start.x - event.clientX), h: Math.abs(start.y - event.clientY) };
      if (next.w >= 80 && next.h >= 60) { crop = next; answered = null; setStatus('Question area selected. Scanning…'); }
      else setStatus('Area too small. Kept the previous area.');
      cleanup();
    };
  }
  // The page shows only the highlight. The reasoning panel opens with the shortcut (or for a report).
  const form = root.querySelector('.report');
  const hidePanel = () => { hud.hidden = true; form.hidden = true; };
  root.querySelector('#hide').onclick = () => hidePanel();
  const openReport = () => { hud.hidden = false; form.hidden = false; root.querySelector('#note').focus(); };
  root.querySelector('#cancel').onclick = () => { form.hidden = true; };
  form.onsubmit = async event => {
    event.preventDefault();
    const note = root.querySelector('#note').value.trim(), withShot = root.querySelector('#shot').checked;
    if (!note && !withShot) { setStatus('Describe the problem or include a screenshot.'); return; }
    root.querySelector('#send').disabled = true;
    try {
      // The screenshot is taken only when the user ticked the box, and only of the visible question area.
      const shot = withShot ? await snapshot() : null;
      const result = await report({ kind: 'user', note, screenshot: shot?.image || '', message: `Status: ${status}`.slice(0, 500) });
      if (result?.error) throw new Error(result.error);
      form.hidden = true; root.querySelector('#note').value = ''; root.querySelector('#shot').checked = false;
      setStatus(`Thanks, report #${result?.id ?? ''} sent. We'll look into it.`);
    } catch (error) { setStatus(`Report not sent: ${error.message}`); }
    finally { root.querySelector('#send').disabled = false; }
  };
  // Scrolling moves the highlights with the page; only a changed question triggers a new read.
  window.addEventListener('scroll', () => { if (enabled) requestAnimationFrame(reposition); }, { capture: true, passive: true });
  window.addEventListener('resize', () => { if (enabled) { crop = null; reposition(); schedule(800); } });
  document.addEventListener('visibilitychange', () => { if (enabled && !document.hidden) schedule(300); });
  // Check locally every 500ms whether the page text changed; scan() then decides if the question did.
  setInterval(() => {
    if (!enabled || busy || selecting || !answered) return;
    reposition();
    if (location.href !== answered.url || docText() !== answered.text) schedule(250);
  }, 500);
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.type === 'STATE') reply({ enabled, status, cropped: Boolean(crop) });
    if (message.type === 'TOGGLE') {
      if (message.enabled) {
        enabled = true; interval = Math.min(60, Math.max(6, Number(message.interval) || 10)) * 1000;
        invalidate(); retryAt = 0; document.documentElement.append(host); hud.hidden = true; setStatus('Watching this tab. Scanning…'); schedule(300);
        log('enabled', `check every ${interval / 1000}s`);
      } else stop();
      reply({ enabled, status });
    }
    if (message.type === 'AREA') { chooseArea(); reply({ ok: true }); }
    if (message.type === 'FULL') { crop = null; invalidate(); setStatus('Watching the full visible screen.'); schedule(200); reply({ ok: true }); }
    if (message.type === 'REPORT_FORM') { if (enabled) openReport(); reply({ ok: enabled }); }
    if (message.type === 'PANEL') { if (enabled) { if (hud.hidden) hud.hidden = false; else hidePanel(); } reply({ open: enabled && !hud.hidden }); }
    if (message.type === 'SCAN') { invalidate(); retryAt = 0; schedule(100); reply({ ok: true }); }
  });
})();
