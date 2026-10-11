# #38 — cập nhật Node 24 LTS sau bản vá bảo mật

Ngày đối chiếu 11/10/2026. Phạm vi một issue: cập nhật runtime Node và image tương ứng, giữ pnpm/dependency graph, kiểm tra lại gates. Không tuyên bố GoEase đã bị khai thác hoặc image hết lỗ hổng.

## Căn cứ và ảnh hưởng

Nền Node24.15.0/OpenSSL3.5.5/Undici7.24.4 có trước [security release tháng 6/2026](https://nodejs.org/en/blog/vulnerability/june-2026-security-releases) và [tháng 7/2026](https://nodejs.org/en/blog/vulnerability/july-2026-security-releases). Tháng 6 sửa TLS, gồm CVE-2026-48934; tháng 7 có bản sửa tiếp CVE-2026-58040 và các vấn đề HTTP/Permission Model. Chọn [Node24.21.0 LTS](https://nodejs.org/en/blog/release/v24.21.0), cùng major24, không nâng npm dependencies hàng loạt. Blog release ghi08/09/2026, distribution index ghi07/09/2026; giữ hai mốc nguồn khác nhau.

Backend dùng global fetch/Undici cho Gemini/Maps và HTTPS của google-auth-library để lấy chứng chỉ; PG có đường TLS khi owner cấu hình. Các bản vá TLS/HTTP và runtime mới liên quan hardening những đường này. Provider origins cố định; chưa thấy product dùng HTTP/2 server, Permission Model, SQLite, dns.resolveAny hoặc WebCrypto AES. Đây là đối chiếu source/API, không là chứng minh không thể khai thác, và không có exploit thực tế được xác lập.

Pins `.node-version`, `.nvmrc`, root engines và ba Docker stages build/api/operator phải cùng24.21.0. Workflow đọc `.node-version`, tên required check `Quality Gate` giữ nguyên. pnpm10.34.6 và root lock giữ nguyên; chuỗi24.15 trong engine ranges của package upstream không phải pin runtime của dự án và không sửa tùy tiện. Receipt cũ giữ runtime thực lúc kiểm tra.

## Nguồn runtime và image

| Artifact | Nguồn / giá trị công khai đã kiểm chứng |
| --- | --- |
| Windows x64 portable | [Official archive](https://nodejs.org/download/release/v24.21.0/node-v24.21.0-win-x64.zip), SHA256 `158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541` khớp [SHASUMS256](https://nodejs.org/download/release/v24.21.0/SHASUMS256.txt) |
| Thực thi portable | `v24.21.0`, OpenSSL3.5.8, Undici7.29.1; pnpm10.34.6 qua Corepack chính bản portable, xác nhận cả child `pnpm exec node`. Không đổi cài đặt hệ thống. |
| Official Node image | [Docker Hub tag metadata](https://hub.docker.com/v2/namespaces/library/repositories/node/tags/24.21.0-bookworm-slim), cập nhật06/10/2026; OCI index `sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`, amd64 child `sha256:51b1100cc2a83d370c6a60952e3f2989c8a43159d0e38586e090f3b3326efefd` |

Image digest đối chiếu registry/Hub metadata, không thay quét Node/OpenSSL/OS packages. Linux container execution phải đạt trên PR HEAD bằng CI Docker bắt buộc; Windows Docker engine hiện không truy cập được, không start service để né điều kiện.

## Kiểm tra và nghiệm thu

Source pin độc lập `ab45f54` bắt đầu từ main5111d474 đã merge thật. Chỉ kế thừa staging sau PR37 merge thật; source cuối, root gates portable, lock/mobile-tree evidence, review và CI được bổ sung sau kiểm tra. Hiện **PENDING**, không gọi pins mới là nghiệm thu thành công.

Kiểm tra dự kiến: frozen install → typecheck → lint → test → build → Expo check tuần tự. Test gồm architecture, private PostgreSQL/HTTP, deploy artifact/operator; build export Android/iOS JS. Required CI còn build/run bốn container, migration/grants/seed, private backup/restore và proxy/browser. Không bỏ bước, không dùng test doubles để báo provider live.

Không thay source mobile/native dependencies; APK Android lịch sử vẫn ghi đúng source/toolchain lúc build, không tự gán binary cho Node mới hoặc suy iOS đạt. Physical devices, OAuth/Maps/Gemini live, staging/signing và preview Metro-off vẫn cần điều kiện trong EXTERNAL_RESOURCES khi tài liệu bàn giao được tích hợp. Không có provider calls hoặc billing trong issue này.

## Kết quả local trên source cuối

Product **`317a84d69d5fbe8f5f1bed5491aef11392750490`** kế thừa PR37 đã merge thật tại main **`162d93739aca05a067836bbe26c66883ce8fe64c`**. [PR37 CI](https://github.com/nyanduong/go-ease-webapp/actions/runs/38148538687) và [main CI](https://github.com/nyanduong/go-ease-webapp/actions/runs/38148950694) đều SUCCESS, gồm container; không dùng chúng thay CI của Node mới.

Điều phối chạy tuần tự bằng portable Node24.21.0/Corepack pnpm10.34.6; shim pnpm được tạo riêng trong thư mục portable, PATH/COREPACK_HOME chỉ scope process. Shim global Windows ép Node cũ nên đã kiểm tra cả nested `pnpm exec pnpm exec node`: execPath thực thuộc portable, OpenSSL3.5.8/Undici7.29.1. Không đổi cài đặt/PATH/global máy.

| Kiểm tra | Kết quả thật |
| --- | --- |
| Frozen install, typecheck, lint, test, build, Expo check | Tất cả PASS |
| Root tests | **300PASS/0skip** =26architecture+2dependency+135API+49web+69mobile+14deploy+4browser+1dev; architecture96source/0violations |
| Deployment local | Actual private PG/operator, moved/pruned runtime/WASM/API và Host regression PASS; không local Docker |
| Expo build | Android687modules →dist/android; iOS689modules →dist/ios; chỉ JS/assets export, không native |
| Lock / mobile source | Root lock SHA256 `BDABAF6F97FFD5AEB419A4AAFA72868520093F160FCCFA74CF04E9A410305925` giữ nguyên; mobile tree `1df75e0ab267df17eb997fafddeaec84c1a28011` bằng main5111 và162d937 |
| npm audit cập nhật | Exit1:0critical/4high/2moderate, cùng residual exceptions trong [#31](ISSUE-31.md); không báo audit sạch hoặc đổi graph để che finding |
| Review độc lập source/digest/assessment | CLEAR exact317a84d; receipt bổ sung chỉ ghi kết quả, không đổi product |
| PR HEAD / Linux Docker Node24.21 | PENDING, mandatory trước browser merge; receipt merge/CI sau cùng ở [issue38](https://github.com/nyanduong/go-ease-webapp/issues/38) |

Private logs `goease-issue38-node24-root-gates-20261011`: test SHA256 `0318441C04E25243892CBCCB61EB0B9C45ACD1DAE577212EE1A5ED305CCE0BA8`, build `3FE8CFBEE14B4BD96FE767943609AC2EB842D74E8ED4EF5FE542D58997B1D82C`, runtime `75CBF6F7B3133BAE2F8AAD84D97D39073A4EB8F1FB52090A29E190127393E228`. Test services dừng theo suite cleanup; không khởi động Metro/Docker daemon, không provider probe. APK x86_64 cũ vẫn compile-only đúng toolchain/source cũ; kết quả này không nâng UAT native/live thành PASS.
