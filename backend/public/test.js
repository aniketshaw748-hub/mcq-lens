import { questions } from './test-questions.js';
const $ = id => document.getElementById(id);
let index = 0;
const selections = new Map();
function render(focus = false) {
  const item = questions[index];
  $('counter').textContent = `Question ${index + 1} of ${questions.length}`;
  $('position').textContent = `${index + 1} / ${questions.length}`;
  $('progress-fill').style.width = `${(index + 1) / questions.length * 100}%`;
  $('subject').textContent = `${item.subject} · ${item.topic}`;
  $('question').textContent = item.question;
  $('code').hidden = !item.code;
  $('code').textContent = item.code || '';
  $('options').querySelectorAll('label').forEach(element => element.remove());
  item.options.forEach((text, option) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'answer'; input.value = String(option); input.checked = selections.get(index) === option;
    input.onchange = () => selections.set(index, option);
    const caption = document.createElement('span'); caption.textContent = `${String.fromCharCode(65 + option)}. ${text}`;
    label.append(input, caption); $('options').append(label);
  });
  $('previous').disabled = index === 0;
  $('next').disabled = index === questions.length - 1;
  $('next').textContent = index === questions.length - 1 ? 'Last question' : 'Next question →';
  if (focus) { $('question').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
}
$('next').onclick = () => { if (index < questions.length - 1) { index++; render(true); } };
$('previous').onclick = () => { if (index > 0) { index--; render(true); } };
$('restart').onclick = () => { index = 0; selections.clear(); render(true); };
fetch(`/api/visit?src=${encodeURIComponent(new URLSearchParams(location.search).get('src') || 'extension-test')}`, { method: 'POST' }).catch(() => {});
render();
