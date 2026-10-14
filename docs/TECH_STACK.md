# Công nghệ cho GoEase

## App chạy trên Expo Go

| Công nghệ | Dùng để làm gì | Thời điểm |
| --- | --- | --- |
| React Native + TypeScript + Expo | Một app Android và iOS | Ngay từ đầu |
| Expo Router | Điều hướng màn hình theo file | Ngay từ đầu |
| React Native StyleSheet | Giao diện, màu sắc, khoảng cách | Ngay từ đầu |
| React state và Context | Form, trạng thái app nhỏ | Ngay từ đầu; chưa cần Redux |
| AsyncStorage | Lưu chuyến của chế độ khách trên máy | Mốc demo đầu |
| fetch | Gọi REST API, xử lý lỗi và timeout | Khi nối backend |
| Zod | Validate dữ liệu runtime và đầu ra AI | Khi có contract/API |
| react-native-maps | Pin địa điểm và bản đồ ngày | Sau luồng lịch trình |
| expo-location | Vị trí khi người dùng yêu cầu | Chỉ thêm khi tính năng cần |

Expo Go hỗ trợ một tập thư viện native có sẵn; thư viện có native code ngoài tập đó cần development build. Chọn package theo SDK và dùng `npx expo install` cho thư viện Expo/native, tránh tự ghép phiên bản React Native và React. [Giới hạn Expo Go](https://docs.expo.dev/faq/), [cài thư viện](https://docs.expo.dev/workflow/using-libraries/).

Expo Router cung cấp điều hướng theo file cho app. Giữ route mỏng, đặt logic nghiệp vụ ở thư mục features. [Expo Router](https://docs.expo.dev/router/introduction/).

AsyncStorage là kho key-value không mã hóa, phù hợp cho chuyến khách và tùy chọn giao diện; không lưu mật khẩu, API key hoặc token ở đây. [AsyncStorage trong Expo](https://docs.expo.dev/versions/latest/sdk/async-storage/).

react-native-maps có trong Expo Go, nhưng phải kiểm tra phiên bản và provider trên mỗi nền tảng. Dùng pin có tọa độ từ dữ liệu đã kiểm soát; Routes/Places là tích hợp riêng, có điều kiện key/quota/billing riêng. [Maps trong Expo](https://docs.expo.dev/versions/latest/sdk/map-view/).

Google Sign-In native cần native build riêng; không chọn nó cho mốc Expo Go. Mốc đầu dùng khách lưu cục bộ; nếu bắt buộc đăng nhập ngay, team cần thiết kế cơ chế xác thực khác có kiểm tra server trước khi lưu dữ liệu riêng. Không thêm đường bypass OAuth vào API. [Google authentication trong Expo](https://docs.expo.dev/guides/google-authentication/).

## Backend và dữ liệu

| Công nghệ | Vai trò |
| --- | --- |
| Node.js LTS + TypeScript | Runtime backend |
| NestJS REST | API lịch trình, xác thực và gọi AI |
| PostgreSQL | Dữ liệu tài khoản/chuyến lưu trên server |
| Prisma | Schema, migration và truy cập DB tại backend |
| Gemini API qua backend | Đề xuất lịch trình từ danh mục địa điểm |
| pnpm workspace | Quản lý app, API và contracts cùng repo |

Có thể hoàn thiện luồng khách lưu trên máy trước khi triển khai DB. Khi có API chuyến riêng, server xác minh danh tính và ownership; không tin ownerId/role do app gửi. Contracts chỉ chứa type, schema validation và logic thuần, không import NestJS/Prisma.

API key Gemini chỉ nằm ở backend. Đầu ra AI phải validate và tính lại chi phí; địa điểm/tọa độ phải khớp danh mục. Mất mạng hoặc AI lỗi cần giữ thông tin nhập và cho thử lại. [Hướng dẫn API key Gemini](https://ai.google.dev/gemini-api/docs/api-key).

## Công nghệ bổ sung sau

Web admin dùng React + Vite + TypeScript; Tailwind/shadcn có thể thêm khi làm admin. Chưa cần web khách hàng, Docker/Kubernetes, Redis/queue, microservices hay hệ thống nhiều agent cho mốc demo Expo Go.

Development build và EAS Build dành cho thư viện native tùy chỉnh hoặc bản cài độc lập. Chỉ chọn dịch vụ/đường phân phối sau khi kiểm tra quyền và chi phí. [Development builds](https://docs.expo.dev/develop/development-builds/introduction/).

## Tài liệu học theo thứ tự

1. [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) và [React](https://react.dev/learn): type, component, state, effect.
2. [React Native](https://reactnative.dev/docs/getting-started): View, Text, ScrollView, FlatList, form và keyboard.
3. [Tạo app Expo](https://docs.expo.dev/get-started/create-a-project/) và [Expo Router](https://docs.expo.dev/router/introduction/): chạy trên hai điện thoại, chuyển màn hình.
4. [NestJS](https://docs.nestjs.com/): controller, service, validation và xử lý lỗi.
5. [PostgreSQL](https://www.postgresql.org/docs/current/tutorial.html) và [Prisma](https://www.prisma.io/docs): quan hệ, migration, transaction.
6. [Gemini API](https://ai.google.dev/gemini-api/docs): gọi server-side và xử lý đầu ra có cấu trúc.

## Quy tắc cấu hình

- Commit lockfile và file env mẫu chỉ có tên biến/giá trị công khai.
- `EXPO_PUBLIC_API_BASE_URL` là URL công khai; không chứa secret trong biến EXPO_PUBLIC_* hoặc VITE_*.
- Gemini key, DB URL có mật khẩu và khóa ký không vào app, Git hoặc ảnh chụp.
- Điện thoại không truy cập backend PC qua localhost của điện thoại; dùng địa chỉ LAN được phép hoặc HTTPS phù hợp.
- Chạy smoke trên Expo Go thật ở cả Android và iPhone trước khi thêm thư viện native tiếp theo.

## Backend hiện có sau #71

Đã có NestJS 12.1.3 tại apps/api, health chỉ báo tiến trình và catalog dùng contracts runtime; chưa DB/Gemini. [Chạy API và kiểm tra từ Expo Go](../apps/api/README.md). Giữ SDK/native dependencies mobile hiện tại; không thêm key cloud cho bước này.
