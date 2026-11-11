import { browsers, detect, visit } from './browsers.js';
// Download buttons offer the visitor's own browser.
const key = detect();
document.querySelectorAll('[data-download]').forEach(link => { link.href = `/install?browser=${key}&download=1`; });
document.getElementById('download').textContent = `Download for ${browsers[key].name}`;
visit('landing');
// The how-to video shows a labelled play button over its poster; once started, the browser's own controls take over.
document.querySelectorAll('[data-play]').forEach(button => button.addEventListener('click', () => {
  const video = button.parentElement.querySelector('video');
  video.controls = true;
  button.hidden = true;
  video.play();
}));
