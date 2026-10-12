# #44 — fixture auth challenge dùng một instant

Ngày kiểm tra 12/10/2026. Phạm vi issue fix riêng sau PR #43; không thay production auth, schema/migration, giới hạn 5 phút, grants hoặc CI.

## Lỗi gốc và tái hiện

Main `311a398ebb7d7c1961b6bfecda407c4eed9d12c8` có [Quality Gate thất bại](https://github.com/nyanduong/go-ease-webapp/actions/runs/38189428597) ở bước test. `auth-http.test.ts` tạo fixture expired bằng hai lần `Date.now()`: `createdAt=t1−600000`, `expiresAt=t2−300000`. Nếu hai lần lệch 1 ms, lifetime là 300001 ms; PostgreSQL từ chối với SQLSTATE `23514`, constraint `challenge_expiry`. Fixture cleanup có cùng mẫu. PR #43 từng có CI thành công trên HEAD nhưng không thay kết quả main này.

Regression mới chạy trên PostgreSQL cô lập thật: INSERT lifetime đúng 300000 ms thành công, UPDATE tăng expiry 1 ms bị từ chối bằng đúng SQLSTATE/constraint trên. Connection riêng mở transaction rồi đóng để rollback dữ liệu fixture. Không dựa vào sleep/retry hoặc chờ clock lệch ngẫu nhiên.

## Sửa và kiểm tra local

Hai fixture expiry/cleanup chụp một `expiredAt`, derive `createdAt` từ cùng instant. Assertion expired400, proof/nonce/transport/replay, simultaneous CAS, ownership và cleanup vẫn giữ nguyên. Production service đã dùng một instant nên không cần đổi runtime.

Writer branch `nyan/issue-44-auth-fixture-clock` từ main `311a398`. Portable Node24.21.0/pnpm10.34.6, frozen install và root `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` đều exit0. Tổng305 tests PASS/0skip: architecture26, dependency2, API136, web49, mobile73, deploy14, browser smoke4, dev1. Google identity dùng Nest override doubles; PostgreSQL/HTTP là thật. Android+iOS JS export PASS, không phải native build hoặc Google OAuth live. Subagent review chỉ đọc CLEAR; `git diff --check` PASS.

Logs local ngoài Git, SHA256: typecheck `32590D4CFCE59ED52043351EA8401FD2A2FDCD0A9FC355B9FEC5EC30D7C5EF9F`, lint `6B384DB6E3731D3B90D5F778CCDBB9F18DFA055FBAC36C8E000DFE47DB0B0117`, test `C114FBC157FA025FB3C192271E82290E39A119750B720C165CC5C4E90914B0B3`, build `1B52ABE436AEDB7E75F37129F2F6EC24AEC98AAE188E4E28605CEEAD2A313E98`.

Quality Gate/security trên HEAD PR cuối, browser merge SHA, CI main và board được ghi tại receipt issue/PR sau khi thực sự đạt; không rerun main lỗi để coi là đã sửa. Chỉ đóng #44 khi đủ kỹ thuật theo ủy quyền. #4/#10/#15/#11 và M0 vẫn mở cho native/live/preview/UAT, không báo nyanduong đã nghiệm thu. Không có chi tiêu, cloud build/deploy hoặc chạy lại Metro development server trong fix này.
