import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const destination = path.resolve('.dev.vars');
let current = await readFile(destination, 'utf8').catch(() => '');
if (!/^ACCESS_SECRET=/m.test(current)) current += `\nACCESS_SECRET=${randomBytes(32).toString('hex')}\n`;
await writeFile(destination, current, { mode: 0o600 });
console.log('Local access signing secret configured. Provider keys stay in .dev.vars; never commit this file.');
