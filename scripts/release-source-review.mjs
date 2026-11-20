import { readFileSync } from 'node:fs';
import { preflight } from './path-policy.mjs';

preflight();
const read = (file) => JSON.parse(readFileSync('data/' + file, 'utf8'));
const sources = read('sources.json'),
  byId = new Map(read('facilities.json').map((f) => [f.id, f]));
const supported = new Set(['html', 'rss', 'atom', 'sitemap']);
const sampleNames = new Set([
  'JAXA筑波宇宙センター',
  'ひろのまきば天文台',
  '桐生市立図書館 天体観察イベント',
]);
const items = sources.map((s) => {
  const facility = byId.get(s.facilityId),
    target = new URL(s.url);
  const formats = [
    ...new Set([...(s.observedFormats ?? []), ...(s.format ? [s.format] : [])]),
  ];
  return {
    id: s.id,
    name: s.name,
    registryState: s.state,
    officialStatus: s.officialStatus,
    operator: s.operator ?? null,
    officialEvidence: s.evidenceUrl ?? null,
    checkedAt: s.checkedAt ?? null,
    target: s.url,
    hostListed: s.allowedHosts.includes(target.hostname),
    allowedHosts: s.allowedHosts,
    scope:
      'current platform rejects unapproved host and redirect; per-source paths pending',
    robotsRecorded: s.robotsStatus ?? null,
    robotsCheckedAt: s.robotsCheckedAt ?? null,
    termsRecorded: s.termsStatus ?? null,
    termsCheckedAt: s.termsCheckedAt ?? null,
    preservedTermsLinks: s.termsLinks ?? [],
    observedFormats: formats,
    recognizedFormat: formats.some((f) => supported.has(f)),
    parserApproved: s.parserApproved === true,
    minIntervalSeconds: s.minIntervalSeconds ?? null,
    collectorBodyLimitBytes: 262144,
    measuredResponseBytes: null,
    facilityStatus: facility?.operatingStatus ?? null,
    facilityCheckedAt: facility?.lastVerifiedAt ?? null,
    shortlist: sampleNames.has(s.name),
    approval: s.state === 'active',
  };
});
const shortlist = items.filter((row) => row.shortlist);
if (
  shortlist.length !== sampleNames.size ||
  shortlist.some(
    (row) =>
      row.approval ||
      row.registryState !== 'review' ||
      !row.hostListed ||
      row.officialStatus !== 'Verified',
  )
)
  throw Error('SOURCE_REVIEW_SHORTLIST_CHANGED');
const result = {
  method: 'offline review of preserved Source and Facility evidence',
  networkRequests: 0,
  actualApprovals: items.filter((s) => s.approval).length,
  sourceCount: items.length,
  officialCount: items.filter((s) => s.officialStatus === 'Verified').length,
  shortlist: shortlist.map((s) => s.id),
  items,
};
if (process.argv[2] === '--check') {
  if (
    result.sourceCount !== 114 ||
    result.officialCount !== 95 ||
    result.actualApprovals !== 0
  )
    throw Error('SOURCE_REVIEW_BASELINE');
  console.log(
    'Reviewed preserved evidence for 114 Sources. Shortlisted 3 inactive candidates; no network calls.',
  );
} else if (process.argv.length === 2) {
  console.log(JSON.stringify(result, null, 2));
} else throw Error('SOURCE_REVIEW_ARGS');
