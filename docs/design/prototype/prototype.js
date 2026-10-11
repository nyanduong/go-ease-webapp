// Prototype riêng: mọi identity, bản đồ, network và persistence dưới đây đều giả lập.
const prototypeDom = globalThis.document;
const storageKey = 'goease:design-prototype:v1';
const clone = (value) => globalThis.structuredClone(value);
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const money = (value) => value === null ? 'Chưa có' : `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
const minutes = (value) => value === null ? 'Chưa chọn giờ' : `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const landscape = `<div class="landscape" aria-hidden="true"><svg viewBox="0 0 340 170" xmlns="http://www.w3.org/2000/svg"><circle cx="263" cy="40" r="24" fill="#e8c37b"/><path d="M0 132 97 30 188 139Z" fill="#7fa78f"/><path d="m101 136 95-93 97 93Z" fill="#a4bda0"/><path d="M0 135q80-36 164-1t176-9v45H0Z" fill="#b7d9d3"/><path d="M0 153q84-25 169-1t171-2" fill="none" stroke="#e6f1e6" stroke-width="3"/><path d="m66 140 12-37 12 37" fill="#f1e1b9"/><path d="M78 103v37" stroke="#537a60" stroke-width="2"/></svg></div>`;
const defaultForm = () => ({ title: 'Đà Nẵng cùng bạn', startDate: '2026-10-20', durationDays: '3', groupSize: '4', budgetVnd: '6000000' });
let saved = null;
try {
  const candidate = JSON.parse(globalThis.localStorage.getItem(storageKey));
  if (candidate?.prototypeVersion === 1 && typeof candidate.trip?.title === 'string' && Array.isArray(candidate.trip.days) && candidate.trip.days.every((day) => Array.isArray(day.activities))) saved = candidate.trip;
} catch { /* Storage không khả dụng/không hợp lệ không chặn mở prototype. */ }
const state = {
  platform: 'android', session: false, screen: 'trips', saved, draft: clone(saved), day: 0,
  dirty: false, offline: false, failSave: false, loading: false, error: '', formError: '',
  form: defaultForm(), location: 'denied', adminSession: 'anonymous', adminPage: 'catalog',
};
const dialog = prototypeDom.querySelector('#prototype-dialog');
let dialogReturnFocus = null;
let toastTimer;
let pendingVersion = 0;

function feedback(message) { prototypeDom.querySelector('#scenario-feedback').textContent = message; }
function toast(message) {
  const element = prototypeDom.querySelector('#toast');
  globalThis.clearTimeout(toastTimer);
  element.textContent = message;
  element.hidden = false;
  toastTimer = globalThis.setTimeout(() => { element.hidden = true; }, 3200);
}
function dateAt(start, offset = 0) {
  const value = new Date(`${start}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
function shortDate(value) { const [, month, day] = value.split('-'); return `${day}/${month}`; }
function dateRange(trip) { return `${shortDate(trip.startDate)} – ${shortDate(dateAt(trip.startDate, trip.durationDays - 1))}`; }
function costSummary(trip) {
  const activities = trip.days.flatMap((day) => day.activities);
  return { known: activities.reduce((total, activity) => total + (activity.cost ?? 0), 0), unknown: activities.filter((activity) => activity.cost === null).length };
}
function appHeader(title = 'GoEase', back = false) {
  return `<header class="app-header ${back ? 'detail' : ''}">${back ? `<button type="button" class="back" data-action="back" data-test="back"><span aria-hidden="true">‹</span>${state.platform === 'ios' ? 'Chuyến đi' : 'Quay lại'}</button>` : ''}<strong>${escape(title)}</strong>${back ? '' : '<button type="button" class="avatar" data-action="profile" aria-label="Tài khoản mẫu">AN</button>'}</header>`;
}
function bottomNav(current = 'trips') {
  return `<nav class="bottom-nav" aria-label="Điều hướng app"><button type="button" data-action="trips" ${current === 'trips' ? 'aria-current="page"' : ''}><span aria-hidden="true">▣</span>Chuyến đi</button><button type="button" data-action="map" data-test="open-map" ${current === 'map' ? 'aria-current="page"' : ''} ${!state.draft ? 'disabled' : ''}><span aria-hidden="true">⌖</span>Bản đồ</button></nav>`;
}
function welcomeScreen() {
  return `<div class="screen-content welcome"><div class="wordmark"><span class="brand-mark" aria-hidden="true">g</span>GoEase</div><span class="pill">Đi cùng nhau, dễ hơn</span><h1>Một chuyến đi.<br />Nhiều điều để nhớ.</h1><p class="muted">Gom lịch trình, địa điểm và ngân sách của nhóm vào một nơi gọn gàng.</p>${landscape}<ul class="welcome-points"><li>Lịch trình theo nhịp của bạn</li><li>Ngân sách rõ cho cả nhóm</li><li>Chỉnh sửa trước khi lên đường</li></ul><button type="button" class="button full" data-action="login" data-test="mobile-login"><span class="google-icon" aria-hidden="true">G</span>Tiếp tục với Google</button><p class="privacy-note">Chuyến riêng chỉ tài khoản của bạn quản lý.</p></div>`;
}
function tripsScreen() {
  const trip = state.draft;
  return `${appHeader()}<div class="screen-content"><span class="eyebrow">CHUYẾN ĐI CỦA TÔI</span><h1 style="margin-top:10px">Hẹn một ngày<br />đi cùng nhau.</h1><p class="muted small">Một kế hoạch vừa đủ, để còn chỗ cho bất ngờ.</p>${trip ? `<button type="button" class="trip-card" data-action="trip-detail" data-test="trip-card">${landscape}<div class="trip-card-body"><span class="pill">Đà Nẵng · Dữ liệu mẫu</span><h2>${escape(trip.title)}</h2><p>${dateRange(trip)} · ${trip.durationDays} ngày · ${trip.groupSize} người</p><div class="trip-card-footer"><span>${money(trip.budgetVnd)}</span><span>${state.dirty ? 'Chưa lưu ●' : 'Xem lịch trình ↗'}</span></div></div></button><p class="small muted" style="margin-top:16px">Bản mẫu chỉ có một chuyến để thử flow M0.</p>` : `<section class="empty-card"><div class="empty-icon" aria-hidden="true">⌁</div><h2>Chưa có chuyến đi nào</h2><p class="muted">Bắt đầu với một chuyến mẫu ngắn.<br />Bạn có thể chỉnh từng hoạt động sau.</p><button type="button" class="button full" data-action="new-trip" data-test="new-trip">＋ Tạo chuyến mẫu</button></section><div class="inspiration"><span aria-hidden="true">☀</span><p><strong>Gợi ý cho lần đầu</strong><br />Đà Nẵng · 3 ngày · cùng nhóm bạn<br /><span class="muted">Dữ liệu thử, chưa là điểm đến mở bán.</span></p></div>`}</div>${bottomNav()}`;
}
function tripFormScreen() {
  const form = state.form;
  return `${appHeader('Tạo chuyến', true)}<div class="screen-content"><div class="form-intro"><span class="pill">Dữ liệu mẫu</span><h1 style="margin-top:13px">Mình đi đâu nhỉ?</h1><p class="small muted">Chọn vài thông tin. Lịch trình mẫu luôn có thể chỉnh lại.</p></div>${state.formError ? `<div class="form-error" role="alert">${escape(state.formError)}</div>` : ''}<form id="trip-form" novalidate><label class="field">Tên chuyến đi<input name="title" maxlength="160" value="${escape(form.title)}" required autocomplete="off" data-test="trip-title" /></label><label class="field">Điểm đến<input value="Đà Nẵng · bộ dữ liệu thử" readonly /><small>Điểm đến thử cho prototype, chưa phải quyết định thị trường.</small></label><label class="field">Ngày khởi hành<input name="startDate" type="date" min="2000-01-01" max="2099-12-31" value="${escape(form.startDate)}" required data-test="trip-start" /></label><div class="form-grid"><label class="field">Số ngày<select name="durationDays" data-test="trip-days">${[1, 2, 3, 4, 5].map((day) => `<option value="${day}" ${Number(form.durationDays) === day ? 'selected' : ''}>${day} ngày</option>`).join('')}</select></label><label class="field">Số người<input name="groupSize" type="number" min="1" max="50" step="1" value="${escape(form.groupSize)}" required data-test="trip-group" /></label></div><label class="field">Ngân sách cả nhóm · VND<input name="budgetVnd" inputmode="numeric" value="${escape(form.budgetVnd)}" placeholder="Chưa xác định" data-test="trip-budget" /><small>Tổng cho tất cả mọi người. Để trống nếu chưa biết.</small></label><button type="submit" class="button full" ${state.loading ? 'disabled' : ''} data-test="create-trip">${state.loading ? 'Đang tạo bản mẫu…' : 'Tạo lịch trình mẫu'}</button><p class="privacy-note">Không tạo booking hoặc giao dịch.</p></form></div>`;
}
function activityCard(activity, index) {
  return `<article class="activity"><div class="activity-time">${activity.start === null ? 'Chưa chọn giờ' : `${minutes(activity.start)} – ${minutes(activity.end)}`}</div><h3>${escape(activity.title)}</h3><p>${escape(activity.notes || 'Thêm ghi chú để cả nhóm dễ hình dung.')}</p><div class="activity-footer"><span class="activity-cost">${activity.cost === null ? 'Chi phí chưa có' : `${money(activity.cost)} / nhóm`}</span><button type="button" class="text-button" data-action="edit-activity" data-index="${index}" data-test="edit-activity-${index}" aria-label="Sửa ${escape(activity.title)}" ${state.loading ? 'disabled' : ''}>Sửa ↗</button></div></article>`;
}
function tripDetailScreen() {
  const trip = state.draft;
  const day = trip.days[state.day];
  const costs = costSummary(trip);
  return `${appHeader('Lịch trình', true)}<div class="screen-content" data-test="trip-detail"><span class="pill">Đà Nẵng · Dữ liệu mẫu</span><h1 class="trip-title">${escape(trip.title)}</h1><p class="trip-meta">${dateRange(trip)} · ${trip.durationDays} ngày · ${trip.groupSize} người</p><section class="budget-card" aria-label="Ngân sách tổng nhóm"><div class="budget-top"><span>NGÂN SÁCH CẢ NHÓM</span><span>${trip.groupSize} người</span></div><strong>${money(trip.budgetVnd)}</strong><p>Đã biết: ${money(costs.known)}${costs.unknown ? ` · ${costs.unknown} khoản chưa có chi phí` : ' · đủ chi phí đã nhập'}${costs.unknown ? '<br />Chưa có tổng ước tính hoàn chỉnh.' : ''}</p></section><div class="day-tabs" role="group" aria-label="Ngày trong chuyến">${trip.days.map((_, index) => `<button type="button" data-action="day" data-index="${index}" data-test="day-${index + 1}" aria-pressed="${state.day === index}"><strong>Ngày ${index + 1}</strong>${shortDate(dateAt(trip.startDate, index))}</button>`).join('')}</div>${state.error ? `<div class="alert" role="alert" data-test="save-error"><strong>Chưa xác nhận lưu</strong><p>${escape(state.error)} Bản đang chỉnh vẫn còn ở đây.</p></div>` : ''}<div class="section-heading"><h2>Nhịp đi của ngày ${state.day + 1}</h2><span>${day.activities.length} hoạt động</span></div>${day.activities.length ? day.activities.map(activityCard).join('') : '<div class="day-empty"><strong>Ngày này còn để ngỏ</strong><p>Thêm một hoạt động hoặc để nhóm tự khám phá.</p><button type="button" class="button secondary small-button" data-action="add-activity" data-test="add-activity">＋ Thêm hoạt động</button></div>'}${day.activities.length ? '<button type="button" class="button secondary full" data-action="add-activity">＋ Thêm hoạt động</button>' : ''}<p class="small muted" style="margin-top:16px">Chi phí là ước tính mẫu cho cả nhóm, không phải giá hay chỗ đã được xác nhận.</p></div><div class="save-strip" data-test="save-state"><p><strong>${state.dirty ? 'Có thay đổi chưa lưu' : 'Bản mẫu đã lưu'}</strong>${state.dirty ? 'Lưu để mở lại bản mới nhất.' : `Phiên bản mẫu ${trip.version}`}</p><button type="button" class="button" data-action="save" data-test="save-trip" ${(!state.dirty || state.loading) ? 'disabled' : ''}>${state.loading ? 'Đang lưu…' : state.error ? 'Thử lưu lại' : 'Lưu chuyến'}</button></div>${bottomNav()}`;
}
function mapScreen() {
  const places = state.draft.days[state.day].activities.map((activity, index) => ({ ...activity, index })).filter((activity) => Number.isInteger(activity.mapPin));
  const locationMessages = {
    denied: ['Chưa chia sẻ vị trí', 'Bạn vẫn xem được lịch trình và pin. Dùng điểm xuất phát mẫu khi cần.'],
    unavailable: ['Chưa tìm được GPS', 'Thử ở nơi thoáng hơn hoặc dùng điểm xuất phát mẫu. Không cần bật vị trí để xem pin.'],
    granted: ['Đã cho phép vị trí · giả lập', 'Prototype chưa lấy vị trí thiết bị. Vị trí thực cần kiểm chứng trong app native.'],
  };
  const [title, message] = locationMessages[state.location];
  return `${appHeader('Bản đồ chuyến', true)}<div class="screen-content"><span class="pill">Ngày ${state.day + 1} · Đà Nẵng mẫu</span><h1 style="font-size:25px;margin-top:12px">Điểm hẹn trên đường</h1><p class="small muted">Xem pin gắn với hoạt động trong lịch trình.</p><div class="location-card"><h3>${title}</h3><p>${message}</p><button type="button" class="text-button" data-action="location" data-value="granted">Thử cấp quyền vị trí</button></div>${state.offline ? '<div class="alert neutral" role="alert"><strong>Đang mất kết nối</strong><p>Không tải được bản đồ/tuyến mới. Lịch trình đang xem vẫn còn; hãy kết nối lại để thử.</p></div>' : ''}<div class="map-canvas ${state.offline ? 'offline' : ''}" aria-label="Minh họa bản đồ, pin giả lập"><div class="map-water"></div><div class="map-park"></div><span class="map-label">MINH HỌA · KHÔNG PHẢI MAPS LIVE</span>${places.map((place) => `<button type="button" class="map-pin ${place.mapPin === 0 ? 'one' : 'two'}" data-action="map-pin" data-index="${place.index}" aria-label="Pin mẫu: ${escape(place.title)}">${place.mapPin + 1}</button>`).join('')}<span class="map-attribution">Vector do nhóm dựng · vị trí giả lập</span></div><div class="alert neutral"><strong>Chưa có tuyến đường trong prototype</strong><p>Không nối pin để giả đường đi. App M0 sẽ báo rõ API lỗi, không có tuyến và trạng thái retry.</p></div>${places.length ? places.map((place) => `<div class="map-place"><span>${place.mapPin + 1}</span><div><h3>${escape(place.title)}</h3><p>Pin minh họa · không có giá/tồn chỗ live</p></div></div>`).join('') : '<p class="muted small">Ngày này chưa có địa điểm gắn bản đồ. Hoạt động tự nhập vẫn ở lịch trình.</p>'}<button type="button" class="button secondary full" data-action="map-retry" data-test="map-retry" style="margin-top:18px">Thử tải lại trạng thái mẫu</button></div>${bottomNav('map')}`;
}
function renderMobile() {
  const content = !state.session ? welcomeScreen() : state.screen === 'form' ? tripFormScreen() : state.screen === 'detail' && state.draft ? tripDetailScreen() : state.screen === 'map' && state.draft ? mapScreen() : tripsScreen();
  prototypeDom.querySelector('#mobile-screen').innerHTML = `${state.offline ? '<div class="offline-banner" role="status">Mất kết nối mẫu · bản đang chỉnh được giữ trong phiên</div>' : ''}${content}`;
}
function adminContent() {
  if (state.adminSession !== 'admin') {
    const denied = state.adminSession === 'customer';
    const expired = state.adminSession === 'expired';
    return `<div class="admin-login">${denied ? '<div class="error-number">403</div>' : '<span class="brand-mark" aria-hidden="true">g</span>'}<span class="eyebrow">GOEASE / QUẢN TRỊ</span><h1 style="margin-top:12px">${denied ? 'Tài khoản chưa có quyền' : expired ? 'Phiên đã hết hạn' : 'Không gian vận hành'}</h1><p>${denied ? 'Quyền quản trị được cấp tại server. Biết đường dẫn hoặc đổi role trên máy không mở được trang này.' : expired ? 'Đăng nhập lại để tiếp tục. Việc này không xóa dữ liệu chuyến đã lưu.' : 'Đăng nhập bằng tài khoản được cấp quyền để xem dữ liệu tham chiếu và tình trạng tích hợp.'}</p><button type="button" class="button full" data-action="admin-login" data-test="admin-login">${denied ? 'Đổi tài khoản mẫu' : 'Đăng nhập nhân viên'}</button><p class="privacy-note">Identity ở prototype là giả lập, không phải kiểm chứng bảo mật.</p></div>`;
  }
  const catalog = state.adminPage === 'catalog';
  return `<div class="admin-shell"><aside class="admin-sidebar"><div class="wordmark"><span class="brand-mark" aria-hidden="true">g</span>GoEase</div><p>KHÔNG GIAN VẬN HÀNH</p><nav class="admin-nav" aria-label="Điều hướng quản trị"><button type="button" data-action="admin-page" data-value="catalog" ${catalog ? 'aria-current="page"' : ''}>Dữ liệu tham chiếu</button><button type="button" data-action="admin-page" data-value="requests" ${!catalog ? 'aria-current="page"' : ''}>Yêu cầu dịch vụ</button></nav><footer>Không có quyền xem chuyến riêng của người khác.</footer></aside><div class="admin-content"><header class="admin-topbar"><span><strong>Nhân viên mẫu</strong> · Admin giả lập</span><button type="button" class="text-button" data-action="admin-logout">Đăng xuất</button></header><div class="admin-body"><span class="eyebrow">${catalog ? 'DANH MỤC / M0' : 'ĐỊNH HƯỚNG SAU M0'}</span><h1>${catalog ? 'Dữ liệu tham chiếu' : 'Yêu cầu khách sạn & vé máy bay'}</h1><p>${catalog ? 'Nội dung dùng chung cho chuyến mẫu. Không chứa lịch trình hoặc dữ liệu riêng của khách.' : 'Phác thảo nơi tiếp nhận yêu cầu khi đã xác minh quyền và vận hành đối tác.'}</p>${catalog ? `<div class="alert neutral"><strong>Dữ liệu prototype</strong><p>Chưa có API quản trị hay nguồn địa điểm live. CRUD và quyền thực sẽ theo #16/#4.</p></div><section class="admin-card"><div class="section-heading"><h2>Đà Nẵng · bộ dữ liệu thử</h2><span class="pill">Chỉ đọc mẫu</span></div><div class="admin-ref"><div><h3>Đi bộ ven biển</h3><p>Trải nghiệm ngoài trời · chưa có tọa độ/provider</p></div><span class="pill">Mẫu</span></div><div class="admin-ref"><div><h3>Thưởng thức món địa phương</h3><p>Ẩm thực · chi phí do người dùng ước tính</p></div><span class="pill">Mẫu</span></div></section><div class="admin-info-grid"><div class="design-note"><strong>Quyền có giới hạn</strong><p>Admin quản lý danh mục được cấp. Không tự đọc/sửa mọi chuyến riêng.</p></div><div class="design-note"><strong>Báo cáo tích hợp</strong><p>AI, Maps và booking cần báo cáo nguồn, quyền và kết quả thật; chưa có số liệu live ở đây.</p></div></div>` : `<section class="admin-card"><span class="pill">Chưa triển khai trong M0</span><h2 style="margin-top:16px">Từ yêu cầu đến xác nhận</h2><p class="small muted">Nhận yêu cầu → kiểm tra quyền/đối tác → chuyển đối tác → chờ phản hồi → xác nhận có bằng chứng.</p><div class="alert neutral"><strong>Chưa có yêu cầu hoặc booking thật</strong><p>Prototype không gửi thông tin, giữ chỗ, thu tiền hoặc phát hành vé. Nghiên cứu khả thi ở #9, không có nút xác nhận giả.</p></div></section>`}</div></div></div>`;
}
function render() {
  const admin = state.platform === 'admin';
  prototypeDom.querySelector('#mobile-preview').hidden = admin;
  prototypeDom.querySelector('#admin-preview').hidden = !admin;
  prototypeDom.querySelector('#preview-stage').classList.toggle('admin-stage', admin);
  const device = prototypeDom.querySelector('#mobile-preview');
  device.className = `device ${state.platform === 'ios' ? 'ios' : 'android'}`;
  device.setAttribute('aria-label', `Prototype app ${state.platform === 'ios' ? 'iOS' : 'Android'}`);
  prototypeDom.querySelectorAll('[data-action="platform"]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.value === state.platform)));
  prototypeDom.querySelector('#network-dot').classList.toggle('offline', state.offline);
  prototypeDom.querySelector('#network-label').textContent = state.offline ? 'Mạng mẫu: mất kết nối' : 'Mạng mẫu: đang kết nối';
  prototypeDom.querySelector('[data-action="network"]').setAttribute('aria-pressed', String(state.offline));
  renderMobile();
  prototypeDom.querySelector('#admin-preview').innerHTML = adminContent();
}
function openDialog(body) {
  dialogReturnFocus = prototypeDom.activeElement;
  dialog.innerHTML = body;
  dialog.showModal();
}
function closeDialog() {
  dialog.close();
  if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus();
}
function dialogHeader(title) { return `<div class="dialog-heading"><h2 id="dialog-title">${title}</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="Đóng hộp thoại">×</button></div>`; }
function loginDialog(admin = false) {
  openDialog(`${dialogHeader('Phiên mẫu · Google chưa kết nối')}<p class="muted small">Đây là bước chuyển trạng thái cho thiết kế. Không xác minh Google, không gửi danh tính thật.</p>${state.offline ? '<div class="alert" role="alert">Không thể mô phỏng đăng nhập khi đang mất kết nối. Bật lại mạng mẫu rồi thử lại.</div>' : `<div class="dialog-actions"><button type="button" class="button" data-action="${admin ? 'login-as-admin' : 'login-as-customer'}" data-test="confirm-login">${admin ? 'Dùng vai trò admin mẫu' : 'Dùng khách mẫu'}</button>${admin ? '<button type="button" class="button secondary" data-action="login-admin-customer">Dùng customer mẫu</button>' : ''}</div>`}`);
}
function captureForm() {
  const form = prototypeDom.querySelector('#trip-form');
  if (form) state.form = Object.fromEntries(new globalThis.FormData(form).entries());
}
function validateTrip(form) {
  if (!form.title.trim() || form.title.trim().length > 160) return 'Nhập tên chuyến từ 1 đến 160 ký tự.';
  if (!Number.isInteger(Number(form.durationDays)) || Number(form.durationDays) < 1 || Number(form.durationDays) > 5) return 'Chuyến mẫu có từ 1 đến 5 ngày.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.startDate) || !Number.isFinite(Date.parse(`${form.startDate}T00:00:00Z`)) || dateAt(form.startDate) !== form.startDate || form.startDate < '2000-01-01' || dateAt(form.startDate, Number(form.durationDays) - 1) > '2099-12-31') return 'Chọn ngày lịch hợp lệ trong khoảng 2000–2099.';
  if (!Number.isInteger(Number(form.groupSize)) || Number(form.groupSize) < 1 || Number(form.groupSize) > 50) return 'Nhập số người nguyên từ 1 đến 50.';
  if (form.budgetVnd.trim() && (!/^\d+$/.test(form.budgetVnd.trim()) || !Number.isSafeInteger(Number(form.budgetVnd)) || Number(form.budgetVnd) > 1e12)) return 'Ngân sách là số nguyên VND từ 0 đến 1.000.000.000.000, hoặc để trống.';
  return '';
}
function persist(trip) {
  try { globalThis.localStorage.setItem(storageKey, JSON.stringify({ prototypeVersion: 1, trip })); return true; }
  catch { state.error = 'Trình duyệt không cho lưu dữ liệu mẫu. Kiểm tra quyền storage rồi thử lại.'; return false; }
}
async function createTrip() {
  captureForm();
  state.formError = validateTrip(state.form);
  if (state.formError) { renderMobile(); return; }
  const attempt = ++pendingVersion;
  const form = clone(state.form);
  state.loading = true;
  renderMobile();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 450));
  if (attempt !== pendingVersion) return;
  state.loading = false;
  if (state.offline) { state.formError = 'Chưa tạo được khi mất kết nối mẫu. Thông tin vừa nhập vẫn được giữ; bật lại mạng rồi thử.'; renderMobile(); return; }
  const trip = {
    title: form.title.trim(), startDate: form.startDate, durationDays: Number(form.durationDays), groupSize: Number(form.groupSize), budgetVnd: form.budgetVnd.trim() ? Number(form.budgetVnd) : null, version: 1,
    days: Array.from({ length: Number(form.durationDays) }, (_, index) => ({ activities: index === 0 ? [
      { title: 'Đi bộ ven biển', notes: 'Một khoảng thảnh thơi đầu ngày. Chi phí mẫu cho cả nhóm.', start: 540, end: 600, cost: 0, mapPin: 0 },
      { title: 'Thưởng thức món địa phương', notes: 'Cùng chọn quán sau. Chưa có giá hoặc chỗ được xác nhận.', start: 720, end: 780, cost: null, mapPin: 1 },
    ] : [] })),
  };
  if (!persist(trip)) { state.formError = state.error; renderMobile(); return; }
  state.saved = clone(trip); state.draft = trip; state.dirty = false; state.day = 0; state.screen = 'detail'; state.error = ''; state.formError = '';
  renderMobile(); toast('Đã tạo bản mẫu · lưu trong trình duyệt này, chưa qua API.');
}
function editActivity(index) {
  const activity = index === -1 ? { title: '', notes: '', start: null, end: null, cost: null } : state.draft.days[state.day].activities[index];
  openDialog(`${dialogHeader(index === -1 ? 'Thêm hoạt động' : 'Chỉnh hoạt động')}<p class="muted small">Cập nhật bản nháp, sau đó bấm “Lưu chuyến” để xác nhận.</p><form id="activity-form" data-index="${index}" novalidate><div id="activity-error" class="form-error" role="alert" hidden></div><label class="field">Tên hoạt động<input name="title" value="${escape(activity.title)}" maxlength="160" required data-test="activity-title" /></label><div class="form-grid"><label class="field">Bắt đầu · HH:mm<input name="start" value="${activity.start === null ? '' : minutes(activity.start)}" placeholder="09:00" inputmode="numeric" data-test="activity-start" /></label><label class="field">Kết thúc · HH:mm<input name="end" value="${activity.end === null ? '' : minutes(activity.end)}" placeholder="10:00" inputmode="numeric" data-test="activity-end" /></label></div><label class="field">Chi phí cả nhóm · VND<input name="cost" value="${activity.cost === null ? '' : activity.cost}" inputmode="numeric" placeholder="Chưa có" data-test="activity-cost" /><small>Để trống nếu chưa biết. 0 nghĩa là đã biết miễn phí.</small></label><label class="field">Ghi chú<textarea name="notes" maxlength="1000" data-test="activity-notes">${escape(activity.notes)}</textarea></label><button type="submit" class="button full" data-test="apply-activity">Cập nhật bản nháp</button></form>`);
}
function parseMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [hour, minute] = value.split(':').map(Number);
  return hour <= 24 && minute <= 59 && (hour !== 24 || minute === 0) ? hour * 60 + minute : NaN;
}
function applyActivity(formElement) {
  const form = Object.fromEntries(new globalThis.FormData(formElement).entries());
  const start = form.start.trim() ? parseMinutes(form.start.trim()) : null;
  const end = form.end.trim() ? parseMinutes(form.end.trim()) : null;
  let error = '';
  if (!form.title.trim() || form.title.trim().length > 160) error = 'Nhập tên hoạt động từ 1 đến 160 ký tự.';
  else if (!((start === null && end === null) || (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start < end && end <= 1440))) error = 'Điền cả hai giờ HH:mm, bắt đầu trước kết thúc, hoặc để trống cả hai. Giờ kết thúc tối đa 24:00.';
  else if (form.cost.trim() && (!/^\d+$/.test(form.cost.trim()) || !Number.isSafeInteger(Number(form.cost)) || Number(form.cost) > 1e12)) error = 'Chi phí là số nguyên VND từ 0 đến 1.000.000.000.000, hoặc để trống.';
  if (error) { const element = prototypeDom.querySelector('#activity-error'); element.textContent = error; element.hidden = false; return; }
  const activities = state.draft.days[state.day].activities;
  const index = Number(formElement.dataset.index);
  const activity = { ...(index === -1 ? {} : activities[index]), title: form.title.trim(), notes: form.notes.trim(), start, end, cost: form.cost.trim() ? Number(form.cost) : null };
  if (index === -1) activities.push(activity); else activities[index] = activity;
  state.dirty = true; state.error = ''; closeDialog(); renderMobile(); prototypeDom.querySelector('[data-test="save-trip"]').focus(); toast('Đã cập nhật bản nháp. Chưa lưu chuyến.');
}
async function saveTrip() {
  if (!state.dirty || state.loading) return;
  const attempt = ++pendingVersion;
  const next = clone(state.draft);
  state.loading = true; state.error = ''; renderMobile();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
  if (attempt !== pendingVersion) return;
  state.loading = false;
  if (state.offline || state.failSave) {
    state.error = state.offline ? 'Mất kết nối mẫu, chưa biết kết quả lưu.' : 'Lỗi lưu giả lập. Kết quả chưa được xác nhận.';
    state.failSave = false; renderMobile(); feedback('Lưu thất bại giả lập; draft và nội dung vừa sửa vẫn giữ nguyên.'); return;
  }
  next.version = (state.saved?.version ?? 0) + 1;
  if (!persist(next)) { renderMobile(); return; }
  state.saved = clone(next); state.draft = next; state.dirty = false; state.error = ''; renderMobile(); toast('Đã lưu bản mẫu trong trình duyệt · không phải lưu DB/API.');
}
function reopen(force = false) {
  const run = () => { pendingVersion += 1; state.loading = false; state.draft = clone(state.saved); state.dirty = false; state.error = ''; state.day = 0; state.screen = state.saved ? 'detail' : 'trips'; renderMobile(); feedback('Đã mở bản lưu mẫu trong trình duyệt. Đây không phải read-after-write từ server.'); };
  if (!force && (state.dirty || state.screen === 'form')) openDialog(`${dialogHeader('Mở bản đã lưu?')}<p class="muted small">Thay đổi chưa lưu trong phiên sẽ bỏ đi. Bản đã lưu mẫu vẫn còn nguyên.</p><div class="dialog-actions"><button type="button" class="button secondary" data-action="close-dialog">Tiếp tục chỉnh</button><button type="button" class="button" data-action="confirm-reopen">Mở bản đã lưu</button></div>`);
  else run();
}
function setPlatform(platform) { captureForm(); state.platform = platform; render(); }

prototypeDom.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'platform') setPlatform(button.dataset.value);
  else if (action === 'close-dialog') closeDialog();
  else if (action === 'login') loginDialog();
  else if (action === 'admin-login') loginDialog(true);
  else if (action === 'login-as-customer') { state.session = true; state.screen = 'trips'; closeDialog(); renderMobile(); }
  else if (action === 'login-as-admin' || action === 'login-admin-customer') { state.adminSession = action === 'login-as-admin' ? 'admin' : 'customer'; closeDialog(); render(); }
  else if (action === 'new-trip') { state.screen = 'form'; state.formError = ''; renderMobile(); }
  else if (action === 'trip-detail') { state.screen = 'detail'; renderMobile(); }
  else if (action === 'trips' || action === 'back') { captureForm(); state.screen = 'trips'; renderMobile(); }
  else if (action === 'map') { state.screen = 'map'; renderMobile(); }
  else if (action === 'day') { state.day = Number(button.dataset.index); renderMobile(); }
  else if (action === 'edit-activity') editActivity(Number(button.dataset.index));
  else if (action === 'add-activity') { if (state.loading) return; if (state.draft.days[state.day].activities.length >= 50) toast('Bản mẫu giới hạn 50 hoạt động/ngày.'); else editActivity(-1); }
  else if (action === 'save') void saveTrip();
  else if (action === 'network') { captureForm(); state.offline = !state.offline; render(); feedback(state.offline ? 'Đã mô phỏng mất mạng. Thử sửa/lưu để kiểm tra giữ draft.' : 'Đã khôi phục mạng mẫu. Bấm Thử lưu lại để tiếp tục.'); }
  else if (action === 'fail-save') { state.failSave = true; feedback('Lần lưu tiếp theo sẽ báo lỗi giả lập. Hãy sửa hoạt động rồi lưu.'); }
  else if (action === 'location') { captureForm(); state.location = button.dataset.value; renderMobile(); feedback(`Trạng thái vị trí mẫu: ${button.dataset.value}. Không đổi quyền thật của thiết bị.`); }
  else if (action === 'reopen') reopen();
  else if (action === 'confirm-reopen') { closeDialog(); reopen(true); }
  else if (action === 'map-retry') toast(state.offline ? 'Vẫn mất mạng mẫu. Chưa tải được bản đồ hoặc tuyến.' : 'Đã thử lại trạng thái mẫu. Chưa có Maps/tuyến live.');
  else if (action === 'map-pin') openDialog(`${dialogHeader(escape(state.draft.days[state.day].activities[Number(button.dataset.index)].title))}<span class="pill">Pin giả lập</span><p class="muted small" style="margin-top:16px">Vị trí minh họa cho flow. Không có tọa độ, dữ liệu provider, đường đi hoặc booking live.</p><button type="button" class="button full" data-action="close-dialog">Quay lại bản đồ</button>`);
  else if (action === 'profile') openDialog(`${dialogHeader('Tài khoản mẫu')}<p class="muted small">Bạn đang dùng phiên khách giả lập. Đăng xuất không xóa bản chuyến đã lưu mẫu.${state.dirty ? ' Bản nháp chưa lưu sẽ bỏ đi nếu đăng xuất.' : ''}</p><button type="button" class="button full" data-action="logout">Đăng xuất phiên mẫu</button>`);
  else if (action === 'logout') { pendingVersion += 1; state.loading = false; state.session = false; state.draft = clone(state.saved); state.dirty = false; state.error = ''; closeDialog(); renderMobile(); }
  else if (action === 'admin-page') { state.adminPage = button.dataset.value; render(); }
  else if (action === 'admin-logout') { state.adminSession = 'anonymous'; render(); }
  else if (action === 'admin-customer') { captureForm(); state.platform = 'admin'; state.adminSession = 'customer'; render(); feedback('403 là trạng thái giao diện giả lập; quyền thực phải kiểm tra ở backend #4/#16.'); }
  else if (action === 'admin-expired') { captureForm(); state.platform = 'admin'; state.adminSession = 'expired'; render(); feedback('Đã mô phỏng hết hạn phiên. Đăng nhập lại để mở shell.'); }
  else if (action === 'reset') openDialog(`${dialogHeader('Đặt lại prototype?')}<p class="muted small">Xóa riêng dữ liệu mẫu trong trình duyệt này và về màn đăng nhập. Không tác động dữ liệu sản phẩm.</p><div class="dialog-actions"><button type="button" class="button secondary" data-action="close-dialog">Giữ bản hiện tại</button><button type="button" class="button danger" data-action="confirm-reset">Đặt lại</button></div>`);
  else if (action === 'confirm-reset') { pendingVersion += 1; try { globalThis.localStorage.removeItem(storageKey); } catch { /* Không có storage vẫn reset state. */ } closeDialog(); Object.assign(state, { session: false, screen: 'trips', saved: null, draft: null, day: 0, dirty: false, offline: false, failSave: false, loading: false, error: '', formError: '', form: defaultForm(), location: 'denied', adminSession: 'anonymous', adminPage: 'catalog' }); render(); feedback('Đã đặt lại dữ liệu prototype.'); }
});
prototypeDom.addEventListener('submit', (event) => {
  if (event.target.id === 'trip-form') { event.preventDefault(); void createTrip(); }
  if (event.target.id === 'activity-form') { event.preventDefault(); applyActivity(event.target); }
});
dialog.addEventListener('cancel', () => { if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus(); });
render();
