import { HttpException } from '@nestjs/common';

const tripMessages: Record<string, string> = {
  TRIP_INVALID_REQUEST: 'Thông tin chuyến chưa hợp lệ. Kiểm tra ngày, số người, ngân sách và hoạt động.',
  TRIP_NOT_FOUND: 'Không tìm thấy chuyến của bạn.',
  TRIP_VERSION_CONFLICT: 'Chuyến đã thay đổi. Mở bản mới nhất trước khi lưu lại.',
  TRIP_IDEMPOTENCY_CONFLICT: 'Mã gửi lại đã dùng cho nội dung khác. Mở chuyến trước khi thử lại.',
  TRIP_TEMPLATE_UNAVAILABLE: 'Danh mục mẫu chưa sẵn sàng. Vui lòng thử lại sau.',
  TRIP_PLACE_UNAVAILABLE: 'Địa điểm mới thêm không còn sử dụng được cho chuyến này.',
  TRIP_VERSION_LIMIT: 'Chuyến đã đạt giới hạn phiên bản và chưa thể lưu thêm.',
  TRIP_RATE_LIMITED: 'Có quá nhiều yêu cầu lưu chuyến. Vui lòng chờ rồi thử lại.',
};

/** Only fixed, application-owned messages may leave the exception filter. */
export class ApiFault extends HttpException {
  constructor(readonly code: string, status: number) {
    super(tripMessages[code] ?? 'Yêu cầu xác thực không thực hiện được. Vui lòng thử lại hoặc đăng nhập lại.', status);
  }
}
