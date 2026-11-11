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
  'Coverage: R01–R32, original sections 0–24, 14 documents, 11 DEV milestones and 15 module contracts present. Semantic/regression review is separate.',
);
