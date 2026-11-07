# MCQ Lens shared service

Live student app: **https://mcq-lens.pages.dev**. The Cloudflare Worker handles `/api/*` behind a Pages gateway. No access link is needed for now: each browser/extension sends a random install ID that keys its allowance. Users may add their own provider keys in the extension's Settings. No payment method was added and no paid service or paid model fallback was activated during setup.

## Owner access

Access links are off for now; old private links in `.local/student-invites.csv` still work but are optional. Each identity (signed link or anonymous install ID) gets **50 successful questions per UTC day**, including cached answers and extension scans. Use one identity per student. Links expire after 30 days; regenerating links preserves student IDs and does not reset their usage. These links grant account access: do not publish the CSV. The first link is also in `.local/start.html` for easy opening.

The root Chrome extension talks to https://mcq-lens.pages.dev with no setup. Owner provider keys stay in Cloudflare Worker secrets. A user's own keys arrive as `X-Groq-Key` / `X-Gemini-Key` / `X-Zai-Key` headers, replace the owner keys for that request, use their own quota pool and skip the 50/day cap; they are never stored or logged.

## Providers and zero-payment behavior

- Z.ai: only `glm-4.7-flash` (text/reasoning) and `glm-4.6v-flash` (vision), officially listed free. The initial live check returned HTTP 429 / overload code 1305. It is configured but availability is not established.
- Groq: only `openai/gpt-oss-120b` and `openai/gpt-oss-20b`. The live key answered successfully; observed headers showed 1,000 requests/day and 8,000 tokens/minute for GPT-OSS-120B. Token limits can bind well before request limits.
- Gemini: `gemini-2.5-flash-lite`; live text, screenshot and grounded search calls succeeded. This key was requested for a free-tier project without billing. A key connected to paid billing can incur provider charges; this application cannot inspect the Google project's billing status from the inference key.
- No Mistral, Cerebras, NVIDIA evaluation endpoint, paid Z.ai search tool, paid fallback, or automatic upgrade.
- Tavily is not connected: Gemini provides the implemented search capability, so a fourth key was unnecessary.

The router distributes different questions across eligible providers. It does not broadcast one question to every provider. Each user question has a fresh context. MCQs use validated question/option data followed by a reasoning step. The extension first extracts a complete visible radio-button question, code/data and every option from the page when reliable. The server validates this data and sends it directly to Groq GPT-OSS-120B (or another available text solver). This needs one upstream call and no vision allowance. Other layouts and image/canvas questions fall back to Gemini (or Z.ai vision) transcription followed by text reasoning, needing at least two upstream calls. A single-answer question with multiple selections is rejected, never rendered. The student is charged one successful question. Old one-stage MCQ cache entries are no longer used. Calculator tool turns remain within the study question and are separately quota-accounted. Groq and Z.ai study answers use a bounded arithmetic parser; Gemini study answers can use code execution. This is not a full symbolic-math engine, and model correctness is not guaranteed.

## Limits and coordination

SQLite-backed Durable Objects enforce quotas across Worker instances. There is one object per student and per provider pool; Z.ai text/vision share one pool. Each student may start twelve requests/minute and receive fifty successful questions/day. A newer MCQ replaces the student's obsolete MCQ lease, refunds its daily reservation, and aborts the old Worker pipeline after a periodic cancellation check. A currently running study-page answer is preserved. In-flight and per-minute errors have distinct reasons and accurate retry times. Failed answers refund the daily student reservation. Upstream failures remain conservatively charged against local provider allowances; already-used provider quota cannot be recovered by cancelling. Authentication errors pause the affected provider instead of repeatedly retrying it.

`src/providers.js` contains local admission limits. **These are caps, not verified provider entitlements.** Gemini defaults conservatively to 5 requests/minute and 20/day until the owner's account dashboard establishes its allowance. Z.ai defaults to one in-flight request; its daily/token caps are application budgets, not published free-provider guarantees. Groq defaults reflect the public free limits. Set `PROVIDER_LIMITS` as a JSON object in Worker variables only after checking actual account allowances. Image token reservations are estimates; providers' own counters remain authoritative.

Owner diagnostics: `node scripts/provider-status.mjs` signs a short-lived owner-only token and reads sanitized provider counters from `/api/provider-status`. Student tokens cannot access that endpoint. Failures log only stage, provider, HTTP status and category, never prompts or credentials. API errors distinguish reading from solving; failed questions still refund the student reservation.

The app retries a busy question twice with a visible countdown. This is browser-side waiting, not a durable server queue; closing the page abandons that wait. The extension also retries after provider backoff. Questions that do not finish do not consume a successful-answer allowance.

**5,000 real answers in one hour is NOT verified or guaranteed.** The backend passed simulated concurrency tests, which do not establish upstream free inference capacity. Do not advertise the 50-question allowance as a promise of immediate or guaranteed availability.

## Cache, privacy and analytics

Exact questions are hashed for cache lookup. Answers are cached for 24 hours; grounded answers for 5 minutes. Raw images are not stored by the application. Cached outputs may contain question text. Student usage counters and provider quotas persist. Daily visit counts store a referral tag, not question content or IP addresses. The deployed `/api/visit?src=setup-test` endpoint recorded the verification visit. Runtime logs record provider/mode/outcome only.

The privacy page is `/privacy.html`. The publisher must add a contact address and review provider terms before Chrome Web Store submission. No store submission or payment was made.

## Local commands

```sh
npm ci
npm run assets
npm run prepare:local
npm run dev
```

Keep `ACCESS_SECRET`, `ZAI_API_KEY`, `GROQ_API_KEY`, and `GEMINI_API_KEY` in ignored `.dev.vars`. `ACCESS_SECRET` signs student identities: changing it revokes every link. Provider key values never belong in the extension, frontend assets, or a shared zip.

```sh
npm test
node tests/runtime.mjs
node tests/ui.mjs
node tests/live-mcq.mjs
npm run check
```

Runtime tests use real local Durable Objects and simulated provider replies. UI and live-MCQ tests consume a small amount of real free provider quota. The live-MCQ test captures an actual Chrome-rendered question and checks that the selected option and highlighted row agree. DOM options are located by matching answer text; image-only coordinate placement still depends on the model and can be imprecise.

## Deploy

The Worker is `mcq-lens` and the Pages project is `mcq-lens`, with production branch `main`. Both belong to the existing Cloudflare account used for setup. No billing activation was performed. The OAuth token cannot read account subscriptions, so the existing account's billing status was not independently verified.

```sh
npm run assets
npm run check
npm run deploy
node scripts/upload-secrets.mjs
node scripts/pages.mjs https://mcq-lens.aniketshaw748.workers.dev
npx wrangler pages deploy .local/pages --project-name mcq-lens --branch main --commit-dirty=true
npm run invites -- --count 100 --url https://mcq-lens.pages.dev
```

Run dependent commands only after their preceding command succeeds. Secret upload uses a temporary ignored JSON file, removes it afterwards, and prints secret names only. Local provider checks are in `.local/provider-check.json` and are not exposed publicly. For a final handoff, include source and public assets but exclude `.dev.vars`, `.local`, `.wrangler`, backups, node_modules and test results.
