import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { API_VERSION, apiErrorResponseSchema } from '@goease/contracts';
import type { ApiErrorCode } from '@goease/contracts';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';

export class ApiFailure extends HttpException {
  constructor(status: number, readonly code: ApiErrorCode, message: string) { super(message, status); }
}
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) return;
    let status = 500, code: ApiErrorCode = 'INTERNAL_ERROR', message = 'Lỗi API. Hãy thử lại.';
    if (exception instanceof ApiFailure) { status = exception.getStatus(); code = exception.code; message = exception.message; }
    else if (exception instanceof HttpException) {
      status = exception.getStatus();
      if (status === 404) { code = 'NOT_FOUND'; message = 'Không có endpoint này.'; }
      else if (status === 400) { code = 'BAD_REQUEST'; message = 'Yêu cầu không hợp lệ.'; }
      else if (status === 413) { code = 'PAYLOAD_TOO_LARGE'; message = 'Body vượt giới hạn 8 KiB.'; }
      else { status = 500; }
    } else if (exception instanceof Error && 'type' in exception) {
      if (exception.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Body vượt giới hạn 8 KiB.'; }
      if (exception.type === 'entity.parse.failed') { status = 400; code = 'BAD_JSON'; message = 'Body JSON không hợp lệ.'; }
    }
    const requestId = String(response.getHeader('x-request-id') ?? randomUUID());
    if (status >= 500) Logger.error({ requestId, status, code }, 'API'); // Never log raw body/query/env or upstream errors.
    response.status(status).json(apiErrorResponseSchema.parse({ apiVersion: API_VERSION, statusCode: status, error: { code, message, requestId } }));
  }
}
