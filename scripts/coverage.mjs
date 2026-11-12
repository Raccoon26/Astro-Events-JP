import { existsSync, readFileSync } from 'node:fs';

const requiredDocs = [
  'README',
  'PROJECT_STATUS',
  'ARCHITECTURE',
  'REQUIREMENTS',
  'DEV_ROADMAP',
  'DATA_MODEL',
  'SOURCE_POLICY',
  'FREE_TIER_POLICY',
  'SECURITY',
  'LOCAL_DEVELOPMENT',
  'CLEANUP_POLICY',
  'TEST_PLAN',
  'RELEASE_CHECKLIST',
  'GITHUB_WORKFLOW',
  'CLOUDFLARE_SETUP',
  'DEPLOYMENT',
  'DISASTER_RECOVERY',
  'SOURCE_COVERAGE',
  'VTUBER_VERIFICATION',
  'COLLECTOR_DESIGN',
  'PARSER_SUPPORT',
  'SOURCE_DISCOVERY',
  'SSRF_SECURITY_AUDIT',
  'COLLECTION_BENCHMARK',
];
for (const name of requiredDocs)
  if (
    !existsSync(`${name}.md`) ||
    readFileSync(`${name}.md`, 'utf8').length < 200
  )
    throw new Error(`Missing document: ${name}`);
const coverage = JSON.parse(readFileSync('requirements-coverage.json', 'utf8'));
const requirements = readFileSync('REQUIREMENTS.md', 'utf8');
for (let i = 1; i <= 32; i++) {
  const id = `R${String(i).padStart(2, '0')}`;
  const item = coverage.requirements[id];
  if (
    !requirements.includes(`| ${id} |`) ||
    !item ||
    !item.devs.length ||
    item.devs.some((dev) => !Number.isInteger(dev) || dev < 0 || dev > 10) ||
    !item.evidence.length ||
    item.evidence.some((file) => !existsSync(file))
  )
    throw new Error(`Uncovered requirement: ${id}`);
}
for (let i = 0; i <= 24; i++)
  if (
    !coverage.requestSections[i]?.length ||
    coverage.requestSections[i].some((id) => !coverage.requirements[id])
  )
    throw new Error(`Unmapped original request section: ${i}`);
const roadmap = readFileSync('DEV_ROADMAP.md', 'utf8');
for (let i = 0; i <= 10; i++)
  if (
    !new RegExp(`^\\|\\s*${String(i).padStart(2, '0')}\\s*\\|`, 'm').test(
      roadmap,
    )
  )
    throw new Error(`Missing DEV ${i}`);
const contracts = readFileSync('src/contracts.ts', 'utf8');
for (const name of [
  'Scheduler',
  'SourceRegistry',
  'SourceDiscovery',
  'Collector',
  'EventExtractor',
  'EventValidator',
  'FacilityMonitor',
  'VTuberMonitor',
  'ImageMetadataExtractor',
  'DeduplicationEngine',
  'PostGenerator',
  'NotificationService',
  'RetentionManager',
  'BudgetGuard',
  'MonitoringService',
])
  if (!contracts.includes(`export interface ${name} `))
    throw new Error(`Missing module ${name}`);
for (const name of requiredDocs) {
  const text = readFileSync(`${name}.md`, 'utf8');
  for (const match of text.matchAll(/\]\(([^)#]+\.md)(?:#[^)]*)?\)/g))
    if (!existsSync(match[1]))
      throw new Error(`Broken doc link in ${name}: ${match[1]}`);
}
console.log(
  `Coverage: R01–R32, original sections 0–24, ${requiredDocs.length} documents, 11 DEV milestones and 15 module contracts present. Semantic/regression review is separate.`,
);
const dev01 = JSON.parse(readFileSync('dev01-coverage.json', 'utf8'));
for (let i = 0; i <= 18; i++) {
  const item = dev01.sections[i];
  if (
    !item?.status ||
    !item.evidence?.length ||
    item.evidence.some((file) => !existsSync(file))
  )
    throw new Error(`Unmapped DEV01 section ${i}`);
}
if (dev01.operationalCompletion !== 'blocked-authentication-deferred-by-user')
  throw new Error(
    'Update DEV01 completion audit only after actual remote verification',
  );
console.log(
  'DEV01 sections 0–18 mapped; remote authentication/operational completion explicitly blocked.',
);
const dev02 = JSON.parse(readFileSync('dev02-coverage.json', 'utf8'));
for (let section = 0; section <= 24; section++) {
  const item = dev02.sections[section];
  if (
    !item?.status ||
    !item.evidence?.length ||
    item.evidence.some((file) => !existsSync(file))
  )
    throw new Error(`Unmapped DEV02 section ${section}`);
}
if (dev02.remoteDEV01 !== 'deferred-by-user-no-reauthentication')
  throw new Error('DEV01 deferral must be preserved');
console.log(
  'DEV02 sections 0–24 mapped; evidence/approval limitations remain explicit.',
);
const dev03 = JSON.parse(readFileSync('dev03-coverage.json', 'utf8'));
for (let section = 0; section <= 29; section++) {
  const item = dev03.sections[section];
  if (
    !item?.status ||
    !item.evidence?.length ||
    item.evidence.some((file) => !existsSync(file))
  )
    throw new Error(`Unmapped DEV03 section ${section}`);
}
if (dev03.remoteDEV01 !== 'deferred-by-user-no-reauthentication')
  throw new Error('DEV01 deferral must remain');
console.log(
  'DEV03 sections 0–29 mapped; local fixtures, live approval 0 and remote CPU/transport limitations explicit.',
);
const dev01r = JSON.parse(readFileSync('dev01r-coverage.json', 'utf8'));
for (let section = 0; section <= 20; section++)
  if (
    !dev01r.sections[section]?.status ||
    dev01r.sections[section].evidence?.some((file) => !existsSync(file))
  )
    throw new Error(`Unmapped DEV01R section ${section}`);
console.log(
  'DEV01R sections 0–20 mapped. Earlier DEV01–03 deferral records are historical; PROJECT_STATUS and DEV01R evidence determine current remote completion.',
);
