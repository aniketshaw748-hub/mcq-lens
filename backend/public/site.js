import { browsers, detect, visit } from './browsers.js';
// The main button offers the visitor's own browser.
const key = detect();
const button = document.getElementById('download');
button.href = `/install?browser=${key}&download=1`;
button.firstChild.textContent = `Download for ${browsers[key].name} `;
visit('landing');
