# Rà Clip 1.5.1

## Độ tin cậy của cảnh báo

- **FIX-11 · Đã sửa đối chiếu.** “Mua một tặng một” và “Mua 1 tặng 1” khớp nhau. “Mua 2 tặng 1” và “Mua một tặng hai” vẫn báo khác bảng. Quà thông thường như “một lõi thay” vẫn đối chiếu được với “lõi thay”. Chiến dịch cũ được tính lại theo quy tắc mới khi mở.
- **FIX-12 · Đã sửa lọc lời thoại.** Đoạn AI lặp cùng một từ liên tiếp từ 8 lần hoặc gần như chỉ lặp một cụm ngắn được bỏ trước khi lưu và đối chiếu. Đoạn nhấn ngắn, phụ đề và đoạn đã sửa tay được giữ. Mục **Nguồn bằng chứng** ghi số đoạn bị bỏ hoặc cho biết chưa đọc được lời thoại.
- **OCR · Đã thêm lọc theo độ tin cậy từng dòng.** Rà Clip giữ dòng rõ trong khung hình có cả chữ rõ và chữ rác. Mục **Nguồn bằng chứng** ghi số dòng độ tin cậy thấp đã bỏ. Với bản ghi cũ thiếu điểm OCR, bộ lọc dùng các dấu hiệu rác có thể nhận biết từ văn bản.
- **SKU · Đã sửa.** Hộp thêm video hiển thị **Chưa gán SKU** cho ô trống và lưu đúng trạng thái đó. Danh sách gợi ý chỉ điền SKU khi người dùng chọn hoặc nhập.

Đạt 58/58 bài kiểm thử đơn vị và 33/33 bài kiểm thử trình duyệt trên Windows. Các bài chạy gồm nhận dạng lời thoại thực với PhoWhisper, tái hiện lời thoại trong báo cáo và đưa dữ liệu lặp mô phỏng qua worker. Nghiệm thu trên **chính clip Merzy 22 giây và clip mỹ phẩm Nhật khoảng 100 giây** còn chờ hai file gốc vì báo cáo đính kèm chỉ có PDF.

## Đối chiếu các mục sửa lỗi

- **FIX-01, FIX-04 và FEAT-01 · Có kiểm chứng.** Bật `RA_CLIP_TEST_MODELS=1` để chạy bài nghe giá tiếng Việt bằng PhoWhisper. Bài mất mạng kiểm tra báo lỗi tiếng Việt, nút tải lại và việc giữ bằng chứng từ nguồn khác. Hộp thêm video hiển thị tiến độ tải và trạng thái sẵn sàng của tab.
- **FIX-02 và FEAT-02 · Đã làm.** Trùng file, link hoặc ID được kiểm tra trước khi lưu. Có lệnh **Tìm video trùng** và lựa chọn mở bản cũ, thay file hoặc lưu riêng.
- **FIX-03 và FEAT-03 · Đã kiểm chứng ba tình huống.** Chưa thấy giá trên hình mở đoạn trích. Chưa chạy lời thoại mở lượt quét lời thoại. Chưa có SKU mở hộp gán mã.
- **FIX-05 · Đã làm.** Nhãn 0,5 giây hiển thị 00:01. Tua dùng thời điểm gốc.
- **FIX-06 · Đã làm.** Log kỹ thuật lặp của OCR được lọc trong worker.
- **FIX-07 · Đã làm.** Có **Hoàn tác xóa** trong 30 giây, khôi phục clip và phản hồi.
- **FIX-08 · Đã làm.** Thời điểm rà có nhãn ngày và giờ theo định dạng Việt Nam bên cạnh ô ngày của trình duyệt.
- **FIX-09 · Đã kiểm chứng.** Hai lượt nhập nhiều file liên tiếp tạo một dòng tổng kết cho mỗi lượt. Mở lượt mới dọn thông báo cũ.
- **FIX-10 · Đã kiểm chứng.** Trong **Quản lý chiến dịch**, dung lượng đã dùng và còn lại xuất hiện cả khi còn rộng. Cảnh báo hiện từ 85% theo số liệu trình duyệt.

## Tính năng liên quan

- **FEAT-04 · Một phần.** Có nhập bảng link hoặc ID và có nút **Gắn file video hoặc phụ đề** khi xem bản ghi có link chưa có file. Metadata do người dùng cung cấp. Phần tự lấy file hoặc metadata từ TikTok đang chờ luồng API có quyền truy cập phù hợp.
- **FEAT-05 · Có thể dùng.** Lọc và giao việc theo người đăng, gán nhiều clip và soạn bản nhắc có link, mốc và nội dung cần kiểm tra.
- **FEAT-06 · Có thể dùng.** Sau khi lưu bảng, mục **Tác động của bảng** cho xem cảnh báo mới, clip hết cảnh báo và soạn bản nhắc.
- **FEAT-07 · Có thể dùng.** Phát hiện từ OCR có **Xem khung hình gốc** và nút tua đến mốc tương ứng.
- **FEAT-08 · Một phần.** Có ưu tiên theo số đơn hoặc lượt xem đã nhập. Xếp hạng theo tiền và tình trạng chạy quảng cáo để sau khi có dữ liệu để đối chiếu hai tiêu chí đó.
- **FEAT-09 · Đã bổ sung.** Kiểm tra định dạng và khả năng mở bản sao lưu trước khi tải. Lượt quét từ 10 video trong chiến dịch shop nhắc tới sao lưu. Có kiểm thử mở lại cả file video thành chiến dịch mới.
- **FEAT-10 · Đã bổ sung.** Chặn cặp SKU và voucher trùng, giá sai định dạng và ngày kết thúc trước ngày bắt đầu. Giá 0 đ và một mã dùng nhiều SKU hiện lưu ý xác nhận trước khi lưu, cả khi nhập file và khi sửa trực tiếp.
- **FEAT-11 · Chưa triển khai PDF.** Báo cáo tải bằng CSV. PDF thuộc đợt hoàn thiện sau nghiệm thu hai clip gốc.
- **FEAT-12 · Một phần.** Có sửa đoạn trích, giữ phần sửa khi quét lại và có nhật ký các lần rà. Lịch sử từng lần sửa đoạn trích và hoàn tác từng lần thuộc đợt sau nghiệm thu hai clip gốc.

Quét hàng loạt đưa trạng thái video đang xử lý và thời gian đã chạy lên trước danh sách. Sau khi đo được tốc độ, app hiện thời gian trung bình và ước lượng thời gian còn lại. Trên màn hình hẹp, nút **Xem bằng chứng** mở thẳng clip đang chọn và có nút quay về danh sách.
