# HƯỚNG DẪN CẤP QUYỀN FIREBASE SECURITY RULES

Bộ quy tắc này giải quyết triệt để 2 vấn đề:
1. **Bảo vệ Bản đồ Nội bộ CDBKNSG** chống bị phá hoại điểm/tọa độ (chỉ tài khoản admin trường mới được lưu sửa, sinh viên/khách xem và tìm đường bình thường).
2. **Khôi phục hoàn toàn quyền truy cập cho app Quản Trị CSVC & Thiết Bị (https://qttbcsvc.vercel.app/)** không còn bị lỗi "Lỗi đồng bộ dữ liệu bảo trì" do bị chặn quyền đọc/ghi collection `tasks` và `users`.

---

## Các bước thực hiện trên Firebase Console:
1. Mở trình duyệt vào [Firebase Console](https://console.firebase.google.com/) -> Chọn Project **alook-26a1f** (hoặc project bạn đang dùng chung).
2. Ở cột menu bên trái, chọn **Firestore Database** -> Chọn tab **Rules** (Quy tắc).
3. **Xóa toàn bộ nội dung hiện tại** trong ô soạn thảo và copy dán toàn bộ đoạn mã bên dưới vào:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // =========================================================================
    // 1. DÀNH CHO BẢN ĐỒ NỘI BỘ CDBKNSG (Chống phá hoại bản đồ)
    // =========================================================================
    match /artifacts/{appId}/public/data/mapState/{document=**} {
      // Cho phép mọi người (sinh viên, khách, GV) xem bản đồ và tìm đường
      allow read: if true;
      // Chỉ duy nhất tài khoản admin trường mới được phép lưu / sửa đổi tọa độ các điểm
      allow write: if request.auth != null 
                   && !request.auth.token.firebase.sign_in_provider.matches('anonymous')
                   && request.auth.token.email == 'admin@nsg.edu.vn';
    }

    // =========================================================================
    // 2. DÀNH CHO APP BẢO TRÌ & QUẢN TRỊ CSVC (https://qttbcsvc.vercel.app/)
    // =========================================================================
    // Dữ liệu danh sách công việc bảo trì (tasks)
    match /tasks/{taskId} {
      allow read: if true;
      allow write: if true;
    }

    // Dữ liệu tài khoản phân quyền nhân sự kỹ thuật (users)
    match /users/{userId} {
      allow read: if true;
      allow write: if true;
    }

    // =========================================================================
    // 3. CÁC TÀI LIỆU KHÁC TRÊN FIREBASE (Nếu có)
    // =========================================================================
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

4. Bấm nút **Publish** (Xuất bản) ở góc trên bên phải để lưu.
5. F5 lại cả 2 trang web:
   - App Quản lý CSVC (`qttbcsvc.vercel.app`): Sẽ hết lỗi đồng bộ, danh sách công việc bảo trì hiển thị lại bình thường ngay lập tức.
   - Bản đồ nội bộ CDBKNSG: Hoạt động trơn tru, được bảo vệ chống phá hoại.
