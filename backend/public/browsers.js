// Downloads always point at the newest GitHub release.
const release = 'https://github.com/aniketshaw748-hub/mcq-lens/releases/latest/download/';
const chromium = (name, page, toggle) => ({
  name, file: 'MCQ-Lens-chrome-edge.zip', page,
  steps: [
    'Extract the zip: right-click it → <b>Extract All</b> (on a Mac, double-click it).',
    `Open <code>${page}</code> in a new tab. Copy the address with the button and paste it into the address bar; a web page can’t open it for you.`,
    `Switch on <b>Developer mode</b> (${toggle}).`,
    'Click <b>Load unpacked</b> and choose the extracted <b>MCQ-Lens-chrome-edge</b> folder (the one with <code>manifest.json</code> inside).',
    'Click the puzzle-piece icon in the toolbar and pin <b>MCQ Lens</b> (the lime circle).'
  ],
  note: 'Keep the extracted folder. The browser loads MCQ Lens from it, so deleting or moving the folder removes the extension.'
});
export const browsers = {
  chrome: chromium('Chrome', 'chrome://extensions', 'top right'),
  edge: { ...chromium('Edge', 'edge://extensions', 'in the left menu; on a narrow window open the ☰ menu first'), lead: 'MCQ Lens is in review for the Edge Add-ons store. Until it’s listed, install it like this.' },
  brave: chromium('Brave', 'brave://extensions', 'top right'),
  opera: chromium('Opera', 'opera://extensions', 'top right'),
  firefox: {
    name: 'Firefox', file: 'MCQ-Lens-firefox.zip', page: 'about:debugging#/runtime/this-firefox',
    steps: [
      'Keep the zip as it is. Don’t extract it.',
      'Open <code>about:debugging#/runtime/this-firefox</code> in a new tab. Copy the address with the button and paste it into the address bar.',
      'Click <b>Load Temporary Add-on…</b> and choose <b>MCQ-Lens-firefox.zip</b>.',
      'Click the puzzle-piece icon in the toolbar to find <b>MCQ Lens</b>.'
    ],
    note: 'Firefox removes add-ons loaded this way when it closes, so repeat steps 2–3 after a restart. Needs Firefox 128 or newer.'
  }
};
export const downloadUrl = key => release + browsers[key].file;
export function detect() {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\//.test(ua)) return 'opera';
  if (navigator.brave) return 'brave';
  return 'chrome';
}
export const visit = source => fetch(`/api/visit?src=${source}`, { method: 'POST' }).catch(() => {});
