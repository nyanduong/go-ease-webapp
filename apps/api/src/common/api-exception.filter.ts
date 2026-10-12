import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorResponse } from '@goease/contracts';
import { ApiFault } from './api-fault.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    // A bounded ingress timeout/client abort may already have completed output.
    if (response.headersSent || response.writableEnded || response.destroyed) return;
    const oversizedJson = exception instanceof Error && 'type' in exception && exception.type === 'entity.too.large' &&
      'status' in exception && exception.status === 413;
    const statusCode = exception instanceof HttpException ? exception.getStatus() : oversizedJson ? 413 : 500;
    const code = exception instanceof ApiFault ? exception.code : statusCode === 404 ? 'NOT_FOUND' : statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR';
    const message = exception instanceof ApiFault ? exception.message : statusCode === 404 ? 'Không tìm thấy đường dẫn API.' :
      statusCode >= 500 ? 'API gặp lỗi. Vui lòng thử lại sau.' : 'Yêu cầu chưa hợp lệ.';
    const request = http.getRequest<Request>();
    const body: ApiErrorResponse = {
      error: { code, message, statusCode },
      path: request.originalUrl.split('?')[0] ?? request.path,
      timestamp: new Date().toISOString(),
    };
    response.status(statusCode).json(body);
  }
}
