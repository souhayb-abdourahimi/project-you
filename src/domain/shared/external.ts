export type Confidence = 'high' | 'medium' | 'low';

/** Provenance attached to every important piece of external data. */
export interface ExternalDataMeta {
  provider: string;
  externalId: string | null;
  source: string;
  fetchedAt: string;
  updatedAt: string | null;
  confidence: Confidence;
  /** Demonstration data. The UI must render a MOCK badge when true. */
  isMock: boolean;
}
