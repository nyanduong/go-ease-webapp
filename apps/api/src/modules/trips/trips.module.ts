import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TripsDatabase } from './trips-database.js';
import { TripsController } from './trips.controller.js';
import { TripsService } from './trips.service.js';

@Module({ imports: [AuthModule], controllers: [TripsController], providers: [TripsDatabase, TripsService] })
export class TripsModule {}
