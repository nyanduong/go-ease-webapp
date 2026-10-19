import { HttpException } from '@nestjs/common';
import type { ApiErrorCode } from '@goease/contracts';
export class ApiFailure extends HttpException {
  constructor(
    status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message, status);
  }
}
