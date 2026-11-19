import { env, pipeline, type AutomaticSpeechRecognitionPipeline, type AutomaticSpeechRecognitionOutput } from '@huggingface/transformers';
import type { Evidence } from './domain';

env.allowLocalModels = false;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
}

interface ModelOptions {
  device: 'wasm';
  dtype: 'q8';
  revision: string;
  progress_callback: (update: { status: string; progress?: number }) => void;
}

const createTranscriber = pipeline as unknown as
  (task: 'automatic-speech-recognition', path: string, options: ModelOptions) => Promise<AutomaticSpeechRecognitionPipeline>;

let model: Promise<AutomaticSpeechRecognitionPipeline> | undefined;

function downloadModel() {
  let lastPercent = -1;
  return createTranscriber('automatic-speech-recognition', 'huuquyet/PhoWhisper-base', {
    device: 'wasm',
    dtype: 'q8',
    revision: '7623a803636be73f54c30dfa4ce1c42cdc9bbbcf',
    progress_callback: update => {
      if (update.status !== 'progress_total' || update.progress === undefined || !Number.isFinite(update.progress)) return;
      const percent = Math.round(update.progress);
      if (percent > lastPercent) {
        lastPercent = percent;
        self.postMessage({ kind: 'progress', message: `Tải mô hình giọng nói · ${percent}%` });
      }
    },
  });
}

async function loadModel() {
  try { return await downloadModel(); }
  catch (error) {
    if (!/fetch|network|HTTP (408|429|5\d\d)/i.test(error instanceof Error ? error.message : String(error))) throw error;
    self.postMessage({ kind: 'progress', message: 'Kết nối tải mô hình bị gián đoạn. Đang thử lại…' });
    await new Promise(resolve => setTimeout(resolve, 1000));
    return downloadModel();
  }
}

async function prepare() {
  model ??= loadModel();
  try { return await model; }
  catch (error) {
    model = undefined;
    console.debug('PhoWhisper initialization:', error);
    throw Error('Chưa mở được mô hình lời thoại. Kiểm tra kết nối mạng rồi thử lại, hoặc dùng phụ đề SRT/VTT.');
  }
}

async function recognize(samples: Float32Array) {
  const transcriber = await prepare();
  self.postMessage({ kind: 'progress', message: 'Đang nhận dạng lời thoại tiếng Việt…' });
  const output = await transcriber(samples, {
    language: 'vietnamese', task: 'transcribe', return_timestamps: true,
    chunk_length_s: 25, stride_length_s: 4,
  }) as AutomaticSpeechRecognitionOutput;
  const evidence: Evidence[] = (output.chunks ?? []).flatMap(chunk => {
    const text = chunk.text.trim();
    const [start, end] = chunk.timestamp;
    return text && Number.isFinite(start) ? [{ start, end: end ?? null, text, source: 'audio' }] : [];
  });
  if (!evidence.length && output.text.trim()) {
    evidence.push({ start: 0, end: null, text: output.text.trim(), source: 'audio' });
  }
  return evidence;
}

self.addEventListener('message', async (event: MessageEvent<Float32Array | 'prepare'>) => {
  try {
    if (event.data === 'prepare') {
      await prepare();
      self.postMessage({ kind: 'success' });
    } else self.postMessage({ kind: 'success', evidence: await recognize(event.data) });
  } catch (error) {
    console.debug('PhoWhisper:', error);
    self.postMessage({ kind: 'error', message: model
      ? 'Chưa đọc được lời thoại trong clip này. Thử quét lại hoặc dùng phụ đề SRT/VTT.'
      : 'Chưa mở được mô hình lời thoại. Kiểm tra kết nối mạng rồi thử lại, hoặc dùng phụ đề SRT/VTT.' });
  }
});
