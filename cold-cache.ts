export interface ColdCacheSample {
  input: number;
  cacheRead: number;
  at: number;
}

export interface ColdCacheEvent {
  gapMs: number;
  fresh: number;
  ratio: number;
  extraCost: number;
}

export interface ColdCacheRates {
  inputPerM: number;
  cacheReadPerM: number;
}

export const COLD_RATIO_MAX = 0.5;
export const COLD_MIN_FRESH = 100_000;

export function detectColdCache(
  prev: ColdCacheSample | null,
  current: ColdCacheSample,
  rates: ColdCacheRates,
  opts?: { minFresh?: number; maxRatio?: number },
): ColdCacheEvent | null {
  if (!Number.isFinite(current.input) || current.input <= 0) return null;
  const minFresh = opts?.minFresh ?? COLD_MIN_FRESH;
  const maxRatio = opts?.maxRatio ?? COLD_RATIO_MAX;
  const ratio = current.cacheRead / current.input;
  if (ratio >= maxRatio) return null;
  const fresh = Math.max(0, current.input - current.cacheRead);
  if (fresh < minFresh) return null;
  if (prev && prev.input > 0 && prev.cacheRead / prev.input < maxRatio) return null;
  const gapMs = prev ? Math.max(0, current.at - prev.at) : 0;
  const extraCost = (fresh * (rates.inputPerM - rates.cacheReadPerM)) / 1_000_000;
  return { gapMs, fresh, ratio, extraCost };
}
