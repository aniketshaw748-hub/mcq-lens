// Read bug reports. Owner only.
//   node scripts/reports.mjs              groups of errors, newest first, with counts
//   node scripts/reports.mjs --id 42      one report in full (screenshot saved to .local/reports/)
//   node scripts/reports.mjs --list [n]   the latest n reports
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { signAccess } from '../src/auth.js';
const secret = (await readFile('.dev.vars', 'utf8')).match(/^ACCESS_SECRET=(.+)$/m)?.[1].trim();
const token = await signAccess(secret, 'owner-diagnostics', Date.now() + 60000);
const base = process.env.MCQ_LENS_URL || 'https://mcq-lens.pages.dev';
const get = async query => {
  const response = await fetch(`${base}/api/reports${query}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Reports request failed: ${response.status}`);
  return response.json();
};
const when = time => `${new Date(time).toISOString().replace('T', ' ').slice(0, 16)} UTC`;
const args = process.argv.slice(2);
if (args[0] === '--id') {
  const { report } = await get(`?id=${Number(args[1])}`);
  if (!report) throw new Error('No report with that id.');
  const { screenshot, events, ...rest } = report;
  console.log(JSON.stringify({ ...rest, time: when(rest.time) }, null, 2));
  console.log('\nWhat the extension did (ms since it was enabled):');
  for (const event of events) console.log(`  ${String(event.t).padStart(8)}  ${event.type.padEnd(16)} ${event.detail}`);
  if (screenshot) {
    await mkdir('.local/reports', { recursive: true });
    const file = `.local/reports/report-${report.id}.jpg`;
    await writeFile(file, Buffer.from(screenshot, 'base64'));
    console.log(`\nScreenshot saved: backend/${file}`);
  }
} else if (args[0] === '--list') {
  const { reports } = await get(`?list&limit=${Number(args[1]) || 20}`);
  for (const r of reports) console.log(`#${r.id}  ${when(r.time)}  ${r.kind.padEnd(4)}  v${r.version}  ${r.site.padEnd(28)} ${r.stage || '-'}: ${r.message}${r.note ? `  · note: ${r.note.slice(0, 60)}` : ''}${r.hasScreenshot ? '  [screenshot]' : ''}`);
} else {
  const { groups } = await get('');
  if (!groups.length) console.log('No reports yet.');
  for (const g of groups) {
    const [kind, stage, reason, message] = g.signature.split('|');
    console.log(`${String(g.count).padStart(5)}× ${String(g.users).padStart(3)} users  last ${when(g.last)}  ${kind.padEnd(4)} ${stage}/${reason}  ${message}   (latest: --id ${g.latest})`);
  }
}
