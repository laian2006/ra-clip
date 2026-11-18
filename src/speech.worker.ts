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
  progress_callback: (update: { status: string; progress: number }) => void;
}

const createTranscriber = pipeline as unknown as
  (task: 'automatic-speech-recognition', path: string, options: ModelOptions) => Promise<AutomaticSpeechRecognitionPipeline>;

let model: Promise<AutomaticSpeechRecognitionPipeline> | undefined;

async function recognize(samples: Float32Array) {
  model ??= createTranscriber('automatic-speech-recognition', 'onnx-community/whisper-tiny', {
    device: 'wasm',
    dtype: 'q8',
    progress_callback: update => {
      if (update.status === 'progress') {
        self.postMessage({ kind: 'progress', message: `Tải mô hình giọng nói · ${Math.floor(update.progress)}%` });
      }
    },
  });
  const transcriber = await model;
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

self.addEventListener('message', async (event: MessageEvent<Float32Array>) => {
  try {
    self.postMessage({ kind: 'success', evidence: await recognize(event.data) });
  } catch (error) {
    model = undefined;
    self.postMessage({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
  }
});
