import { CollectionError } from './types';
export async function digest(text: string | Uint8Array) {
  const bytes =
    typeof text === 'string' ? new TextEncoder().encode(text) : text;
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', bytes as BufferSource),
    ),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export function displayText(value: string, max = 600) {
  const cleaned = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[\s\u00a0\u3000]+/gu, ' ')
    .trim();
  let output = '',
    count = 0;
  for (const character of cleaned) {
    if (count++ >= max) break;
    output += character;
  }
  return output;
}
export function comparisonText(value: string) {
  return displayText(value).normalize('NFKC').toLocaleLowerCase('ja');
}
export function dateValue(value: string | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
export function decodeDocument(bytes: Uint8Array, contentType: string): string {
  let label = contentType.match(/charset\s*=\s*["']?([a-z0-9_-]+)/i)?.[1];
  const prefix = new TextDecoder('windows-1252').decode(
    bytes.subarray(0, 2048),
  );
  label ??=
    prefix.match(/<\?xml[^>]*encoding=["']([^"']+)/i)?.[1] ??
    prefix.match(/<meta[^>]+charset\s*=\s*["']?([a-z0-9_-]+)/i)?.[1];
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    label = 'utf-8';
  if (bytes[0] === 0xff || bytes[0] === 0xfe)
    throw new CollectionError('invalid-encoding');
  const encoding = (label ?? 'utf-8').toLowerCase().replaceAll('_', '-');
  if (
    ![
      'utf-8',
      'utf8',
      'shift-jis',
      'shift-jisx0213',
      'sjis',
      'windows-31j',
      'x-sjis',
      'euc-jp',
      'iso-2022-jp',
    ].includes(encoding)
  )
    throw new CollectionError('invalid-encoding');
  try {
    return new TextDecoder(
      ['sjis', 'windows-31j', 'x-sjis', 'shift-jisx0213'].includes(encoding)
        ? 'shift_jis'
        : encoding,
      { fatal: true, ignoreBOM: false },
    ).decode(bytes);
  } catch {
    throw new CollectionError('invalid-encoding');
  }
}
