declare module 'twitter-text/dist/esm/parseTweet.js' {
  export default function parseTweet(
    text: string,
    options?: object,
  ): {
    weightedLength: number;
    valid: boolean;
    permillage: number;
    validRangeStart: number;
    validRangeEnd: number;
    displayRangeStart: number;
    displayRangeEnd: number;
  };
}
declare module 'twitter-text/dist/esm/extractUrlsWithIndices.js' {
  export default function extract(
    text: string,
  ): { url: string; indices: [number, number] }[];
}
declare module 'twitter-text/dist/esm/extractHashtags.js' {
  export default function extract(text: string): string[];
}
declare module 'twitter-text/dist/esm/extractMentions.js' {
  export default function extract(text: string): string[];
}
declare module 'twitter-text/dist/esm/configs.js' {
  const configs: Record<string, object>;
  export default configs;
}
declare module 'twemoji-parser' {
  export function parse(
    text: string,
  ): { indices: [number, number]; text: string }[];
}
