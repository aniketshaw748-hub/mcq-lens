export const SERVICE_URL = 'https://mcq-lens.pages.dev';

// Works with no setup. Optional own keys from Settings travel only as request headers to the
// MCQ Lens service, which uses them for this request instead of the shared keys.
export async function solve(settings, image, signal, extractedQuestions) {
  const headers = { 'Content-Type': 'application/json', 'X-Client-Id': settings.clientId };
  const gemini = settings.geminiKey || settings.apiKey; // apiKey: personal Gemini key saved before version 1.2
  if (settings.groqKey) headers['X-Groq-Key'] = settings.groqKey;
  if (gemini) headers['X-Gemini-Key'] = gemini;
  if (settings.zaiKey) headers['X-Zai-Key'] = settings.zaiKey;
  const response = await fetch(`${SERVICE_URL}/api/answer`, {
    method: 'POST', headers,
    body: JSON.stringify({ question: 'Solve the visible multiple-choice questions.', ...(extractedQuestions?.length ? { extractedQuestions } : { image }), mode: 'mcq' }), signal
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Study service unavailable.'), { status: response.status, retryMs: data.retryMs, reason: data.reason, stage: data.stage });
  return data.questions || [];
}

// Bug report: the extension's own steps and the error, plus a screenshot only if the user attached one.
export async function sendReport(settings, report) {
  const response = await fetch(`${SERVICE_URL}/api/report`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Id': settings.clientId }, body: JSON.stringify(report) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Report failed (${response.status}).`);
  return data;
}
