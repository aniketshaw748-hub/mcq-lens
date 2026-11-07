import { readFile, writeFile } from 'node:fs/promises';
const names = ['ZAI_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY'];
let current = await readFile('.dev.vars', 'utf8');
for (let i = 0; i < names.length; i++) {
  const value = (await readFile(process.argv[i + 2], 'utf8')).trim();
  if (!value || /[\r\n]/.test(value)) throw new Error(`Invalid ${names[i]} input.`);
  current = current.replace(new RegExp(`^${names[i]}=.*\\r?\\n?`, 'm'), '');
  current += `${names[i]}=${value}\n`;
}
await writeFile('.dev.vars', current, { mode: 0o600 });
console.log('Three provider keys imported into local ignored configuration. No key values printed.');
