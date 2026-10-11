import { pathToFileURL } from 'node:url';
import { createDatabaseClient } from './client.js';
import { samplePlaces } from './sample-catalog.js';
export { samplePlaces } from './sample-catalog.js';

// Only CC0 structured coordinates and our own short names; no provider payload,
// photos, prices, partner inventory, login identities or default administrator.
export async function seedCatalog(database: ReturnType<typeof createDatabaseClient>) {
  await database.$transaction(samplePlaces.map(({ entity, revision, precision, ...place }) => {
    const data = {
      ...place, destinationCode: 'VN-HANOI-SAMPLE', isSample: true, active: true,
      sourceUrl: `https://www.wikidata.org/w/index.php?title=${entity}&oldid=${revision}`,
      attribution: `Wikidata contributors · CC0-1.0 · ${entity} P625 revision ${revision}; retrieved 2026-10-11; source precision ${precision}°; approximate sample point, no price/availability.`,
    };
    return database.place.upsert({ where: { code: place.code }, create: data, update: data });
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const database = createDatabaseClient();
  try { await seedCatalog(database); console.info('Sample catalog seeded (3 CC0 points; no users/admin).'); }
  catch { console.error('Catalog seed failed; inspect the private database environment.'); process.exitCode = 1; }
  finally { await database.$disconnect(); }
}
