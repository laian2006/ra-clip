# Rà Clip 1.5.3

## FIX-12 · Lời thoại bị loại sau khi lọc

Quét lại `trim-mypham-nhat.mp4` bằng bản web 1.5.2 trên Windows. Edge 157.0.4341.60 và Chromium 159.0.8154.6 đều trả về một đoạn lời thoại, với chuỗi ký tự giống nhau. App giữ một đoạn và vẫn xếp **Cần xác nhận** vì chưa trích được thông tin ưu đãi. Báo cáo phía người dùng ghi **Bỏ 1 đoạn lặp bất thường** và **0 đoạn giữ lại**.

Số 0 và 1 là số đoạn còn lại sau lọc. Khi mô hình gom cả lượt đọc vào một đoạn và đoạn đó chứa vòng lặp, 1.5.2 bỏ cả đoạn. Khi đoạn duy nhất qua lọc, số đoạn giữ lại là 1. Lượt quét trên Windows kiểm chứng được cơ chế đếm này. Chưa xác định được vì sao đầu ra nhận dạng ban đầu khác ở môi trường người kiểm thử.

1.5.3 tự đọc lại theo các cửa sổ âm thanh tối đa 16 giây khi kết quả đầu bị loại hết vì lặp. Lượt đọc lại bỏ đoạn lặp và đoạn có lượng lời thoại bất thường so với mốc thời gian. Đoạn giữ được mang nhãn **Độ tin cậy thấp**, có mốc nghe lại và chỉ tham gia đối chiếu sau khi người dùng kiểm tra và lưu. Có thể mở **Thêm phụ đề hoặc lời thoại** nếu cần bổ sung. Tiến độ hiện số đoạn đã thử trong lượt đọc lại.

Kiểm thử có đối chứng dùng âm thanh gốc của clip Nhật trên Windows. Chỉ lượt đầu được thay bằng đầu ra lặp theo báo cáo. PhoWhisper thật đọc lại các cửa sổ âm thanh, tạo bản nháp theo mốc và giao diện vẫn yêu cầu xác nhận. Bài kiểm thử đầu-cuối cũng đi qua thao tác nghe hoặc sửa đoạn, lưu rồi tính lại báo cáo.

- **FIX-11 · Đã đóng ở 1.5.2.** Dữ liệu gốc Merzy đạt ở lượt quét mới và khi mở lại lần rà cũ. Các bài kiểm thử sai số lượng mua hoặc tặng vẫn chạy ở 1.5.3.
- **OCR · Có nhãn khi thiếu ngữ cảnh.** Trong **Bằng chứng → Đoạn trích**, chữ OCR thiếu chỉ dấu ưu đãi được đánh dấu **Độ tin cậy thấp** để kiểm tra thủ công. Mục **Nguồn bằng chứng** cho biết bao nhiêu đoạn ở nhóm này. Mã hoặc giá có ngữ cảnh rõ, đủ điểm vẫn được kiểm tra tự động.

## Đối chiếu các mục trong báo cáo

- **FIX-03 / FEAT-03 · Đã kiểm chứng trên màn hình 390 px.** Thiếu giá trên hình mở đoạn trích. Chưa chạy lời thoại mở lượt quét. Chưa gán SKU mở ô gán mã.
- **FIX-09 · Đã kiểm chứng.** Hai lượt nhập nhiều file liên tiếp tạo một tóm tắt mỗi lượt. Mở lượt mới dọn thông báo cũ.
- **FIX-10 · Đã kiểm chứng.** **Quản lý chiến dịch** hiện dung lượng đã dùng và còn lại ở cả hai ca kiểm thử 40% và 90%. Ngưỡng cảnh báo là 85%.
- **Điện thoại.** Nút **Xem bằng chứng** mở thẳng clip đang chọn. Đã kiểm tra đường này ở 390 px, gồm cả chuyển sang các đoạn lời thoại đọc lại.
- **FEAT-04 · Một phần.** Nhập link hoặc ID trong danh sách rồi chọn **Gắn file video hoặc phụ đề**. Phần lấy file hoặc thông tin trực tiếp từ TikTok chờ cơ chế được cấp quyền.
- **FEAT-08 · Một phần.** **Việc cần làm** ưu tiên theo số đơn và lượt xem đã nhập. Xếp theo tiền hoặc quảng cáo đang chạy cần dữ liệu tương ứng.
- **FEAT-09 · Có sao lưu.** **Quản lý chiến dịch** kiểm tra gói trước khi tải. Kiểm thử mở lại bản sao cùng file video thành chiến dịch riêng.
- **FEAT-10 · Có kiểm tra bảng.** Ngày đảo, giá sai định dạng và cặp SKU/mã trùng được chặn. Giá 0 đ và mã áp dụng nhiều SKU cần xác nhận.
- **FEAT-11 và FEAT-12 · Đợt hoàn thiện sau.** Hiện có CSV và nhật ký rà. Báo cáo PDF và lịch sử từng lần sửa đoạn trích thuộc phạm vi tiếp theo.

Trên Windows, bộ kiểm thử đạt **67/67 bài đơn vị và 35/35 bài trình duyệt** với `RA_CLIP_TEST_MODELS=1`, gồm bài nghe giá và sửa voucher chưa rõ bằng PhoWhisper thật.
