// Fixed offline synthetic input, never a Source approval, DB row or public generation API.

import type { DetailedVerifiedEvent } from '../verification/types';
import { renderPost } from './render';
import fixture from './synthetic-profile.json';
export async function syntheticPost(at: string) {
  const event = structuredClone(fixture.event) as DetailedVerifiedEvent;
  event.verification.checkedAt = at;
  event.verification.expiresAt = new Date(
    Date.parse(at) + 3600000,
  ).toISOString();
  // Fixed pure generation workload: no validator/DB writes or arbitrary request input.
  // The committed fixture already has coherent fixed 2099 dates/evidence; only the
  // synthetic diagnostic lifetime is renewed, never a persisted real verification.
  const p = await renderPost(event, 1, 'observation', Date.parse(at));
  return {
    synthetic: true,
    externalRequests: 0,
    weightedLength: p.weightedLength,
    valid: p.weightedLength <= 280,
    templateVersion: p.templateVersion,
  };
}
