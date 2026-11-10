# MCQ Lens: Microsoft Edge Add-ons submission

Upload: `dist/MCQ-Lens-store-v<version>.zip` (runtime files only, manifest at root).

## Availability
Visibility: Public. Markets: all.

## Properties
- Category: Productivity (or Education if offered)
- Website: https://mcq-lens.pages.dev
- Support contact: publisher's Partner Center contact
- Mature content: No

## Privacy
**Single purpose:** When the user turns it on for a tab, MCQ Lens reads the multiple-choice question visible in that tab and highlights an AI-suggested answer with a short explanation. It updates the suggestion when the question on screen changes.

**Permission justification**
- activeTab: captures the visible part of the tab the user explicitly turned MCQ Lens on (by clicking the toolbar button), to read a question that is shown as an image.
- scripting: injects the content script into that same tab to read the question and option text and draw the highlight (and, when the user presses the shortcut, a small explanation panel). Nothing is clicked or submitted.
- storage: keeps the check interval, the automatic error-report switch, a random install ID used for the daily free allowance, and any API keys the user chooses to add, in local extension storage.
- Host permission https://mcq-lens.pages.dev/*: the extension's own answer service, which receives the question and returns the suggested answer.

**Remote code:** No, I am not using remote code.

**Data usage:** Website content (the visible question text or a screenshot of the tab/selected area, only while enabled; the site domain in error reports; a screenshot in a user report only if ticked). Authentication information (only API keys the user optionally adds in Settings; sent with their requests, not stored by the service). Certify all three disclosures.

**Privacy policy URL:** https://mcq-lens.pages.dev/privacy

## Store listing (English)
**Description:**
MCQ Lens reads the multiple-choice question on your current tab and rings the AI-suggested answer. Press Alt+Shift+Y to see why.

How to use it after installing:
• Open a page with a question, click the MCQ Lens toolbar button and choose "Enable on this tab". Only tabs you enable are read.
• A thin ring circles the suggested option's radio button. Your own choice stays visible inside it, and a dashed ring means the AI is less sure. Nothing else is added to the page.
• Press Alt+Shift+Y on the page to see the reasoning. Press it again, or the hide icon, to put it away.
• Click "Next" and it reads the new question on its own. Scrolling or switching tabs does not trigger new reads.
• Works with text, code and picture options such as equations: for picture options it reads a screenshot and rings the option's radio button.
• Pick any ring colour in Settings.
• "Select area" in the toolbar menu limits reading to the question.

Free, with no sign-up: each browser gets 50 free questions a day from the MCQ Lens service. Used them up? Add your own free Groq, Google Gemini or Z.ai API key in Settings and keep going with no daily cap.

MCQ Lens never clicks, selects or submits anything. Answers come from AI models (Groq, Google Gemini or Z.ai through the MCQ Lens service) and can be wrong. Check them, and follow the rules of your school, course or test platform. Question text or screenshots are sent to the MCQ Lens service and these providers only while the extension is enabled; see the privacy policy. If something goes wrong, MCQ Lens sends a short error report (never question text or page content); you can switch this off in Settings or send your own with "Report a problem".

Website and practice test: https://mcq-lens.pages.dev

**Search terms (7 max):** MCQ, multiple choice questions, MCQ solver, quiz answers, AI answer helper, exam prep, study helper

**Assets:** logo `store/logo-300.png`; screenshots in `store/screenshots/` (1280x800): `1-ring.png`, `2-reasoning.png`, `3-settings.png`, `4-colour.png`.

## Notes for certification
No account or login is needed. Test page with practice questions: https://mcq-lens.pages.dev/test
1. Install the extension and open https://mcq-lens.pages.dev/test
2. Click the MCQ Lens toolbar button, then "Enable on this tab".
3. Within a few seconds a green ring circles the suggested option and the toolbar icon shows a check mark. Press Alt+Shift+Y on the page to show the explanation.
4. Click "Next question" on the page: the highlight clears and the new question is answered automatically.
5. Settings (toolbar popup → "Settings") shows the optional API-key fields; they are not needed for testing.
6. "Report a problem" in the toolbar popup opens a short form on the page that sends a bug report (a note, and a screenshot of the question area only if ticked). Automatic error reports contain no question text and can be switched off in Settings.
The answer service at https://mcq-lens.pages.dev is live. Each install gets 50 free questions per day.
