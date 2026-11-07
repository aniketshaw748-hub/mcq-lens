# MCQ Lens project

- Root is the Chrome extension. `backend/` is the Cloudflare Worker and study page. Its MCQ transcription/selection schema lives in backend/src/mcq.js; the root solver.js handles extension transport and personal-key compatibility.
- Live frontend: https://mcq-lens.pages.dev. Backend Worker: `mcq-lens`. Pages production branch: `main`. Never overwrite other Cloudflare projects.
- Keys are in Worker secrets and ignored `backend/.dev.vars`. Private student links and QA outputs are under ignored `backend/.local/`. Never print or package them.
- Default models are fixed free-tier choices. Do not add paid fallbacks, upgrade plans, or activate billing. Google/Groq account billing state cannot be inferred from an API key.
- Provider daily/token/concurrency caps are local admission controls, not promises of actual provider capacity. 5,000 real answers/hour remains unverified.
- Quota is a SQLite-backed Durable Object keyed per student/provider; never replace it with isolate-local Maps. Z.ai text and vision share its provider pool.
- Tests using `tests/ui.mjs`, `tests/live-mcq.mjs`, and `scripts/smoke.mjs` in backend make real provider calls; keep usage small. `tests/runtime.mjs` uses fake provider replies and real local Durable Objects.
- Installed Miniflare 5 requires `convertV4MiniflareOptions` for tests using the version-4-style constructor options. Its README still shows the old constructor directly.
- Model answer coordinates can be wrong. Prefer exact visible DOM option text; verify actual live screenshot highlighting. Image-only coordinates remain approximate.
- Page-text extraction must include the actual question plus code/data and every option. A fieldset legend such as "Choose one answer" describes controls and is not the question. Refuse clipped options or image/canvas content and fall back to screenshot reading.
- Screenshot MCQs must use backend/src/mcq.js (transcription → reasoning → validated option indices), never the generic vision study solver. Reject multiple selections for a single-answer question. Latest MCQ work supersedes obsolete MCQ leases; student rate admission is 12/minute and the successful daily allowance remains 50.
- When simulating extension injection with Playwright addScriptTag on the hosted app, use a test browser context with bypassCSP enabled; the real extension's isolated-world injection is not subject to page CSP. Never weaken the deployed CSP for this test harness.
- Assets are vendored by `npm run assets` in backend; run this after `npm ci`. Pages assets must be rebuilt with `scripts/pages.mjs` after frontend changes.
- Source zip uses a positive file allowlist. Run `scripts/check-packages.mjs` from backend before archiving or sharing either zip.
