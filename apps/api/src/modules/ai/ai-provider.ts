import type { CreateTripInput, CatalogEntry } from '@goease/contracts';
export const AI_PROVIDER = Symbol('AI_PROVIDER');
/** Transport seam retained for offline fixtures and observed live calls. */
export interface AiProvider {
  generate(body: string, signal: AbortSignal): Promise<unknown>;
}
/** Provider-neutral interface consumed by itinerary orchestration. */
export interface AiPlanner {
  prepare(
    input: CreateTripInput,
    catalog: CatalogEntry[],
  ): (signal: AbortSignal) => Promise<unknown>;
}
