// Tell Bing (and other IndexNow search engines) that the public pages changed, so they recrawl them.
// Run after a Pages deploy: node scripts/indexnow.mjs
// The key is public by design: search engines verify it at https://mcq-lens.pages.dev/<key>.txt.
const host = 'mcq-lens.pages.dev';
const key = '913ce87f34c50e60f9c16db6ff882cc3';
const pages = ['/', '/install', '/test', '/privacy'];

const response = await fetch('https://api.indexnow.org/IndexNow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: pages.map(p => `https://${host}${p}`) })
});
// 200 = accepted, 202 = accepted while the key is verified.
if (![200, 202].includes(response.status)) throw new Error(`IndexNow returned HTTP ${response.status}`);
console.log(`IndexNow: ${pages.length} pages submitted (HTTP ${response.status}).`);
