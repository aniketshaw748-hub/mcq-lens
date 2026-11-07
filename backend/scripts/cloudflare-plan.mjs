import { readFile } from 'node:fs/promises';
import path from 'node:path';
const config = await readFile(path.join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml'), 'utf8');
const token = config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if (!token) throw new Error('Cloudflare OAuth credential unavailable.');
const response = await fetch('https://api.cloudflare.com/client/v4/accounts/c182672957ea06c76aa0bbcf78487dfb/subscriptions', { headers: { Authorization: `Bearer ${token}` } });
const data = await response.json();
console.log(JSON.stringify({ status: response.status, plans: data.result?.map(x => ({ name: x.rate_plan?.public_name || x.rate_plan?.id, state: x.state, price: x.price })) || [] }));
