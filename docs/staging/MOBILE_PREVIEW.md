# Preview Android và iOS — #10 còn điều kiện ngoài

Preview nội bộ cần JS/assets bundled, mở khi **Metro tắt**, HTTPS staging thật, cài trên **máy Android thật và iPhone thật** với ca riêng. Development APK/emulator, Metro export hoặc browser responsive không thay thế. Android/iOS vẫn song song; Windows không chứng minh iOS/signing/account/device đã đạt.

`apps/mobile/eas.json` đã có profile `preview`: internal distribution, `developmentClient=false`, `GOEASE_BUILD_VARIANT=preview`, Android APK. Không có project ID giả. App config preview chặn API không HTTPS và tắt dev network exceptions. Chưa chạy EAS build/deploy/provider trong #10.

Owner cần xác minh EAS account/project/quyền, quota/cost; Android signing/distribution + Google OAuth SHA1 đúng chứng chỉ preview; Apple team/signing/provisioning/thiết bị đăng ký; public Google client IDs/redirects/test users; Maps key native riêng restriction package/bundle+certificate; server key chỉ API. Simulator build không thay physical iPhone requirement và không tự chứng minh Apple paid membership.

Khi tài nguyên thật được owner cấp: cấu hình public `EXPO_PUBLIC_API_BASE_URL` HTTPS staging, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` và native Maps keys theo runbook #4/#8. Mọi EXPO_PUBLIC đều có thể đọc từ binary; không đặt server key/DB URL/token/signing secret trong đó. EAS project linkage/signing do owner được ủy quyền thực hiện, không tự signup/billing/terms trong đợt config này.

Sau review SHA và quyền/quota, owner chạy build profile preview riêng Android và iOS theo [EAS internal distribution](https://docs.expo.dev/build/internal-distribution/) và [build configuration](https://docs.expo.dev/build/eas-json/). Ghi build ID/SHA/binary hash/OS/thiết bị thật/cách cài/môi trường. Tắt Metro, cold launch, Google login thật, create/edit/save/reopen My Trips, retry khi mất mạng/lost response, logout/account switch, Maps/permission theo tài nguyên đã cấp. Đọc log/network mà không in ID token/opaque session/PII. Ghi FAIL/BLOCKED thực; không dùng Google/Routes/Gemini doubles để báo live.

API/staging deployment và backup/rollback tại [README staging](README.md). Kết quả riêng từng nền tảng tại [GE-M0-10](../verification/GE-M0-10.md); #10/#11 vẫn mở cho đến đủ các ca thiết bị thật và nyanduong nghiệm thu cuối.
