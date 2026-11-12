import {
  parseDocument,
  SafeHttpCollector,
  unavailableTransport,
} from '../../src/collection/index';
import {
  approvalFixture,
  context,
  sourceFixture,
} from '../collection-fixtures';
// Synthetic localhost integration fixture, never a deployable production entrypoint.
export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === '/guard') {
      try {
        await new SafeHttpCollector(
          unavailableTransport,
          approvalFixture(),
        ).collect(sourceFixture(), request.signal);
      } catch {
        return Response.json({ code: 'dns-protection-unavailable' });
      }
      return new Response('unexpected', { status: 500 });
    }
    const format = url.searchParams.get('format');
    if (
      format !== 'html' &&
      format !== 'rss' &&
      format !== 'atom' &&
      format !== 'sitemap'
    )
      return new Response('bad fixture', { status: 400 });
    return Response.json(
      await parseDocument(await request.text(), context(format)),
    );
  },
} satisfies ExportedHandler;
