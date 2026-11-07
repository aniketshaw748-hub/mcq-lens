import { readFile } from 'node:fs/promises';
import { signAccess } from '../src/auth.js';
const secret = (await readFile('.dev.vars', 'utf8')).match(/^ACCESS_SECRET=(.+)$/m)?.[1].trim();
const token = await signAccess(secret, 'owner-diagnostics', Date.now() + 60000);
const response = await fetch(`${process.argv[2] || 'https://mcq-lens.pages.dev'}/api/provider-status`, { headers: { Authorization: `Bearer ${token}` } });
console.log(JSON.stringify({ status: response.status, ...await response.json() }, null, 2));
