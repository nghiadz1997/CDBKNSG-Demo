# Hướng Dẫn Cấu Hình Bảo Mật Firebase Firestore (Chống Phá Hoại Điểm 100%)

## Vấn đề bảo mật trước đây
Trước đây, ứng dụng sử dụng đăng nhập nặc danh (`signInAnonymously`) cho mọi người truy cập. Nếu Firestore Rules của bạn được đặt là:
```javascript
// CẤU HÌNH CŨ - NGUY HIỂM (Bị phá hoại điểm liên tục)
allow read, write: if request.auth != null; // Hoặc allow write: if true;
```
Thì bất kỳ ai mở F12 hoặc gửi request đều có thể **xóa sạch, di chuyển hoặc ghi đè toàn bộ 226 phòng học của trường**.

---

## Hướng dẫn cập nhật Rules chuẩn bảo mật tuyệt đối

### Bước 1: Mở Firebase Console
1. Truy cập [Firebase Console](https://console.firebase.google.com/).
2. Chọn dự án: **`alook-26a1f`**.
3. Ở menu bên trái, chọn **Build** -> **Firestore Database**.
4. Bấm vào tab **Rules** (Quy tắc).

### Bước 2: Dán bộ quy tắc bảo mật sau vào

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Quy tắc bảo vệ sơ đồ bản đồ trường CDBKNSG
    match /artifacts/{appId}/public/data/mapState/{document=**} {
      
      // 1. TẤT CẢ MỌI NGƯỜI (Sinh viên, Giảng viên, Khách) ĐỀU ĐƯỢC PHÉP ĐỌC BẢN ĐỒ
      allow read: if true;
      
      // 2. CHỈ DUY NHẤT TÀI KHOẢN ADMIN MỚI ĐƯỢC PHÉP THAY ĐỔI / LƯU ĐIỂM
      // Chặn 100% tài khoản ẩn danh, hacker, hay script bên ngoài
      allow write: if request.auth != null 
                   && !request.auth.token.firebase.sign_in_provider.matches('anonymous')
                   && request.auth.token.email == 'admin@nsg.edu.vn';
    }

    // Mặc định chặn tất cả các đường dẫn khác
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Bước 3: Xuất bản (Publish)
- Bấm nút **Publish** (Xuất bản) ở góc trên bên phải.
- Quy tắc có hiệu lực ngay lập tức trong vòng vài giây!

---

## Kết quả bảo mật đạt được:
1. **Phía máy chủ (Server-side)**: Firestore của Google sẽ tự động từ chối (`PERMISSION_DENIED`) bất kỳ yêu cầu sửa đổi điểm nào không đến từ `admin@nsg.edu.vn`. Dù ai có can thiệp code client hay dùng công cụ hack cũng **không thể phá được**.
2. **Phía ứng dụng (Client-side)**: Mã nguồn mới đã tích hợp hệ thống kiểm tra thẩm quyền, Data Integrity Guard, và sao lưu tự động nhiều phiên bản (Rollback 1-Click).
