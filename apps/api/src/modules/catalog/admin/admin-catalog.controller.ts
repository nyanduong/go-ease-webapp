import { adminCatalogPageQuerySchema } from '@goease/contracts';
import { Body, Controller, Get, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiFailure } from '../../../common/errors/api-failure.js';
import { requestSignal } from '../../../common/http/request-signal.js';
import { AdminCatalogService } from './admin-catalog.service.js';
const queryCheck = (query: unknown) => {
  if (!query || typeof query !== 'object' || Object.keys(query).length)
    throw new ApiFailure(400, 'BAD_REQUEST', 'Endpoint không nhận query.');
};
@Controller('v1/admin/catalog')
export class AdminCatalogController {
  constructor(@Inject(AdminCatalogService) private readonly catalog: AdminCatalogService) {}
  @Get() list(@Req() req: Request, @Query() query: unknown) {
    const parsed = adminCatalogPageQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new ApiFailure(
        400,
        'BAD_REQUEST',
        'Query phân trang không hợp lệ (limit 1–50, after ID).',
      );
    if (Object.keys(query as object).length)
      return this.catalog.page(req.headers.authorization, requestSignal(req), parsed.data);
    return this.catalog.list(req.headers.authorization, requestSignal(req));
  }
  @Post() create(@Req() req: Request, @Body() body: unknown, @Query() query: unknown) {
    queryCheck(query);
    return this.catalog.createPlace(req.headers.authorization, requestSignal(req), body);
  }
  @Put(':id') update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Query() query: unknown,
  ) {
    queryCheck(query);
    return this.catalog.updatePlace(req.headers.authorization, requestSignal(req), id, body);
  }
}
