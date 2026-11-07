# MCQ Lens — current handoff

As of 2026-11-08: deployed and working at https://mcq-lens.pages.dev. Root extension version comes from `manifest.json` (currently 1.1.1).

## Locked requirements

- Owner keys only; no student provider setup.
- No payment or payment-method addition; no paid fallback.
- 50 successful questions per student per UTC day, each with a fresh context.
- College explanations, mathematical rendering/calculation tools, optional web search, and automatic MCQ screen highlighting.
- Peak target: 100 students × 50 questions within one hour. This target is not proven; do not imply otherwise.

## Live state

- Added `/test.html`: 50 original hard MCQs drawn from the MAKAUT 2023–24 fifth-semester core technical syllabus, one at a time with Next/Previous/Restart. Subjects: Operating Systems (14), Compiler Design (14), OOP (12), Software Engineering (10). No answer key is loaded into the page. The public syllabus reference is linked in its footer. No student sign-in or AI calls are required to browse the test questions.
- Test-page verification passed all 50 question transitions, exactly four options per question, Previous, Restart, the last-question boundary, and mobile overflow checks. A production test using the actual extension watcher plus live AI confirmed automatic re-answering after Next; no browser runtime errors. Test artifact: `dist/MAKAUT-Sem5-MCQ-Test.zip`.
- RESOLVED 2026-11-08: the user showed two issues—"suggesting all 4 answers" and the combined previous-answer/asking-too-quickly error. The old single-stage vision path confused option extraction with answer selection. MCQs now use validated transcription followed by a text reasoning model (Groq GPT-OSS-120B preferred). Live checks selected only B (6.5 ms) for Q1 and C (16/3 ms) for Q2 with computed waiting times. Old MCQ cache namespace v2 is not reused; new answers use mcq-v3. Direct personal-key mode rejects multiple answers unless the question explicitly allows them.
- New MCQ requests supersede old MCQ leases, refund their student daily reservation, and abort obsolete work via periodic cancellation checks. Student admission is now 12 requests/minute, still 50 successful questions/day. Study-page work is preserved. Real Durable Object/Worker tests verify replacement, stale-response rejection, accurate retry reasons and one successful-question charge; provider quotas remain enforced.

- Existing Cloudflare OAuth account used. Worker `mcq-lens`, SQLite-backed `Quota` Durable Objects, Pages `mcq-lens`, production branch `main`.
- Worker secrets: ACCESS_SECRET, ZAI_API_KEY, GROQ_API_KEY, GEMINI_API_KEY. No values belong in this document or deliverables.
- Live Groq and Gemini checks succeeded. Z.ai GLM-4.7-Flash initially returned HTTP 429 / overload 1305; it remains configured with conservative concurrency and backoff.
- Search uses Gemini grounding. Tavily was not connected because the implemented search path did not need a fourth key.
- First-party visit analytics are enabled and a production test visit was recorded.
- 100 private student links are in `backend/.local/student-invites.csv`; private launch page `backend/.local/start.html`. Both are excluded from public assets and archives.
- Chrome Web Store publication was discussed, not authorized or performed. A new developer account needs a one-time registration fee. STORE-READINESS.md lists remaining listing requirements.

## Verification and limits

Passed root unit tests, real browser watcher tests, unpacked-extension/settings tests, backend unit tests, and real Durable Object concurrency tests. A simulated 100-student request test verifies application coordination only.

Production browser tests passed student access, live math answers, rendered equations, mobile layout, web source links, Markdown, single-dollar math and HTML sanitization. Production screenshot → AI → extension highlight test chose 4 for 2+2 and fully overlapped the correct actual option row.

The first live highlight test exposed a real model-coordinate error: it chose 4 but placed the box on option 3. Fixed by matching answer text to visible DOM option elements. For image-only questions, highlighting still relies on estimated model coordinates and can be inaccurate.

Unverified: sustained 5,000 real answers/hour, Z.ai successful inference, every target quiz layout and image-only coordinate reliability. Cloudflare OAuth lacks subscription-read access, so pre-existing account billing status was not independently inspected. No billing activation, card entry or paid fallback was performed.

## Files and deployment

- Extension install folder: `C:\Coding\MCQ-Lens`.
- Backend source/deploy instructions: `backend/README.md`.
- Extension package: `dist/MCQ-Lens-v1.1.1.zip`.
- Complete source package: `dist/MCQ-Lens-source-v1.1.1.zip`.
- Both packages are checked for actual key values and private configuration before sharing. Package filenames should be derived from the manifest version on future builds.
- Backups of the original personal-key-only extension are in `backups/2026-11-07-shared-backend/` and are not shipped.
