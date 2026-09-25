import { analyzeDocumentSheets } from "./analyzeWorkbook";
import { buildWorkbookFingerprint } from "./workbookFingerprint";
import type { SmartImportAnalysis } from "./types";

export type AnalysisCacheEntry = {
  fileKey: string;
  analysis: SmartImportAnalysis;
  fingerprintHash: string;
};

const cache = new Map<string, AnalysisCacheEntry>();

function gridFingerprint(sheets: { name: string; grid: string[][] }[]): string {
  const first = sheets[0];
  if (!first) return "";
  const rowCount = first.grid.length;
  const colCount = first.grid[0]?.length ?? 0;
  const sample = (first.grid[1] ?? []).slice(0, 8).join("|");
  return `${rowCount}x${colCount}:${sample}`;
}

export function buildFileAnalysisKey(fileName: string, sheets: { name: string; grid: string[][] }[]): string {
  return `${fileName}::${gridFingerprint(sheets)}`;
}

export function getCachedAnalysis(fileKey: string): AnalysisCacheEntry | undefined {
  return cache.get(fileKey);
}

export function setCachedAnalysis(entry: AnalysisCacheEntry): void {
  cache.set(entry.fileKey, entry);
}

export type RunAnalysisOptions = {
  fileKey: string;
  sheets: { name: string; grid: string[][] }[];
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
};

export async function runSmartAnalysisAsync(
  options: RunAnalysisOptions,
): Promise<{ analysis: SmartImportAnalysis; fingerprintHash: string }> {
  const cached = getCachedAnalysis(options.fileKey);
  if (cached) {
    options.onProgress?.(100);
    return { analysis: cached.analysis, fingerprintHash: cached.fingerprintHash };
  }

  options.onProgress?.(10);
  await yieldToMain(options.signal);

  const analysis = analyzeDocumentSheets(options.sheets);
  options.onProgress?.(70);
  await yieldToMain(options.signal);

  const first = options.sheets[0];
  const fp = first
    ? buildWorkbookFingerprint(first.grid, analysis)
    : { hash: analysis.fingerprint } as ReturnType<typeof buildWorkbookFingerprint>;

  options.onProgress?.(100);
  const entry: AnalysisCacheEntry = {
    fileKey: options.fileKey,
    analysis,
    fingerprintHash: fp.hash,
  };
  setCachedAnalysis(entry);
  return { analysis, fingerprintHash: fp.hash };
}

function yieldToMain(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (signal?.aborted) reject(new DOMException("Aborted", "AbortError"));
      else resolve();
    }, 0);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

export function clearAnalysisCache(): void {
  cache.clear();
}
