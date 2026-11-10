import { getDestination } from '@goease/contracts';
import { getDalatCatalog } from '@goease/catalog';

const defaults = {
  status: 'published',
  destinationId: null,
  categoryIds: [],
  image: null,
  address: '',
  coordinates: null,
  destination: null,
};
const tourism = (title, url) => ({ title: `Vietnam Tourism — ${title} (21/10/2026)`, url });
const hue = tourism('Huế', 'https://vietnam.travel/places-to-go/north-central-coast/hue');
const danang = tourism(
  'Đà Nẵng',
  'https://vietnam.travel/places-to-go/south-central-coast-central-highlands/da-nang',
);
const dalat = tourism(
  'Đà Lạt',
  'https://vietnam.travel/places-to-go/south-central-coast-central-highlands/dalat',
);
const catalog = getDalatCatalog();
const crazyHouse = catalog.find((value) => value.id === 'dalat-bietthuhangnga');
const market = catalog.find((value) => value.id === 'dalat-chodemdalat');

// Original concise editorial summaries. Existing catalog coordinates retain their
// sourced map-marker provenance; unknown prices/opening hours are never invented.
export const additionalEditorialContent = [
  {
    ...defaults,
    id: 'di-san',
    kind: 'category',
    title: 'Văn hóa & di sản',
    summary: 'Những câu chuyện phía sau mỗi điểm dừng.',
    body: 'Bắt đầu từ kiến trúc, lịch sử và những không gian văn hóa địa phương. Đọc nguồn tham khảo trước khi chọn điểm ghé cho lịch trình.',
    sources: [hue],
  },
  {
    ...defaults,
    id: 'am-thuc',
    kind: 'category',
    title: 'Hương vị địa phương',
    summary: 'Khám phá địa phương qua món ăn.',
    body: 'Chọn trải nghiệm ẩm thực theo sở thích của bạn. Hỏi rõ nguyên liệu, giá và khẩu phần tại nơi phục vụ trước khi gọi món.',
    sources: [dalat],
  },
  {
    ...defaults,
    id: 'hue',
    kind: 'destination',
    title: 'Huế',
    summary: 'Dành thời gian cho di sản, sông Hương và hương vị cố đô.',
    body: 'Huế gắn với kiến trúc cung đình, các ngôi chùa và văn hóa ẩm thực. Bạn có thể chọn một vài điểm dừng gần nhau và dành khoảng nghỉ giữa các buổi tham quan. Kiểm tra thời tiết và thông tin vận hành trước chuyến đi.',
    categoryIds: ['di-san'],
    address: 'Huế, Việt Nam',
    coordinates: getDestination('hue').center,
    destination: getDestination('hue'),
    sources: [hue],
  },
  {
    ...defaults,
    id: 'da-nang',
    kind: 'destination',
    title: 'Đà Nẵng',
    summary: 'Một hành trình giữa biển, núi và nhịp sống thành phố.',
    body: 'Đà Nẵng có những bãi biển, bán đảo Sơn Trà và các điểm tham quan quanh Ngũ Hành Sơn. Tự chọn các điểm phù hợp với sức khỏe và thời gian di chuyển của nhóm; để trống một phần lịch cho thời tiết và những khám phá bất chợt.',
    categoryIds: ['thien-nhien'],
    address: 'Đà Nẵng, Việt Nam',
    coordinates: getDestination('da-nang').center,
    destination: getDestination('da-nang'),
    sources: [danang],
  },
  {
    ...defaults,
    id: crazyHouse.id,
    kind: 'place',
    title: crazyHouse.name,
    summary: 'Một điểm dừng kiến trúc cho chuyến đi Đà Lạt.',
    body: 'Biệt thự Hằng Nga là một địa điểm kiến trúc tại Đà Lạt. Hãy đọc thông tin từ đơn vị du lịch địa phương và xác nhận giờ mở cửa, giá vé trực tiếp trước khi ghé. Vị trí bản đồ được giữ từ catalog có nguồn của GoEase.',
    destinationId: 'da-lat',
    categoryIds: ['di-san'],
    address: '03 Huỳnh Thúc Kháng, Đà Lạt, Lâm Đồng',
    coordinates: crazyHouse.coordinates,
    sources: crazyHouse.sources.map((value) => ({
      title: 'Cổng du lịch Lâm Đồng — Biệt thự Hằng Nga',
      url: value.url,
    })),
  },
  {
    ...defaults,
    id: 'am-thuc-cho-dem-da-lat',
    kind: 'food',
    title: 'Hương vị quanh chợ đêm Đà Lạt',
    summary: 'Một điểm dừng để khám phá ẩm thực buổi tối.',
    body: 'Khu vực chợ đêm Đà Lạt có nhiều hàng ăn và đồ uống, trong đó có sữa đậu nành. Nội dung này giới thiệu khu vực ẩm thực, không đại diện cho một quán cụ thể. Hỏi rõ giá, nguyên liệu và điều kiện vệ sinh trước khi chọn món; giờ phục vụ tùy từng hàng.',
    destinationId: 'da-lat',
    categoryIds: ['am-thuc'],
    address: 'Khu vực chợ đêm Đà Lạt, phường Xuân Hương - Đà Lạt, Lâm Đồng',
    coordinates: market.coordinates,
    sources: [
      {
        title: 'Cổng du lịch Lâm Đồng — Chợ đêm Đà Lạt (21/10/2026)',
        url: 'https://visitlamdong.vn/vi/chodemdalat',
      },
    ],
  },
  {
    ...defaults,
    id: 'cam-nang-da-lat-theo-nhip-rieng',
    kind: 'article',
    title: 'Đà Lạt theo nhịp riêng của bạn',
    summary: 'Bắt đầu với ít điểm dừng và nhiều khoảng nghỉ.',
    body: 'Chọn một điểm tham quan làm mốc cho mỗi buổi, rồi kiểm tra quãng đường đến nơi tiếp theo. Hồ Xuân Hương, khu chợ và nhà ga là những gợi ý để tìm hiểu thêm từ cổng thông tin du lịch.\n\nTrong GoEase, bạn có thể tạo lịch trống, tự thêm điểm dừng và ghi chi phí dự kiến. Chừa thời gian cho ăn uống, nghỉ ngơi và di chuyển. Giá hoặc giờ mở cửa chưa được xác nhận nên được ghi chú để kiểm tra trước khi đi.',
    destinationId: 'da-lat',
    categoryIds: ['di-san'],
    sources: [dalat],
  },
];
