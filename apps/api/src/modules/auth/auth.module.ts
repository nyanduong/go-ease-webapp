import { Module } from '@nestjs/common';
import { AuthController, AdminAccessController } from './auth.controller.js';
import { AuthDatabase } from './auth-database.js';
import { AuthService } from './auth.service.js';
import { GoogleIdentityVerifier, GoogleTokenVerifier } from './google-verifier.js';
import { AbuseLimit } from './abuse-limit.js';
import { SessionGuard, AdminGuard } from './auth.guard.js';

@Module({ controllers: [AuthController, AdminAccessController], providers: [AuthDatabase, AuthService, AbuseLimit,
  { provide: GoogleIdentityVerifier, useClass: GoogleTokenVerifier }, SessionGuard, AdminGuard], exports: [AuthService, SessionGuard, AdminGuard] })
export class AuthModule {}
