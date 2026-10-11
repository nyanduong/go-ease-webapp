import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ApiFault } from '../../common/api-fault.js';
import { AuthService } from './auth.service.js';
import type { AuthRequest } from './http.js';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.auth = await this.auth.authenticate(request);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) this.auth.assertMutation(request, request.auth);
    return true;
  }
}
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (context.switchToHttp().getRequest<AuthRequest>().auth?.user.role !== 'ADMIN') throw new ApiFault('ADMIN_REQUIRED', 403);
    return true;
  }
}
