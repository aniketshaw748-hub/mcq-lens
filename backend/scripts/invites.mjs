import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { signAccess } from '../src/auth.js';
const config = await readFile('.dev.vars', 'utf8');
const secret = config.match(/^ACCESS_SECRET=(.+)$/m)?.[1].trim();
if (!secret) throw new Error('Run npm run prepare:local first.');
const args = process.argv.slice(2);
const count = Number(args[args.indexOf('--count') + 1]) || 100;
const url = args.includes('--url') ? args[args.indexOf('--url') + 1].replace(/\/$/, '') : 'http://127.0.0.1:8787';
if (count < 1 || count > 1000) throw new Error('Count must be 1–1000.');
await mkdir('.local', { recursive: true });
const rows = ['student,access_link'];
for (let i = 1; i <= count; i++) {
  const id = `student-${String(i).padStart(3, '0')}`;
  const token = await signAccess(secret, id, Date.now() + 30 * 86400000);
  rows.push(`${id},${url}/#access=${token}`);
}
await writeFile('.local/student-invites.csv', rows.join('\n'), { mode: 0o600 });
console.log(`Created ${count} private student links in .local/student-invites.csv. Each identity gets 50 questions/day.`);
