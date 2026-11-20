# Rà Clip 1.5.2

## Đối chiếu hai video gốc

- **FIX-11 · Đạt với dữ liệu gốc.** Bản web 1.5.1 đã tái hiện cảnh báo sai trên clip Merzy và dòng SON-MERZY trong bảng gửi kèm. Lời thoại tiếp tục bằng “nhanh tay trót đơn…” khiến bộ đọc bỏ mất cấu trúc mua – tặng. Bản 1.5.2 đọc riêng hai số lượng và giữ câu gốc làm bằng chứng. Mở lại kết quả 1.5.1 lẫn quét mới clip gốc đều cho **Quà tặng · Khớp bảng** trên bản build 1.5.2. Hai trường hợp sai số lượng mua hoặc tặng vẫn báo khác. Nếu chỉ đọc được một phần hoặc bảng ghi thêm tên quà mà clip chưa nói rõ, app yêu cầu xác nhận.
- **FIX-12 · Đã thêm đường xử lý khi lời thoại trống.** Khi toàn bộ đoạn AI bị lọc, **Bằng chứng** báo số đoạn bị loại và mở thẳng ô để nhập phụ đề hoặc lời thoại thay thế. Bài kiểm thử đã đi trọn từ trạng thái 0 đoạn đến kết quả sau khi lưu lời thoại nhập tay. Lượt quét thật clip mỹ phẩm Nhật trên Windows giữ một đoạn lời thoại và kết quả **Cần xác nhận** vì chưa trích được ưu đãi. Trường hợp mô hình lặp 150 lần được kiểm riêng bằng đầu ra mô phỏng.
- **OCR · Đã tăng lọc ngữ cảnh.** Các mảnh rời như “is”, “ay Bi ii” hoặc “Z2” thiếu căn cứ để dùng làm bằng chứng. Mã ngắn có nhãn rõ như “Mã Z2” vẫn được giữ khi đủ điểm. Với hai file gốc trên máy kiểm thử, số mốc OCR giữ lại giảm từ 6 xuống 0 ở Merzy và từ 21 xuống 2 ở clip Nhật. App ghi số dòng bị loại trong **Nguồn bằng chứng**.

Kiểm thử trên Windows đạt **64/64 bài đơn vị và 34/34 bài trình duyệt**, gồm lượt tải và chạy PhoWhisper thật để nghe giá và sửa voucher chưa rõ. Lượt kiểm bằng hai file gốc dùng video và bảng ưu đãi người dùng gửi kèm.

## Kiểm tra trong giao diện

- **FIX-03 / FEAT-03 · Đã kiểm chứng.** Ở màn hình 390 px, ba tình huống thiếu giá trên hình, chưa chạy lời thoại và chưa gán SKU lần lượt mở đoạn trích, chạy lời thoại và mở ô gán SKU.
- **FIX-09 · Đã kiểm chứng.** Nhập nhiều file trong hai lượt liên tiếp. Mỗi lượt có một tóm tắt và lượt mới dọn thông báo cũ.
- **FIX-10 · Đã kiểm chứng.** Trong **Quản lý chiến dịch**, xem phần dung lượng khi dùng 40% và khi dùng 90%. Cả hai đều hiện dung lượng đã dùng và còn lại. Mức từ 85% hiện cảnh báo.
- **Phiên bản và thời gian.** Số phiên bản nằm dưới tên Rà Clip. Hộp **Quét hàng loạt** hiện khoảng ước lượng ngay khi chọn video và nguồn quét. App dùng thời lượng đã đọc và tốc độ lượt trước trên thiết bị nếu có. Ước lượng trước quét ghi rõ giả định cho clip cũ chưa biết thời lượng và khả năng tải mô hình lần đầu.
- **Điện thoại.** **Xem bằng chứng** mở thẳng video đang chọn. **Về danh sách video** quay lại kho kết quả.

## Phạm vi các mục còn lại

- **FEAT-01 và FEAT-06 · Đang dùng.** Hộp thêm video có chuẩn bị mô hình, tiến độ tải và thử lại khi lỗi. **Tác động của bảng** hiện các clip đổi kết luận và cho soạn bản nhắc. Hoạt động gửi bản nhắc do người dùng thực hiện.
- **FEAT-04 · Một phần.** Nhập link hoặc ID trong danh sách. Bản ghi có link và thiếu file có nút **Gắn file video hoặc phụ đề**. Phần lấy video hoặc thông tin từ TikTok chờ luồng API được cấp quyền.
- **FEAT-08 · Một phần.** **Việc cần làm** hỗ trợ ưu tiên theo đơn và lượt xem đã nhập. Xếp theo giá trị tiền hoặc quảng cáo đang chạy cần dữ liệu xác thực tương ứng.
- **FEAT-09 · Có sao lưu và kiểm tra khả năng mở.** Kiểm tra ở **Quản lý chiến dịch**. Bài kiểm thử tải và mở lại bản sao có file video.
- **FEAT-10 · Có kiểm tra trước khi lưu.** Trùng cặp SKU và mã, ngày đảo, giá sai định dạng được chặn. Giá 0 đ và mã dùng nhiều SKU cần xác nhận.
- **FEAT-11 và FEAT-12 · Đợt hoàn thiện sau.** Hiện có CSV và nhật ký rà. PDF và lịch sử riêng cho từng lần sửa đoạn trích thuộc phạm vi tiếp theo.
