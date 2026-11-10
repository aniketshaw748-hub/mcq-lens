# MCQ Lens

A browser extension that reads the multiple-choice question on your screen and highlights the AI-suggested answer. Free, no account and no API key needed.

## Install

**Download from the [latest release](https://github.com/aniketshaw748-hub/mcq-lens/releases/latest):**

| Browser | File |
| --- | --- |
| Chrome, Edge, Brave, Opera | [MCQ-Lens-chrome-edge.zip](https://github.com/aniketshaw748-hub/mcq-lens/releases/latest/download/MCQ-Lens-chrome-edge.zip) |
| Firefox (128 or newer) | [MCQ-Lens-firefox.zip](https://github.com/aniketshaw748-hub/mcq-lens/releases/latest/download/MCQ-Lens-firefox.zip) |

### Chrome (and Brave, Opera)

1. Download **MCQ-Lens-chrome-edge.zip** and extract it (right-click → Extract All).
2. Go to `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and pick the extracted folder (the one with `manifest.json` inside).
4. Click the puzzle icon in the toolbar and pin **MCQ Lens**.

Keep the extracted folder: Chrome loads the extension from it, so deleting or moving the folder removes the extension.

### Microsoft Edge

MCQ Lens is in review for the Edge Add-ons store. Until it's listed:

1. Download **MCQ-Lens-chrome-edge.zip** and extract it.
2. Go to `edge://extensions` and switch on **Developer mode** (left side).
3. Click **Load unpacked** and pick the extracted folder.
4. Click the puzzle icon in the toolbar and pin **MCQ Lens** (the lime circle icon).

### Firefox

1. Download **MCQ-Lens-firefox.zip**. Don't extract it.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick the zip.
4. Click the puzzle icon in the toolbar to find **MCQ Lens**.

Firefox removes add-ons loaded this way when it closes, so repeat these steps after a restart. Permanent install needs a version signed by Mozilla, which isn't available yet.

### Use it

1. Open a page with a multiple-choice question.
2. Click the **MCQ Lens** icon → **Enable on this tab**.
3. A small ring circles the suggested option's radio button, so you can still see your own choice inside it. Press **Alt+Shift+Y** on the page to see the reasoning (change the shortcut at `chrome://extensions/shortcuts`). The toolbar icon shows ✓ when answered and ! when something needs attention. Go to the next question and it answers again automatically.

Try it on the test page: https://mcq-lens.pages.dev/test. Answers come from AI and can be wrong. MCQ Lens never clicks or submits anything for you. Follow your school's or test platform's rules.

Each install gets 50 free questions a day. For more, add your own free Groq, Gemini or Z.ai key in **Settings** (MCQ Lens icon → Settings).

## How it works

Website: https://mcq-lens.pages.dev (landing page and download), https://mcq-lens.pages.dev/install (install guide) and https://mcq-lens.pages.dev/test (25 random practice questions from a bank of 206, with an answer key at the end). The earlier study helper now lives at https://mcq-lens.pages.dev/study.

The extension uses the owner's shared AI service. It works straight after install: no access link, account or API key. Settings has an optional place for a user's own Groq, Gemini or Z.ai keys; with any of them, that user's questions run on their keys only, with no MCQ Lens daily cap.

Only enabled tabs are scanned. Window focus doesn't matter: it keeps working while you use another window or app. A screenshot question is read only while its tab is on screen; switching tabs keeps the current answer. Reloading or navigating switches scanning off. Scrolling moves highlights with their options; a screenshot question is re-read only after scrolling more than half a screen. Resizing resets the selected area. The shared service reads complete radio-button questions directly from visible page text when possible, including code and all options. This skips the vision provider. Other layouts and image/canvas questions use screenshot reading. Requests are sent only when the selected image changes. Timers and animations may cause extra scans, so keep them outside the selected area. The interval defaults to 10 seconds and is configurable from 6–60 seconds.

The shared service permits 50 successful questions per student per UTC day. Every answered changed screenshot counts, including a cached answer. Failed answers refund the daily allowance. Availability depends on the providers' free quotas; the allowance is not a guarantee that all questions can be answered immediately. The extension never clicks or submits answers.

## Owner setup

The shared backend source and deployment instructions are in backend/README.md. Access links are switched off for now (the server accepts requests without them); the old private links in backend/.local/ still work but are not needed. Neither file is included in public deployments or deliverable zips.

Provider keys live in Cloudflare Worker secrets and the local ignored backend/.dev.vars. They are not distributed in this extension. Z.ai free Flash models, Groq GPT-OSS models and Gemini are configured. Gemini supplies web search for the separate study-question page; the screen-scanning extension does not search the web.

## Privacy and correctness

While enabled, readable question/option text goes to the owner's server and its text model. If the extension cannot reliably extract a complete question, screenshot crops go to the server and its configured vision provider (Gemini, Groq or Z.ai). Own keys from Settings are sent as request headers to the server, used for that request only and never stored there. Crop out personal data. The application processes raw screenshots in memory. Answers may be cached for 24 hours, or 5 minutes for search-backed answers. Provider-side processing follows provider terms, including free-tier terms. The extension stores a random install ID and any own keys locally in the Chrome profile, not Chrome Sync.

Green marks a high-confidence AI suggestion; amber marks uncertainty. Confidence is the model's subjective judgment. The panel gives the option text and explanation. Highlight placement uses the actual page option when its text matches the answer. For image-only questions, boxes depend on the model's estimated coordinates and can be imprecise. All question text and options must be readable and visible. Answers can be wrong.

Protected Chrome pages, the Web Store and the built-in PDF viewer do not support injection. The extension requests temporary active-tab access, scripting and local storage. A student connection adds permission for only that service origin. Optional host declarations allow you to choose the service, not always-on access to every website.

Privacy page: https://mcq-lens.pages.dev/privacy.html

## Verification

The shared MCQ pipeline now reads the screenshot and solves the transcribed question in separate stages. Live checks on the hard scheduling test questions selected only B (6.5 ms) for Q1 and C (16/3 ms) for Q2, with computed explanations. The old behavior that highlighted every option is rejected. New MCQs supersede obsolete in-flight MCQ requests instead of receiving the old combined busy/rate error. Real provider quotas still apply.

Version 1.1.2 adds page-text reading. Live Q7 (LRU: C, 9 faults) and automatic Next to Q8 (unsafe request: A) selected exactly one correct row using Groq and no vision call. Clipped options and image/canvas content refuse text extraction. Provider failures identify the reading or solving stage rather than displaying one generic message.

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
