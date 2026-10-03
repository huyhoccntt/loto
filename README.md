# Lotto

Ứng dụng lô tô nhiều người chơi, chạy dạng web tĩnh và dùng Supabase Realtime để đồng bộ phòng. Không cần chạy Node server riêng.

## Cấu hình Supabase

1. Tạo một project Supabase và bật Realtime trong project.
2. Sao chép `.env.example` thành `.env.local`.
3. Điền Project URL và publishable key (hoặc anon key cũ) trong `.env.local`:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
   ```

   Đây là key dành cho client; không dùng `service_role` key trong ứng dụng.
4. Chạy `npm install`, sau đó `npm run dev`.

Phòng và trạng thái ván tồn tại khi còn người chơi kết nối; chủ phòng được chuyển cho người chơi còn lại khi chủ phòng rời đi. Dự án không cần bảng cơ sở dữ liệu.

Kênh phòng dùng Realtime public để người chơi vào bằng mã, không cần tài khoản. Vì vậy, ai biết mã phòng đang hoạt động đều có thể xem dữ liệu ván chơi; không dùng tên hoặc thông tin nhạy cảm.

## Build và triển khai GitHub Pages

- `npm run build`: kiểm tra TypeScript và tạo bản web tĩnh trong `dist`.
- `npm run preview`: chạy thử bản build.
- Trong GitHub, vào **Settings → Secrets and variables → Actions** và thêm hai repository secrets `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`.
- Vào **Settings → Pages**, chọn **GitHub Actions** làm nguồn triển khai.
- Push lên nhánh `main` (hoặc chạy workflow **Deploy to GitHub Pages** thủ công trong tab **Actions**). Workflow sẽ tự build và deploy; không cần chạy Node server trên hosting.
- Trang của repository thường có địa chỉ `https://<username>.github.io/<repository>/`; workflow tự cấu hình Vite base path theo tên repository.

Workflow build cần hai Supabase secrets nêu trên để multiplayer hoạt động. Nếu deploy thủ công, đặt `VITE_BASE_PATH=/<repository>/` cùng hai biến Supabase trước khi chạy `npm run build`, rồi upload thư mục `dist`.
