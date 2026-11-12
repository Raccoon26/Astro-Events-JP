import { selectAll as queryAll, selectOne as queryOne } from 'css-select';
import { type AnyNode, DomHandler, type Element, isTag } from 'domhandler';
import { textContent } from 'domutils';
import { Parser } from 'htmlparser2';
import {
  candidate,
  discoverLink,
  imageCandidate,
  officialLink,
  relevant,
} from './parse-common';
import { displayText } from './text';
import {
  CollectionError,
  type HtmlRules,
  type ParseContext,
  type ParsedDocument,
} from './types';

function selector(value: string | undefined, fallback: string) {
  const result = value ?? fallback;
  if (
    result.length > 160 ||
    !/^[-\w\s.#>[\]="':,]+$/u.test(result) ||
    result.includes(':') ||
    result.split(',').length > 8
  )
    throw new CollectionError('parse-error');
  return result;
}
const selectAll = (query: string, root: AnyNode[]) =>
  queryAll<AnyNode, Element>(query, root);
const selectOne = (query: string, root: AnyNode[]) =>
  queryOne<AnyNode, Element>(query, root);
function cleanText(node: AnyNode | undefined | null): string {
  if (!node) return '';
  if (
    isTag(node) &&
    ['script', 'style', 'noscript', 'nav', 'header', 'footer'].includes(
      node.name,
    )
  )
    return '';
  if ('children' in node) return node.children.map(cleanText).join(' ');
  return 'data' in node ? node.data : '';
}
function nodes(html: string, context: ParseContext) {
  if (new TextEncoder().encode(html).length > context.limits.maxBytes)
    throw new CollectionError('body-too-large');
  let count = 0,
    depth = 0;
  const handler = new DomHandler();
  const open = handler.onopentag.bind(handler),
    close = handler.onclosetag.bind(handler);
  handler.onopentag = (name, attributes) => {
    if (++count > context.limits.maxNodes || ++depth > context.limits.maxDepth)
      throw new CollectionError('parse-error');
    open(name, attributes);
  };
  handler.onclosetag = () => {
    depth = Math.max(0, depth - 1);
    close();
  };
  const parser = new Parser(handler, { decodeEntities: true });
  try {
    parser.end(html);
  } catch (error) {
    if (error instanceof CollectionError) throw error;
    throw new CollectionError('parse-error');
  }
  return handler.dom;
}
function images(root: AnyNode[], context: ParseContext) {
  const found = [];
  for (const node of selectAll('meta,img,a', root)) {
    let raw = '',
      label = '',
      relation = 'html-image';
    if (
      node.name === 'meta' &&
      ['og:image', 'twitter:image'].includes(
        node.attribs.property ?? node.attribs.name ?? '',
      )
    ) {
      raw = node.attribs.content ?? '';
      relation = 'page-metadata';
    } else if (node.name === 'img') {
      raw = node.attribs.src ?? node.attribs['data-src'] ?? '';
      label = node.attribs.alt ?? '';
      if (/logo|ロゴ|icon|アイコン/i.test(label + ' ' + raw)) continue;
    } else if (
      node.name === 'a' &&
      /\.(?:png|jpe?g|gif|webp|pdf)(?:[?#]|$)/i.test(node.attribs.href ?? '')
    ) {
      raw = node.attribs.href ?? '';
      label = cleanText(node);
    }
    if (raw) {
      const image = imageCandidate(raw, label, context, relation);
      if (image) found.push(image);
    }
    if (found.length >= context.limits.maxItems) break;
  }
  return found;
}
function container(anchor: Element) {
  let parent: AnyNode = anchor;
  for (let i = 0; i < 4 && parent.parent; i++) {
    if (isTag(parent) && ['li', 'tr', 'article'].includes(parent.name)) break;
    if (
      isTag(parent) &&
      /event|news|card|item/.test(parent.attribs.class ?? '')
    )
      break;
    parent = parent.parent;
  }
  return parent;
}
export async function parseHtml(
  html: string,
  context: ParseContext,
  rules: HtmlRules = context.rules ?? {},
): Promise<ParsedDocument> {
  const root = nodes(html, context);
  const declaredBase = selectOne('base[href]', root)?.attribs.href;
  if (declaredBase) {
    const base = officialLink(declaredBase, context);
    if (base) context = { ...context, baseUrl: base };
  }
  const output: ParsedDocument = {
    candidates: [],
    discoveries: [],
    sitemaps: [],
    truncated: false,
  };
  const seen = new Set<string>();
  const discovered = new Set<string>();
  const globalImages = images(root, context);
  const add = async (item: AnyNode, link: Element | null, title: string) => {
    const url = link
      ? officialLink(link.attribs.href ?? '', context)
      : context.url;
    if (!url || !title) return;
    const description = displayText(cleanText(item), 1000);
    if (
      !relevant(`${title} ${description}`, context.source.category === 'vtuber')
    )
      return;
    if (seen.has(url + title)) return;
    seen.add(url + title);
    if (output.candidates.length >= context.limits.maxItems) {
      output.truncated = true;
      return;
    }
    const itemRoot = [item];
    const dateNode = rules.dateSelector
      ? selectOne(selector(rules.dateSelector, ''), itemRoot)
      : null;
    const venueNode = rules.venueSelector
      ? selectOne(selector(rules.venueSelector, ''), itemRoot)
      : null;
    const time = selectOne('time', itemRoot)?.attribs.datetime;
    output.candidates.push(
      await candidate(context, {
        url,
        title,
        description,
        images: [...images(itemRoot, context), ...globalImages],
        dateText: dateNode ? cleanText(dateNode) : description,
        venueText: venueNode ? cleanText(venueNode) : description,
        ...(time ? { published: time } : {}),
      }),
    );
  };
  if (rules.detailPage) {
    const title = cleanText(selectOne('h1', root) ?? selectOne('title', root));
    await add({ type: 'root', children: root } as AnyNode, null, title);
  } else if (rules.itemSelector) {
    const items = selectAll(selector(rules.itemSelector, ''), root);
    for (let index = context.offset ?? 0; index < items.length; index++) {
      const item = items[index]!;
      const link = selectOne(selector(rules.linkSelector, 'a[href]'), [item]);
      const title = rules.titleSelector
        ? cleanText(selectOne(selector(rules.titleSelector, ''), [item]))
        : cleanText(link);
      await add(item, link, title);
      if (
        output.candidates.length >= context.limits.maxItems &&
        index + 1 < items.length
      ) {
        output.nextOffset = index + 1;
        output.truncated = true;
        break;
      }
    }
  } else {
    const links = selectAll('a[href]', root);
    for (let index = context.offset ?? 0; index < links.length; index++) {
      const link = links[index]!;
      if (
        link.parent &&
        isTag(link.parent) &&
        ['nav', 'header', 'footer'].includes(link.parent.name)
      )
        continue;
      const item = container(link);
      const anchorText = displayText(cleanText(link), 512);
      const heading = selectOne('h1,h2,h3,h4', [item]);
      const title = /^(?:詳細|詳しく|続きを読む|more|こちら)/i.test(anchorText)
        ? cleanText(heading)
        : anchorText;
      if (relevant(title, context.source.category === 'vtuber'))
        await add(item, link, title);
      if (
        output.candidates.length >= context.limits.maxItems &&
        index + 1 < links.length
      ) {
        output.nextOffset = index + 1;
        output.truncated = true;
        break;
      }
    }
  }
  for (const node of selectAll('a[href],link[href]', root)) {
    if (output.discoveries.length >= context.limits.maxLinks) {
      output.truncated = true;
      break;
    }
    const text = displayText(cleanText(node), 200),
      type = node.attribs.type ?? '',
      rel = node.attribs.rel ?? '';
    const format = /rss/.test(type)
      ? 'rss'
      : /atom/.test(type)
        ? 'atom'
        : /sitemap/.test(rel + ' ' + text)
          ? 'sitemap'
          : null;
    if (
      !format &&
      !relevant(text, context.source.category === 'vtuber') &&
      !/主催|協力|公式|予約|申込/u.test(text)
    )
      continue;
    const url = discoverLink(
      node.attribs.href ?? '',
      context.baseUrl ?? context.url,
    );
    if (!url || discovered.has(url)) continue;
    discovered.add(url);
    output.discoveries.push({
      url,
      from: context.url,
      relation: format
        ? 'official-page-alternate-link'
        : 'official-page-related-link; ownership review required',
      format,
    });
  }
  // JS-only shells are explicitly unsupported; scripts are never executed.
  if (
    !output.candidates.length &&
    /javascript.*(?:有効|enable)|(?:id=["'](?:app|root)["'][^>]*>\s*<\/)/i.test(
      html,
    ) &&
    textContent(root).trim().length < 300
  )
    throw new CollectionError('unsupported-format');
  return output;
}
