import { SaxesParser } from 'saxes';
// Isolate saxes 6's pre-exactOptionalPropertyTypes declarations from the strict app.
// Runtime API is covered by XML attack fixtures and the workerd bundle test.
export function createSax() {
  return new SaxesParser({ xmlns: true });
}
