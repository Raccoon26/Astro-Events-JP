import path from 'node:path';

// Exact, reviewed polyfill imports from twitter-text@3.1.0. Its algorithm is unchanged.
const names = [
  'es6.array.filter',
  'es6.array.for-each',
  'es6.array.from',
  'es6.array.index-of',
  'es6.array.is-array',
  'es6.array.iterator',
  'es6.array.reduce',
  'es6.array.sort',
  'es6.date.to-string',
  'es6.object.assign',
  'es6.object.define-properties',
  'es6.object.define-property',
  'es6.object.keys',
  'es6.object.to-string',
  'es6.regexp.constructor',
  'es6.regexp.match',
  'es6.regexp.replace',
  'es6.regexp.split',
  'es6.regexp.to-string',
  'es6.string.iterator',
  'es6.symbol',
  'es7.object.get-own-property-descriptors',
  'web.dom.iterable',
];
export function nativeTwitterAliases() {
  return Object.fromEntries(
    names.map((name) => [
      `core-js/modules/${name}`,
      path.resolve('src/posts/native-compat.ts'),
    ]),
  );
}
