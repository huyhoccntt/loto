# Lotto

Ứng dụng lô tô nhiều người chơi, chạy dạng web tĩnh. Khi cấu hình Supabase Realtime, mọi người có thể chơi cùng nhau qua Internet; nếu không cấu hình, ứng dụng chỉ đồng bộ giữa các tab trên cùng thiết bị.

Tạo phòng, tham gia bằng mã, quay số, đặt lại ván và thông báo KINH được đồng bộ realtime.

## Cấu hình chơi qua Internet

GitHub Pages chỉ lưu trữ giao diện tĩnh. Để chia sẻ phòng với người chơi ở thiết bị hoặc địa điểm khác, cần kết nối ứng dụng với Supabase Realtime:

1. Tạo project tại [supabase.com](https://supabase.com/).
2. Trong **Project Settings → API**, lấy **Project URL** và **anon/public key** (có thể mang tên `publishable key` trong giao diện mới).
3. Để chạy local, sao chép `.env.example` thành `.env.local` và điền hai giá trị:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Trên GitHub, vào **Settings → Secrets and variables → Actions → New repository secret**, tạo hai secret cùng tên ở trên.
5. Sau khi lưu Secrets, vào **Actions → Deploy to GitHub Pages → Run workflow** để build lại với cấu hình mới (việc thêm Secrets không tự kích hoạt deploy). Khi workflow hoàn tất, mở lại trang GitHub Pages. Khi tiêu đề hiển thị **ONLINE ROOM**, có thể chia sẻ mã phòng cho bạn bè.

Ứng dụng chỉ dùng Supabase Realtime Broadcast/Presence, không cần tạo bảng database. Phòng tồn tại trong thời gian host còn mở trang; nếu host đóng trang hoặc mất kết nối, phòng sẽ không còn trạng thái để người khác tham gia. Không đưa `service_role` key vào ứng dụng; chỉ dùng anon/publishable key.

## Build và triển khai GitHub Pages

- `npm run build`: kiểm tra TypeScript và tạo bản web tĩnh trong `dist`.
- `npm run preview`: chạy thử bản build.
- Vào **Settings → Pages**, chọn **GitHub Actions** làm nguồn triển khai.
- Push lên nhánh `main` (hoặc chạy workflow **Deploy to GitHub Pages** thủ công trong tab **Actions**). Workflow sẽ tự build và deploy; không cần chạy Node server trên hosting.
- Trang của repository thường có địa chỉ `https://<username>.github.io/<repository>/`; workflow tự cấu hình Vite base path theo tên repository.
- Nếu build/deploy thủ công, đặt `VITE_BASE_PATH=/<repository>/` trước khi chạy `npm run build`, rồi upload thư mục `dist`.
