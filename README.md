# Lotto

Ứng dụng lô tô nhiều người chơi cục bộ, chạy dạng web tĩnh. Không cần Node server, Supabase hay cấu hình biến môi trường.

Tạo phòng, tham gia bằng mã, quay số, đặt lại ván và thông báo KINH hoạt động giữa các tab của cùng trình duyệt/thiết bị. GitHub Pages không cung cấp backend, vì vậy các thiết bị khác nhau không thể đồng bộ với nhau ở chế độ này.

## Build và triển khai GitHub Pages

- `npm run build`: kiểm tra TypeScript và tạo bản web tĩnh trong `dist`.
- `npm run preview`: chạy thử bản build.
- Vào **Settings → Pages**, chọn **GitHub Actions** làm nguồn triển khai.
- Push lên nhánh `main` (hoặc chạy workflow **Deploy to GitHub Pages** thủ công trong tab **Actions**). Workflow sẽ tự build và deploy; không cần chạy Node server trên hosting.
- Trang của repository thường có địa chỉ `https://<username>.github.io/<repository>/`; workflow tự cấu hình Vite base path theo tên repository.
- Nếu build/deploy thủ công, đặt `VITE_BASE_PATH=/<repository>/` trước khi chạy `npm run build`, rồi upload thư mục `dist`.
