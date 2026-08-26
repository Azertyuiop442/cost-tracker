
import type { ModelPrice, PricingTable } from './types.ts';
import type { ModApi } from '@commandcode/harness';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

export function cacheSavingsFor(model: string, cacheRead: number, table: PricingTable): number {
  const price = priceFor(model, table);
  if (!price || cacheRead <= 0) return 0;
  const cacheRate = price.cacheReadPerM ?? price.inputPerM * 0.1;
  return cacheRead * (price.inputPerM - cacheRate) / 1_000_000;
}

const HARDCODED_PRICING: ModelPrice[] = [

  { id: "deepseek/deepseek-v4-pro", inputPerM: 0.435, outputPerM: 0.87, cacheReadPerM: 0.003625, contextWindow: 1_000_000 },
  { id: "deepseek/deepseek-v4-flash", inputPerM: 0.14, outputPerM: 0.28, cacheReadPerM: 0.0028, contextWindow: 1_000_000 },
  { id: "moonshotai/Kimi-K3", inputPerM: 3.0, outputPerM: 15.0, cacheReadPerM: 0.3, contextWindow: 256_000 },
  { id: "moonshotai/Kimi-K2.7-Code", inputPerM: 0.95, outputPerM: 4.0, cacheReadPerM: 0.19, contextWindow: 256_000 },
  { id: "moonshotai/Kimi-K2.7-Code-Highspeed", inputPerM: 1.9, outputPerM: 8.0, cacheReadPerM: 0.38, contextWindow: 256_000 },
  { id: "moonshotai/Kimi-K2.6", inputPerM: 0.95, outputPerM: 4.0, cacheReadPerM: 0.16, contextWindow: 256_000 },
  { id: "moonshotai/Kimi-K2.5", inputPerM: 0.6, outputPerM: 3.0, cacheReadPerM: 0.1, contextWindow: 256_000 },
  { id: "zai-org/GLM-5.2", inputPerM: 1.4, outputPerM: 4.4, cacheReadPerM: 0.26, contextWindow: 200_000 },
  { id: "zai-org/GLM-5.2-Fast", inputPerM: 3.0, outputPerM: 10.25, cacheReadPerM: 0.5, contextWindow: 200_000 },
  { id: "zai-org/GLM-5.1", inputPerM: 1.4, outputPerM: 4.4, cacheReadPerM: 0.26, contextWindow: 200_000 },
  { id: "zai-org/GLM-5", inputPerM: 1.0, outputPerM: 3.2, cacheReadPerM: 0.2, contextWindow: 200_000 },
  { id: "MiniMaxAI/MiniMax-M3", inputPerM: 0.3, outputPerM: 1.2, cacheReadPerM: 0.06 },
  { id: "MiniMaxAI/MiniMax-M2.7", inputPerM: 0.3, outputPerM: 1.2, cacheReadPerM: 0.06 },
  { id: "MiniMaxAI/MiniMax-M2.5", inputPerM: 0.3, outputPerM: 1.2, cacheReadPerM: 0.03 },
  { id: "xiaomi/mimo-v2.5-pro", inputPerM: 0.435, outputPerM: 0.87, cacheReadPerM: 0.0036 },
  { id: "xiaomi/mimo-v2.5", inputPerM: 0.14, outputPerM: 0.28, cacheReadPerM: 0.0028 },
  { id: "Qwen/Qwen3.8-Max", inputPerM: 2.0, outputPerM: 6.0, cacheReadPerM: 0.25 },
  { id: "Qwen/Qwen3.6-Max-Preview", inputPerM: 1.3, outputPerM: 7.8, cacheReadPerM: 0.26 },
  { id: "Qwen/Qwen3.6-Plus", inputPerM: 0.5, outputPerM: 3.0, cacheReadPerM: 0.1 },
  { id: "Qwen/Qwen3.7-Max", inputPerM: 2.5, outputPerM: 7.5, cacheReadPerM: 0.5 },
  { id: "Qwen/Qwen3.7-Plus", inputPerM: 0.4, outputPerM: 1.6, cacheReadPerM: 0.08 },
  { id: "Qwen/Qwen3.7-Flash", inputPerM: 0.03, outputPerM: 0.13, cacheReadPerM: 0.006 },
  { id: "stepfun/Step-3.7-Flash", inputPerM: 0.2, outputPerM: 1.15, cacheReadPerM: 0.04 },
  { id: "stepfun/Step-3.5-Flash", inputPerM: 0.1, outputPerM: 0.3, cacheReadPerM: 0.02 },
  { id: "tencent/hy3-paid", inputPerM: 0.14, outputPerM: 0.58, cacheReadPerM: 0.035 },
  { id: "inclusionai/ling-3.0-flash-free", inputPerM: 0, outputPerM: 0 },
  { id: "poolside/laguna-s-2.1-free", inputPerM: 0, outputPerM: 0, contextWindow: 262_144 },
  { id: "nvidia/nemotron-3-ultra-550b-a55b", inputPerM: 0.6, outputPerM: 2.4, cacheReadPerM: 0.12 },
  { id: "thinkingmachines/inkling", inputPerM: 1.0, outputPerM: 4.05, cacheReadPerM: 0.17 },
  { id: "thinkingmachines/inkling-small", inputPerM: 0.5, outputPerM: 1.2, cacheReadPerM: 0.1 },

  { id: "claude-fable-5", inputPerM: 10.0, outputPerM: 50.0, cacheReadPerM: 1.0, contextWindow: 200_000 },
  { id: "claude-opus-5", inputPerM: 5.0, outputPerM: 25.0, cacheReadPerM: 0.5, contextWindow: 200_000 },
  { id: "claude-opus-4-8", inputPerM: 5.0, outputPerM: 25.0, cacheReadPerM: 0.5, contextWindow: 200_000 },
  { id: "claude-opus-4-7", inputPerM: 5.0, outputPerM: 25.0, cacheReadPerM: 0.5, contextWindow: 200_000 },
  { id: "claude-opus-4-6", inputPerM: 5.0, outputPerM: 25.0, cacheReadPerM: 0.5, contextWindow: 200_000 },
  { id: "claude-sonnet-5", inputPerM: 2.0, outputPerM: 10.0, cacheReadPerM: 0.2, contextWindow: 200_000 },
  { id: "claude-sonnet-4-6", inputPerM: 3.0, outputPerM: 15.0, cacheReadPerM: 0.3, contextWindow: 200_000 },
  { id: "claude-sonnet-4-5", inputPerM: 3.0, outputPerM: 15.0, cacheReadPerM: 0.3, contextWindow: 200_000 },
  { id: "claude-haiku-4-5", inputPerM: 1.0, outputPerM: 5.0, cacheReadPerM: 0.1, contextWindow: 200_000 },
  { id: "gpt-5.6-sol", inputPerM: 5.0, outputPerM: 30.0, cacheReadPerM: 0.5, contextWindow: 400_000 },
  { id: "gpt-5.6-terra", inputPerM: 1.0, outputPerM: 6.0, cacheReadPerM: 0.1, contextWindow: 400_000 },
  { id: "gpt-5.6-luna", inputPerM: 0.1, outputPerM: 0.6, cacheReadPerM: 0.01, contextWindow: 400_000 },
  { id: "gpt-5.5", inputPerM: 5.0, outputPerM: 30.0, cacheReadPerM: 0.5, contextWindow: 400_000 },
  { id: "gpt-5.4", inputPerM: 2.5, outputPerM: 15.0, cacheReadPerM: 0.25, contextWindow: 400_000 },
  { id: "gpt-5.4-mini", inputPerM: 0.75, outputPerM: 4.5, cacheReadPerM: 0.075, contextWindow: 400_000 },
  { id: "gpt-5.3-codex", inputPerM: 2.0, outputPerM: 8.0, cacheReadPerM: 0.5, contextWindow: 400_000 },
  { id: "google/gemini-3.6-flash", inputPerM: 1.5, outputPerM: 7.5, cacheReadPerM: 0.15, contextWindow: 1_000_000 },
  { id: "google/gemini-3.5-flash", inputPerM: 1.5, outputPerM: 9.0, cacheReadPerM: 0.15, contextWindow: 1_000_000 },
  { id: "google/gemini-3.5-flash-lite", inputPerM: 0.3, outputPerM: 2.5, cacheReadPerM: 0.03, contextWindow: 1_000_000 },
  { id: "google/gemini-3.1-flash-lite", inputPerM: 0.25, outputPerM: 1.5, cacheReadPerM: 0.03, contextWindow: 1_000_000 },
  { id: "sakana/fugu-ultra", inputPerM: 5.0, outputPerM: 30.0, cacheReadPerM: 0.5, contextWindow: 256_000 },
  { id: "meta/muse-spark-1.2", inputPerM: 1.25, outputPerM: 4.25, cacheReadPerM: 0.15, contextWindow: 128_000 },
  { id: "meta/muse-spark-1.2-contributor", inputPerM: 0.1, outputPerM: 0.2, cacheReadPerM: 0.002, contextWindow: 128_000 },
  { id: "meta/muse-spark-1.1", inputPerM: 1.25, outputPerM: 4.25, cacheReadPerM: 0.15, contextWindow: 128_000 },
  { id: "xai/grok-4.5", inputPerM: 2.0, outputPerM: 6.0, cacheReadPerM: 0.5, contextWindow: 256_000 },
];

export function normalizeModelId(id: string): string {
  return id.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

export function basename(id: string): string {
  return (id.split("/").pop() ?? id).toLowerCase();
}

export function fuzzyMatchModel(id: string, table: PricingTable): ModelPrice | undefined {
  const needle = normalizeModelId(id);
  if (!needle) return undefined;
  const direct = table.models.find(m => normalizeModelId(m.id) === needle);
  if (direct) return direct;
  const needleBase = basename(needle);
  return table.models.find(m => basename(m.id) === needleBase);
}

export function clamp(n: number, lo: number, hi: number): number {
  if (!isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export const MAX_BRIDGE_TURNS = 12;

const PRICING_CACHE_FILE = `${process.env.HOME}/.commandcode/mods/cost-tracker-pricing.json`;
const PRICING_TTL_MS = 6 * 60 * 60 * 1000;
let pricingCache: PricingTable | null = null;

export async function loadPricingFromDisk(): Promise<PricingTable | null> {
  try {
    const raw = readFileSync(PRICING_CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed?.models?.length > 0 && isValidPricingTable(parsed)) return parsed as PricingTable;
  } catch {}
  return null;
}

export function isValidPricingTable(t: any): boolean {
  if (!t || !Array.isArray(t.models) || t.models.length === 0) return false;
  return t.models.every((m: any) => {
    const input = m?.inputPerM, output = m?.outputPerM, cache = m?.cacheReadPerM;
    if (typeof input !== "number" || typeof output !== "number" || input < 0 || output < 0) return false;
    if (!isFinite(input) || !isFinite(output)) return false;
    if (cache !== undefined && (typeof cache !== "number" || cache < 0 || cache > input)) return false;
    if (m?.contextWindow !== undefined) {
      const cw = m.contextWindow;
      if (typeof cw !== "number" || !isFinite(cw) || cw <= 0) return false;
    }
    return input <= 100 && output <= 100;
  });
}

export async function savePricingToDisk(table: PricingTable): Promise<void> {
  try {
    mkdirSync(PRICING_CACHE_FILE.replace(/\/[^/]+$/, ""), { recursive: true });
    writeFileSync(PRICING_CACHE_FILE, JSON.stringify(table, null, 2), "utf-8");
  } catch {}
}

const PRICING_PAGE_NAME_TO_ID: Record<string, string> = {
  "Laguna S 2.1": "poolside/laguna-s-2.1-free",
  "Ling 3.0 Flash": "inclusionai/ling-3.0-flash-free",
  "Tencent Hy3": "tencent/hy3-paid",
  "Kimi K3": "moonshotai/Kimi-K3",
  "Kimi K2.7 Code": "moonshotai/Kimi-K2.7-Code",
  "Kimi K2.7 Code HighSpeed": "moonshotai/Kimi-K2.7-Code-Highspeed",
  "Kimi K2.6": "moonshotai/Kimi-K2.6",
  "Kimi K2.5": "moonshotai/Kimi-K2.5",
  "GLM-5.2": "zai-org/GLM-5.2",
  "GLM-5.2 Fast": "zai-org/GLM-5.2-Fast",
  "GLM-5.1": "zai-org/GLM-5.1",
  "GLM-5": "zai-org/GLM-5",
  "MiniMax M3": "MiniMaxAI/MiniMax-M3",
  "MiniMax M2.7": "MiniMaxAI/MiniMax-M2.7",
  "MiniMax M2.5": "MiniMaxAI/MiniMax-M2.5",
  "DeepSeek V4 Pro": "deepseek/deepseek-v4-pro",
  "DeepSeek V4 Flash (latest)": "deepseek/deepseek-v4-flash",
  "Qwen 3.8 Max": "Qwen/Qwen3.8-Max",
  "Qwen 3.6 Max Preview": "Qwen/Qwen3.6-Max-Preview",
  "Qwen 3.6 Plus": "Qwen/Qwen3.6-Plus",
  "Qwen 3.7 Max": "Qwen/Qwen3.7-Max",
  "Qwen 3.7 Plus": "Qwen/Qwen3.7-Plus",
  "Qwen 3.7 Flash": "Qwen/Qwen3.7-Flash",
  "Step 3.7 Flash": "stepfun/Step-3.7-Flash",
  "Step 3.5 Flash": "stepfun/Step-3.5-Flash",
  "MiMo V2.5 Pro": "xiaomi/mimo-v2.5-pro",
  "MiMo V2.5": "xiaomi/mimo-v2.5",
  "Nemotron 3 Ultra": "nvidia/nemotron-3-ultra-550b-a55b",
  "Claude Fable 5": "claude-fable-5",
  "Claude Opus 5": "claude-opus-5",
  "Claude Opus 4.8": "claude-opus-4-8",
  "Claude Opus 4.7": "claude-opus-4-7",
  "Claude Opus 4.6": "claude-opus-4-6",
  "Claude Sonnet 5": "claude-sonnet-5",
  "Claude Sonnet 4.6": "claude-sonnet-4-6",
  "Claude Sonnet 4.5": "claude-sonnet-4-5",
  "Claude Haiku 4.5": "claude-haiku-4-5",
  "GPT-5.6 Sol": "gpt-5.6-sol",
  "GPT-5.6 Terra": "gpt-5.6-terra",
  "GPT-5.6 Luna": "gpt-5.6-luna",
  "GPT-5.5": "gpt-5.5",
  "GPT-5.4": "gpt-5.4",
  "GPT-5.4 Mini": "gpt-5.4-mini",
  "GPT-5.3 Codex": "gpt-5.3-codex",
  "Gemini 3.6 Flash": "google/gemini-3.6-flash",
  "Gemini 3.5 Flash": "google/gemini-3.5-flash",
  "Gemini 3.5 Flash Lite": "google/gemini-3.5-flash-lite",
  "Gemini 3.1 Flash Lite": "google/gemini-3.1-flash-lite",
  "Fugu Ultra": "sakana/fugu-ultra",
  "Muse Spark 1.2": "meta/muse-spark-1.2",
  "Muse Spark 1.2 Contributor": "meta/muse-spark-1.2-contributor",
  "Muse Spark 1.1": "meta/muse-spark-1.1",
  "Grok 4.5": "xai/grok-4.5",
  "Inkling": "thinkingmachines/inkling",
  "Inkling Small": "thinkingmachines/inkling-small",
};

export async function fetchCommandCodePricing(): Promise<PricingTable | undefined> {
  try {
    const res = await fetch("https://commandcode.ai/docs/resources/pricing-limits", {
      headers: { "User-Agent": "cost-tracker/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    const models: ModelPrice[] = [];

    const rowRe = /<div class="grid grid-cols-\[[^\]]+\] items-center" role="row">([\s\S]*?)<\/div>\s*<\/div>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(html)) !== null) {
      const row = rowMatch[1];

      const nameM = /px-4 py-3[\s\S]*?>([^<>]{2,60})<\/(?:a|span)>/.exec(row);
      if (!nameM) continue;
      const name = nameM[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const id = PRICING_PAGE_NAME_TO_ID[name];
      if (!id) continue;

      const priceCells: string[] = [];
      const cellRe = /(?:flex flex-col items-end )?px-2 py-3 text-right text-\[12px\][^>]*>([\s\S]*?)<\/div>|(?:flex flex-col items-end )?px-2 py-3 text-\[12px\][^>]*>([\s\S]*?)<\/div>/g;
      let cellM: RegExpExecArray | null;
      while ((cellM = cellRe.exec(row)) !== null && priceCells.length < 4) {
        priceCells.push(cellM[1] ?? cellM[2] ?? "");
      }
      if (priceCells.length < 3) continue;

      const currentPrice = (cell: string): number | undefined => {
        const withoutStruck = cell.replace(/<s>[\s\S]*?<\/s>/g, "");
        if (/Free/i.test(withoutStruck)) return 0;
        const prices = [...withoutStruck.matchAll(/\$([\d.]+)/g)];
        if (prices.length === 0) return undefined;
        const val = parseFloat(prices[prices.length - 1][1]);
        return Number.isNaN(val) ? undefined : val;
      };
      const input = currentPrice(priceCells[0]);
      const output = currentPrice(priceCells[1]);
      const cache = currentPrice(priceCells[2]);
      if (input === undefined || output === undefined) continue;

      const contextCellM = /<div class="px-4 py-3[^>]*>([\s\S]*?)<\/div>/.exec(row.slice(nameM[0].length));
      let contextWindow: number | undefined;
      if (contextCellM) {
        const ctxText = contextCellM[1].replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim();
        const ctxM = /^(\d+(?:\.\d+)?)([KM])$/i.exec(ctxText);
        if (ctxM) {
          const n = parseFloat(ctxM[1]);
          contextWindow = ctxM[2].toLowerCase() === "m" ? n * 1_000_000 : n * 1_000;
        }
      }

      models.push({
        id,
        inputPerM: input,
        outputPerM: output,
        cacheReadPerM: cache ?? input * 0.1,
        contextWindow,
      });
    }
    if (models.length === 0) return undefined;
    return { models, updatedAt: Date.now() };
  } catch {
    return undefined;
  }
}

let pricingMemo = new Map<string, ModelPrice | undefined>();
let pricingMemoGen: PricingTable | null = null;

export function priceFor(model: string, table: PricingTable): ModelPrice | undefined {
  if (pricingMemoGen !== table) {
    pricingMemo = new Map();
    pricingMemoGen = table;
  }
  const key = normalizeModelId(model);
  if (!pricingMemo.has(key)) {
    pricingMemo.set(key, fuzzyMatchModel(model, table));
  }
  return pricingMemo.get(key);
}

export async function getPricing(cmd: ModApi): Promise<PricingTable> {

  if (pricingCache && Date.now() - pricingCache.updatedAt < PRICING_TTL_MS) return pricingCache;

  const base: PricingTable = { models: [...HARDCODED_PRICING], updatedAt: Date.now() };

  const disk = await loadPricingFromDisk();
  if (disk) {

    const hardcoded = new Map(base.models.map((m) => [m.id, m]));
    for (const m of disk.models) {
      const h = hardcoded.get(m.id);
      if (m.contextWindow === undefined && h?.contextWindow !== undefined) {
        m.contextWindow = h.contextWindow;
      }
    }
    pricingCache = disk;

    if (Date.now() - disk.updatedAt >= PRICING_TTL_MS) {
      void refreshPricingInBackground(cmd);
    }
    return disk;
  }

  const live = await fetchCommandCodePricing();
  if (live) {

    const merged = new Map(base.models.map(m => [m.id, m]));
    for (const m of live.models) {
      if (merged.has(m.id)) {

        if (m.contextWindow === undefined) {
          m.contextWindow = merged.get(m.id)?.contextWindow;
        }
        merged.set(m.id, m);
      }
    }
    const table = { models: [...merged.values()], updatedAt: Date.now() };
    pricingCache = table;
    await savePricingToDisk(table);
    return table;
  }

  pricingCache = base;
  return base;
}

let pricingRefreshing = false;
export async function refreshPricingInBackground(cmd: ModApi): Promise<void> {
  if (pricingRefreshing) return;
  pricingRefreshing = true;
  try {
    const live = await fetchCommandCodePricing();
    if (live) {
      const base: PricingTable = { models: [...HARDCODED_PRICING], updatedAt: Date.now() };
      const merged = new Map(base.models.map((m) => [m.id, m]));
      for (const m of live.models) {
        if (merged.has(m.id)) {
          if (m.contextWindow === undefined) {
            m.contextWindow = merged.get(m.id)?.contextWindow;
          }
          merged.set(m.id, m);
        }
      }
      const table = { models: [...merged.values()], updatedAt: Date.now() };
      pricingCache = table;
      pricingMemoGen = null;
      await savePricingToDisk(table);
    }
  } catch {
  } finally {
    pricingRefreshing = false;
  }
}

export function computeCost(model: string, input: number, output: number, cacheRead: number, table: PricingTable): number {
  const price = priceFor(model, table);
  if (!price) return 0;
  const cacheReadRate = price.cacheReadPerM ?? price.inputPerM * 0.1;
  const fresh = Math.max(0, input - cacheRead);
  return (fresh * price.inputPerM + cacheRead * cacheReadRate + output * price.outputPerM) / 1_000_000;
}

export function canonicalizeModel(model: string, table: PricingTable): string {
  if (!model || model === "unknown") return model;
  return fuzzyMatchModel(model, table)?.id ?? model;
}

