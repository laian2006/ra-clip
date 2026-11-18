# Thành phần và dữ liệu bên thứ ba

- Chữ trên khung hình dùng [Tesseract.js](https://github.com/naptha/tesseract.js). Các gói OCR tiếng Anh và tiếng Việt trong `public/ocr` lấy từ tag 4.1.0 của [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) và đi kèm giấy phép Apache-2.0.
- Lời thoại được xử lý bằng [Transformers.js](https://github.com/huggingface/transformers.js) và mô hình [ONNX Whisper Tiny](https://huggingface.co/onnx-community/whisper-tiny). Các trọng số được tải theo yêu cầu.
- Giọng nói trong clip demo được tổng hợp bằng [Piper VAIS1000](https://huggingface.co/rhasspy/piper-voices/blob/main/vi/vi_VN/vais1000/medium/MODEL_CARD). Tư liệu huấn luyện của giọng này được ghi nhận theo [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Clip demo có lời thoại và hình ảnh dựng riêng, được cắt ghép và mã hóa lại.
- Giao diện dùng [Be Vietnam Pro](https://github.com/bettergui/BeVietnamPro) và biểu tượng [Lucide](https://lucide.dev/license).
