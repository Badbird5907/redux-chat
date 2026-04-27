import type {
  HighlightRequestMessage,
  WorkerResponseMessage,
} from "./shiki-worker-types";

interface HighlightWorkerRequest {
  cacheKey: string;
  code: string;
  language: string;
  theme: HighlightRequestMessage["theme"];
}

interface PendingRequestHandlers {
  reject: (error: Error) => void;
  resolve: (value: { cacheKey: string; html: string }) => void;
}

const highlightedHtmlCache = new Map<string, string>();
const pendingRequests = new Map<number, PendingRequestHandlers>();

let nextRequestId = 1;
let shikiWorker: Worker | null = null;

function resetWorker(error: Error) {
  for (const pendingRequest of pendingRequests.values()) {
    pendingRequest.reject(error);
  }

  pendingRequests.clear();
  shikiWorker?.terminate();
  shikiWorker = null;
}

function handleWorkerMessage(event: MessageEvent<WorkerResponseMessage>) {
  const message = event.data;
  const pendingRequest = pendingRequests.get(message.requestId);

  if (!pendingRequest) {
    return;
  }

  pendingRequests.delete(message.requestId);

  if (message.type === "success") {
    highlightedHtmlCache.set(message.cacheKey, message.html);
    pendingRequest.resolve({
      cacheKey: message.cacheKey,
      html: message.html,
    });
    return;
  }

  pendingRequest.reject(new Error(message.error));
}

function handleWorkerError(event: ErrorEvent | Event) {
  const error =
    event instanceof ErrorEvent
      ? new Error(event.message || "Shiki worker error")
      : new Error("Shiki worker error");

  resetWorker(error);
}

export function getHighlightedHtmlFromCache(cacheKey: string) {
  return highlightedHtmlCache.get(cacheKey) ?? null;
}

export function getShikiWorker() {
  if (typeof window === "undefined") {
    throw new Error("Shiki worker can only be used in the browser");
  }

  if (shikiWorker !== null) {
    return shikiWorker;
  }

  shikiWorker = new Worker(new URL("./shiki.worker.ts", import.meta.url), {
    type: "module",
  });
  shikiWorker.addEventListener("message", handleWorkerMessage);
  shikiWorker.addEventListener("error", handleWorkerError);
  shikiWorker.addEventListener("messageerror", handleWorkerError);

  return shikiWorker;
}

export function prewarmShikiWorker() {
  if (typeof window === "undefined") {
    return;
  }

  getShikiWorker();
}

export function highlightCodeInWorker({
  cacheKey,
  code,
  language,
  theme,
}: HighlightWorkerRequest): Promise<{ cacheKey: string; html: string }> {
  const cachedHtml = getHighlightedHtmlFromCache(cacheKey);

  if (cachedHtml !== null) {
    return Promise.resolve({
      cacheKey,
      html: cachedHtml,
    });
  }

  const worker = getShikiWorker();
  const requestId = nextRequestId++;
  const message: HighlightRequestMessage = {
    type: "highlight",
    requestId,
    cacheKey,
    code,
    language,
    theme,
  };

  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
    worker.postMessage(message);
  });
}
