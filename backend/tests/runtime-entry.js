import worker from '../src/worker.js';
export { Quota } from '../src/quota.js';
export default {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/test/reserve') return request.json().then(async args => Response.json(await env.QUOTA.getByName(args.name).reserve(args)));
    if (new URL(request.url).pathname === '/test/active') return request.json().then(async args => Response.json(await env.QUOTA.getByName(args.name).active(args.id)));
    if (new URL(request.url).pathname === '/test/release') return request.json().then(async args => { await env.QUOTA.getByName(args.name).release(args); return Response.json({ ok: true }); });
    if (new URL(request.url).pathname === '/test/usage') return request.json().then(async args => Response.json(await env.QUOTA.getByName(args.name).usage()));
    return worker.fetch(request, env, ctx);
  }
};
