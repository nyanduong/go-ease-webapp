export type MapsErrorCode = 'MAPS_NOT_CONFIGURED' | 'MAPS_INVALID_INPUT' | 'MAPS_TIMEOUT' | 'MAPS_CANCELLED'
  | 'MAPS_PROVIDER_FAILURE' | 'MAPS_INVALID_OUTPUT' | 'MAPS_LIVE_NOT_AUTHORIZED';

const messages: Record<MapsErrorCode, string> = {
  MAPS_NOT_CONFIGURED: 'Routes chưa được cấu hình hợp lệ.',
  MAPS_INVALID_INPUT: 'Yêu cầu hoặc danh mục bản đồ mẫu không hợp lệ.',
  MAPS_TIMEOUT: 'Routes vượt thời gian cho phép.',
  MAPS_CANCELLED: 'Đã hủy yêu cầu Routes.',
  MAPS_PROVIDER_FAILURE: 'Routes chưa trả kết quả sử dụng được.',
  MAPS_INVALID_OUTPUT: 'Kết quả Routes không đạt kiểm tra.',
  MAPS_LIVE_NOT_AUTHORIZED: 'Probe live thiếu phạm vi chi tiêu được ủy quyền.',
};

/** No raw provider/driver cause, body, URL credentials or key is retained. */
export class MapsError extends Error {
  constructor(readonly code: MapsErrorCode, readonly attempts = 0, readonly elapsedMs = 0) {
    super(messages[code]); this.name = 'MapsError';
  }
}
