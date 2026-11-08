import { browsers, detect, visit } from './browsers.js';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Every download button offers the visitor's own browser.
const key = detect();
document.querySelectorAll('[data-download]').forEach(link => {
  link.href = `/install?browser=${key}&download=1`;
  if (link.id === 'download' || link.closest('.final')) link.firstChild.textContent = `Download for ${browsers[key].name} `;
});

// Scroll reveals: one observer, each element animates in once.
const io = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
}), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));
requestAnimationFrame(() => document.documentElement.classList.add('loaded'));

// The lens drifts on its own and eases toward the pointer while you move it.
const stage = document.getElementById('lens');
if (stage) {
  const answer = stage.querySelector('.layer--base .answer');
  const home = () => {
    const s = stage.getBoundingClientRect(), a = answer.getBoundingClientRect();
    return { x: (a.left + a.width * 0.3 - s.left) / s.width * 100, y: (a.top + a.height / 2 - s.top) / s.height * 100 };
  };
  let pos = home(), target = null, visible = false, frame = 0, start = performance.now();
  const paint = () => { stage.style.setProperty('--lx', `${pos.x}%`); stage.style.setProperty('--ly', `${pos.y}%`); };
  const tick = now => {
    const t = (now - start) / 1000;
    const goal = target || { x: 52 + 24 * Math.sin(t * 0.42), y: 56 + 18 * Math.sin(t * 0.67 + 1) };
    pos = { x: pos.x + (goal.x - pos.x) * 0.09, y: pos.y + (goal.y - pos.y) * 0.09 };
    paint();
    frame = visible ? requestAnimationFrame(tick) : 0;
  };
  const point = event => {
    const s = stage.getBoundingClientRect();
    target = { x: (event.clientX - s.left) / s.width * 100, y: (event.clientY - s.top) / s.height * 100 };
    if (reduce) { pos = target; paint(); }
  };
  stage.addEventListener('pointermove', point);
  stage.addEventListener('pointerdown', point);
  // Keyboard: arrow keys move the lens; it stays where you leave it until the pointer takes over.
  stage.addEventListener('keydown', event => {
    const step = { ArrowLeft: [-4, 0], ArrowRight: [4, 0], ArrowUp: [0, -4], ArrowDown: [0, 4] }[event.key];
    if (!step) return;
    event.preventDefault();
    const from = target || pos;
    target = { x: Math.min(95, Math.max(5, from.x + step[0])), y: Math.min(95, Math.max(5, from.y + step[1])) };
    if (reduce) { pos = target; paint(); }
  });
  stage.addEventListener('pointerleave', () => { if (document.activeElement === stage) return; target = null; if (reduce) { pos = home(); paint(); } });
  paint();
  if (!reduce) new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !frame) { start = performance.now() - 2000; frame = requestAnimationFrame(tick); }
  }).observe(stage);
}
visit('landing');
