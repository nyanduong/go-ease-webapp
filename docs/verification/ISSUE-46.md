# #46 — vá container và quét final image

Phạm vi kỹ thuật trước bản thử M0; **chưa cho phép release/deploy**. #10/#11/M0 vẫn mở. Không có payment, cloud build, HTTPS staging hoặc native/UAT từ receipt này.

## Scan base thật ngày12/10/2026

Nguồn main `83891a9ac4c880cd0c0866eede2c22fb411bf365`; ba OCI index digest trong [Dockerfile](../../deploy/Dockerfile), chọn `linux/amd64`. Trivy chính thức **0.75.0**, vulnerability DB v2 UpdatedAt `2026-10-12T01:14:57Z`. Mỗi scan hoàn tất exit0, không ignore/severity/status filter. Exit0 không có nghĩa không có findings.

| Base | OS package/advisory pairs | Công cụ kèm image |
| --- | --- | --- |
| Node24.21.0 bookworm-slim, Debian12.15 | 241:4critical/54high/102medium/77low/4unknown;13 có FixedVersion | 21 npm:8high/12medium/1low;20 có FixedVersion |
| nginx1.30.5 alpine3.24, Alpine3.24.2 | 6:3high/3medium; cả6 có FixedVersion | Không phát hiện language findings |
| PostgreSQL18.6 trixie, Debian13.7 | 317:1critical/63high/110medium/132low/11unknown;4 có FixedVersion | gosu Go1.24.6:60, gồm1critical/24high; tất cả có FixedVersion |

Đây là **base scans**, chưa chứa artifact GoEase hoặc bản vá Docker layer. Counts là package/advisory pairs, không phải số lỗi ứng dụng có thể khai thác. Scanner severity và vendor assessment phải giữ riêng.

Raw JSON/log/metadata/checksums nằm ngoài Git trong thư mục local `goease-image-scan-20261012-fc766f22`; receipt SHA256 `f35ebe658d7eef9cdcf535197386441a6dadc950cdd218c3c3e1512eb07c133d`. Không chứa secrets hoặc upload mã riêng đến scan server. Scanner Windows archive kiểm SHA256 theo official release API/checksum; không tuyên bố tự xác minh Sigstore signature.

## Thay đổi container có giới hạn

Giữ nguyên base pins, Node/pnpm/lockfile, OS package metadata và repository ký chính thức. Không `dist-upgrade`, trộn Debian suites hoặc tắt kiểm chữ ký. Exact versions thiếu ở mirror thì build thất bại để review lại.

| Target/layer | Thay đổi |
| --- | --- |
| Node base dùng cho build/API/operator | `perl-base=5.36.0-7+deb12u4`; OpenSSL/CA vẫn cài từ kho chính thức |
| Final API/operator | Bỏ đúng global npm directory và npm/npx links, giữ `/app/node_modules`; build stage vẫn có npm/corepack/pnpm |
| Admin | `libexpat=2.8.5-r0`, `libpng=1.6.59-r0`, `nghttp2-libs=1.70.0-r0`, `pcre2=10.49-r0`, `tiff=4.7.2-r0`, `zlib=1.3.2-r1` |
| Custom pg-tools | `liblzma5`/`xz-utils=5.8.1-1+deb13u2`; bỏ đúng `/usr/local/bin/gosu`, vì target dùng `USER postgres` và entrypoint riêng |

Ngày12/10 các version đã có trong official Debian Packages.xz/Alpine APKINDEX. Debian indexes khớp SHA256 được InRelease công bố; chữ ký apt/apk vẫn do package manager kiểm trong Linux build, không suy từ lần đọc Windows. Lịch sử thử URL Packages.gz trảHTTP404 là sai dạng index, không phải policy/Auto-review rejection.

API/operator gọi Node trực tiếp; migration gọi Node + Prisma CLI/engine đã chuẩn bị trong build. Bỏ tool không dùng là giảm bề mặt runtime, không sửa/xóa metadata để che scan. **Database service upstream vẫn riêng và còn findings**, không bỏ gosu trong image đó hoặc suy pg-tools đã vá là DB service đã đạt.

Lần final-image CI đầu [38195450542](https://github.com/nyanduong/go-ease-webapp/actions/runs/38195450542), source `e5f517f8d9c58af1e3caddc7a7b7cd2fd33d1f82`: bốn scans và behavior/backup/restore PASS, aggregate gate **FAIL đúng điều kiện** vì operator có3fixable library findings. `@prisma/config7.10.0 → deepmerge-ts7.1.5` có [CVE-2026-40345](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx); `prisma7.10.0 → mysql2 3.15.3` có [auth downgrade](https://github.com/sidorares/node-mysql2/releases/tag/v3.22.0) và [inflate DoS](https://github.com/sidorares/node-mysql2/releases/tag/v3.23.1). Full5reports đã extract/checksum-verify ngoài Git, không bỏ findings hoặc chỉ quét OS để qua gate.

Vá graph bằng exact parent-scoped pnpm overrides: `@prisma/config@7.10.0>deepmerge-ts=8.0.0`, `prisma@7.10.0>mysql2=3.23.1`. Giữ Prisma/client/adapter7.10.0, không chuyển CLI8RC hoặc xóa metadata/dependency được dùng. [Deepmerge8 release](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0) có đổi Map merging/type aliases/into mutation; consumer Prisma chỉ truyền `deepmerge` cho c12 với config GoEase dạng record/path, không dùng Maps/into. Regression kiểm cycle không stack overflow và actual Prisma config loader giữ schema/migrations; generate/root gates và actual PG migration/backup/restore phải chạy lại trên HEAD đã vá. mysql2 không là backend DB adapter GoEase; PostgreSQL vẫn là provider bắt buộc. Upstream advisory page MySQL từng ghi chưa có patched version; release/commit và scanner DB dùng range mới phải đối chiếu riêng, không tự coi advisory đã đóng.

## Final-image gate và bằng chứng

Quality Gate giữ toàn bộ bước cũ, thêm Trivy Linux64 chính thức khóa SHA256 `c6e65abddb348e25f10549df887045629cf28cc72453cd1c63acb717316b3f3f`. Quét bốn image IDs vừa build qua local Docker, trước mount fixture secrets; cwd/config/cache riêng, không scanner server. Giữ JSON mọi severity, kể cả unfixed và full package inventory; API/operator phải có Node library coverage cùng Nest runtime, operator thêm Prisma CLI. Scan đủ bốn target trước aggregate verdict. Report lỗi/thiếu/khác image/platform/phạm vi hoặc DB quá48giờ làm gate fail. Package version/tool absence được kiểm trong final target; existing migrate/grants/seed/verify, non-root/read-only, proxy/browser/replacement và backup/restore vẫn bắt buộc.

Bốn JSON và `summary.json` nằm trong report directory tách khỏi secret/backup fixtures; ghi source HEAD, checkout commit, image IDs, platform, tool/DB time và report hashes. Full bytes được gzip/base64/chunk vào CI logs, kiểm SHA256 khi extract; không upload Actions artifact/cache khi chưa xác minh quota. [GitHub billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) phân biệt standard public runner/logs miễn phí với artifact storage có thể vượt hạn mức. Gate từ chối findings có FixedVersion; **không coi unfixed là sạch**, không dùng `--ignore-unfixed` hoặc blanket allowlist. `releaseReady=false` giữ rõ trong summary, ngay cả khi không có bản vá khả dụng. CI success không thay đánh giá bảo mật trước release.

Tải log của run thật và extract ra **thư mục mới ngoài Git**; không ghi secrets hoặc backup vào log/report:

```sh
gh run view <RUN_ID> --repo nyanduong/go-ease-webapp --log > <PRIVATE_OUTSIDE_GIT>/run.log
node deploy/image-report-log.mjs <PRIVATE_OUTSIDE_GIT>/run.log <PRIVATE_OUTSIDE_GIT>/new-image-reports
```

Final image results/CI URL/merge SHA được ghi ở issue/PR sau khi chạy thật; phần dưới không là receipt đã PASS khi chưa có link CI.

## Residual và điều kiện trước bản thử

- Node CVE-2023-45853: [Debian](https://security-tracker.debian.org/tracker/CVE-2023-45853) ghi bookworm không build contrib/minizip vào binary package liên quan; giữ raw scanner finding và vendor note, không miễn trừ toàn bộ zlib.
- Node13fixable Perl pairs gồm [CVE-2026-13221](https://security-tracker.debian.org/tracker/CVE-2026-13221), [CVE-2026-42496](https://security-tracker.debian.org/tracker/CVE-2026-42496), [CVE-2026-8376](https://security-tracker.debian.org/tracker/CVE-2026-8376). CVE cuối mô tả32bit; image chọnamd64 chưa đủ để bỏ qua toàn bộ package findings. npm findings thuộc global npm toolchain, không phải pnpm graph hoặc Node built-in Undici.
- PostgreSQL [CVE-2026-6653](https://security-tracker.debian.org/tracker/CVE-2026-6653) trên libxml2 chưa có fixed trixie; scanner-critical/vendor no-dsa minor phải ghi riêng. Script không có XML operation chưa chứng minh binary linkage/reachability an toàn.
- Các critical/high còn lại cần đánh giá advisory/vendor/platform/call path và review đủ bằng chứng trước staging/bản thử. **#46 giữ mở** khi tiêu chí này chưa đạt; PR partial dùng `Refs #46`. Không tự đổi severity, tắt scanner, hoặc suy base/lockfile audit là final-image sạch.
- [Assessment base residual](ISSUE-46-RESIDUAL.md) đối chiếu22unique advisory critical/high chưa có FixedVersion với nguồn Debian. Libxml2/GnuTLS, các tool/mount/Perl paths và candidate source-package-only vẫn cần filesystem/linkage/effective-permission proof trên final image; chưa là quyết định miễn trừ.

Nguồn chính thức: [Trivy release](https://github.com/aquasecurity/trivy/releases/tag/v0.75.0), [container scan](https://trivy.dev/docs/v0.75/guide/target/container_image/), [Alpine secfix](https://secdb.alpinelinux.org/v3.24/main.json), [Debian xz DSA](https://security-tracker.debian.org/tracker/DSA-6549-1), [gosu Go advisory](https://pkg.go.dev/vuln/GO-2026-4337).
