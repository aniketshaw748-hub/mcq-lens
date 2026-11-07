const encoder = new TextEncoder();
const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const decode = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
async function key(secret) { return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
export async function signAccess(secret, id, expires) {
  const payload = encode(encoder.encode(JSON.stringify({ id, expires })));
  const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload));
  return `${payload}.${encode(new Uint8Array(signature))}`;
}
export async function verifyAccess(secret, token) {
  if (!secret || typeof token !== 'string' || token.length > 1000) return null;
  try {
    const [payload, signature, extra] = token.split('.');
    if (extra || !await crypto.subtle.verify('HMAC', await key(secret), decode(signature), encoder.encode(payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(decode(payload)));
    return typeof data.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(data.id) && Number.isFinite(data.expires) && data.expires > Date.now() ? data.id : null;
  } catch { return null; }
}
