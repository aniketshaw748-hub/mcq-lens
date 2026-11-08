import { questions as bank } from './test-questions.js';
const $ = id => document.getElementById(id);
const SET_SIZE = 25;
const params = new URLSearchParams(location.search);
// ?order=fixed gives the first 25 in bank order, for repeatable QA runs.
const pick = () => params.get('order') === 'fixed' ? bank.slice(0, SET_SIZE) : shuffle([...bank]).slice(0, SET_SIZE);
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}
let questions = pick();
let index = 0;
const selections = new Map();
const letter = n => String.fromCharCode(65 + n);
function render(focus = false) {
  const item = questions[index];
  const last = index === questions.length - 1;
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
    const caption = document.createElement('span'); caption.textContent = `${letter(option)}. ${text}`;
    label.append(input, caption); $('options').append(label);
  });
  $('previous').disabled = index === 0;
  $('next').textContent = last ? 'See results' : 'Next question →';
  if (focus) { $('question').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
}
function results() {
  const correct = questions.filter((item, i) => selections.get(i) === item.answer).length;
  const answered = selections.size;
  $('score').textContent = `You scored ${correct} out of ${questions.length}.`;
  $('score-note').textContent = answered < questions.length
    ? `${questions.length - answered} left unanswered. Below is the answer key for every question, so you can also check what MCQ Lens suggested.`
    : 'Below is the answer key for every question, so you can also check what MCQ Lens suggested.';
  $('review-list').replaceChildren(...questions.map((item, i) => {
    const li = document.createElement('li');
    const mine = selections.get(i);
    const status = mine === undefined ? 'Not answered' : mine === item.answer ? 'Correct' : 'Incorrect';
    li.className = mine === undefined ? 'skipped' : mine === item.answer ? 'right' : 'wrong';
    const head = document.createElement('p'); head.className = 'meta'; head.textContent = `${item.subject} · ${status}`;
    const q = document.createElement('p'); q.className = 'q'; q.textContent = item.question;
    const answer = document.createElement('p');
    answer.textContent = `Answer: ${letter(item.answer)}. ${item.options[item.answer]}`;
    li.append(head, q);
    if (item.code) { const code = document.createElement('pre'); code.textContent = item.code; li.append(code); }
    li.append(answer);
    if (mine !== undefined && mine !== item.answer) { const yours = document.createElement('p'); yours.className = 'yours'; yours.textContent = `Your answer: ${letter(mine)}. ${item.options[mine]}`; li.append(yours); }
    return li;
  }));
  $('quiz').hidden = true; $('results').hidden = false;
  window.scrollTo({ top: 0, behavior: 'instant' }); $('score').focus({ preventScroll: true });
}
function restart() {
  questions = pick(); index = 0; selections.clear();
  $('results').hidden = true; $('quiz').hidden = false; render(true);
}
$('next').onclick = () => { if (index < questions.length - 1) { index++; render(true); } else results(); };
$('previous').onclick = () => { if (index > 0) { index--; render(true); } };
$('restart').onclick = restart;
$('again').onclick = restart;
$('review').onclick = () => { $('results').hidden = true; $('quiz').hidden = false; render(true); };
fetch(`/api/visit?src=${encodeURIComponent(params.get('src') || 'extension-test')}`, { method: 'POST' }).catch(() => {});
render();
