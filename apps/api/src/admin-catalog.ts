import { Body, Controller, Get, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { adminPlaceCreateSchema, adminPlaceUpdateSchema, managedPlaceSchema, managedCatalogSchema, catalogEntrySchema } from '@goease/contracts';
import { TripsService } from './trips.js';
import { ApiFailure } from './errors.js';
const queryCheck=(query:unknown)=>{if(!query||typeof query!=='object'||Object.keys(query).length)throw new ApiFailure(400,'BAD_REQUEST','Endpoint không nhận query.');};
@Controller('v1/admin/catalog')
export class AdminCatalogController {
  constructor(@Inject(TripsService) private readonly trips:TripsService){}
  @Get() async list(@Req() req:Request,@Query() query:unknown){queryCheck(query);return this.trips.admin(req,async tx=>managedCatalogSchema.parse({apiVersion:'1',places:(await tx.place.findMany({orderBy:{id:'asc'},take:21})).map(p=>({entry:p.snapshot,version:p.version,enabled:p.enabled}))}));}
  @Post() async create(@Req() req:Request,@Body() body:unknown,@Query() query:unknown){queryCheck(query);return this.trips.admin(req,async(tx,owner)=>{
    const parsed=adminPlaceCreateSchema.safeParse(body);if(!parsed.success)throw new ApiFailure(400,'BAD_REQUEST','Place/nguồn không hợp lệ; không nhận role/owner.');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(781601)`;
    if(await tx.place.count()>=20)throw new ApiFailure(409,'CATALOG_LIMIT','MVP tối đa 20 Place, kể cả địa điểm đã tắt.');
    if(await tx.place.findUnique({where:{id:parsed.data.entry.id}}))throw new ApiFailure(409,'CATALOG_CONFLICT','ID Place đã được sử dụng; không tạo lại.');
    const entry=JSON.parse(JSON.stringify(parsed.data.entry));
    await tx.place.create({data:{id:entry.id,name:entry.name,snapshot:entry}});
    await tx.placeRevision.create({data:{placeId:entry.id,version:1,snapshot:entry,enabled:true,actorIssuer:owner.ownerIssuer,actorSubject:owner.ownerSubject}});
    return managedPlaceSchema.parse({entry,version:1,enabled:true});
  });}
  @Put(':id') async update(@Req() req:Request,@Param('id') id:string,@Body() body:unknown,@Query() query:unknown){queryCheck(query);return this.trips.admin(req,async(tx,owner)=>{
    const parsed=adminPlaceUpdateSchema.safeParse(body);if(!parsed.success||parsed.data.entry.id!==id)throw new ApiFailure(400,'BAD_REQUEST','Nội dung, ID hoặc version Place không hợp lệ.');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(781601)`;
    const current=await tx.place.findUnique({where:{id}});if(!current)throw new ApiFailure(404,'NOT_FOUND','Không có Place này.');
    if(current.version!==parsed.data.expectedVersion||current.version===2147483647)throw new ApiFailure(409,'CATALOG_CONFLICT','Place đã đổi; tải lại để đối chiếu, không tự ghi đè.');
    const previous=catalogEntrySchema.parse(current.snapshot),entry=parsed.data.entry;
    if(JSON.stringify(previous.coordinates)!==JSON.stringify(entry.coordinates))throw new ApiFailure(400,'BAD_REQUEST','Tọa độ Place đã tạo là bất biến để giữ vị trí chuyến cũ; tạo ID mới khi cần đổi vị trí.');
    if(current.enabled&&!parsed.data.enabled&&await tx.place.count({where:{enabled:true}})<=8)throw new ApiFailure(409,'CATALOG_LIMIT','Giữ ít nhất 8 địa điểm đang hoạt động để lập lịch trình.');
    const snapshot=JSON.parse(JSON.stringify(entry)),version=current.version+1;
    await tx.place.update({where:{id},data:{name:entry.name,snapshot,version,enabled:parsed.data.enabled}});
    await tx.placeRevision.create({data:{placeId:id,version,snapshot,enabled:parsed.data.enabled,actorIssuer:owner.ownerIssuer,actorSubject:owner.ownerSubject}});
    return managedPlaceSchema.parse({entry,version,enabled:parsed.data.enabled});
  });}
}
