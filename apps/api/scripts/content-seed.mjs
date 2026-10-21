import { Pool } from 'pg';
import { pathToFileURL } from 'node:url';
import { getDestination, contentInputSchema } from '@goease/contracts';
import { additionalEditorialContent } from './content-seed-data.mjs';

const source = {
  title: 'Vietnam Tourism — Đà Lạt (kiểm tra 21/10/2026)',
  url: 'https://vietnam.travel/places-to-go/south-central-coast-central-highlands/dalat',
};
export const initialContent = [
  {
    id: 'da-lat',
    kind: 'destination',
    title: 'Đà Lạt',
    summary: 'Khám phá thành phố cao nguyên theo nhịp riêng của bạn.',
    body: 'Đà Lạt là điểm khởi đầu cho những chuyến đi giữa thiên nhiên, vườn hoa và những góc phố cao nguyên. Lưu lại những nơi bạn muốn đến rồi tự sắp xếp thời gian phù hợp. Kiểm tra giờ mở cửa và giá với đơn vị vận hành trước chuyến đi.',
    status: 'published',
    destinationId: null,
    categoryIds: [],
    image: null,
    address: 'Đà Lạt, Việt Nam',
    coordinates: getDestination('da-lat').center,
    destination: getDestination('da-lat'),
    sources: [source],
  },
  {
    id: 'thien-nhien',
    kind: 'category',
    title: 'Thiên nhiên',
    summary: 'Những khoảng xanh cho hành trình.',
    body: 'Khám phá các điểm đến gắn với cảnh quan thiên nhiên. Nội dung biên tập sẽ được bổ sung khi đã kiểm tra nguồn.',
    status: 'published',
    destinationId: null,
    categoryIds: [],
    image: null,
    address: '',
    coordinates: null,
    destination: null,
    sources: [source],
  },
  ...additionalEditorialContent,
].map((entry) => contentInputSchema.parse(entry));

export async function seedContent(databaseUrl) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    await tx.query('SELECT pg_advisory_xact_lock(781602)');
    for (const entry of initialContent) {
      const dependencies = [
        ...entry.categoryIds,
        ...(entry.destinationId ? [entry.destinationId] : []),
      ];
      const refs = dependencies.length
        ? (
            await tx.query(
              'SELECT id,kind,status FROM "EditorialContent" WHERE id=ANY($1::varchar[])',
              [dependencies],
            )
          ).rows
        : [];
      // An admin may have hidden/replaced a seed parent. Preserve that decision;
      // do not publish new descendants into an invalid reference graph.
      if (
        dependencies.some(
          (id) =>
            !refs.some(
              (row) =>
                row.id === id &&
                row.kind === (id === entry.destinationId ? 'destination' : 'category') &&
                (entry.status !== 'published' || row.status === 'published'),
            ),
        )
      )
        continue;
      const inserted = await tx.query(
        'INSERT INTO "EditorialContent" (id,kind,status,title,"destinationId",payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id',
        [
          entry.id,
          entry.kind,
          entry.status,
          entry.title,
          entry.destinationId,
          JSON.stringify(entry),
        ],
      );
      if (inserted.rowCount)
        for (const categoryId of entry.categoryIds)
          await tx.query(
            'INSERT INTO "EditorialCategory" ("contentId","categoryId") VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [entry.id, categoryId],
          );
    }
    await tx.query('COMMIT');
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally {
    tx.release();
    await pool.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.MIGRATION_DATABASE_URL)
    throw Error('Explicit MIGRATION_DATABASE_URL required; no runtime or production fallback.');
  await seedContent(process.env.MIGRATION_DATABASE_URL);
  console.info(
    'Editorial seed inserted missing IDs only; existing edits preserved. No provider calls.',
  );
}
