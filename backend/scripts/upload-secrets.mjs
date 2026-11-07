import { readFile, writeFile, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const contents = await readFile('.dev.vars', 'utf8');
const secrets = Object.fromEntries(contents.split(/\r?\n/).filter(x => /^[A-Z_]+=/.test(x)).map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
const file = '.local/secrets-upload.json';
await writeFile(file, JSON.stringify(secrets), { mode: 0o600 });
try {
  const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk', file], { stdio: 'inherit', windowsHide: true });
  const code = await new Promise(resolve => child.on('exit', resolve));
  if (code !== 0) throw new Error('Secret upload failed.');
} finally { await unlink(file); }
