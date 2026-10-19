import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AiModule } from '../ai/ai.module.js';
import { HealthController } from './health.controller.js';
@Module({ imports: [DatabaseModule, AiModule], controllers: [HealthController] })
export class HealthModule {}
