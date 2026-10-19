import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { catchError, finalize, throwError, timeout, TimeoutError } from 'rxjs';
import { ApiFailure } from '../errors/api-failure.js';
import { abortRequest } from './request-signal.js';
export class Deadline implements NestInterceptor {
  constructor(private readonly ms: number) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      timeout({ first: this.ms }),
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof TimeoutError
            ? new ApiFailure(504, 'REQUEST_TIMEOUT', 'API quá thời gian xử lý. Hãy thử lại.')
            : error,
        ),
      ),
      finalize(() => abortRequest(context.switchToHttp().getRequest<Request>())),
    );
  }
}
