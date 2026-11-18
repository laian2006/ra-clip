# Rà Clip

Rà lại video bán hàng sau khi giá, voucher hoặc quà tặng thay đổi. Ứng dụng đọc lời thoại và chữ trên video tiếng Việt, đối chiếu theo mã phân loại sản phẩm (SKU), rồi chỉ ra đoạn cần xem trong clip.

![Màn hình rà soát với dữ liệu mẫu](docs/giao-dien.png)

## Chạy trên máy

Cần Node.js 22.12+ (dòng 22) hoặc 24+ và trình duyệt hiện đại.

```sh
npm ci
npm run dev
```

Mở địa chỉ Vite in ra, thường là `http://127.0.0.1:5173`. App mở với kho mẫu gồm 5 clip và 2 phiên bản ưu đãi. Chọn **Dùng dữ liệu của bạn** để mở kho riêng.

### Demo nhanh

1. Trong **Rà soát**, mở clip **Bình giữ nhiệt 500 ml** rồi bấm **00:05** để tới lời quảng bá voucher đã hết hạn.
2. Trong **Bảng ưu đãi**, đổi giá SKU `TUI-KEM` từ 129.000 thành 149.000, rồi chọn **Lưu phiên bản**. Hai clip gắn SKU đó được rà lại. Các SKU khác giữ kết quả cũ cho cùng thời điểm rà.
3. Quay lại **Rà soát**, mở **Túi canvas đi học**, ghi nhận **Mới phát hiện** và **Xuất báo cáo**. CSV ghi mốc thời gian, câu gốc, dữ liệu tham chiếu và phản hồi.

### Dùng với dữ liệu thật

- **Bảng ưu đãi:** nhập trang đầu của file XLSX hoặc file CSV/TSV có các cột `sku, name, voucher, price, gift, start, end, condition`. Có thể tải mẫu CSV trong app. Mỗi cặp SKU và voucher là một dòng. Dòng không có mã đại diện cho giá/ưu đãi thông thường. Giá nhập theo VNĐ. Ngày nhận `YYYY-MM-DD`, `DD/MM/YYYY` hoặc ngày kèm giờ. Ứng dụng hiểu giờ Việt Nam (UTC+7).
- **Video:** nhập file MP4, WebM, M4V hoặc MOV mà trình duyệt đọc được, tối đa 150 MB và 2 phút mỗi file. Có thể thêm tối đa 20 file một lượt. Gán SKU và ngày đăng nếu có. Dùng phụ đề SRT/VTT hoặc ghi chú như `00:05 Còn 99k khi áp mã SALE99.` để rà ngay khi chưa tải mô hình. Link bài đăng dùng để mở clip gốc.
- **Rà soát:** chọn thời điểm, xem cảnh báo, đánh dấu phản hồi và tải CSV. Khi lưu bảng mới, app chỉ tính lại SKU đổi và clip có dữ liệu mới. Khi đổi thời điểm, app tính lại tất cả.

## Cách hoạt động

`src/media.ts` đọc và lấy mẫu khung hình trong trình duyệt. `src/speech.worker.ts` chạy Whisper Tiny đa ngôn ngữ bằng WebAssembly trong Web Worker. OCR dùng Tesseract với tiếng Việt và tiếng Anh. `src/claims.ts` trích giá, voucher, quà tặng và mốc trong câu. `src/audit.ts` đối chiếu các đoạn đó với phiên bản ưu đãi và giữ dấu vết theo từng clip. IndexedDB lưu file video, đoạn nhận dạng, các phiên bản và phản hồi.

Lần đầu dùng lời thoại, trình duyệt tải mô hình từ Hugging Face. OCR dùng tệp ngôn ngữ đi cùng app. File và nội dung video được xử lý tại chỗ. Dữ liệu demo tách khỏi dữ liệu shop và toàn bộ dữ liệu được lưu trong hồ sơ trình duyệt đang dùng.

Kết quả phản ánh **bảng shop nhập tại thời điểm rà**. Giá theo từng tài khoản hoặc điều kiện thanh toán cần dữ liệu tương ứng. Nhận dạng có thể bỏ sót chữ xuất hiện ngắn, đọc nhầm tiếng Việt có nhạc nền, hoặc gặp câu mơ hồ khi một SKU có nhiều ưu đãi. Dùng trạng thái **Cần xác nhận** và đoạn video gốc để kiểm tra trước khi sửa nội dung. Xóa dữ liệu trang trong trình duyệt sẽ xóa kho cùng báo cáo đang lưu trên thiết bị đó.

## Kiểm thử

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Bộ kiểm thử kiểm tra cách đọc tiếng Việt, ngày hết hạn UTC+7, nhập Excel, đối chiếu các phiên bản, phản hồi, phát đúng giây, OCR và xuất CSV. Bài kiểm thử Whisper dùng tải mô hình mạng ngoài và có thể bật bằng biến môi trường `RA_CLIP_TEST_MODELS=1`. Có thể chọn trình duyệt Microsoft Edge đã cài bằng `RA_CLIP_BROWSER=msedge`.

Mã nguồn theo [MIT](LICENSE). Ảnh sản phẩm, nội dung clip và dữ liệu mẫu được tạo riêng cho demo. Giọng demo dùng Piper VAIS1000 với lời thoại tổng hợp. [Ghi chú về mô hình và dữ liệu](THIRD_PARTY.md)
