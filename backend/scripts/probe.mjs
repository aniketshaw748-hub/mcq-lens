import { readFile, writeFile, mkdir } from 'node:fs/promises';
const env = Object.fromEntries((await readFile('.dev.vars', 'utf8')).split(/\r?\n/).filter(x => x.includes('=')).map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
const cases = [
  { provider: 'zai', model: 'glm-4.7-flash', url: 'https://api.z.ai/api/paas/v4/chat/completions', key: env.ZAI_API_KEY },
  { provider: 'groq', model: 'openai/gpt-oss-120b', url: 'https://api.groq.com/openai/v1/chat/completions', key: env.GROQ_API_KEY },
  { provider: 'gemini', model: 'gemini-2.5-flash-lite', key: env.GEMINI_API_KEY }
];
const results = await Promise.all(cases.map(async item => {
  const start = Date.now();
  try {
    const gemini = item.provider === 'gemini';
    const body = gemini ? { contents: [{ parts: [{ text: 'What is 2 + 2? Reply with the number only.' }] }], generationConfig: { maxOutputTokens: 32 } } : { model: item.model, messages: [{ role: 'user', content: 'What is 2 + 2? Reply with the number only.' }], max_tokens: 128, ...(item.provider === 'zai' ? { thinking: { type: 'disabled' } } : { reasoning_effort: 'low' }) };
    const response = await fetch(item.url || `https://generativelanguage.googleapis.com/v1beta/models/${item.model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(gemini ? { 'x-goog-api-key': item.key } : { Authorization: `Bearer ${item.key}` }) }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const data = await response.json();
    const answer = gemini ? data.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('') : data.choices?.[0]?.message?.content;
    const limits = Object.fromEntries([...response.headers].filter(([key]) => /^x-ratelimit-(limit|remaining|reset)/.test(key)));
    return { provider: item.provider, model: item.model, status: response.status, ok: response.ok && /4/.test(answer || ''), elapsedMs: Date.now() - start, errorCode: data.error?.code || null, limits };
  } catch (error) { return { provider: item.provider, ok: false, error: error.name, elapsedMs: Date.now() - start }; }
}));
await mkdir('.local', { recursive: true });
await writeFile('.local/provider-check.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
