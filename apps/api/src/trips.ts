import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from './generated/prisma/client.js';
import { getDalatCatalog } from '@goease/catalog';
import { catalogEntrySchema, managedCatalogSchema } from '@goease/contracts';
import { createServerTripSchema, updateServerTripSchema, deleteServerTripSchema, idSchema, tripSchemaWithCatalog, tripMutationResultSchema, tripMutationResponseSchema, serverTripResponseSchema, serverTripListQuerySchema, serverTripListResponseSchema, type Trip } from '@goease/contracts';
import type { ApiConfig } from './config.js';
import { AuthVerifier } from './auth.js';
import { ApiFailure } from './errors.js';
import { requestSignal } from './request-signal.js';

type Owner = { ownerIssuer: string; ownerSubject: string };
type Stored = Prisma.TripGetPayload<{ include: { days: { include: { activities: true } } } }>;
const include = { days: { orderBy: { position: 'asc' as const }, include: { activities: { orderBy: { position: 'asc' as const } } } } };
function alive(signal: AbortSignal) { if (signal.aborted) throw new ApiFailure(499, 'TRIPS_CANCELLED', 'Đã hủy thao tác. Nếu mất phản hồi, đối soát bằng mutationId cũ.'); }
function record(row: Stored) {
  return serverTripResponseSchema.parse({ apiVersion: '1', version: row.version, updatedAt: row.updatedAt.toISOString(), trip: {
    schemaVersion: row.schemaVersion, id: row.id, ...(row.generationSource === null ? {} : { generationSource: row.generationSource }), name: row.name, destinationId: row.destinationId, startDate: row.startDate, durationDays: row.durationDays, people: row.people, budgetVnd: row.budgetVnd, timeZone: row.timeZone, currency: row.currency,
    days: row.days.map(day => ({ id: day.id, date: day.date, activities: day.activities.map(a => ({ id: a.id, name: a.name, location: a.locationKind === 'catalog' ? { kind: 'catalog', placeId: a.placeId } : { kind: 'custom' }, startTime: a.startTime, endTime: a.endTime, costVnd: a.costVnd, notes: a.notes })) })),
  } });
}
export class TripsService {
  private client?: PrismaClient;
  constructor(private readonly config: ApiConfig, private readonly auth: AuthVerifier) {
    if (config.TRIPS_ENABLED && config.DATABASE_URL) this.client = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DATABASE_URL, max: 4, connectionTimeoutMillis: 2000, idleTimeoutMillis: 5000, options: `-c statement_timeout=${config.TRIPS_DB_TIMEOUT_MS} -c lock_timeout=1000`, application_name: 'goease-private-trips' }, { onPoolError: () => {} }), log: [] });
  }
  async onModuleInit() {
    if (!this.client) return;
    try {
      const roles = await this.client.$queryRaw<{ unsafe: boolean }[]>`SELECT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR NOT pg_has_role(current_user,'goease_app','MEMBER') OR has_schema_privilege(current_user,'public','CREATE') OR has_database_privilege(current_user,current_database(),'CREATE') OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND roleid<>(SELECT oid FROM pg_roles WHERE rolname='goease_app')) OR EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tableowner=current_user)) AS unsafe FROM pg_roles WHERE rolname=current_user`;
      if (roles.length !== 1 || roles[0]!.unsafe) throw Error();
      const protectedTables = await this.client.$queryRaw<{ name: string; safe: boolean }[]>`SELECT c.relname AS name, (c.relrowsecurity AND c.relforcerowsecurity AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='owner_only')) AS safe FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('AppUser','Trip','TripDay','TripActivity','TripMutation')`;
      if (protectedTables.length !== 5 || protectedTables.some(table => !table.safe)) throw Error();
      const catalogTables=await this.client.$queryRaw<{safe:boolean}[]>`SELECT (c.relrowsecurity AND c.relforcerowsecurity) AS safe FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('Place','CatalogAdmin','PlaceRevision')`;
      if(catalogTables.length!==3||catalogTables.some(t=>!t.safe))throw Error();
      const places = await this.client.place.findMany({ orderBy: { id: 'asc' } });
      if (places.length < 8 || places.length > 20 || places.filter(p => p.enabled).length < 8 || places.some(place => { const entry = catalogEntrySchema.parse(place.snapshot); return place.id !== entry.id || place.name !== entry.name; })) throw Error();
    } catch { await this.client.$disconnect(); throw new Error('Private trip database unavailable, unsafe role or catalog seed missing'); }
  }
  async onModuleDestroy() { await this.client?.$disconnect(); }
  healthState() { return this.client ? 'configured-unverified' as const : 'not-configured' as const; }
  async managedCatalog() {
    if (!this.client) return managedCatalogSchema.parse({apiVersion:'1',places:getDalatCatalog().map(entry=>({entry,enabled:true,version:1}))});
    try { const rows = await this.client!.place.findMany({orderBy:{id:'asc'},take:21});return managedCatalogSchema.parse({apiVersion:'1',places:rows.map(p=>({entry:p.snapshot,version:p.version,enabled:p.enabled}))}); }
    catch { throw new ApiFailure(503,'DB_UNAVAILABLE','Catalog database chưa đáp ứng.'); }
  }
  async admin<T>(req: Request, action: (tx: Prisma.TransactionClient, owner: Owner) => Promise<T>) {
    if (!this.config.CATALOG_ADMIN_ENABLED) throw new ApiFailure(503,'ADMIN_DISABLED','Quản lý catalog đang tắt.');
    const owner = await this.identity(req);
    return this.transaction(owner,requestSignal(req),async tx=>{
      const permitted=await tx.$queryRaw<{enabled:boolean}[]>`SELECT enabled FROM "CatalogAdmin" WHERE issuer=${owner.ownerIssuer} AND subject=${owner.ownerSubject}::uuid`;
      if(!permitted[0]?.enabled)throw new ApiFailure(403,'ADMIN_FORBIDDEN','Tài khoản chưa được server cấp quyền catalog.');
      return action(tx,owner);
    });
  }
  async identity(req: Request): Promise<Owner> {
    if (!this.config.TRIPS_ENABLED) throw new ApiFailure(503, 'TRIPS_DISABLED', 'Chuyến server đang tắt; chuyến khách trên máy được giữ nguyên.');
    if (!this.client) throw new ApiFailure(503, 'TRIPS_NOT_CONFIGURED', 'Chưa cấu hình database riêng cho chuyến.');
    const result = await this.auth.verify(req.headers.authorization, {}, requestSignal(req));
    return { ownerIssuer: this.config.SUPABASE_AUTH_URL + '/auth/v1', ownerSubject: result.identity.id };
  }
  private async transaction<T>(owner: Owner, signal: AbortSignal, action: (tx: Prisma.TransactionClient) => Promise<T>) {
    try {
      alive(signal);
      return await this.client!.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('goease.issuer',${owner.ownerIssuer},true), set_config('goease.subject',${owner.ownerSubject},true)`;
        alive(signal); const result = await action(tx); alive(signal); return result;
      }, { maxWait: 1000, timeout: this.config.TRIPS_DB_TIMEOUT_MS, isolationLevel: 'ReadCommitted' });
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new ApiFailure(409, 'TRIP_CONFLICT', 'Chuyến đã thay đổi; đọc lại trước khi sửa.');
      throw new ApiFailure(503, 'DB_UNAVAILABLE', 'Chưa xác nhận ghi server. Giữ nội dung/mutationId để đối soát, không tự ghi đè hoặc tạo ID mới.');
    }
  }
  async list(owner: Owner, query: unknown, signal: AbortSignal) {
    const parsed = serverTripListQuerySchema.safeParse(query);
    if (!parsed.success) throw new ApiFailure(400, 'BAD_REQUEST', 'List chỉ nhận cursor ID hợp lệ.');
    return this.transaction(owner, signal, async tx => {
      const rows = await tx.trip.findMany({ where: { ...owner, deletedAt: null, ...(parsed.data.cursor ? { id: { gt: parsed.data.cursor } } : {}) }, orderBy: { id: 'asc' }, take: 21 });
      return serverTripListResponseSchema.parse({ apiVersion: '1', nextCursor: rows.length > 20 ? rows[19]!.id : null, items: rows.slice(0, 20).map(r => ({ id: r.id, name: r.name, startDate: r.startDate, durationDays: r.durationDays, people: r.people, version: r.version, updatedAt: r.updatedAt.toISOString() })) });
    });
  }
  async get(owner: Owner, id: string, signal: AbortSignal) {
    return this.transaction(owner, signal, async tx => {
      const row = await tx.trip.findFirst({ where: { ...owner, id, deletedAt: null }, include });
      if (!row) throw new ApiFailure(404, 'NOT_FOUND', 'Không có chuyến của tài khoản này.');
      return record(row);
    });
  }
  async mutate(owner: Owner, operation: 'create' | 'update' | 'delete', id: string, input: unknown, signal: AbortSignal) {
    const parsed = (operation === 'create' ? createServerTripSchema : operation === 'update' ? updateServerTripSchema : deleteServerTripSchema).safeParse(input);
    if (!parsed.success) throw new ApiFailure(400, 'BAD_REQUEST', 'Mutation cần mutationId, dữ liệu chuyến/version đúng contract; không nhận owner/role.');
    const data = parsed.data, trip: Trip | undefined = 'trip' in data ? data.trip : undefined, expected = 'expectedVersion' in data ? data.expectedVersion : undefined;
    if (trip && trip.id !== id) throw new ApiFailure(400, 'BAD_REQUEST', 'ID chuyến không hợp lệ.');
    const hash = createHash('sha256').update(JSON.stringify({ operation, id, data })).digest('hex');
    return this.transaction(owner, signal, async tx => {
      await tx.$executeRaw`INSERT INTO "AppUser" (issuer,subject) VALUES (${owner.ownerIssuer},${owner.ownerSubject}::uuid) ON CONFLICT DO NOTHING`;
      await tx.$queryRaw`SELECT subject FROM "AppUser" WHERE issuer=${owner.ownerIssuer} AND subject=${owner.ownerSubject}::uuid FOR UPDATE`;
      alive(signal);
      await tx.$executeRaw`DELETE FROM "TripMutation" WHERE "ownerIssuer"=${owner.ownerIssuer} AND "ownerSubject"=${owner.ownerSubject}::uuid AND "createdAt" < now() - interval '24 hours'`;
      const old = await tx.tripMutation.findUnique({ where: { ownerIssuer_ownerSubject_mutationId: { ...owner, mutationId: data.mutationId } } });
      if (old) {
        if (old.requestHash !== hash) throw new ApiFailure(409, 'IDEMPOTENCY_CONFLICT', 'mutationId đã dùng cho nội dung khác; không ghi đè.');
        return tripMutationResponseSchema.parse({ apiVersion: '1', mutationId: data.mutationId, replayed: true, result: tripMutationResultSchema.parse(old.result) });
      }
      if (await tx.tripMutation.count({ where: owner }) >= 200) throw new ApiFailure(429, 'TRIP_LIMIT', 'Đạt 200 thao tác mới trong 24 giờ của tài khoản.');
      const current = await tx.trip.findUnique({ where: { ownerIssuer_ownerSubject_id: { ...owner, id } } });
      if(trip){
        const catalog=await tx.place.findMany({take:21});
        const places=catalog.map(p=>{const {id,name,destinationId,coordinates,sources}=catalogEntrySchema.parse(p.snapshot);return {id,name,destinationId,coordinates,sources};});
        const previous=await tx.tripActivity.findMany({where:{...owner,tripId:id},select:{id:true,placeId:true,name:true}});
        const old=new Map(previous.map(a=>[a.id,a]));
        // Validate legacy names against their saved activity, while new references need the current canonical name.
        const checking={...trip,days:trip.days.map(d=>({...d,activities:d.activities.map(a=>{const location=a.location,prior=old.get(a.id);return location.kind==='catalog'&&prior?.placeId===location.placeId&&prior.name===a.name?{...a,name:places.find(p=>p.id===location.placeId)?.name??a.name}:a;})}))};
        if(!tripSchemaWithCatalog(places).safeParse(checking).success)throw new ApiFailure(400,'BAD_REQUEST','Catalog/ngày/giờ/tiền không hợp lệ.');
        if(trip.days.some(d=>d.activities.some(a=>{const location=a.location;return location.kind==='catalog'&&catalog.find(p=>p.id===location.placeId)?.enabled===false&&old.get(a.id)?.placeId!==location.placeId;})))throw new ApiFailure(400,'BAD_REQUEST','Địa điểm đã vô hiệu hóa chỉ được giữ trong hoạt động đã lưu trước đó.');
      }
      if (operation === 'create') {
        if (current) throw new ApiFailure(409, 'TRIP_CONFLICT', 'ID chuyến đã tồn tại hoặc đã xóa; không tạo lại với ID này.');
        if (await tx.trip.count({ where: owner }) >= 200 || await tx.trip.count({ where: { ...owner, deletedAt: null } }) >= 50) throw new ApiFailure(429, 'TRIP_LIMIT', 'Giới hạn MVP: 50 chuyến đang lưu, 200 ID đã dùng/tài khoản.');
      } else if (!current || current.deletedAt) throw new ApiFailure(404, 'NOT_FOUND', 'Không có chuyến của tài khoản này.');
      else if (current.version !== expected || current.version === 2147483647) throw new ApiFailure(409, 'TRIP_CONFLICT', 'Version đã thay đổi; đọc lại trước khi sửa/xóa.');
      const timestamp = new Date(); let result;
      if (operation === 'delete') {
        await tx.tripDay.deleteMany({ where: { ...owner, tripId: id } });
        const updated = await tx.trip.update({ where: { ownerIssuer_ownerSubject_id: { ...owner, id } }, data: { version: { increment: 1 }, deletedAt: timestamp, updatedAt: timestamp } });
        result = { kind: 'deleted' as const, id, version: updated.version, deletedAt: timestamp.toISOString() };
      } else {
        const { days, id: tripId, ...fields } = trip!;
        if (operation === 'create') await tx.trip.create({ data: { ...owner, id: tripId, ...fields, generationSource: fields.generationSource ?? null, updatedAt: timestamp } });
        else {
          await tx.trip.update({ where: { ownerIssuer_ownerSubject_id: { ...owner, id } }, data: { ...fields, generationSource: fields.generationSource ?? null, version: { increment: 1 }, updatedAt: timestamp } });
          await tx.tripDay.deleteMany({ where: { ...owner, tripId: id } });
        }
        await tx.tripDay.createMany({ data: days.map((day, position) => ({ ...owner, tripId, id: day.id, date: day.date, position })) });
        const activities = days.flatMap(day => day.activities.map((a, position) => ({ ...owner, tripId, dayId: day.id, id: a.id, position, name: a.name, locationKind: a.location.kind, placeId: a.location.kind === 'catalog' ? a.location.placeId : null, startTime: a.startTime, endTime: a.endTime, costVnd: a.costVnd, notes: a.notes })));
        if (activities.length) await tx.tripActivity.createMany({ data: activities });
        const saved = record((await tx.trip.findFirst({ where: { ...owner, id, deletedAt: null }, include }))!);
        result = { kind: 'saved' as const, trip: saved.trip, version: saved.version, updatedAt: saved.updatedAt };
      }
      const checked = tripMutationResultSchema.parse(result); alive(signal);
      await tx.tripMutation.create({ data: { ...owner, mutationId: data.mutationId, requestHash: hash, result: JSON.parse(JSON.stringify(checked)) as Prisma.InputJsonValue } });
      return tripMutationResponseSchema.parse({ apiVersion: '1', mutationId: data.mutationId, replayed: false, result: checked });
    });
  }
}
function tripId(value: string) { const parsed = idSchema.safeParse(value); if (!parsed.success) throw new ApiFailure(400, 'BAD_REQUEST', 'ID chuyến không hợp lệ.'); return parsed.data; }
function noQuery(query: unknown) { if (!query || typeof query !== 'object' || Object.keys(query).length) throw new ApiFailure(400, 'BAD_REQUEST', 'Endpoint không nhận query.'); }
@Controller('v1/trips')
export class TripsController {
  constructor(@Inject(TripsService) private readonly trips: TripsService) {}
  @Get() async list(@Req() req: Request, @Query() query: unknown) { return this.trips.list(await this.trips.identity(req), query, requestSignal(req)); }
  @Get(':id') async get(@Req() req: Request, @Param('id') id: string, @Query() query: unknown) { noQuery(query); return this.trips.get(await this.trips.identity(req), tripId(id), requestSignal(req)); }
  @Post() async create(@Req() req: Request, @Body() body: unknown, @Query() query: unknown) { noQuery(query); const parsed = createServerTripSchema.safeParse(body); if (!parsed.success) throw new ApiFailure(400, 'BAD_REQUEST', 'Create cần mutationId và Trip đúng contract.'); return this.trips.mutate(await this.trips.identity(req), 'create', parsed.data.trip.id, body, requestSignal(req)); }
  @Put(':id') async update(@Req() req: Request, @Param('id') id: string, @Body() body: unknown, @Query() query: unknown) { noQuery(query); return this.trips.mutate(await this.trips.identity(req), 'update', tripId(id), body, requestSignal(req)); }
  @Delete(':id') async remove(@Req() req: Request, @Param('id') id: string, @Body() body: unknown, @Query() query: unknown) { noQuery(query); return this.trips.mutate(await this.trips.identity(req), 'delete', tripId(id), body, requestSignal(req)); }
}
