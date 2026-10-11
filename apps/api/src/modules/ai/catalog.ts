import type { AiCandidatePlace } from '@goease/contracts';
import { createDatabaseClient } from '../../database/client.js';
import { samplePlaces } from '../../database/sample-catalog.js';
import { AiError } from './errors.js';
import { prepareAiRequest, requestFromCatalog } from './schedule.js';

interface SampleCatalogRow {
  id: string; code: string; destinationCode: string; name: string;
  latitude: { toNumber(): number }; longitude: { toNumber(): number };
  sourceUrl: string; attribution: string; active: boolean; isSample: boolean;
}

/** Validate the actual rows before their labels can reach a provider request. */
export function validateApprovedSampleRows(rows: readonly SampleCatalogRow[]): AiCandidatePlace[] {
  if (rows.length !== samplePlaces.length || new Set(rows.map(row => row.code)).size !== samplePlaces.length) {
    throw new AiError('AI_INVALID_INPUT');
  }
  const catalog = rows.map(row => {
    const seed = samplePlaces.find(place => place.code === row.code);
    if (!seed || row.destinationCode !== 'VN-HANOI-SAMPLE' || row.name !== seed.name
      || row.latitude.toNumber() !== Number(seed.latitude) || row.longitude.toNumber() !== Number(seed.longitude)
      || row.sourceUrl !== `https://www.wikidata.org/w/index.php?title=${seed.entity}&oldid=${seed.revision}`
      || row.attribution !== `Wikidata contributors · CC0-1.0 · ${seed.entity} P625 revision ${seed.revision}; retrieved 2026-10-11; source precision ${seed.precision}°; approximate sample point, no price/availability.`) {
      throw new AiError('AI_INVALID_INPUT');
    }
    return { id: row.id, destinationCode: row.destinationCode, name: row.name,
      latitude: row.latitude.toNumber(), longitude: row.longitude.toNumber(), sourceUrl: row.sourceUrl,
      attribution: row.attribution, active: row.active, isSample: row.isSample };
  });
  prepareAiRequest(requestFromCatalog(1, catalog), catalog);
  return catalog;
}

/** Internal probe reads the existing three approved CC0 seeds; never creates Places. */
export async function loadApprovedSampleCatalog(databaseUrl: string): Promise<AiCandidatePlace[]> {
  const database = createDatabaseClient(databaseUrl);
  try {
    const rows = await database.place.findMany({ where: { code: { in: samplePlaces.map(place => place.code) } },
      orderBy: { code: 'asc' }, select: { id: true, code: true, destinationCode: true, name: true,
        latitude: true, longitude: true, sourceUrl: true, attribution: true, active: true, isSample: true } });
    return validateApprovedSampleRows(rows);
  } catch (error) {
    throw error instanceof AiError ? error : new AiError('AI_INVALID_INPUT');
  } finally { await database.$disconnect(); }
}
