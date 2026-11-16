// ES2022 Workers supply these built-ins natively. This module replaces ONLY the pinned
// twitter-text ES5 compatibility side-effect imports, never its parsing/weighting code.
const functions: unknown[] = [
  Array.from,
  Array.isArray,
  Array.prototype.filter,
  Array.prototype.forEach,
  Array.prototype.indexOf,
  Array.prototype.reduce,
  Array.prototype.sort,
  Object.assign,
  Object.defineProperty,
  Object.defineProperties,
  Object.keys,
  Object.getOwnPropertyDescriptors,
  String.prototype.normalize,
  String.prototype[Symbol.iterator],
  Array.prototype[Symbol.iterator],
  RegExp.prototype[Symbol.match],
  RegExp.prototype[Symbol.replace],
  RegExp.prototype[Symbol.split],
];
if (functions.some((value) => typeof value !== 'function'))
  throw new Error('NATIVE_BUILTINS_UNAVAILABLE');

export {};
