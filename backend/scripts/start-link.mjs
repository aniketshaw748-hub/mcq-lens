import { readFile, writeFile } from 'node:fs/promises';
const first = (await readFile('.local/student-invites.csv', 'utf8')).split('\n')[1].split(',').slice(1).join(',');
await writeFile('.local/start.html', `<!doctype html><html lang="en"><meta charset="utf-8"><title>Your private MCQ Lens access</title><body style="font:18px system-ui;padding:60px"><h1>Your study app is ready.</h1><p>This private link uses student-001's 50-question allowance.</p><a href="${first}">Open MCQ Lens</a><p>Keep this file private. Copy its complete link into the extension's Settings to connect.</p></body></html>`, { mode: 0o600 });
console.log('Private launch page saved to .local/start.html.');
