import type { Usage } from '../domain';
import type { NotificationStore } from './store';
import { type Action, NotificationError } from './types';

/** Portable WebCrypto MAC verification; no JavaScript secret string equality or logging. */
export async function authenticateWebhook(
  supplied: string | null,
  expected: string,
) {
  if (
    !/^[A-Za-z0-9_-]{32,256}$/.test(expected) ||
    supplied === null ||
    supplied.length > 256
  )
    return false;
  const bytes = new TextEncoder(),
    key = await crypto.subtle.importKey(
      'raw',
      bytes.encode(expected),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    bytes.encode(expected),
  );
  return crypto.subtle.verify('HMAC', key, signature, bytes.encode(supplied));
}
export async function webhook(
  request: Request,
  store: NotificationStore,
  secret: string,
  usage: Usage | null,
) {
  if (
    request.method !== 'POST' ||
    !(await authenticateWebhook(
      request.headers.get('x-telegram-bot-api-secret-token'),
      secret,
    ))
  )
    return Response.json({ code: 'UNAUTHORIZED' }, { status: 401 });
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return Response.json({ code: 'INVALID_REQUEST' }, { status: 400 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error();
    let length = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const v = await reader.read();
      if (v.done) break;
      length += v.value.byteLength;
      if (length > 32768) {
        await reader.cancel();
        throw Error();
      }
      chunks.push(v.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes),
    );
    const q = body?.callback_query,
      message = q?.message;
    if (
      !q ||
      typeof q.data !== 'string' ||
      typeof q.id !== 'string' ||
      !q.id ||
      q.id.length > 128 ||
      !message ||
      !Number.isSafeInteger(body.update_id) ||
      !Number.isSafeInteger(q.from?.id) ||
      !Number.isSafeInteger(message.chat?.id) ||
      !Number.isSafeInteger(message.message_id)
    )
      throw Error();
    const token = q.data;
    // The action is server-side, never accepted from arbitrary JSON or callback_data.
    const action = await store.callbackAction(token);
    const result = await store.callback(
      token,
      action as Action,
      {
        chatId: String(message.chat.id),
        userId: String(q.from.id),
        messageId: String(message.message_id),
        updateId: String(body.update_id),
      },
      usage,
    );
    await store.queueCallbackAck(token, q.id);
    return Response.json({ ok: true, result, externalRequests: 0 });
  } catch (error) {
    return Response.json(
      {
        code:
          error instanceof NotificationError ? error.code : 'INVALID_REQUEST',
      },
      { status: 400 },
    );
  }
}
