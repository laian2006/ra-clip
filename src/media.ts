import type { Evidence, MediaSource, ScanSource } from './domain';
import { keepSpeechEvidence, screenOcrLines, screenedSource } from './evidence-quality';
import { referenceOnly } from './claims';
import { speechSampleRate, type SpeechResult } from './speech-recovery';
import { maxVideoBytes, maxVideoSeconds, scanFrameCount } from './video-limits';

const IMAGE_EDGE = 960;

export const supportedVideo = (file: File) =>
  /\.(mp4|m4v|webm|mov)$/i.test(file.name) || /^(video\/mp4|video\/webm|video\/quicktime)$/.test(file.type);

export function validateVideo(file: File) {
  if (!supportedVideo(file)) throw Error('Chọn video MP4, WebM, M4V hoặc MOV.');
  if (!file.size || file.size > maxVideoBytes) throw Error('Video phải có dung lượng từ 1 byte đến 150 MB.');
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
    if (video.duration > maxVideoSeconds) throw Error('Chọn video tối đa 5 phút.');
    return { video, release };
  } catch (error) {
    release();
    throw error;
  }
}

export async function captureFrame(blob: Blob, seconds: number, signal: AbortSignal) {
  const { video, release } = await videoMetadata(blob, signal);
  try {
    if (seconds > video.duration + 0.05) throw Error('Mốc này nằm ngoài thời lượng video.');
    const target = Math.min(seconds, Math.max(0, video.duration - 0.02));
    if (Math.abs(video.currentTime - target) > 0.001) {
      const seeked = waitForMedia(video, 'seeked', signal);
      video.currentTime = target;
      await seeked;
    }
    signal.throwIfAborted();
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw Error('Trình duyệt không tạo được ảnh khung hình.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally { release(); }
}

let speechWorker: Worker | undefined;
let speechReady = false;
export const speechIsReady = () => speechReady;

function speechTask(input: Float32Array | 'prepare', progress: (message: string) => void, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<SpeechResult>((resolve, reject) => {
    try { speechWorker ??= new Worker(new URL('./speech.worker.ts', import.meta.url), { type: 'module' }); }
    catch (error) {
      console.debug('Không mở được bộ xử lý lời thoại:', error);
      reject(Error('Trình duyệt không mở được bộ xử lý lời thoại. Thử lại hoặc dùng phụ đề SRT/VTT.'));
      return;
    }
    const worker = speechWorker;
    let timer: number;
    const clean = () => {
      window.clearTimeout(timer);
      worker.removeEventListener('message', message);
      worker.removeEventListener('error', fail);
      signal.removeEventListener('abort', cancel);
    };
    const message = (event: MessageEvent<Partial<SpeechResult> & { kind: string; message?: string }>) => {
      if (event.data.kind === 'progress') {
        window.clearTimeout(timer);
        timer = window.setTimeout(timeout, 180_000);
        progress(event.data.message ?? '');
        return;
      }
      clean();
      if (event.data.kind === 'success') {
        speechReady = true;
        resolve({ evidence: event.data.evidence ?? [], discarded: event.data.discarded ?? 0,
          retried: event.data.retried ?? 0, timingRejected: event.data.timingRejected ?? 0,
          failedParts: event.data.failedParts });
      }
      else reject(Error(event.data.message || 'Lỗi nhận dạng lời thoại.'));
    };
    const reset = () => { worker.terminate(); if (speechWorker === worker) { speechWorker = undefined; speechReady = false; } };
    const timeout = () => { clean(); reset(); reject(Error('Lời thoại xử lý quá lâu. Thử lại hoặc dùng phụ đề SRT/VTT.')); };
    const fail = (event: ErrorEvent) => {
      console.debug('Tiến trình PhoWhisper:', event.message);
      clean(); reset(); reject(Error('Mô hình lời thoại không phản hồi. Thử lại hoặc dùng phụ đề SRT/VTT.'));
    };
    const cancel = () => { clean(); reset(); reject(signal.reason); };
    worker.addEventListener('message', message);
    worker.addEventListener('error', fail);
    signal.addEventListener('abort', cancel, { once: true });
    timer = window.setTimeout(timeout, 90_000);
    if (input === 'prepare') worker.postMessage(input);
    else worker.postMessage(input, [input.buffer]);
  });
}

export async function prepareSpeech(progress: (message: string) => void, signal: AbortSignal) {
  await speechTask('prepare', progress, signal);
}

async function audioSamples(blob: Blob) {
  const audio = await new OfflineAudioContext(1, 1, speechSampleRate).decodeAudioData(await blob.arrayBuffer());
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
  const script = new URL('ocr/worker.js', document.baseURI);
  script.searchParams.set('script', new URL(workerAsset.default, document.baseURI).href);
  const initialization = createWorker(['vie', 'eng'], 1, {
    workerPath: script.href,
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
    let discarded = 0;
    const read = async (image: HTMLCanvasElement) => {
      const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
      const lines = data.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines));
      return { ...screenOcrLines(lines?.length ? lines : data.text.split('\n').map(text => ({ text, confidence: data.confidence }))),
        confidence: data.confidence };
    };
    const frames = scanFrameCount(video.duration);
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
      let reading = await read(canvas);
      if (!hasOfferText(reading.text)) {
        const alternate = await read(contrastCaptions(canvas));
        const useAlternate = alternate.text && (!reading.text || hasOfferText(alternate.text) || alternate.confidence > reading.confidence);
        if (useAlternate) reading = alternate;
        else if (!reading.text) reading.discarded = Math.max(reading.discarded, alternate.discarded);
      }
      discarded += reading.discarded;
      if (reading.text) evidence.push({
        start: Math.round(at * 10) / 10, end: null,
        text: reading.text, source: 'frame',
      });
    }
    return { evidence, discarded };
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
interface ScanAnalysis {
  evidence: Evidence[];
  sources: Partial<Record<MediaSource, ScanSource>>;
  duration?: number;
}

export async function analyzeVideo(blob: Blob, options: ScanOptions, progress: (message: string) => void, signal: AbortSignal): Promise<ScanAnalysis> {
  const { video, release } = await videoMetadata(blob, signal);
  const evidence: Evidence[] = [];
  const sources: Partial<Record<MediaSource, ScanSource>> = {};
  try {
    if (options.audio) {
      try {
        progress('Đang đọc âm thanh…');
        const samples = await audioSamples(blob).catch(error => {
          console.debug('Không giải mã được âm thanh:', error);
          throw Error('Trình duyệt không đọc được âm thanh. Kiểm tra video có tiếng hoặc dùng phụ đề SRT/VTT.');
        });
        signal.throwIfAborted();
        if (!samples.some(value => Math.abs(value) > 0.005)) sources.audio = { state: 'empty', detail: 'Âm thanh quá nhỏ để nhận dạng.' };
        else {
          const speech = await speechTask(samples, progress, signal);
          const kept = keepSpeechEvidence(speech.evidence);
          evidence.push(...kept);
          const drafts = kept.filter(referenceOnly).length;
          const outcome = screenedSource('audio', kept.length - drafts, speech.discarded + speech.evidence.length - kept.length);
          if (speech.retried) {
            outcome.retried = speech.retried;
            outcome.detail += ` Đã thử đọc lại ${speech.retried} đoạn âm thanh ngắn.`;
          }
          if (speech.timingRejected) outcome.detail += ` Bỏ ${speech.timingRejected} đoạn có mốc thời gian bất thường.`;
          if (speech.failedParts) {
            outcome.incomplete = true;
            outcome.detail += ` Có ${speech.failedParts} phần chưa đọc được. Có thể thêm phụ đề hoặc thử quét lại.`;
          }
          sources.audio = outcome;
        }
      } catch (error) {
        signal.throwIfAborted();
        sources.audio = { state: 'failed', detail: error instanceof Error ? error.message : 'Chưa đọc được lời thoại. Thử lại hoặc dùng phụ đề SRT/VTT.' };
      }
    }
    if (options.frame) {
      try {
        progress('Đang chuẩn bị mô hình đọc chữ…');
        const frames = await readFrames(video, progress, signal);
        evidence.push(...frames.evidence);
        sources.frame = screenedSource('frame', frames.evidence.length, frames.discarded);
      } catch (error) {
        signal.throwIfAborted();
        console.debug('Tesseract:', error);
        sources.frame = { state: 'failed', detail: 'Chưa quét xong khung hình. Thử lại hoặc dùng phụ đề SRT/VTT.' };
      }
    }
    return { evidence: evidence.sort((a, b) => a.start - b.start), sources, duration: video.duration };
  } finally {
    release();
  }
}
