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
MCQ Lens reads the multiple-choice question on your current tab and highlights an AI-suggested answer, with a short worked explanation.

How it works:
• Click the MCQ Lens toolbar button and choose "Enable on this tab". Only tabs you enable are read.
• MCQ Lens reads the visible question and its options. For normal web pages it reads the text directly; for questions shown as images it reads a screenshot of the visible tab or an area you choose.
• It highlights the suggested option on the page. Press Alt+Shift+Y to see the reasoning. It never clicks, selects or submits anything.
• When the question changes (for example after "Next"), it reads the new question automatically. Scrolling or switching tabs does not trigger new reads.
• "Select area" in the toolbar menu limits reading to the question, which also keeps unrelated information out.

No sign-up or setup: each browser gets 50 free questions a day from the MCQ Lens service. You can add your own free Groq, Google Gemini or Z.ai API key in Settings to use your own provider limits instead.

Important: answers come from AI models (Groq, Google Gemini or Z.ai through the MCQ Lens service) and can be wrong. Check them against your course material, and follow the rules of your school, course or test platform. Question text or screenshots are sent to the MCQ Lens service and these providers only while the extension is enabled; see the privacy policy for details. If something goes wrong, MCQ Lens sends a short error report (never question text or page content) so it can be fixed; you can switch this off in Settings or send your own report with "Report a problem".

**Search terms:** MCQ, multiple choice, quiz helper, study, answer highlight, practice questions, exam prep

**Assets:** logo `store/logo-300.png`; screenshots `store/store-screenshot-1-highlight.png`, `store/store-screenshot-2-settings.png` (1280x800).

## Notes for certification
No account or login is needed. Test page with practice questions: https://mcq-lens.pages.dev/test
1. Install the extension and open https://mcq-lens.pages.dev/test
2. Click the MCQ Lens toolbar button, then "Enable on this tab".
3. Within a few seconds a green dot marks the suggested option and the toolbar icon shows a check mark. Press Alt+Shift+Y on the page to show the explanation.
4. Click "Next question" on the page: the highlight clears and the new question is answered automatically.
5. Settings (toolbar popup → "Settings") shows the optional API-key fields; they are not needed for testing.
6. "Report a problem" in the toolbar popup opens a short form on the page that sends a bug report (a note, and a screenshot of the question area only if ticked). Automatic error reports contain no question text and can be switched off in Settings.
The answer service at https://mcq-lens.pages.dev is live. Each install gets 50 free questions per day.
