import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
const config = await readFile('.dev.vars', 'utf8');
const values = config.split(/\r?\n/).filter(x => /^[A-Z_]+=/.test(x)).map(x => x.slice(x.indexOf('=') + 1)).filter(x => x.length > 15);
const version = JSON.parse(await readFile('../manifest.json', 'utf8')).version;
for (const file of [`../dist/MCQ-Lens-v${version}.zip`, `../dist/MCQ-Lens-store-v${version}.zip`, `../dist/MCQ-Lens-source-v${version}.zip`]) {
  const buffer = await readFile(file);
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Invalid ZIP footer.');
  const count = buffer.readUInt16LE(end + 10); let offset = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP directory.');
    const method = buffer.readUInt16LE(offset + 10), size = buffer.readUInt32LE(offset + 20), nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32), local = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString();
    if (/(?:^|\/)(?:\.dev\.vars|\.local|\.wrangler|node_modules|backups)(?:\/|$)/.test(name)) throw new Error('Private file found in ZIP.');
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const compressed = buffer.subarray(start, start + size);
    const data = method === 8 ? inflateRawSync(compressed) : compressed;
    if (values.some(value => data.includes(Buffer.from(value)))) throw new Error('Secret detected in ZIP.');
    offset += 46 + nameLength + extraLength + commentLength;
  }
  console.log(`${file}: ${count} entries checked; no secret values or private configuration included.`);
}
