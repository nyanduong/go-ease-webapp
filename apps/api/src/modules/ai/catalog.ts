import type { AiCandidatePlace } from '@goease/contracts';
import { createDatabaseClient } from '../../database/client.js';
import { samplePlaces } from '../../database/seed.js';
import { AiError } from './errors.js';
import { prepareAiRequest, requestFromCatalog } from './schedule.js';

/** Internal probe reads the existing three approved CC0 seeds; never creates Places. */
export async function loadApprovedSampleCatalog(databaseUrl: string): Promise<AiCandidatePlace[]> {
  const database = createDatabaseClient(databaseUrl);
  try {
    const rows = await database.place.findMany({ where: { code: { in: samplePlaces.map(place => place.code) } },
      orderBy: { code: 'asc' }, select: { id: true, code: true, destinationCode: true, name: true,
        latitude: true, longitude: true, sourceUrl: true, attribution: true, active: true, isSample: true } });
    if (rows.length !== samplePlaces.length) throw new AiError('AI_INVALID_INPUT');
    const catalog = rows.map(row => {
      const seed = samplePlaces.find(place => place.code === row.code);
      if (!seed || row.destinationCode !== 'VN-HANOI-SAMPLE'
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
  } catch (error) {
    throw error instanceof AiError ? error : new AiError('AI_INVALID_INPUT');
  } finally { await database.$disconnect(); }
}
