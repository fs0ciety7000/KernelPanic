// UTF-8 safe base64 that works in both browser and Node without Buffer.

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function encodeBase64(text: string): string {
  return encodeBytes(new TextEncoder().encode(text));
}

export function encodeBytes(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHA[(n >> 18) & 63]! + ALPHA[(n >> 12) & 63]!;
    out += i + 1 < bytes.length ? ALPHA[(n >> 6) & 63]! : '=';
    out += i + 2 < bytes.length ? ALPHA[n & 63]! : '=';
  }
  return out;
}

/** Throws on invalid input, like `base64 -d`. */
export function decodeBase64(b64: string): string {
  return new TextDecoder().decode(decodeBytes(b64));
}

export function decodeBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) {
    throw new Error('invalid input');
  }
  const bytes: number[] = [];
  let buf = 0, bits = 0;
  for (const ch of clean.replace(/=+$/, '')) {
    buf = (buf << 6) | ALPHA.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}
