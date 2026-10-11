import { pathToFileURL } from 'node:url';
import { createDatabaseClient } from './client.js';

// Only CC0 structured coordinates and our own short names; no provider payload,
// photos, prices, partner inventory, login identities or default administrator.
export const samplePlaces = [
  { code: 'sample-wikidata-Q1202019', name: 'Văn Miếu – Quốc Tử Giám', latitude: '21.028611', longitude: '105.835556', entity: 'Q1202019', revision: '2549929856', precision: '0.00001' },
  { code: 'sample-wikidata-Q1186043', name: 'Nhà hát Lớn Hà Nội', latitude: '21.024167', longitude: '105.857778', entity: 'Q1186043', revision: '2515896370', precision: '0.00027777777777778' },
  { code: 'sample-wikidata-Q206219', name: 'Hoàng thành Thăng Long', latitude: '21.032500', longitude: '105.839720', entity: 'Q206219', revision: '2553059818', precision: '0.0001' },
] as const;

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
