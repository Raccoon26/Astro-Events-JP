import { parseHtml } from './html';
import type { ParseContext } from './types';
import { CollectionError } from './types';
import { parseXml } from './xml';
export async function parseDocument(text: string, context: ParseContext) {
  if (
    !Number.isInteger(context.offset ?? 0) ||
    (context.offset ?? 0) < 0 ||
    (context.offset ?? 0) > context.limits.maxNodes
  )
    throw new CollectionError('parse-error');
  try {
    return await (context.source.format === 'html'
      ? parseHtml(text, context)
      : parseXml(text, context));
  } catch (error) {
    if (error instanceof CollectionError) throw error;
    throw new CollectionError('parse-error');
  }
}
