import type { Evidence } from './domain';

const MAX_BYTES = 150 * 1024 * 1024;
const MAX_DURATION = 120;
const IMAGE_EDGE = 960;
const MAX_FRAMES = 48;

export const supportedVideo = (file: File) =>
  /\.(mp4|m4v|webm|mov)$/i.test(file.name) || /^(video\/mp4|video\/webm|video\/quicktime)$/.test(file.type);

export function validateVideo(file: File) {
  if (!supportedVideo(file)) throw Error('Chọn video MP4, WebM, M4V hoặc MOV.');
  if (!file.size || file.size > MAX_BYTES) throw Error('Video phải nhỏ hơn 150 MB.');
}

function waitForMedia(video: HTMLVideoElement, eventName: string, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const clean = () => {
      video.removeEventListener(eventName, success);
      video.removeEventListener('error', fail);
      signal.removeEventListener('abort', cancel);
      clearTimeout(timeout);
    };
    const success = () => { clean(); resolve(); };
    const fail = () => { clean(); reject(Error('Trình duyệt không đọc được video. Thử MP4 (H.264/AAC) hoặc WebM.')); };
    const cancel = () => { clean(); reject(signal.reason); };
    const timeout = window.setTimeout(fail, 15_000);
    video.addEventListener(eventName, success, { once: true });
    video.addEventListener('error', fail, { once: true });
    signal.addEventListener('abort', cancel, { once: true });
  });
}

export async function videoMetadata(blob: Blob, signal = new AbortController().signal) {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const release = () => {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  };
  try {
    const loading = waitForMedia(video, 'loadeddata', signal);
    video.src = url;
    await loading;
    if (!Number.isFinite(video.duration) || !video.videoWidth || !video.videoHeight) {
      throw Error('Không đọc được kích thước hoặc thời lượng của video.');
    }
    if (video.duration > MAX_DURATION) throw Error('Chọn video tối đa 2 phút.');
    return { video, release };
  } catch (error) {
    release();
    throw error;
  }
}

let speechWorker: Worker | undefined;

function transcribe(samples: Float32Array, progress: (message: string) => void, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<Evidence[]>((resolve, reject) => {
    speechWorker ??= new Worker(new URL('./speech.worker.ts', import.meta.url), { type: 'module' });
    const worker = speechWorker;
    const clean = () => {
      worker.removeEventListener('message', message);
      worker.removeEventListener('error', fail);
      signal.removeEventListener('abort', cancel);
    };
    const message = (event: MessageEvent<{ kind: string; message?: string; evidence?: Evidence[] }>) => {
      if (event.data.kind === 'progress') { progress(event.data.message ?? ''); return; }
      clean();
      if (event.data.kind === 'success') resolve(event.data.evidence ?? []);
      else reject(Error(event.data.message || 'Lỗi nhận dạng lời thoại.'));
    };
    const reset = () => { worker.terminate(); if (speechWorker === worker) speechWorker = undefined; };
    const fail = (event: ErrorEvent) => { clean(); reset(); reject(Error(event.message || 'Mô hình giọng nói không phản hồi.')); };
    const cancel = () => { clean(); reset(); reject(signal.reason); };
    worker.addEventListener('message', message);
    worker.addEventListener('error', fail);
    signal.addEventListener('abort', cancel, { once: true });
    worker.postMessage(samples, [samples.buffer]);
  });
}

async function audioSamples(blob: Blob) {
  const audio = await new OfflineAudioContext(1, 1, 16_000).decodeAudioData(await blob.arrayBuffer());
  const samples = new Float32Array(audio.length);
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const data = audio.getChannelData(channel);
    for (let i = 0; i < data.length; i++) samples[i] += data[i] / audio.numberOfChannels;
  }
  return samples;
}

function contrastCaptions(frame: HTMLCanvasElement) {
  const band = Math.max(1, Math.round(frame.height * 0.28));
  const side = Math.round(frame.width * 0.045);
  const inset = Math.round(frame.height * 0.03);
  const width = frame.width - side * 2;
  const margin = 12;
  const canvas = document.createElement('canvas');
  canvas.width = width + margin * 2;
  canvas.height = band * 2 + margin * 3;
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })!;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const [top, y] of [[inset, margin], [frame.height - band - inset, band + margin * 2]]) {
    context.drawImage(frame, side, top, width, band, margin, y, width, band);
    const image = context.getImageData(margin, y, width, band);
    const pixels = image.data;
    const luma = new Uint8ClampedArray(pixels.length / 4);
    const histogram = new Uint32Array(256);
    let sum = 0;
    for (let i = 0; i < luma.length; i++) {
      const j = 4 * i;
      luma[i] = (pixels[j] * 3 + pixels[j + 1] * 6 + pixels[j + 2]) / 10;
      histogram[luma[i]]++;
      sum += luma[i];
    }
    let count = 0;
    let cumulative = 0;
    let max = 0;
    let threshold = 128;
    let darkPixels = 0;
    for (let i = 0; i < histogram.length - 1; i++) {
      count += histogram[i];
      cumulative += histogram[i] * i;
      if (count <= 0 || count >= luma.length) continue;
      const meanDifference = cumulative / count - (sum - cumulative) / (luma.length - count);
      const variance = count * (luma.length - count) * meanDifference ** 2;
      if (variance > max) {
        max = variance;
        threshold = i;
        darkPixels = count;
      }
    }
    const invert = darkPixels > luma.length * 0.52;
    for (let i = 0; i < luma.length; i++) {
      const value = (luma[i] <= threshold) === invert ? 255 : 0;
      pixels[4 * i] = pixels[4 * i + 1] = pixels[4 * i + 2] = value;
    }
    context.putImageData(image, margin, y);
  }
  return canvas;
}

function hasOfferText(value: string) {
  return /\d{2,}\s*(?:k\b|[.,]\d{3}|đ|vnd)|(?<![\p{L}\d])(?:voucher|mã|tặng)(?![\p{L}\d])/iu.test(value);
}

async function readFrames(video: HTMLVideoElement, progress: (message: string) => void, signal: AbortSignal) {
  const [{ createWorker, PSM }, workerAsset, coreAsset] = await Promise.all([
    import('tesseract.js'),
    import('tesseract.js/dist/worker.min.js?url'),
    import('tesseract.js-core/tesseract-core-lstm.wasm.js?url'),
  ]);
  signal.throwIfAborted();
  const initialization = createWorker(['vie', 'eng'], 1, {
    workerPath: new URL(workerAsset.default, document.baseURI).href,
    corePath: new URL(coreAsset.default, document.baseURI).href,
    langPath: new URL('ocr/', document.baseURI).href,
    workerBlobURL: false,
  });

  let rejectOnAbort: (reason: unknown) => void = () => {};
  const onAbort = () => rejectOnAbort(signal.reason);
  const canceled = new Promise<never>((_resolve, reject) => { rejectOnAbort = reject; });
  signal.addEventListener('abort', onAbort, { once: true });
  const timer = window.setTimeout(() => rejectOnAbort(Error('Mô hình đọc chữ mở quá lâu. Kéo thả phụ đề để tiếp tục.')), 30_000);
  let worker: Awaited<typeof initialization>;
  try {
    worker = await Promise.race([initialization, canceled]);
  } catch (error) {
    signal.removeEventListener('abort', onAbort);
    void initialization.then(instance => instance.terminate(), () => {});
    throw error;
  } finally { clearTimeout(timer); }

  const work = async () => {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1' });
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, IMAGE_EDGE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw Error('Trình duyệt không đọc được khung hình.');

    const evidence: Evidence[] = [];
    const frames = Math.max(1, Math.min(MAX_FRAMES, Math.ceil(video.duration / 2)));
    for (let i = 0; i < frames; i++) {
      signal.throwIfAborted();
      const at = Math.min(video.duration * (i + 0.25) / frames, video.duration - 0.02);
      if (at > 0 && Math.abs(video.currentTime - at) > 0.001) {
        const seek = waitForMedia(video, 'seeked', signal);
        video.currentTime = at;
        await seek;
      }
      progress(`Đọc chữ trên video · khung ${i + 1}/${frames}`);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const { data } = await worker.recognize(canvas);
      let text = data.text.trim();
      if (!hasOfferText(text)) {
        const { data: highContrast } = await worker.recognize(contrastCaptions(canvas));
        const alternative = highContrast.text.trim();
        if (alternative && (hasOfferText(alternative) || highContrast.confidence > data.confidence)) text = alternative;
      }
      if (text) evidence.push({
        start: Math.round(at * 10) / 10, end: null,
        text: text.replace(/\n\s*\n/g, '\n'), source: 'frame',
      });
    }
    return evidence;
  };

  try {
    signal.throwIfAborted();
    return await Promise.race([work(), canceled]);
  } finally {
    signal.removeEventListener('abort', onAbort);
    await worker.terminate();
  }
}

export interface ScanOptions { audio: boolean; frame: boolean }

export async function analyzeVideo(blob: Blob, options: ScanOptions, progress: (message: string) => void, signal: AbortSignal) {
  const { video, release } = await videoMetadata(blob, signal);
  const evidence: Evidence[] = [];
  const notes: string[] = [];
  try {
    if (options.audio) {
      try {
        progress('Đang đọc âm thanh…');
        const samples = await audioSamples(blob);
        signal.throwIfAborted();
        if (!samples.some(value => Math.abs(value) > 0.005)) notes.push('Âm thanh quá nhỏ để nhận dạng.');
        else {
          const speech = await transcribe(samples, progress, signal);
          evidence.push(...speech);
          if (!speech.length) notes.push('Chưa nhận ra lời thoại.');
        }
      } catch (error) {
        signal.throwIfAborted();
        notes.push(`Lời thoại: ${error instanceof Error ? error.message : 'không đọc được âm thanh'}`);
      }
    }
    if (options.frame) {
      try {
        progress('Đang chuẩn bị mô hình đọc chữ…');
        const frames = await readFrames(video, progress, signal);
        evidence.push(...frames);
        if (!frames.length) notes.push('Chưa nhận ra chữ trên các khung hình đã lấy mẫu.');
      } catch (error) {
        signal.throwIfAborted();
        notes.push(`Chữ trên video: ${error instanceof Error ? error.message : 'không đọc được khung hình'}`);
      }
    }
    return { evidence: evidence.sort((a, b) => a.start - b.start), notes };
  } finally {
    release();
  }
}
