(() => {
  if (globalThis.__mcqLens) return;
  globalThis.__mcqLens = true;
  let enabled = false, busy = false, timer, generation = 0, interval = 10000;
  let answered = null, placed = [], crop = null, status = 'Off', retryAt = 0, selecting = false;
  const host = document.createElement('div');
  host.id = 'mcq-lens-overlay';
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    :host{font:13px/1.45 'Segoe UI',sans-serif;color:#242c26}.hud{position:fixed;right:18px;bottom:18px;max-width:340px;background:#f6f5ee;color:#242c26;border:1px solid #d9ddd2;border-radius:13px;padding:13px 15px;box-shadow:0 6px 30px #0002;pointer-events:auto;font:13px/1.45 'Segoe UI',sans-serif}
    .top{display:flex;gap:12px;align-items:center;justify-content:space-between}.name{font-weight:700}.status{margin-top:6px;font-size:12px;color:#616b62}.buttons{display:flex;gap:6px;margin-top:10px}button{font:12px 'Segoe UI',sans-serif;border:1px solid #cbd3c4;background:transparent;border-radius:6px;padding:5px 8px;cursor:pointer;color:#315e3a}button:hover{background:#e2f2a7}button:focus-visible{outline:2px solid #315e3a}.box{position:fixed;box-sizing:border-box;border:3px solid #38753a;border-radius:6px;background:#b8ec7438;pointer-events:none}.box.low{border-color:#b07b1e;background:#efbd5430}.box span{position:absolute;top:-21px;left:0;background:#315e3a;color:white;padding:2px 6px;border-radius:4px;white-space:nowrap;font:11px 'Segoe UI',sans-serif}.box.low span{background:#94621b}.reason{max-height:200px;overflow:auto;margin-top:8px;font-size:12px}.reason p{margin:7px 0}.region{position:fixed;box-sizing:border-box;border:1px dashed #315e3a;pointer-events:none}.veil{position:fixed;inset:0;pointer-events:auto;cursor:crosshair;background:#0004;touch-action:none}.selection{position:fixed;border:2px solid #e2f2a7;background:#e2f2a733;pointer-events:none}.hint{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#242c26;color:white;padding:12px 18px;border-radius:8px;font:14px 'Segoe UI',sans-serif;pointer-events:none}
  </style><div id="marks"></div><div class="hud"><div class="top"><span class="name">◎ MCQ Lens</span><button id="off" aria-label="Turn off MCQ Lens">Turn off</button></div><div class="status" role="status"></div><div class="reason"></div><div class="buttons"><button id="rescan">Scan now</button><button id="area">Choose area</button><button id="reset">Full screen</button></div></div>`;
  const marks = root.querySelector('#marks'), hud = root.querySelector('.hud'), reasons = root.querySelector('.reason');
  const setStatus = text => { status = text; root.querySelector('.status').textContent = text; };
  const clear = () => { marks.replaceChildren(); reasons.replaceChildren(); placed = []; };
  const send = message => chrome.runtime.sendMessage(message);
  // Whole-page text, used only locally: unlike the visible area it does not change when the user scrolls.
  const docText = () => (document.body || document.documentElement).innerText.slice(0, 200000);
  const questionKey = questions => JSON.stringify(questions.map(q => [q.question, q.options.map(o => o.text)]));
  // Highlights follow their option on the page (or their page position) instead of forcing a re-read.
  function reposition() {
    for (const mark of placed) {
      const r = mark.target?.isConnected ? mark.target.getBoundingClientRect() : { left: mark.x - scrollX, top: mark.y - scrollY, width: mark.w, height: mark.h };
      mark.box.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
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
      const image = new Image();
      image.src = response.image;
      await image.decode();
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
        placed.push({ box, target: matches[0]?.element, x: predicted.x + origin.x, y: predicted.y + origin.y, w: predicted.w, h: predicted.h });
        const label = document.createElement('span'); label.textContent = q.confidence === 'high' ? 'Suggested answer' : `Uncertain · ${q.confidence}`;
        box.append(label); marks.append(box); count++;
      }
    }
    reposition();
    setStatus(count ? `${count} suggested option${count === 1 ? '' : 's'} · watching for changes` : 'No complete, answerable MCQ found. Watching…');
    return status;
  }
  async function scan() {
    if (!enabled || busy || selecting) return;
    // A hidden tab keeps its highlight; it is checked again when the tab is back.
    if (document.hidden) { setStatus('Paused while this tab is hidden.'); schedule(); return; }
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
        answered.text = text; reposition(); setStatus(answered.status); return;
      }
      let shot;
      if (!key) {
        shot = await snapshot();
        if (!enabled || version !== generation) return;
        if (shot.paused) { setStatus('Paused. Bring this tab and window to the foreground.'); return; }
        if (shot.error) throw new Error(shot.error);
        // Image or canvas questions: unchanged pixels at the same scroll position mean the same question.
        if (answered && !answered.key && answered.url === url && shift === 0 && same(answered.pixels, shot.pixels)) { answered.text = text; setStatus(answered.status); return; }
      }
      clear(); setStatus('Reading question and checking the answer…');
      const response = await send({ type: 'SOLVE', image: shot?.image || '', extractedQuestions: extracted });
      if (!enabled || version !== generation) return;
      if (response.paused) { setStatus('Paused. Bring this tab and window to the foreground.'); return; }
      if (response.error) { retryAt = Date.now() + (response.retryMs || 10000); setStatus(response.error); return; }
      // Reject the answer if the question changed while it was being worked out.
      let changed = location.href !== url;
      if (!changed && key) { const after = readPageQuestions(area); changed = after ? questionKey(after) !== key : docText() !== text; }
      else if (!changed && scrollX === origin.x && scrollY === origin.y) {
        const current = await snapshot();
        if (!enabled || version !== generation) return;
        changed = docText() !== text && Boolean(current.pixels) && !same(shot.pixels, current.pixels);
      } else if (!changed) changed = docText() !== text;
      if (changed) { setStatus('Question changed while reading. Scanning again…'); delay = 250; return; }
      answered = { key, text: docText(), url, origin, pixels: shot?.pixels };
      answered.status = render(response.questions || [], area, origin);
    } catch (error) {
      if (enabled && version === generation) { clear(); answered = null; setStatus(error.message || 'Could not scan this tab. Re-enable the extension.'); retryAt = Date.now() + 10000; }
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
  root.querySelector('#off').onclick = stop;
  root.querySelector('#rescan').onclick = () => { invalidate(); retryAt = 0; setStatus('Scanning…'); schedule(100); };
  root.querySelector('#area').onclick = chooseArea;
  root.querySelector('#reset').onclick = () => { crop = null; invalidate(); setStatus('Watching the full visible screen.'); schedule(200); };
  // Scrolling moves the highlights with the page; only a changed question triggers a new read.
  window.addEventListener('scroll', () => { if (enabled) requestAnimationFrame(reposition); }, { capture: true, passive: true });
  window.addEventListener('resize', () => { if (enabled) { crop = null; reposition(); schedule(800); } });
  document.addEventListener('visibilitychange', () => { if (enabled && !document.hidden) schedule(300); });
  // Check locally every 500ms whether the page text changed; scan() then decides if the question did.
  setInterval(() => {
    if (!enabled || busy || selecting || !answered || document.hidden) return;
    reposition();
    if (location.href !== answered.url || docText() !== answered.text) schedule(250);
  }, 500);
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.type === 'STATE') reply({ enabled, status });
    if (message.type === 'TOGGLE') {
      if (message.enabled) {
        enabled = true; interval = Math.min(60, Math.max(6, Number(message.interval) || 10)) * 1000;
        invalidate(); retryAt = 0; document.documentElement.append(host); hud.hidden = false; setStatus('Watching this tab. Scanning…'); schedule(300);
      } else stop();
      reply({ enabled, status });
    }
    if (message.type === 'AREA') { chooseArea(); reply({ ok: true }); }
    if (message.type === 'SCAN') { invalidate(); retryAt = 0; schedule(100); reply({ ok: true }); }
  });
})();
