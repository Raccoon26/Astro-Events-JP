import type {
  CrawlRun,
  Delivery,
  Event,
  Evidence,
  Facility,
  GeneratedPost,
  ImageMetadata,
  PublicationStatus,
  Report,
  Source,
  Usage,
  Validation,
  VerifiedEvent,
  Vtuber,
} from './domain';
export interface Scheduler {
  select(now: string, limit: number): Promise<Source[]>;
  checkpoint(run: CrawlRun): Promise<void>;
}
export interface SourceRegistry {
  get(id: string): Promise<Source | null>;
  save(source: Source): Promise<void>;
  listPrefecture(code: number, cursor: string | null): Promise<Source[]>;
}
export interface DiscoveryCandidate {
  url: string;
  discoveredFrom: string;
  prefecture: number | null;
  reason: string;
}
export interface SourceDiscovery {
  discover(source: Source): Promise<DiscoveryCandidate[]>;
  submit(candidate: DiscoveryCandidate): Promise<void>;
}
export interface CollectedPage {
  sourceId: string;
  url: string;
  content: string;
  contentType: string;
  digest: string;
  fetchedAt: string;
}
export interface Collector {
  collect(source: Source, signal: AbortSignal): Promise<CollectedPage | null>;
}
export interface EventExtractor {
  extract(page: CollectedPage): Promise<Event[]>;
}
export interface EventValidator {
  validate(event: Event): Promise<Validation>;
  verify(event: Validation): VerifiedEvent | null;
}
export interface FacilityImpact {
  facility: Facility;
  affectedEvents: string[];
  evidence: Evidence[];
  cancellationConfirmed: boolean;
}
export interface FacilityMonitor {
  inspect(facility: Facility): Promise<FacilityImpact>;
}
export interface VTuberMonitor {
  inspect(vtuber: Vtuber): Promise<Event[]>;
}
export interface ImageMetadataExtractor {
  extract(page: CollectedPage): Promise<ImageMetadata[]>;
}
export interface DeduplicationEngine {
  fingerprint(event: Event): Promise<string>;
  match(event: Event): Promise<{
    eventId: string | null;
    confidence: number;
    needsReview: boolean;
  }>;
}
export interface PostGenerator {
  generate(
    event: VerifiedEvent,
    kind: GeneratedPost['kind'],
  ): Promise<GeneratedPost>;
  validateLength(text: string): { weightedLength: number; valid: boolean };
}
export interface NotificationService {
  deliver(report: Report, delivery: Delivery): Promise<Delivery>;
  callback(token: string, action: PublicationStatus): Promise<void>;
}
export interface RetentionManager {
  plan(
    now: string,
    batchSize: number,
  ): Promise<{ eventIds: string[]; fingerprints: number; runs: number }>;
  execute(now: string, batchSize: number): Promise<void>;
}
export interface BudgetGuard {
  allow(usage: Usage, estimated: Usage): boolean;
  defer(sourceId: string, until: string): Promise<void>;
}
export interface MonitoringService {
  record(run: CrawlRun, usage: Usage): Promise<void>;
  warn(
    code: string,
    safeContext: Readonly<Record<string, number | boolean>>,
  ): Promise<void>;
}
