import { catalogEntriesSchema, catalogSchema, type CatalogEntry, type Place } from '@goease/contracts';
import { rawDalatCatalog } from './dalat.js';

export const CATALOG_INFO = Object.freeze({
  destinationId: 'da-lat', accessedOn: '2026-10-14',
  label: 'Danh mục demo — kiểm tra vị trí, giờ mở cửa và giá trước khi đi.',
  sourceName: 'Cổng thông tin du lịch Lâm Đồng', sourceUrl: 'https://visitlamdong.vn/vi/places',
});

// Invalid bundled data must fail validation, never silently become an empty list.
const entries = catalogEntriesSchema.parse(rawDalatCatalog);

/** Return independent copies so an editor cannot modify the shared catalog. */
export function getDalatCatalog(): CatalogEntry[] {
  return catalogEntriesSchema.parse(entries);
}

/** Project metadata to the existing strict Place contract for generators/API. */
export function getDalatPlaces(): Place[] {
  return catalogSchema.parse(entries.map(({ id, name, destinationId, coordinates, sources }) => ({
    id, name, destinationId, coordinates, sources,
  })));
}

export function findDalatCatalogEntry(id: string): CatalogEntry | undefined {
  return getDalatCatalog().find((entry) => entry.id === id);
}
