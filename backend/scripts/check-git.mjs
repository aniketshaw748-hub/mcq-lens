import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
const secrets = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => line.slice(line.indexOf('=') + 1).trim()).filter(value => value.length >= 12);
const files = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']).trim().split('\n').filter(Boolean);
const unsafe = [];
for (const file of files) {
  if (/(^|\/)(?:\.local|\.wrangler|node_modules|backups|test-results)(?:\/|$)|(?:^|\/)\.dev.vars|\.zip$|\.pem$/.test(file)) { unsafe.push(file); continue; }
  const text = git(['show', `:${file}`]);
  if (secrets.some(value => text.includes(value)) || /AIzaSy[A-Za-z0-9_-]{30,}|gsk_[A-Za-z0-9]{30,}|gh[pousr]_[A-Za-z0-9]{30,}/.test(text)) unsafe.push(file);
}
if (unsafe.length) throw new Error(`Private data detected in staged paths: ${unsafe.join(', ')}`);
console.log(`PASS ${files.length} staged files checked; no configured secrets, provider-key patterns or private/generated files.`);
