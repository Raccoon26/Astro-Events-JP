import {
  type IsolatedWire,
  REPORTS_REPO,
  type WireRequest,
  type WireResponse,
} from './types';
/** In-process synthetic provider. No fetch, token, URL override, image or mail capability. */
export class FakeNotificationWire implements IsolatedWire {
  readonly mode = 'isolated-fake' as const;
  readonly requests: WireRequest[] = [];
  readonly messages = new Map<number, Record<string, unknown>>();
  readonly issues = new Map<number, Record<string, unknown>>();
  readonly faults: ((
    request: WireRequest,
  ) => WireResponse | undefined | Promise<WireResponse | undefined>)[] = [];
  private sequence = 100;
  restore(saved: unknown) {
    if (!saved || typeof saved !== 'object')
      throw Error('FAKE_PROVIDER_INVALID');
    const s = saved as {
      project?: unknown;
      mode?: unknown;
      messages?: unknown;
      issues?: unknown;
    };
    if (
      s.project !== 'Astro-Events-JP' ||
      s.mode !== 'simulation' ||
      !Array.isArray(s.messages) ||
      !Array.isArray(s.issues) ||
      s.messages.length + s.issues.length > 5000
    )
      throw Error('FAKE_PROVIDER_INVALID');
    const valid = (
      entry: unknown,
    ): entry is [number, Record<string, unknown>] =>
      Array.isArray(entry) &&
      entry.length === 2 &&
      Number.isSafeInteger(entry[0]) &&
      entry[0] > 0 &&
      entry[1] !== null &&
      typeof entry[1] === 'object' &&
      !Array.isArray(entry[1]);
    if (!s.messages.every(valid) || !s.issues.every(valid))
      throw Error('FAKE_PROVIDER_INVALID');
    for (const [k, v] of s.messages) {
      if (
        v.message_id !== k ||
        typeof v.text !== 'string' ||
        v.text.length > 4096
      )
        throw Error('FAKE_PROVIDER_INVALID');
      this.messages.set(k, v);
    }
    for (const [k, v] of s.issues) {
      if (
        v.number !== k ||
        typeof v.body !== 'string' ||
        v.body.length > 50000 ||
        v.html_url !== `https://github.com/${REPORTS_REPO}/issues/${k}`
      )
        throw Error('FAKE_PROVIDER_INVALID');
      this.issues.set(k, v);
    }
    this.sequence = Math.max(
      100,
      ...this.messages.keys(),
      ...this.issues.keys(),
    );
  }
  async request(input: WireRequest): Promise<WireResponse> {
    const request = structuredClone(input);
    this.requests.push(request);
    const fault = this.faults.shift();
    if (fault) {
      const result = await fault(request);
      if (result) return result;
    }
    const p = request.payload;
    if (request.provider === 'telegram') {
      if (request.operation === 'answerCallbackQuery')
        return { status: 200, body: { ok: true, result: true } };
      if (request.operation === 'sendMessage') {
        const id = ++this.sequence,
          message = { message_id: id, text: p.text, chat: { id: p.chat_id } };
        this.messages.set(id, message);
        return { status: 200, body: { ok: true, result: message } };
      }
      if (request.operation === 'editMessageText') {
        const message = this.messages.get(Number(p.message_id));
        if (!message) return { status: 400, body: { ok: false } };
        Object.assign(message, { text: p.text });
        return { status: 200, body: { ok: true, result: message } };
      }
    }
    if (request.provider === 'github' && p.repository === REPORTS_REPO) {
      if (request.operation === 'repository')
        return {
          status: 200,
          body: {
            full_name: REPORTS_REPO,
            private: true,
            has_issues: true,
            permissions: { issues_write: true },
          },
        };
      if (request.operation === 'listIssues')
        return {
          status: 200,
          body: [...this.issues.values()].slice(0, 50),
          headers:
            this.issues.size > 50
              ? { link: '<https://api.github.com/next>; rel="next"' }
              : {},
        };
      if (request.operation === 'getIssue')
        return this.issues.has(Number(p.number))
          ? { status: 200, body: this.issues.get(Number(p.number)) }
          : { status: 404, body: {} };
      if (['createIssue', 'updateIssue'].includes(request.operation)) {
        const number =
          request.operation === 'createIssue'
            ? ++this.sequence
            : Number(p.number);
        const issue = {
          number,
          title: p.title,
          body: p.body,
          html_url: `https://github.com/${REPORTS_REPO}/issues/${number}`,
        };
        this.issues.set(number, issue);
        return {
          status: request.operation === 'createIssue' ? 201 : 200,
          body: issue,
        };
      }
    }
    return { status: 400, body: { code: 'UNSUPPORTED_FAKE_OPERATION' } };
  }
}
