import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Module,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { API_CONFIG } from '../../config/config.module.js';
import type { ApiConfig } from '../../config/env.js';
import { DatabaseModule } from '../../database/database.module.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ActorTransactionService } from '../../database/actor-transaction.service.js';
import { AccountIdentityService } from '../auth/account-identity.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { requestSignal } from '../../common/http/request-signal.js';
import { ContentService } from './content.service.js';

@Controller('v1/content')
class PublicContentController {
  constructor(@Inject(ContentService) private readonly content: ContentService) {}
  @Get() list(@Query() query: unknown) {
    return this.content.list(query);
  }
  @Get(':id') detail(@Param('id') id: string) {
    return this.content.detail(id);
  }
}
@Controller('v1/admin/content')
class AdminContentController {
  constructor(@Inject(ContentService) private readonly content: ContentService) {}
  @Get() list(@Req() req: Request, @Query() query: unknown) {
    return this.content.adminList(req.headers.authorization, requestSignal(req), query);
  }
  @Post() create(@Req() req: Request, @Body() body: unknown) {
    return this.content.save(req.headers.authorization, requestSignal(req), body);
  }
  @Put(':id') update(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.content.save(req.headers.authorization, requestSignal(req), body, id);
  }
}
@Controller('v1/favorites')
class FavoritesController {
  constructor(@Inject(ContentService) private readonly content: ContentService) {}
  @Get() list(@Req() req: Request, @Query() query: unknown) {
    return this.content.favorites(req.headers.authorization, requestSignal(req), query);
  }
  @Put(':id') save(@Req() req: Request, @Param('id') id: string) {
    return this.content.favorite(req.headers.authorization, requestSignal(req), id);
  }
  @Delete(':id') remove(@Req() req: Request, @Param('id') id: string) {
    return this.content.favorite(req.headers.authorization, requestSignal(req), id, true);
  }
}
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [PublicContentController, AdminContentController, FavoritesController],
  providers: [
    {
      provide: ContentService,
      inject: [API_CONFIG, PrismaService, AccountIdentityService, ActorTransactionService],
      useFactory: (
        config: ApiConfig,
        db: PrismaService,
        identity: AccountIdentityService,
        tx: ActorTransactionService,
      ) => new ContentService(config, db, identity, tx),
    },
  ],
})
export class ContentModule {}
