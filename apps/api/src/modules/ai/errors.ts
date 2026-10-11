export type AiErrorCode = 'AI_NOT_CONFIGURED' | 'AI_INVALID_INPUT' | 'AI_TIMEOUT' | 'AI_CANCELLED'
  | 'AI_PROVIDER_FAILURE' | 'AI_INVALID_OUTPUT' | 'AI_LIVE_NOT_AUTHORIZED';

const messages: Record<AiErrorCode, string> = {
  AI_NOT_CONFIGURED: 'Gemini chưa được cấu hình hợp lệ.',
  AI_INVALID_INPUT: 'Yêu cầu hoặc danh mục mẫu không hợp lệ.',
  AI_TIMEOUT: 'Gemini vượt thời gian cho phép.',
  AI_CANCELLED: 'Đã hủy yêu cầu Gemini.',
  AI_PROVIDER_FAILURE: 'Gemini chưa trả kết quả sử dụng được.',
  AI_INVALID_OUTPUT: 'Kết quả Gemini không đạt kiểm tra lịch trình.',
  AI_LIVE_NOT_AUTHORIZED: 'Probe live thiếu phạm vi chi tiêu được ủy quyền.',
};

/** Never retain a provider error, prompt, key, URL credentials or raw body. */
export class AiError extends Error {
  constructor(readonly code: AiErrorCode, readonly attempts = 0, readonly elapsedMs = 0) {
    super(messages[code]);
    this.name = 'AiError';
  }
}
