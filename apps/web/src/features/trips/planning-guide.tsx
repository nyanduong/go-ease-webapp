export function PlanningGuide() {
  return (
    <aside
      aria-label="Hướng dẫn lên kế hoạch"
      className="hidden self-start rounded-3xl bg-mint/60 p-6 lg:sticky lg:top-28 lg:block"
    >
      <span className="text-xs font-bold tracking-widest text-teal-dark uppercase">
        Chuyến đi bắt đầu từ đây
      </span>
      <h2 className="mt-3 text-2xl">Cùng nhau lên kế hoạch.</h2>
      <ol className="my-7 flex flex-col gap-6">
        {[
          ['Điền vài thông tin', 'Chọn ngày, số người và ngân sách chung.'],
          ['Tạo lịch trình của nhóm', 'Bắt đầu từ mẫu Đà Lạt, rồi thêm những nơi bạn thích.'],
          [
            'Xem lại và lưu chuyến',
            'Điều chỉnh hoạt động, chi phí và quản lý chuyến qua tài khoản.',
          ],
        ].map(([title, description], index) => (
          <li key={title} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-paper text-xs font-bold text-teal">
              {index + 1}
            </span>
            <div>
              <h3 className="text-sm">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
