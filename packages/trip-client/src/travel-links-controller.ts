export const travelLinks = Object.freeze([
  Object.freeze({
    id: 'stays',
    name: 'Booking.com',
    title: 'Tìm chỗ nghỉ',
    description: 'Tự tìm khách sạn và chỗ nghỉ trên Booking.com.',
    url: 'https://www.booking.com/',
    domain: 'www.booking.com',
    icon: 'bed-outline' as const,
  }),
  Object.freeze({
    id: 'flights',
    name: 'Vietnam Airlines',
    title: 'Tham khảo chuyến bay',
    description: 'Xem đường bay và thông tin vé trên website Vietnam Airlines.',
    url: 'https://www.vietnamairlines.com/',
    domain: 'www.vietnamairlines.com',
    icon: 'airplane-outline' as const,
  }),
]);
export type TravelLinkId = (typeof travelLinks)[number]['id'];
export function getTravelLink(id: string) {
  return travelLinks.find((item) => item.id === id);
}

/** No trip, identity or tracking fields are accepted or appended to outbound URLs. */
export function createTravelLinkFlow(openUrl: (url: string) => Promise<unknown>) {
  let selection: TravelLinkId | null = null;
  let opening = false;
  return {
    select(id: string) {
      if (opening) return false;
      const item = getTravelLink(id);
      selection = item?.id ?? null;
      return !!item;
    },
    cancel() {
      if (!opening) selection = null;
    },
    selected() {
      return selection;
    },
    async confirm() {
      const item = selection && getTravelLink(selection);
      if (opening || !item) return { ok: false, message: 'Chọn website trước khi tiếp tục.' };
      opening = true;
      selection = null;
      try {
        await openUrl(item.url);
        return {
          ok: true,
          message: `Đã gửi yêu cầu mở ${item.name}. Việc tìm, đặt và xác nhận dịch vụ được thực hiện trên website bên ngoài.`,
        };
      } catch {
        return {
          ok: false,
          message: 'Chưa mở được website. Kiểm tra kết nối rồi chọn thử lại.',
        };
      } finally {
        opening = false;
      }
    },
  };
}
