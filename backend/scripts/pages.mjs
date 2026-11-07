import { cp, mkdir, writeFile } from 'node:fs/promises';
const backend = new URL(process.argv[2]);
if (backend.protocol !== 'https:') throw new Error('Expected HTTPS Worker origin.');
await mkdir('.local/pages', { recursive: true });
await cp('public', '.local/pages', { recursive: true });
await writeFile('.local/pages/_worker.js', `export default { fetch(request, env) { const u = new URL(request.url); if (!u.pathname.startsWith('/api/')) return env.ASSETS.fetch(request); const target = new URL(u.pathname + u.search, ${JSON.stringify(backend.origin)}); return fetch(new Request(target, request)); } };\n`);
await writeFile('.local/pages/_routes.json', JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }));
console.log('Pages frontend and API gateway prepared.');
