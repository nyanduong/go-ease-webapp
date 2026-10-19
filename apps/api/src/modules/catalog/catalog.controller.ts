import { Controller, Get, Inject, Query } from '@nestjs/common';
import { catalogQuerySchema } from '@goease/contracts';
import { ApiFailure } from '../../common/errors/api-failure.js';
import { CatalogService } from './catalog.service.js';
@Controller('v1/catalog')
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}
  @Get() list(@Query() query: unknown) {
    if (!catalogQuerySchema.safeParse(query).success)
      throw new ApiFailure(
        400,
        'BAD_REQUEST',
        'Chỉ hỗ trợ destinationId=da-lat; không nhận query khác hoặc lặp.',
      );
    return this.catalog.list();
  }
  @Get('places') places(@Query() query: unknown) {
    if (!catalogQuerySchema.safeParse(query).success)
      throw new ApiFailure(400, 'BAD_REQUEST', 'Query catalog không hợp lệ.');
    return this.catalog.managedCatalog();
  }
}
