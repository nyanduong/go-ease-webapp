import { getDestination } from '@goease/contracts';
import { getDalatCatalog } from '@goease/catalog';
import photos from '../../web/src/features/trips/curated-photos.json' with { type: 'json' };
const source = (title, url) => ({ title, url });
const tourism = {
  'da-lat': source(
    'Vietnam Tourism — Đà Lạt',
    'https://vietnam.travel/places-to-go/south-central-coast-central-highlands/dalat',
  ),
  'da-nang': source(
    'Vietnam Tourism — Đà Nẵng',
    'https://vietnam.travel/places-to-go/south-central-coast-central-highlands/da-nang',
  ),
  hue: source(
    'Vietnam Tourism — Huế',
    'https://vietnam.travel/places-to-go/north-central-coast/hue',
  ),
};
const commonsImage = (file, alt, credit) => ({
  url: 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file),
  alt,
  credit,
});
const photoFor = (id) => {
  const photo = photos.find((p) => p.id === id);
  const file = decodeURIComponent(photo.sourceUrl.split('/wiki/File:')[1]);
  return commonsImage(file, photo.alt, photo.author + ' · ' + photo.license);
};
export function enrichOriginalSeed(entry) {
  const cover = {
    'da-lat': 'da-lat',
    'da-nang': 'da-nang',
    hue: 'hue',
    'dalat-bietthuhangnga': 'dalat-crazy-house',
    'cam-nang-da-lat-theo-nhip-rieng': 'da-lat',
  }[entry.id];
  if (!cover) return entry;
  const body = {
    'da-lat':
      'Đà Lạt dành cho những chuyến đi giữa hồ, kiến trúc và cảnh quan cao nguyên. Nếu lần đầu đến thành phố, hãy chọn một khu vực làm điểm tựa thay vì cố ghé thật nhiều nơi trong ngày. Hồ Xuân Hương thuận tiện cho một buổi đi bộ; nhà ga và Biệt thự Hằng Nga mở ra những góc nhìn khác về kiến trúc địa phương.\n\nCác điểm ngoài trung tâm như thác Datanla cần thêm thời gian di chuyển. Kiểm tra thời tiết, đường đi và dịch vụ đang vận hành trực tiếp với điểm tham quan. Với nhóm có trẻ nhỏ hoặc người cần nghỉ thường xuyên, nên để trống một buổi và chọn đường đi phù hợp.\n\nBắt đầu bằng việc lưu những nơi muốn ghé, tạo lịch trống rồi thêm từng hoạt động. Ghi riêng thời gian di chuyển, bữa ăn và khoản chi dự kiến; giá và giờ mở cửa có thể thay đổi nên không coi lịch gợi ý là xác nhận dịch vụ.',
    'da-nang':
      'Đà Nẵng có thể được khám phá qua ba nhịp: bờ biển, cảnh quan núi và đời sống quanh sông Hàn. Chọn một nhịp cho mỗi buổi để tránh mất quá nhiều thời gian di chuyển. Mỹ Khê phù hợp cho khoảng nghỉ ven biển; Ngũ Hành Sơn có đường lên và bậc thang, cần cân nhắc thể lực trước khi chọn.\n\nKhi ghé bán đảo Sơn Trà, kiểm tra tuyến đường đang mở, thời tiết và quy định bảo tồn tại địa phương. Trong thành phố, có thể ghép một bữa ăn với chuyến dạo quanh sông Hàn. Mì Quảng và bún chả cá là hai gợi ý để tìm hiểu ẩm thực miền Trung.\n\nTrong GoEase, tạo lịch trống với điểm đến Đà Nẵng, chọn các điểm cùng khu vực cho một buổi và ghi thời gian nghỉ. Xác nhận giờ, giá và điều kiện phục vụ tại nguồn chính thức trước khi đi; nội dung này không phải vé hay đặt chỗ.',
    hue: 'Huế gắn với di sản triều Nguyễn, cảnh quan sông Hương và những bữa ăn nhiều món nhỏ. Một chuyến đi dễ theo dõi có thể bắt đầu bằng khu Hoàng thành, sau đó dành buổi khác cho chùa hoặc lăng tẩm. Các khu di tích không nằm sát nhau, vì vậy cần xem bản đồ trước khi ghép vào cùng ngày.\n\nKhi tham quan, mang theo nước uống, chọn trang phục phù hợp không gian di sản và chừa thời gian nghỉ. Trong mùa mưa, cần có phương án đổi thứ tự hoạt động. Thông tin vé, giờ và khu vực mở cửa phải được kiểm tra với Trung tâm Bảo tồn Di tích Cố đô Huế.\n\nẨm thực là một phần của hành trình: có thể tìm hiểu bún bò, bánh bèo, bánh nậm và những món ăn địa phương qua nguồn tham khảo. Hỏi rõ nguyên liệu, độ cay và giá trước khi gọi; GoEase không đại diện cho một hàng quán cụ thể.',
  }[entry.id];
  const photo = photos.find((p) => p.id === cover);
  return {
    ...entry,
    image: photoFor(cover),
    ...(body ? { body } : {}),
    sources: [
      ...entry.sources,
      source('Ảnh: ' + photo.alt, photo.sourceUrl),
      source('Giấy phép ảnh: ' + photo.license, photo.licenseUrl),
    ],
  };
}
const base = {
  status: 'published',
  destination: null,
  image: null,
  categoryIds: [],
  address: '',
  coordinates: null,
};
const place = (
  id,
  destinationId,
  title,
  summary,
  body,
  address,
  coordinates,
  image,
  sources,
  categoryIds = ['di-san'],
) => ({
  ...base,
  id,
  kind: 'place',
  destinationId,
  title,
  summary,
  body,
  address,
  coordinates,
  image,
  sources,
  categoryIds,
});
const dalatPlace = (id, photoId, summary, body, address, categoryIds) => {
  const p =
    getDalatCatalog().find((p) => p.id === id) ??
    (id === 'dalat-hoxuanhuong'
      ? {
          name: 'Hồ Xuân Hương',
          coordinates: { latitude: 11.941039, longitude: 108.444671 },
          sources: [{ url: 'https://visitlamdong.vn/en/hoxuanhuong' }],
        }
      : undefined);
  const photo = photos.find((p) => p.id === photoId);
  return place(
    id,
    'da-lat',
    p.name,
    summary,
    body,
    address,
    p.coordinates,
    photoFor(photoId),
    [
      source('Cổng du lịch Lâm Đồng', p.sources[0].url),
      source('Ảnh: ' + photo.alt, photo.sourceUrl),
      source('Giấy phép ảnh: ' + photo.license, photo.licenseUrl),
    ],
    categoryIds,
  );
};
const hueFoodSource = source(
  'Vietnam Tourism — Ăn như người Huế',
  'https://www.vietnam.travel/things-to-do/how-eat-local-hue',
);
const danangFoodSource = source(
  'Vietnam Tourism — Ẩm thực Đà Nẵng',
  'https://vietnam.travel/node/1100',
);
const miFile = 'Mi Quang 1A Danang.jpg';
const bunFile = 'Bún bò Huế - Chợ Đông Ba (2024) - img 01.jpg';
export const reviewContent = [
  dalatPlace(
    'dalat-nhagadalat',
    'dalat-station',
    'Một điểm dừng để nhìn lại kiến trúc đường sắt Đà Lạt.',
    'Ga Đà Lạt là một điểm ghé tìm hiểu kiến trúc đường sắt tại thành phố cao nguyên. Dành thời gian quan sát mặt đứng nhà ga và khu vực trưng bày được phép tiếp cận; không đi vào khu vực đường ray đang vận hành.\n\nNếu muốn đi tàu tham quan, hãy kiểm tra chuyến đang chạy, vé và điểm đón trực tiếp với nhà ga. Một lượt ghé nhà ga không mặc nhiên bao gồm vé tàu. Vị trí bản đồ lấy từ catalog có nguồn của GoEase.',
    'Khu vực Ga Đà Lạt, đường Quang Trung, Đà Lạt',
    ['di-san'],
  ),
  dalatPlace(
    'dalat-thacdatanla',
    'dalat-datanla',
    'Một khoảng xanh và tiếng nước giữa hành trình cao nguyên.',
    'Thác Datanla là điểm tham quan thiên nhiên ở Đà Lạt. Đường xuống khu vực thác và các dịch vụ tại điểm có thể cần thể lực hoặc điều kiện sử dụng riêng; hỏi đơn vị vận hành trước khi chọn.\n\nĐi giày phù hợp, tránh đứng sát mép trơn và tuân theo biển hướng dẫn tại chỗ. Chừa thời gian di chuyển ngoài trung tâm; kiểm tra thời tiết và các hạng mục mở cửa trước ngày ghé. Giá và giờ không được xác nhận trong bài viết này.',
    'Khu du lịch thác Datanla, Đà Lạt',
    ['thien-nhien'],
  ),
  dalatPlace(
    'dalat-hoxuanhuong',
    'da-lat',
    'Đi bộ bên mặt hồ giữa trung tâm Đà Lạt.',
    'Hồ Xuân Hương là một điểm dừng cảnh quan trong thành phố Đà Lạt. Có thể chọn một đoạn ven hồ cho buổi đi bộ nhẹ thay vì đặt mục tiêu đi hết vòng hồ.\n\nChú ý giao thông khi qua đường, kiểm tra thời tiết và giữ gìn không gian công cộng. Các hàng quán quanh hồ là dịch vụ riêng; hỏi giá trước khi sử dụng. Vị trí bản đồ là mốc tham khảo từ nguồn catalog, không phải cổng vào hay điểm đỗ xe.',
    'Hồ Xuân Hương, Đà Lạt',
    ['thien-nhien'],
  ),
  place(
    'hue-hoang-thanh',
    'hue',
    'Hoàng thành Huế',
    'Dành một buổi cho kiến trúc và những câu chuyện cung đình.',
    'Hoàng thành nằm trong Kinh thành Huế, gắn với lịch sử triều Nguyễn. Hãy chọn một nhóm công trình phù hợp thời gian và dành khoảng nghỉ giữa các khu tham quan.\n\nKiểm tra cổng vào, tuyến tham quan, vé và khu vực mở cửa trên trang của đơn vị quản lý. Mốc bản đồ là tâm khu Hoàng thành theo Wikidata, không phải vị trí quầy vé. Ảnh cho thấy không gian Hoàng thành; thông tin này không bao gồm dịch vụ đặt vé.',
    'Khu Hoàng thành, Huế',
    { latitude: 16.469444444444, longitude: 107.57777777778 },
    photoFor('hue'),
    [
      tourism.hue,
      source('Trung tâm Bảo tồn Di tích Cố đô Huế', 'https://eticket.hueworldheritage.org.vn/'),
      source('Vị trí tham khảo Hoàng thành', 'https://www.wikidata.org/wiki/Q10769129'),
      source('Ảnh: Hoàng thành Huế', photos.find((p) => p.id === 'hue').sourceUrl),
      source('Giấy phép ảnh: CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0'),
    ],
  ),
  place(
    'da-nang-cau-rong',
    'da-nang',
    'Ngắm Cầu Rồng bên sông Hàn',
    'Một điểm dừng ngắm cây cầu từ bờ sông.',
    'Cầu Rồng là một dấu mốc kiến trúc trên sông Hàn ở Đà Nẵng. Nội dung này giới thiệu điểm ngắm cảnh bên bờ sông, phù hợp để ghép với một khoảng đi bộ trong thành phố.\n\nMốc bản đồ được lấy từ vị trí chụp ảnh công khai, là điểm tham khảo ngắm cầu chứ không phải điểm đứng trên lòng cầu. Tuân thủ hướng dẫn giao thông, chọn vỉa hè an toàn và kiểm tra điều kiện tại chỗ. Không có lịch biểu diễn hay giá dịch vụ nào được xác nhận trong bài viết.',
    'Khu vực bờ sông Hàn gần Cầu Rồng, Đà Nẵng',
    { latitude: 16.061692, longitude: 108.230125 },
    photoFor('da-nang'),
    [
      tourism['da-nang'],
      source('Ảnh và vị trí điểm ngắm Cầu Rồng', photos.find((p) => p.id === 'da-nang').sourceUrl),
      source('Giấy phép ảnh: CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0'),
    ],
    ['di-san'],
  ),
  {
    ...base,
    id: 'mi-quang-da-nang',
    kind: 'food',
    destinationId: 'da-nang',
    categoryIds: ['am-thuc'],
    title: 'Mì Quảng ở Đà Nẵng',
    summary: 'Sợi mì, rau sống và phần nước chan đậm vị miền Trung.',
    body: 'Mì Quảng là một gợi ý ẩm thực khi đến Đà Nẵng. Các thành phần thường gặp gồm sợi mì, rau, bánh tráng và phần nước chan với thịt hoặc hải sản; cách nấu thay đổi theo hàng.\n\nHỏi rõ thành phần nếu bạn dị ứng đậu phộng, tôm hoặc có chế độ ăn riêng. Ảnh được chụp tại Mì Quảng 1A ở Đà Nẵng, dùng để giới thiệu món ăn; đây không phải đề xuất đặt chỗ hay cam kết chất lượng của quán. Mốc bản đồ là trung tâm điểm đến Đà Nẵng, không phải địa chỉ một hàng mì. Chọn nơi ăn và xác nhận giá, giờ phục vụ trước khi đi.',
    address: 'Món ăn tại Đà Nẵng · bản đồ chỉ trung tâm điểm đến',
    coordinates: getDestination('da-nang').center,
    image: commonsImage(
      miFile,
      'Mì Quảng tôm thịt, ảnh chụp tại Đà Nẵng',
      'Jpatokal · CC BY-SA 4.0',
    ),
    sources: [
      danangFoodSource,
      source(
        'Ảnh: Mì Quảng tại Đà Nẵng',
        'https://commons.wikimedia.org/wiki/File:Mi_Quang_1A_Danang.jpg',
      ),
      source('Giấy phép ảnh: CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0'),
    ],
  },
  {
    ...base,
    id: 'bun-bo-hue',
    kind: 'food',
    destinationId: 'hue',
    categoryIds: ['am-thuc'],
    title: 'Bún bò ở chợ Đông Ba',
    summary: 'Tìm hiểu một món ăn Huế qua khu chợ địa phương.',
    body: 'Bún bò là một món ăn gắn với ẩm thực Huế. Bài viết giới thiệu món ăn trong bối cảnh chợ Đông Ba; hình ảnh và mốc bản đồ được ghi nhận tại khu chợ, không xác định một hàng quán cụ thể.\n\nTrước khi gọi món, hỏi rõ thành phần, độ cay và khẩu phần. Nước dùng có thể có mắm ruốc, thịt và các nguyên liệu khác tùy hàng; người có dị ứng cần xác nhận trực tiếp. Tự kiểm tra giá và giờ phục vụ. Nội dung không bao gồm đặt chỗ hoặc bảo đảm an toàn thực phẩm.',
    address: 'Khu vực chợ Đông Ba, Huế · không phải một quán cụ thể',
    coordinates: { latitude: 16.472589, longitude: 107.588181 },
    image: commonsImage(bunFile, 'Bún bò Huế tại chợ Đông Ba', 'Chainwit. · CC BY 4.0'),
    sources: [
      hueFoodSource,
      source(
        'Ảnh và vị trí: bún bò tại chợ Đông Ba',
        'https://commons.wikimedia.org/wiki/File:' +
          encodeURIComponent(bunFile.replaceAll(' ', '_')),
      ),
      source('Giấy phép ảnh: CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0'),
    ],
  },
  ...[
    [
      'cam-nang-da-nang-theo-khu-vuc',
      'da-nang',
      'Đà Nẵng: xếp lịch theo từng khu vực',
      'Ghép biển, sông và núi thành các buổi dễ theo dõi.',
      'Bắt đầu bằng cách đặt các điểm muốn ghé lên bản đồ. Gom những nơi gần nhau vào một buổi: khu biển cho khoảng nghỉ, sông Hàn cho một buổi dạo, điểm núi cho một buổi có thời gian di chuyển riêng. Đừng ghép tất cả vào một lịch quá chặt.\n\nTrước khi thêm Ngũ Hành Sơn hoặc Sơn Trà, kiểm tra thời tiết, đường đi và thể lực của nhóm. Thêm thời gian ăn trưa, nghỉ và đoạn đường quay về. Trong GoEase, hãy dùng ghi chú để ghi những thông tin còn phải xác nhận thay vì điền giờ hoặc giá chưa biết.\n\nGiữ một phương án thay thế trong thành phố nếu thời tiết không phù hợp hoạt động ngoài trời. Các gợi ý này là cách tổ chức chuyến đi, không phải tuyến du lịch có dịch vụ đi kèm.',
    ],
    [
      'cam-nang-hue-mot-buoi-di-san',
      'hue',
      'Huế: dành thời gian cho di sản',
      'Ít điểm dừng hơn để có thời gian đọc, đi bộ và nghỉ.',
      'Chọn Hoàng thành làm điểm chính của một buổi, rồi xem bản đồ trước khi thêm điểm thứ hai. Chùa và các lăng tẩm có vị trí khác nhau; không nên mặc định chúng đều có thể đi bộ từ trung tâm. Kiểm tra thông tin tuyến tham quan ở đơn vị quản lý trước khi xuất phát.\n\nMang nước uống, chọn trang phục phù hợp và để khoảng trống trong lịch cho những lúc cần nghỉ. Nếu trời mưa, đổi thứ tự hoạt động hoặc rút bớt điểm thay vì cố giữ lịch ban đầu. Một bữa ăn địa phương là một khoảng nghỉ có chủ đích, không phải hoạt động phải chen vào.\n\nTrong GoEase, đặt thời gian di chuyển riêng giữa các hoạt động và ghi lại những khoản chi dự kiến. Vé, giờ và phương tiện cần được xác nhận trực tiếp; bài viết không bán hoặc giữ chỗ.',
    ],
  ].map(([id, destinationId, title, summary, body]) => ({
    ...base,
    id,
    kind: 'article',
    destinationId,
    categoryIds: ['di-san'],
    title,
    summary,
    body,
    image: photoFor(destinationId),
    sources: [
      tourism[destinationId],
      ...(destinationId === 'hue'
        ? [
            source(
              'Trung tâm Bảo tồn Di tích Cố đô Huế',
              'https://eticket.hueworldheritage.org.vn/',
            ),
          ]
        : []),
      source('Ảnh điểm đến', photos.find((p) => p.id === destinationId).sourceUrl),
      source(
        'Giấy phép ảnh: ' + photos.find((p) => p.id === destinationId).license,
        photos.find((p) => p.id === destinationId).licenseUrl,
      ),
    ],
  })),
];
