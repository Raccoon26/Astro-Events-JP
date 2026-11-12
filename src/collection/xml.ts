import {
  candidate,
  discoverLink,
  imageCandidate,
  officialLink,
  relevant,
} from './parse-common';
import { createSax } from './sax-runtime.js';
import { displayText } from './text';
import {
  CollectionError,
  type ParseContext,
  type ParsedDocument,
} from './types';

interface Node {
  name: string;
  uri: string;
  attributes: Record<string, string>;
  text: string;
  children: Node[];
}
const ATOM = 'http://www.w3.org/2005/Atom';
const SITEMAP = 'http://www.sitemaps.org/schemas/sitemap/0.9';
function field(node: Node, ...names: string[]) {
  return (
    node.children.find((child) => names.includes(child.name))?.text.trim() ?? ''
  );
}
// SAX parsing holds one bounded item at a time; DTDs/entities are never expanded or fetched.
function scan(xml: string, context: ParseContext) {
  if (new TextEncoder().encode(xml).length > context.limits.maxBytes)
    throw new CollectionError('body-too-large');
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml))
    throw new CollectionError('parse-error');
  const parser = createSax();
  let root = '',
    rootUri = '',
    nodes = 0,
    depth = 0;
  const stack: Node[] = [];
  const entries: Node[] = [];
  let truncated = false;
  let capture = false;
  let total = 0;
  parser.on('error', () => {
    throw new CollectionError('parse-error');
  });
  parser.on('doctype', () => {
    throw new CollectionError('parse-error');
  });
  parser.on('opentag', (tag) => {
    if (++nodes > context.limits.maxNodes || ++depth > context.limits.maxDepth)
      throw new CollectionError('parse-error');
    if (depth === 1) {
      root = tag.local;
      rootUri = tag.uri;
    }
    if (['item', 'entry', 'url', 'sitemap'].includes(tag.local) && depth <= 3)
      capture = true;
    if (!capture) return;
    const node: Node = {
      name: tag.local,
      uri: tag.uri,
      attributes: Object.fromEntries(
        Object.values(tag.attributes).map((a) => [a.local, a.value]),
      ),
      text: '',
      children: [],
    };
    stack.at(-1)?.children.push(node);
    stack.push(node);
  });
  const text = (value: string) => {
    for (const node of stack) node.text = (node.text + value).slice(0, 4096);
  };
  parser.on('text', text);
  parser.on('cdata', text);
  parser.on('closetag', () => {
    if (capture) {
      const node = stack.pop();
      if (!stack.length) {
        capture = false;
        if (node) {
          const position = total++;
          if (position >= (context.offset ?? 0)) {
            if (entries.length < context.limits.maxLinks) entries.push(node);
            else truncated = true;
          }
        }
      }
    }
    depth--;
  });
  try {
    for (let i = 0; i < xml.length; i += 4096)
      parser.write(xml.slice(i, i + 4096));
    parser.close();
  } catch (error) {
    if (error instanceof CollectionError) throw error;
    throw new CollectionError('parse-error');
  }
  return { root, rootUri, entries, truncated, total };
}
function plainDescription(html: string) {
  return displayText(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]{0,2048}>/g, ' '),
    600,
  );
}
export async function parseXml(
  xml: string,
  context: ParseContext,
): Promise<ParsedDocument> {
  const data = scan(xml, context);
  const output: ParsedDocument = {
    candidates: [],
    discoveries: [],
    sitemaps: [],
    truncated: data.truncated,
  };
  const sitemap = ['urlset', 'sitemapindex'].includes(data.root);
  if (sitemap && data.rootUri !== SITEMAP && data.rootUri !== '')
    throw new CollectionError('parse-error');
  if (
    !sitemap &&
    data.root !== 'rss' &&
    !(data.root === 'feed' && data.rootUri === ATOM)
  )
    throw new CollectionError('unsupported-format');
  if (
    (context.source.format === 'sitemap' && !sitemap) ||
    (context.source.format === 'rss' && data.root !== 'rss') ||
    (context.source.format === 'atom' && data.root !== 'feed')
  )
    throw new CollectionError('unsupported-format');
  const seen = new Set<string>();
  let consumed = 0;
  for (const entry of data.entries) {
    consumed++;
    if (sitemap) {
      const raw = field(entry, 'loc');
      const url = officialLink(raw, context);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const lastmod = field(entry, 'lastmod') || null;
      if (data.root === 'sitemapindex') {
        output.sitemaps.push({ url, lastmod });
        output.discoveries.push({
          url,
          from: context.url,
          relation: 'official-sitemap-index; bounded traversal',
          format: 'sitemap',
          lastmod,
        });
        continue;
      }
      const path = decodeURIComponent(new URL(url).pathname);
      if (
        !relevant(path) &&
        !/(?:^|\/)(?:events?|news|topics|lectures?|public|star|space|planetarium)(?:[\/_.-]|$)/i.test(
          path,
        )
      )
        continue;
      output.discoveries.push({
        url,
        from: context.url,
        relation: 'official-sitemap-url; lastmod is advisory',
        format: 'html',
        lastmod,
      });
      if (output.candidates.length < context.limits.maxItems)
        output.candidates.push(
          await candidate(context, {
            url,
            title: decodeURIComponent(new URL(url).pathname),
            description:
              'Sitemap URL candidate; event details require DEV04 verification',
            itemId: url,
          }),
        );
      else output.truncated = true;
      if (output.candidates.length >= context.limits.maxItems) break;
      continue;
    }
    const atom = data.root === 'feed';
    const title = field(entry, 'title');
    const description = plainDescription(
      field(entry, atom ? 'summary' : 'description', 'content', 'encoded'),
    );
    if (
      !relevant(`${title} ${description}`, context.source.category === 'vtuber')
    )
      continue;
    const link = atom
      ? entry.children.find(
          (c) =>
            c.name === 'link' &&
            (!c.attributes.rel || c.attributes.rel === 'alternate') &&
            (!c.attributes.type || c.attributes.type.includes('html')),
        )?.attributes.href
      : field(entry, 'link');
    const url = link ? officialLink(link, context) : null;
    if (!url) continue;
    const itemId = field(entry, atom ? 'id' : 'guid') || url;
    const key = JSON.stringify([itemId, url, title]);
    if (seen.has(key)) continue;
    seen.add(key);
    const images = entry.children
      .filter(
        (c) =>
          ['enclosure', 'content', 'thumbnail'].includes(c.name) &&
          c.attributes.url &&
          (!c.attributes.type || c.attributes.type.startsWith('image/')),
      )
      .flatMap((c) => {
        const image = imageCandidate(
          c.attributes.url ?? '',
          title,
          context,
          'feed-enclosure',
        );
        return image ? [image] : [];
      });
    for (const child of entry.children.filter(
      (c) => c.name === 'link' && c.attributes.rel === 'related',
    )) {
      const linked = discoverLink(child.attributes.href ?? '', context.url);
      if (linked)
        output.discoveries.push({
          url: linked,
          from: context.url,
          relation: 'feed-related-link; review required',
          format: null,
        });
    }
    if (output.candidates.length < context.limits.maxItems)
      output.candidates.push(
        await candidate(context, {
          url,
          title,
          description,
          itemId,
          published: field(entry, atom ? 'published' : 'pubDate', 'date'),
          updated: field(entry, 'updated'),
          images,
          author: field(
            entry.children.find((c) => c.name === 'author') ?? entry,
            'name',
            'creator',
            'author',
          ),
        }),
      );
    else output.truncated = true;
    if (output.candidates.length >= context.limits.maxItems) break;
  }
  if ((context.offset ?? 0) + consumed < data.total) {
    output.nextOffset = (context.offset ?? 0) + consumed;
    output.truncated = true;
  }
  return output;
}
