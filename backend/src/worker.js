import { verifyAccess } from './auth.js';
import { routes, solveWith, DEFAULT_LIMITS, quotaLimits } from './providers.js';
import { solveMCQ, validateExtraction } from './mcq.js';
export { Quota } from './quota.js';

const STUDENT_LIMITS = { rpm: 12, rpd: 50, tpm: 1e9, tpd: 1e9, concurrent: 1 };
const json = (data, status = 200, extra = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...extra } });
async function bodyJSON(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request body.');
  const chunks = []; let length = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.length;
    if (length > 4200000) { await reader.cancel(); throw new Error('Question image is too large.'); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(buffer));
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const origin = request.headers.get('origin');
    const extensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/.test(origin || '');
    const allowed = !origin || origin === url.origin || extensionOrigin || (env.ALLOWED_ORIGINS || '').split(',').includes(origin);
    if (!allowed) return json({ error: 'Origin is not allowed.' }, 403);
    const cors = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } : {};
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const respond = (data, status = 200, headers = {}) => json(data, status, { ...cors, ...headers });
    if (url.pathname === '/api/visit' && request.method === 'POST') {
      const source = (url.searchParams.get('src') || 'direct').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'direct';
      const total = await env.QUOTA.getByName(`visits:${new Date().toISOString().slice(0, 10)}`).visit(source);
      return respond({ recorded: true, visits: total });
    }
    if (url.pathname === '/api/health') return respond({ ready: Boolean(env.ACCESS_SECRET && (env.ZAI_API_KEY || env.GROQ_API_KEY || env.GEMINI_API_KEY)), configured: { zai: Boolean(env.ZAI_API_KEY), groq: Boolean(env.GROQ_API_KEY), gemini: Boolean(env.GEMINI_API_KEY) }, capacityVerified: false });
    const token = request.headers.get('authorization')?.replace(/^Bearer /i, '');
    const student = await verifyAccess(env.ACCESS_SECRET, token);
    if (!student) return respond({ error: 'Open your student access link or enter your access code.' }, 401);
    if (url.pathname === '/api/provider-status' && request.method === 'GET') {
      if (student !== 'owner-diagnostics') return respond({ error: 'Owner access required.' }, 403);
      const status = await Promise.all(Object.keys(DEFAULT_LIMITS).map(async name => [name, await env.QUOTA.getByName(`provider:${name}`).status(quotaLimits(env, name), name === 'gemini' || name === 'search' ? 'pacific' : 'utc')]));
      return respond({ providers: Object.fromEntries(status) });
    }
    const quota = env.QUOTA.getByName(`student:${student}`);
    if (url.pathname === '/api/me' && request.method === 'GET') return respond({ student, used: (await quota.usage()).requests, dailyLimit: 50 });
    if (url.pathname !== '/api/answer' || request.method !== 'POST') return respond({ error: 'Route not found.' }, 404);
    let input;
    try {
      input = await bodyJSON(request);
      if (typeof input.question !== 'string' || input.question.length > 12000 || (input.image && (typeof input.image !== 'string' || input.image.length > 4000000 || !/^[A-Za-z0-9+/]+=*$/.test(input.image)))) throw new Error('Enter a question up to 12,000 characters and a JPEG image under 3 MB.');
      const extractedQuestions = input.extractedQuestions ? validateExtraction({ questions: input.extractedQuestions }) : undefined;
      input = { question: input.question.trim(), image: extractedQuestions?.length ? '' : input.image || '', webSearch: input.webSearch === true, mode: input.mode === 'mcq' ? 'mcq' : 'study', ...(extractedQuestions?.length ? { extractedQuestions } : {}) };
      if (!input.question && !input.image) throw new Error('Enter a question or attach an image.');
      if (input.mode === 'mcq' && ((!input.image && !input.extractedQuestions) || input.webSearch)) throw new Error('Screen scanning requires readable page questions or an image and does not use search.');
    } catch (error) { return respond({ error: error.message || 'Invalid request.' }, 400); }
    const providers = routes(env, input);
    if (!providers.length) return respond({ error: input.webSearch ? 'Web search needs the owner’s free-tier Gemini key. No search request was sent.' : 'The owner has not connected a provider for this question type yet.' }, 503);
    const lease = await quota.reserve({ limits: STUDENT_LIMITS, ttl: 90000, category: input.mode, replace: input.mode === 'mcq' });
    if (!lease.id) return respond({ error: lease.exhausted ? 'Your 50-question daily allowance is used. It resets at midnight UTC.' : lease.reason === 'busy' ? 'Your study answer is still running. This question will retry shortly.' : `Scan limit reached. Retrying in ${Math.ceil(lease.retryMs / 1000)} seconds.`, retryMs: lease.exhausted ? 0 : lease.retryMs, reason: lease.reason }, 429, { 'Retry-After': String(Math.ceil(lease.retryMs / 1000)) });
    let success = false;
    let finished = false, cancellationTimer;
    const superseded = new AbortController();
    const checkCancellation = async () => {
      if (finished) return;
      try { if (!await quota.active(lease.id)) { superseded.abort(); return; } }
      catch { superseded.abort(); return; }
      if (!finished) cancellationTimer = setTimeout(checkCancellation, 1500);
    };
    if (input.mode === 'mcq') cancellationTimer = setTimeout(checkCancellation, 1500);
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)));
      const hash = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
      const cacheKey = new Request(`${url.origin}/_answer-cache/${input.mode === 'mcq' ? 'mcq-v3' : 'v2'}/${hash}`);
      const cached = await caches.default.match(cacheKey);
      if (cached) { success = true; return respond({ ...await cached.json(), cached: true, remaining: lease.remaining }); }
      let retryMs = Infinity, failure;
      const timeout = AbortSignal.timeout(input.mode === 'mcq' ? 35000 : 65000);
      const signal = AbortSignal.any([request.signal, timeout, superseded.signal]);
      // Rotate the starting provider deterministically to distribute independent
      // questions without broadcasting each question to every API.
      const start = parseInt(hash.slice(0, 8), 16) % providers.length;
      for (let i = 0; i < (input.mode === 'mcq' ? 1 : providers.length); i++) {
        if (signal.aborted) break;
        const provider = providers[(start + i) % providers.length];
        try {
          const result = input.mode === 'mcq' ? await solveMCQ(env, input, signal) : await solveWith(env, provider, input, signal);
          if (superseded.signal.aborted || !await quota.active(lease.id)) return respond({ error: 'A newer question replaced this scan.', retryMs: 0, reason: 'superseded' }, 409);
          const ttl = input.webSearch ? 300 : 86400;
          ctx.waitUntil(caches.default.put(cacheKey, new Response(JSON.stringify(result), { headers: { 'Cache-Control': `public, max-age=${ttl}`, 'Content-Type': 'application/json' } })));
          success = true;
          console.log(JSON.stringify({ event: 'answer', provider: result.provider, model: result.model, mode: input.mode, search: input.webSearch }));
          return respond({ ...result, cached: false, remaining: lease.remaining });
        } catch (error) {
          failure = error;
          retryMs = Math.min(retryMs, error.retryMs || 60000);
          console.log(JSON.stringify({ event: 'provider_unavailable', provider: provider.name, stage: error.stage, reason: error.reason }));
        }
      }
      if (superseded.signal.aborted) return respond({ error: 'A newer question replaced this scan.', retryMs: 0, reason: 'superseded' }, 409);
      if (!Number.isFinite(retryMs)) retryMs = 60000;
      return respond({ error: `${failure?.stage ? failure.message : 'Free providers are unavailable right now. Please retry later.'} Your question was not deducted.`, retryMs, stage: failure?.stage, reason: failure?.reason }, 429, { 'Retry-After': String(Math.ceil(retryMs / 1000)) });
    } finally { finished = true; clearTimeout(cancellationTimer); await quota.release({ id: lease.id, refund: !success }); }
  }
};
