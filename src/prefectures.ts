import metadata from '../data/prefectures.json';
export const prefectures = metadata;
export function prefecture(code: number) {
  if (!Number.isInteger(code) || code < 1 || code > 47)
    throw new Error('Invalid prefecture code');
  return prefectures[code - 1]!;
}
export function regionPrefectures(region: string) {
  return prefectures.filter((p) => p.region === region);
}
