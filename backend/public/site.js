import { browsers, detect, visit } from './browsers.js';
// Download buttons offer the visitor's own browser.
const key = detect();
document.querySelectorAll('[data-download]').forEach(link => { link.href = `/install?browser=${key}&download=1`; });
document.getElementById('download').textContent = `Download for ${browsers[key].name}`;
visit('landing');
