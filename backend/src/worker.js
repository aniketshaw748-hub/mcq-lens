import { verifyAccess } from './auth.js';
import { routes, solveWith, DEFAULT_LIMITS, quotaLimits } from './providers.js';
import { solveMCQ, validateExtraction } from './mcq.js';
import { validateReport } from './reports.js';
export { Quota } from './quota.js';
export { Reports } from './reports.js';

const STUDENT_LIMITS = { rpm: 12, rpd: 50, tpm: 1e9, tpd: 1e9, concurrent: 1 };
// Open access: no student link is needed. Each browser/extension sends a random install ID so the
// per-person allowance still works; a hashed IP is the fallback.
async function anonymousId(request) {
  const client = request.headers.get('x-client-id');
  if (/^[a-zA-Z0-9-]{8,80}$/.test(client || '')) return `anon-${client}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(request.headers.get('cf-connecting-ip') || 'unknown'));
  return `ip-${Array.from(new Uint8Array(digest).slice(0, 12), x => x.toString(16).padStart(2, '0')).join('')}`;
}
// Keys a user adds in the extension's Settings replace the owner's keys for that request only.
// They are never stored or logged, and get their own provider quota pool.
async function withUserKeys(request, env) {
  const keys = Object.fromEntries([['GROQ_API_KEY', 'x-groq-key'], ['GEMINI_API_KEY', 'x-gemini-key'], ['ZAI_API_KEY', 'x-zai-key']]
    .map(([name, header]) => [name, request.headers.get(header)]).filter(([, value]) => /^[!-~]{10,300}$/.test(value || '')));
  if (!Object.keys(keys).length) return env;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(keys)));
  return { ...env, GROQ_API_KEY: keys.GROQ_API_KEY, GEMINI_API_KEY: keys.GEMINI_API_KEY, ZAI_API_KEY: keys.ZAI_API_KEY, KEY_POOL: Array.from(new Uint8Array(digest).slice(0, 16), x => x.toString(16).padStart(2, '0')).join('') };
}
const REPORT_LIMITS = { rpm: 10, rpd: 100, tpm: 1e9, tpd: 1e9, concurrent: 100 };
const OWN_KEY_LIMITS = { rpm: 60, rpd: 1e9, tpm: 1e9, tpd: 1e9, concurrent: 1 };
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
    const extensionOrigin = /^(chrome-extension:\/\/[a-p]{32}|moz-extension:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(origin || '');
    const allowed = !origin || origin === url.origin || extensionOrigin || (env.ALLOWED_ORIGINS || '').split(',').includes(origin);
    if (!allowed) return json({ error: 'Origin is not allowed.' }, 403);
    const cors = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Client-Id, X-Groq-Key, X-Gemini-Key, X-Zai-Key', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } : {};
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const respond = (data, status = 200, headers = {}) => json(data, status, { ...cors, ...headers });
    if (url.pathname === '/api/visit' && request.method === 'POST') {
      const source = (url.searchParams.get('src') || 'direct').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'direct';
      const total = await env.QUOTA.getByName(`visits:${new Date().toISOString().slice(0, 10)}`).visit(source);
      return respond({ recorded: true, visits: total });
    }
    if (url.pathname === '/api/health') return respond({ ready: Boolean(env.ACCESS_SECRET && (env.ZAI_API_KEY || env.GROQ_API_KEY || env.GEMINI_API_KEY)), configured: { zai: Boolean(env.ZAI_API_KEY), groq: Boolean(env.GROQ_API_KEY), gemini: Boolean(env.GEMINI_API_KEY) }, capacityVerified: false });
    const token = request.headers.get('authorization')?.replace(/^Bearer /i, '');
    const verified = await verifyAccess(env.ACCESS_SECRET, token);
    if (url.pathname === '/api/provider-status' && request.method === 'GET') {
      if (verified !== 'owner-diagnostics') return respond({ error: 'Owner access required.' }, 403);
      const status = await Promise.all(Object.keys(DEFAULT_LIMITS).map(async name => [name, await env.QUOTA.getByName(`provider:${name}`).status(quotaLimits(env, name), name === 'gemini' || name === 'search' ? 'pacific' : 'utc')]));
      return respond({ providers: Object.fromEntries(status) });
    }
    if (url.pathname === '/api/reports' && request.method === 'GET') {
      if (verified !== 'owner-diagnostics') return respond({ error: 'Owner access required.' }, 403);
      const store = env.REPORTS.getByName('all'), id = Number(url.searchParams.get('id'));
      if (id) return respond({ report: await store.get(id) });
      if (url.searchParams.has('list')) return respond({ reports: await store.list(url.searchParams.get('signature') || '', Math.min(100, Number(url.searchParams.get('limit')) || 20)) });
      return respond({ groups: await store.summary() });
    }
    const student = verified || await anonymousId(request);
    if (url.pathname === '/api/report' && request.method === 'POST') {
      let report;
      try { report = validateReport(await bodyJSON(request)); } catch (error) { return respond({ error: error.message || 'Invalid report.' }, 400); }
      const lease = await env.QUOTA.getByName(`reports:${student}`).reserve({ limits: REPORT_LIMITS, ttl: 1 });
      if (!lease.id) return respond({ error: 'Too many reports from this browser. Try again later.', retryMs: lease.retryMs }, 429);
      return respond({ received: true, id: await env.REPORTS.getByName('all').add(report, student) });
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
    const providerEnv = await withUserKeys(request, env);
    const providers = routes(providerEnv, input);
    if (!providers.length) return respond({ error: input.webSearch ? 'Web search needs the owner’s free-tier Gemini key. No search request was sent.' : 'The owner has not connected a provider for this question type yet.' }, 503);
    const lease = await quota.reserve({ limits: providerEnv.KEY_POOL ? OWN_KEY_LIMITS : STUDENT_LIMITS, ttl: 90000, category: input.mode, replace: input.mode === 'mcq' });
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
          const result = input.mode === 'mcq' ? await solveMCQ(providerEnv, input, signal) : await solveWith(providerEnv, provider, input, signal);
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
