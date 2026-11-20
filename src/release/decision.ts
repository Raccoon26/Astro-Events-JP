export const CODE_GATES = [
  'contractRehearsal',
  'securityAudit',
  'costDesign',
  'requiredCi',
  'protectedMerge',
] as const;
export const STAGING_GATES = [
  'stagingApproval',
  'remoteSchema',
  'peerProof',
  'sourceApproval',
  'officialCpu',
  'accountBudget',
  'observabilityUsage',
  'reportsApp',
  'limitedDelivery',
  'recovery',
  'rollback',
] as const;
export const PRODUCTION_GATES = [
  'productionApproval',
  'acceptedRisks',
  'costApproval',
  'deploymentProof',
  'activationControls',
  'stopPlan',
] as const;
type Gate = (
  | typeof CODE_GATES
  | typeof STAGING_GATES
  | typeof PRODUCTION_GATES
)[number];
export function releaseVerdict(evidence: Partial<Record<Gate, boolean>>) {
  const missing = (gates: readonly Gate[]) =>
    gates.filter((g) => evidence[g] !== true);
  const code = missing(CODE_GATES),
    staging = missing(STAGING_GATES),
    production = missing(PRODUCTION_GATES);
  const verdict = code.length
    ? 'BLOCKED'
    : staging.length
      ? 'CODE_READY / OPERATIONS_PENDING'
      : production.length
        ? 'STAGING_VALIDATED / PRODUCTION_PENDING'
        : 'PRODUCTION_READY';
  return { verdict, missing: { code, staging, production } };
}
