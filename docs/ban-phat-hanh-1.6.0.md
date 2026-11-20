# Rà Clip 1.6.0

Báo cáo kiểm thử 1.5.4 xác nhận FIX-11 và FIX-12 đã đạt trên bản web với hai clip gốc. Người kiểm thử thấy clip Nhật tự đọc lại, giữ sáu đoạn lời thoại và xác nhận được cả sáu. Lỗi còn sót nằm ở số đoạn chờ hiển thị trong **Nguồn bằng chứng**.

## Cải tiến ưu tiên

- **Lưu các đoạn đã kiểm tra.** Mở **Bằng chứng → Xem lời thoại đọc lại**. Nghe theo mốc, bỏ chọn đoạn còn nghi ngờ rồi bấm **Lưu … đoạn đã chọn**. Nếu tên nghe gần giống SKU hoặc tên sản phẩm trong bảng đang dùng, app đề xuất cách viết. Chấp nhận gợi ý để xem trước, sau đó lưu các đoạn đã kiểm tra. Kết quả rà được tính lại một lần cho cả nhóm.
- **Đếm số đoạn còn chờ.** Nguồn lời thoại lấy số đang chờ từ các đoạn đã lưu, kể cả với phiếu quét từ 1.5.3–1.5.4. Lưu ba trong sáu đoạn thì còn ba. Lưu hết thì còn không.
- **Quét nền trong tab đang mở.** Từ **Kho video → Quét hàng loạt**, bắt đầu quét rồi bấm **Tiếp tục quét nền**. Có thể đổi màn hình, mở lại tiến độ hoặc dừng. Kết quả được lưu theo từng video và có thông báo khi xong. Có thể dùng công cụ kiểm kịch bản trong lúc chờ. Các thao tác thay đổi chiến dịch dùng lại được sau khi lượt quét kết thúc.
- **Ước lượng theo thời gian đã đo.** App dùng thời lượng, số khung cần đọc và thời gian đã đo trên trình duyệt đó. Các video đã quét có số đo riêng, còn thời gian mở mô hình được tính riêng cho lượt khởi động lạnh. Khi chưa đo đủ, app hiển thị một khoảng rộng rồi cập nhật trong lúc quét.
- **Clip tối đa 5 phút, 150 MB.** Clip dài hơn hai phút được chia để đọc lời thoại theo phần. App gộp đoạn trích theo mốc của file gốc và lấy mẫu khung hình trên toàn clip. Phần lời thoại quét lỗi được ghi rõ để bổ sung. Bản sao lưu hỗ trợ file theo giới hạn mới.

## Kiểm tra bằng file

- **Clip Nhật gốc.** Trong ca đối chứng, thay đầu ra lượt đầu bằng vòng lặp theo báo cáo, để PhoWhisper thật đọc lại âm thanh gốc. Bộ đếm đi qua 6 → 3 → 0 và vẫn là 0 sau tải lại. App gợi ý sửa “mỹ phẩm nhặt” thành “Mỹ phẩm Nhật”. Sau khi lưu, kết luận vẫn là **Cần xác nhận** vì lời thoại thiếu thông tin ưu đãi.
- **Clip dài 2 phút 24 giây.** Ghép nguyên các phần từ hai quảng cáo đã gửi thành một file kiểm thử rồi nhập file đó một lần. Cả lời thoại và OCR xử lý xong. Một đoạn lời thoại kéo dài đến 144,47 giây trên mốc của file đã nhập.
- **Lô 9 video.** Gồm hai clip gốc và bảy mẫu trong app. Lượt đầu quét khi chuyển qua **Bảng ưu đãi** và **Nhật ký rà**, lưu đủ 9 kết quả, thông báo khi hoàn thành sau 4 phút 28 giây. Lượt sau có khoảng dự báo từ 3 phút 7 giây đến 5 phút 13 giây, chạy thực tế 3 phút 14 giây. Điểm giữa lệch 29% trong ca đo này. Mốc nghiệm thu trên một bộ chín clip thực tế độc lập vẫn cần dữ liệu để đo.

Trên Windows, bản này đạt 72/72 bài kiểm thử đơn vị và 37/37 bài trình duyệt với `RA_CLIP_TEST_MODELS=1`. Bài nghe giá và sửa voucher chạy với PhoWhisper thật.

## Đối chiếu các mục đã có

- **FIX-03 · Đã kiểm chứng ở 390 px.** Từ **Bằng chứng**, trường hợp thiếu giá trên hình mở các đoạn trích, chưa chạy lời thoại có nút **Quét lời thoại**, và chưa có SKU mở trường gán mã.
- **FIX-09 · Đã kiểm chứng.** Thêm nhiều video hai lượt liên tiếp. Mỗi lượt cho một tóm tắt, mở lượt mới dọn tóm tắt cũ.
- **FIX-10 · Đã kiểm chứng.** **Quản lý chiến dịch** hiển thị dung lượng đã dùng và còn lại ở 40% và 90%. Cảnh báo xuất hiện từ 85%.
- **FEAT-04 · Một phần.** Trong **Kho video**, nhập danh sách link hoặc ID rồi mở video và chọn **Gắn file video hoặc phụ đề**. Mốc tự lấy file và metadata phụ thuộc kết nối TikTok được cấp quyền.
- **FEAT-08 · Một phần.** **Việc cần làm** ưu tiên theo số đơn và lượt xem đã nhập. Mốc tiếp theo là lấy thêm doanh thu, chi tiêu hoặc trạng thái quảng cáo để xếp theo tác động tài chính.
- **FEAT-09 · Đã kiểm chứng.** **Quản lý chiến dịch** tải và kiểm tra gói .raclip. Mở bản sao tạo chiến dịch riêng có dữ liệu và video đi kèm.
- **FEAT-10 · Đã kiểm chứng.** **Bảng ưu đãi** báo lỗi giá, ngày đảo và cặp SKU/mã trùng. Giá 0 đ và mã dùng cho nhiều SKU được đưa vào bước xem trước.
- **FEAT-11 · Chưa có.** **Xuất báo cáo** hiện tải CSV. PDF kèm ảnh khung hình thuộc đợt hoàn thiện xuất báo cáo.
- **FEAT-12 · Chưa có.** Dấu **Đã sửa tay** và **Nhật ký rà** hiện có. Lịch sử trước/sau và hoàn tác từng lần sửa thuộc đợt hoàn thiện bằng chứng.

Cảnh báo trước hạn, thống kê theo thời gian, tìm theo lời thoại trong toàn kho và so sánh hai lần rà nằm ở đợt P1. Đồng bộ nhóm, tự lấy dữ liệu TikTok, nhắc sao lưu và phân biệt người nói nằm ở đợt P2.
