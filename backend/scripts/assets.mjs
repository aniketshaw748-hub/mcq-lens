import { cp, mkdir } from 'node:fs/promises';
await mkdir('public/vendor', { recursive: true });
await cp('node_modules/katex/dist', 'public/vendor/katex', { recursive: true });
await cp('node_modules/marked/lib/marked.esm.js', 'public/vendor/marked.esm.js');
await cp('node_modules/dompurify/dist/purify.min.js', 'public/vendor/purify.min.js');
await cp('node_modules/katex/LICENSE', 'public/vendor/katex-LICENSE');
await cp('node_modules/marked/LICENSE', 'public/vendor/marked-LICENSE');
await cp('node_modules/dompurify/LICENSE', 'public/vendor/dompurify-LICENSE');
console.log('KaTeX assets copied locally; no third-party scripts are loaded by the study page.');
