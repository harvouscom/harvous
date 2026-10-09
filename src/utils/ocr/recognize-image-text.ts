/**
 * Read the text off a photo, on the device.
 *
 * tesseract.js is WebAssembly in a worker, so a scan never leaves the phone and works for a
 * guest with no account. It is only ever reached through a dynamic `import()` from the scan
 * sheet: the engine and its English model are a few megabytes the initial payload must not
 * carry (`npm run perf:check`). The files are self-hosted — see `ocrAssets` in vite.config.ts.
 *
 * Printed text only. Tesseract is good at a book page or a handout and poor at handwriting;
 * the native app uses Apple's Vision for that (native/Harvous/Editor/IOSTextCaptureScanner.swift).
 */
import { createWorker, OEM, type Worker } from 'tesseract.js';

declare const __OCR_ASSET_BASE__: string;

export type OcrStage = 'preparing' | 'loading' | 'reading';

export type OcrProgress = {
  stage: OcrStage;
  /** 0–1 across the whole job, for one progress bar. */
  value: number;
};

export type OcrResult = {
  text: string;
  /** Tesseract's mean word confidence, 0–100. */
  confidence: number;
};

/** Long edge, in pixels. A phone photo is ~4000px; past ~2000 reading slows and gains nothing. */
const MAX_EDGE = 2000;
/** Hold the engine this long after a scan so a retake does not reload it. */
const IDLE_TERMINATE_MS = 60_000;

function assetUrl(path: string): string {
  return new URL(`${__OCR_ASSET_BASE__}${path}`, window.location.origin).href;
}

/**
 * WebAssembly SIMD — the same probe wasm-feature-detect (tesseract's own dependency) runs.
 * Asked here rather than by tesseract so it picks between the two cores the build ships,
 * instead of reaching for a relaxed-SIMD core that is not there.
 */
function supportsWasmSimd(): boolean {
  try {
    return WebAssembly.validate(
      new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]),
    );
  } catch {
    return false;
  }
}

let workerPromise: Promise<Worker> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
/** Whoever is waiting on the current job; the worker's logger is fixed at creation. */
let progressListener: ((progress: OcrProgress) => void) | null = null;

/*
 * Loading the core and the model is most of a first scan; reading is the rest. Weight the bar
 * so neither half sits at one end for long.
 */
const LOADING_SHARE = 0.35;

function reportFromLogger(message: { status: string; progress: number }) {
  if (!progressListener) return;
  const p = Math.max(0, Math.min(1, message.progress || 0));
  if (message.status === 'recognizing text') {
    progressListener({ stage: 'reading', value: LOADING_SHARE + p * (1 - LOADING_SHARE) });
  } else if (/loading|initializ/.test(message.status)) {
    const step = message.status.includes('core') ? 0 : message.status.includes('traineddata') ? 1 : 2;
    progressListener({ stage: 'loading', value: ((step + p) / 3) * LOADING_SHARE });
  }
}

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    const core = supportsWasmSimd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js';
    workerPromise = createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: assetUrl('worker.min.js'),
      corePath: assetUrl(`core/${core}`),
      langPath: assetUrl('lang'),
      // Versioned like the asset directory, so a new model is fetched rather than an old one
      // read back out of IndexedDB.
      cachePath: `harvous-ocr${__OCR_ASSET_BASE__.replace(/\W+/g, '-')}`,
      logger: reportFromLogger,
    }).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

function scheduleIdleTerminate() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void terminateOcr(), IDLE_TERMINATE_MS);
}

/** Free the engine (~100 MB of WebAssembly memory). Safe to call at any time. */
export async function terminateOcr(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const pending = workerPromise;
  workerPromise = null;
  progressListener = null;
  if (!pending) return;
  try {
    await (await pending).terminate();
  } catch {
    /* already gone */
  }
}

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      // `from-image` honours the EXIF rotation, so a portrait photo is not read sideways.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* e.g. HEIC outside Safari — fall back to the browser's own decoder */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Upright and no larger than the engine can use. */
async function prepareImage(file: Blob): Promise<HTMLCanvasElement> {
  const source = await decode(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the photo.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source && typeof source.close === 'function') source.close();
  return canvas;
}

export async function recognizeImageText(
  file: Blob,
  onProgress?: (progress: OcrProgress) => void,
): Promise<OcrResult> {
  if (idleTimer) clearTimeout(idleTimer);
  progressListener = onProgress ?? null;
  onProgress?.({ stage: 'preparing', value: 0 });
  try {
    const [canvas, worker] = await Promise.all([prepareImage(file), getWorker()]);
    onProgress?.({ stage: 'reading', value: LOADING_SHARE });
    const { data } = await worker.recognize(canvas);
    onProgress?.({ stage: 'reading', value: 1 });
    return { text: data.text ?? '', confidence: data.confidence ?? 0 };
  } finally {
    progressListener = null;
    scheduleIdleTerminate();
  }
}
