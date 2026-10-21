import {
  contentInputSchema,
  contentUpdateSchema,
  contentQuerySchema,
  contentRecordSchema,
  contentPageSchema,
  destinationIdSchema,
  type ContentInput,
  type ContentQuery,
} from '@goease/contracts';
import type { ApiConfig } from '../../config/env.js';
import { ApiFailure } from '../../common/errors/api-failure.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  ActorTransactionService,
  type Transaction,
  type Owner,
} from '../../database/actor-transaction.service.js';
import { AccountIdentityService } from '../auth/account-identity.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { isVietnamCoordinate } from '../discovery/vietnam-coverage.js';

type Row = { payload: unknown; version: number; updatedAt: Date };
const record = (row: Row) =>
  contentRecordSchema.parse({
    entry: row.payload,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  });
const publicWhere: Prisma.EditorialContentWhereInput = {
  status: 'published',
  OR: [{ destinationId: null }, { parent: { status: 'published', kind: 'destination' } }],
};
export class ContentService {
  constructor(
    private readonly config: ApiConfig,
    private readonly db: PrismaService,
    private readonly identity: AccountIdentityService,
    private readonly transactions: ActorTransactionService,
  ) {}

  private query(query: unknown) {
    const parsed = contentQuerySchema.safeParse(query);
    if (!parsed.success) throw new ApiFailure(400, 'BAD_REQUEST', 'Bộ lọc nội dung không hợp lệ.');
    return parsed.data;
  }
  private id(id: string) {
    if (!destinationIdSchema.safeParse(id).success)
      throw new ApiFailure(400, 'BAD_REQUEST', 'ID không hợp lệ.');
    return id;
  }
  private async admin<T>(
    authorization: string | undefined,
    signal: AbortSignal,
    action: (tx: Transaction) => Promise<T>,
  ) {
    if (!this.config.CATALOG_ADMIN_ENABLED)
      throw new ApiFailure(503, 'ADMIN_DISABLED', 'Quản trị nội dung đang tắt.');
    const owner = await this.identity.verify(authorization, signal);
    return this.transactions.run(owner, signal, async (tx) => {
      const rows = await tx.$queryRaw<
        { enabled: boolean }[]
      >`SELECT enabled FROM "CatalogAdmin" WHERE issuer=${owner.ownerIssuer} AND subject=${owner.ownerSubject}::uuid`;
      if (!rows[0]?.enabled)
        throw new ApiFailure(403, 'ADMIN_FORBIDDEN', 'Cần quyền quản trị nội dung.');
      return action(tx);
    });
  }
  private async page(tx: Transaction, query: ContentQuery, admin = false, owner?: Owner) {
    const limit = query.limit ?? 20;
    const rows = await tx.editorialContent.findMany({
      where: {
        AND: [
          admin ? {} : publicWhere,
          {
            ...(query.after ? { id: { gt: query.after } } : {}),
            ...(query.kind ? { kind: query.kind } : {}),
            ...(query.destinationId ? { destinationId: query.destinationId } : {}),
            ...(query.categoryId
              ? {
                  categories: {
                    some: { categoryId: query.categoryId, category: { status: 'published' } },
                  },
                }
              : {}),
            ...(query.q ? { title: { contains: query.q, mode: 'insensitive' as const } } : {}),
            ...(owner ? { favorites: { some: owner } } : {}),
          },
        ],
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    return contentPageSchema.parse({
      apiVersion: '1',
      items: rows.slice(0, limit).map(record),
      nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
    });
  }
  list(query: unknown) {
    return this.page(this.db.requireClient(), this.query(query));
  }
  adminList(authorization: string | undefined, signal: AbortSignal, query: unknown) {
    const parsed = this.query(query);
    return this.admin(authorization, signal, (tx) => this.page(tx, parsed, true));
  }
  async detail(id: string) {
    const row = await this.db
      .requireClient()
      .editorialContent.findFirst({ where: { AND: [publicWhere, { id: this.id(id) }] } });
    if (!row)
      throw new ApiFailure(404, 'NOT_FOUND', 'Nội dung chưa được công bố hoặc không tồn tại.');
    return record(row);
  }
  save(authorization: string | undefined, signal: AbortSignal, body: unknown, id?: string) {
    return this.admin(authorization, signal, async (tx) => {
      const parsed = id ? contentUpdateSchema.safeParse(body) : contentInputSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiFailure(400, 'BAD_REQUEST', 'Nội dung hoặc nguồn chưa hợp lệ.');
      const data = parsed.data;
      const entry: ContentInput = 'entry' in data ? data.entry : data;
      if (
        entry.status === 'published' &&
        ((entry.destination &&
          (entry.destination.countryCode !== 'VN' ||
            !isVietnamCoordinate(entry.destination.center))) ||
          (entry.coordinates && !isVietnamCoordinate(entry.coordinates)))
      )
        throw new ApiFailure(
          400,
          'BAD_REQUEST',
          'Chỉ công bố điểm đến và tọa độ trong vùng Việt Nam được hỗ trợ lập kế hoạch.',
        );
      if (id && entry.id !== this.id(id)) throw new ApiFailure(400, 'BAD_REQUEST', 'Không đổi ID.');
      // Serialize publication/reference checks and category replacement across API workers.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(781602)`;
      const current = await tx.editorialContent.findUnique({ where: { id: entry.id } });
      if (
        (!id && current) ||
        (id &&
          (!current || !('expectedVersion' in data) || current.version !== data.expectedVersion))
      )
        throw new ApiFailure(409, 'CATALOG_CONFLICT', 'Nội dung đã đổi; tải lại để đối chiếu.');
      if (current && current.kind !== entry.kind)
        throw new ApiFailure(400, 'BAD_REQUEST', 'Loại nội dung là bất biến.');
      if (entry.destinationId) {
        const parent = await tx.editorialContent.findUnique({ where: { id: entry.destinationId } });
        if (
          !parent ||
          parent.kind !== 'destination' ||
          (entry.status === 'published' && parent.status !== 'published')
        )
          throw new ApiFailure(
            400,
            'BAD_REQUEST',
            'Cần điểm đến hợp lệ, đã công bố trước nội dung.',
          );
      }
      const categories = await tx.editorialContent.findMany({
        where: {
          id: { in: entry.categoryIds },
          kind: 'category',
          ...(entry.status === 'published' ? { status: 'published' } : {}),
        },
        take: 12,
      });
      if (categories.length !== entry.categoryIds.length)
        throw new ApiFailure(400, 'BAD_REQUEST', 'Chủ đề không hợp lệ hoặc chưa công bố.');
      const values = {
        kind: entry.kind,
        status: entry.status,
        title: entry.title,
        destinationId: entry.destinationId,
        payload: JSON.parse(JSON.stringify(entry)) as Prisma.InputJsonValue,
        updatedAt: new Date(),
        version: (current?.version ?? 0) + 1,
      };
      const saved = current
        ? await tx.editorialContent.update({ where: { id: entry.id }, data: values })
        : await tx.editorialContent.create({ data: { id: entry.id, ...values } });
      await tx.editorialCategory.deleteMany({ where: { contentId: entry.id } });
      if (entry.categoryIds.length)
        await tx.editorialCategory.createMany({
          data: entry.categoryIds.map((categoryId) => ({ contentId: entry.id, categoryId })),
        });
      return record(saved);
    });
  }
  async favorites(authorization: string | undefined, signal: AbortSignal, query: unknown) {
    const parsed = this.query(query),
      owner = await this.identity.verify(authorization, signal);
    return this.transactions.run(owner, signal, (tx) => this.page(tx, parsed, false, owner));
  }
  async favorite(
    authorization: string | undefined,
    signal: AbortSignal,
    id: string,
    remove = false,
  ) {
    this.id(id);
    const owner = await this.identity.verify(authorization, signal);
    return this.transactions.run(owner, signal, async (tx) => {
      if (remove) await tx.contentFavorite.deleteMany({ where: { ...owner, contentId: id } });
      else {
        const row = await tx.editorialContent.findFirst({ where: { AND: [publicWhere, { id }] } });
        if (!row) throw new ApiFailure(404, 'NOT_FOUND', 'Nội dung chưa được công bố.');
        await tx.contentFavorite.createMany({
          data: [{ ...owner, contentId: id }],
          skipDuplicates: true,
        });
      }
      return { apiVersion: '1', saved: !remove };
    });
  }
}
