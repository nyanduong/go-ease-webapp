import { HttpException } from '@nestjs/common';

/** Only fixed, application-owned messages may leave the exception filter. */
export class ApiFault extends HttpException {
  constructor(readonly code: string, status: number) {
    super('Yêu cầu xác thực không thực hiện được. Vui lòng thử lại hoặc đăng nhập lại.', status);
  }
}
