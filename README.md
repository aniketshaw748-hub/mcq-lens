# MCQ Lens

Shared study app: https://mcq-lens.pages.dev

The Chrome extension now supports the owner's shared AI service. Students need a private access link, not provider accounts or API keys. The earlier personal Gemini-key mode remains optional.

## Install the extension

1. Extract the extension zip, or use this source folder directly.
2. Open chrome://extensions, enable Developer mode, and choose Load unpacked.
3. Select the folder containing manifest.json (C:\Coding\MCQ-Lens for the local source).
4. Open extension Settings and paste your complete private student link.
5. Allow the requested access to that study-service origin.
6. Open a question tab, enable MCQ Lens, and choose an area around the question and ALL options.

Only enabled tabs are scanned. Hidden tabs and unfocused windows pause. Reloading or navigating switches scanning off. Scroll removes old highlights and rescans; resize resets the selected area. Screenshots are sent only when the selected image changes. Timers and animations may cause extra scans, so keep them outside the selected area. The interval defaults to 10 seconds and is configurable from 6–60 seconds.

The shared service permits 50 successful questions per student per UTC day. Every answered changed screenshot counts, including a cached answer. Failed answers refund the daily allowance. Availability depends on the providers' free quotas; the allowance is not a guarantee that all questions can be answered immediately. The extension never clicks or submits answers.

## Owner setup

The shared backend source and deployment instructions are in backend/README.md. Private student access links are in backend/.local/student-invites.csv; backend/.local/start.html opens the first student's link. These are access credentials: keep them private. Neither file is included in public deployments or deliverable zips.

Provider keys live in Cloudflare Worker secrets and the local ignored backend/.dev.vars. They are not distributed in this extension. Z.ai free Flash models, Groq GPT-OSS models and Gemini are configured. Gemini supplies web search for the separate study-question page; the screen-scanning extension does not search the web.

## Privacy and correctness

While enabled, screenshot crops go to the owner's server and its configured vision provider (Z.ai or Gemini), or directly to Google when using a personal key. Crop out personal data. The application processes raw screenshots in memory. Answers may be cached for 24 hours, or 5 minutes for search-backed answers. Provider-side processing follows provider terms, including free-tier terms. The extension stores its student access code locally in the Chrome profile, not Chrome Sync.

Green marks a high-confidence AI suggestion; amber marks uncertainty. Confidence is the model's subjective judgment. The panel gives the option text and explanation. Highlight placement uses the actual page option when its text matches the answer. For image-only questions, boxes depend on the model's estimated coordinates and can be imprecise. All question text and options must be readable and visible. Answers can be wrong.

Protected Chrome pages, the Web Store and the built-in PDF viewer do not support injection. The extension requests temporary active-tab access, scripting and local storage. A student connection adds permission for only that service origin. Optional host declarations allow you to choose the service, not always-on access to every website.

Privacy page: https://mcq-lens.pages.dev/privacy.html

## Verification

The shared MCQ pipeline now reads the screenshot and solves the transcribed question in separate stages. Live checks on the hard scheduling test questions selected only B (6.5 ms) for Q1 and C (16/3 ms) for Q2, with computed explanations. The old behavior that highlighted every option is rejected. New MCQs supersede obsolete in-flight MCQ requests instead of receiving the old combined busy/rate error. Real provider quotas still apply.

- Extension unit tests and real-browser watcher tests passed.
- Unpacked extension loads; settings save, reveal, delete and interval controls were tested.
- Live Groq and Gemini API calls succeeded.
- A live screenshot was read by Gemini; the extension highlighted the correct actual option row with full vertical overlap.
- A live student math flow rendered equations on desktop and mobile.
- Live search returned sources; visit analytics recorded a test visit.
- Durable Object tests enforced fifty daily reservations under seventy simultaneous attempts. One hundred distinct student requests passed with simulated provider capacity.
- Z.ai's initial live check returned HTTP 429 / overload. No successful Z.ai inference is claimed.
- 5,000 real answers within one hour remains unverified and is not guaranteed.

Run npm ci, npm test, npm run test:browser, and node tests/extension.mjs from this folder. Backend tests and live-provider smoke tests are documented in backend/README.md.

Chrome Web Store submission has not been made. See STORE-READINESS.md for registration, privacy and listing requirements. Unpacked installation is free; Google requires a one-time developer registration fee for a new publisher account.
