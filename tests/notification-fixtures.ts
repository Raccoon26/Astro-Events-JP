// Independent synthetic delivery fixtures only. Not actual sources/events/recipients.
import type { PostKind } from '../src/domain';
import { renderPost } from '../src/posts/render';
import type { PostDelivery } from '../src/posts/types';
import { POST_NOW, postFixture } from './post-fixtures';
export async function notificationFixture(kind: PostKind = 'observation') {
  const { event } = await postFixture(kind),
    post = await renderPost(event, 1, kind, POST_NOW);
  const delivery: PostDelivery = {
    copyText: post.text,
    metadata: {
      post,
      eventId: post.eventId,
      sourceId: event.sourceId,
      eventRevision: 1,
      verified: true,
      checkedAt: event.verification.checkedAt,
      expiresAt: event.verification.expiresAt,
      fingerprint: event.verification.fingerprint,
      decisionId: 'synthetic-decision',
      officialUrl: event.officialUrl,
      images: event.verification.images,
      impacts: event.verification.impacts,
      recommended: true,
      recheckRequired: false,
      fields: Object.fromEntries(
        Object.entries(event.verification.fields).map(([k, v]) => [k, v.state]),
      ),
    },
  };
  return { event, delivery };
}
