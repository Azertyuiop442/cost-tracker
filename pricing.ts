
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
  { id: "deepseek/deepseek-v4-pro", inputPerM: 0.66, outputPerM: 1.98, cacheReadPerM: 0.022, contextWindow: 1_000_000, timeOfDay: { windows: "01–04 & 06–10 UTC", peak: { inputPerM: 1.32, outputPerM: 3.96, cacheReadPerM: 0.044 } } },
  { id: "deepseek/deepseek-v4-flash", inputPerM: 0.22, outputPerM: 0.66, cacheReadPerM: 0.007, contextWindow: 1_000_000, timeOfDay: { windows: "01–04 & 06–10 UTC", peak: { inputPerM: 0.44, outputPerM: 1.32, cacheReadPerM: 0.014 } } },
  { id: "deepseek/deepseek-v4-flash-vision-exp", inputPerM: 0.22, outputPerM: 0.66, cacheReadPerM: 0.007, contextWindow: 1_000_000, timeOfDay: { windows: "01–04 & 06–10 UTC", peak: { inputPerM: 0.44, outputPerM: 1.32, cacheReadPerM: 0.014 } } },
  { id: "moonshotai/Kimi-K3", inputPerM: 3.0, outputPerM: 15.0, cacheReadPerM: 0.3, contextWindow: 1_000_000 },
  { id: "moonshotai/Kimi-K2.7-Code", inputPerM: 0.95, outputPerM: 4.0, cacheReadPerM: 0.19, contextWindow: 256_000 },
  { id: "moonshotai/Kimi-K2.7-Code-Highspeed", inputPerM: 1.9, outputPerM: 8.0, cacheReadPerM: 0.38, contextWindow: 262_000 },
  { id: "moonshotai/Kimi-K2.6", inputPerM: 0.95, outputPerM: 4.0, cacheReadPerM: 0.16, contextWindow: 256_000 },
  { id: "moonshotai/Kimi-K2.5", inputPerM: 0.6, outputPerM: 3.0, cacheReadPerM: 0.1, contextWindow: 256_000 },
  { id: "zai-org/GLM-5.3-Flash", inputPerM: 0.15, outputPerM: 0.5, cacheReadPerM: 0.03, contextWindow: 1_048_576 },
  { id: "zai-org/GLM-5.3", inputPerM: 1.4, outputPerM: 4.4, cacheReadPerM: 0.26, contextWindow: 1_000_000 },
  { id: "zai-org/GLM-5.2", inputPerM: 1.4, outputPerM: 4.4, cacheReadPerM: 0.26, contextWindow: 1_000_000 },
  { id: "zai-org/GLM-5.2-Fast", inputPerM: 3.0, outputPerM: 10.25, cacheReadPerM: 0.5, contextWindow: 1_000_000 },
  { id: "zai-org/GLM-5.1", inputPerM: 1.4, outputPerM: 4.4, cacheReadPerM: 0.26, contextWindow: 200_000 },
  { id: "zai-org/GLM-5", inputPerM: 1.0, outputPerM: 3.2, cacheReadPerM: 0.2, contextWindow: 200_000 },
  { id: "MiniMaxAI/MiniMax-M3", inputPerM: 0.3, outputPerM: 1.2, cacheReadPerM: 0.06, contextWindow: 1_000_000 },
  { id: "MiniMaxAI/MiniMax-M2.7", inputPerM: 0.3, outputPerM: 1.2, cacheReadPerM: 0.06 },
  { id: "MiniMaxAI/MiniMax-M2.5", inputPerM: 0.3, outputPerM: 1.2, cacheReadPerM: 0.03, contextWindow: 200_000 },
  { id: "minimax/minimax-m3-free", inputPerM: 0, outputPerM: 0, cacheReadPerM: 0, contextWindow: 1_000_000 },
  { id: "minimax/minimax-m2.7-free", inputPerM: 0, outputPerM: 0, cacheReadPerM: 0, contextWindow: 197_000 },
  { id: "stealth/ox-alpha", inputPerM: 0, outputPerM: 0, cacheReadPerM: 0, contextWindow: 1_000_000 },
  { id: "xiaomi/mimo-v2.5-pro", inputPerM: 0.435, outputPerM: 0.87, cacheReadPerM: 0.0036, contextWindow: 1_000_000 },
  { id: "xiaomi/mimo-v2.5", inputPerM: 0.14, outputPerM: 0.28, cacheReadPerM: 0.0028, contextWindow: 1_000_000 },
  { id: "Qwen/Qwen3.8-Max", inputPerM: 2.0, outputPerM: 6.0, cacheReadPerM: 0.25, contextWindow: 1_000_000 },
  { id: "Qwen/Qwen3.8-27B", inputPerM: 0.4, outputPerM: 3.0, cacheReadPerM: 0.04, contextWindow: 262_144 },
  { id: "Qwen/Qwen3.6-Max-Preview", inputPerM: 1.3, outputPerM: 7.8, cacheReadPerM: 0.26 },
  { id: "Qwen/Qwen3.6-Plus", inputPerM: 0.5, outputPerM: 3.0, cacheReadPerM: 0.1 },
  { id: "Qwen/Qwen3.7-Max", inputPerM: 2.5, outputPerM: 7.5, cacheReadPerM: 0.5, contextWindow: 1_000_000 },
  { id: "Qwen/Qwen3.7-Plus", inputPerM: 0.4, outputPerM: 1.6, cacheReadPerM: 0.08, contextWindow: 1_000_000 },
  { id: "Qwen/Qwen3.7-Flash", inputPerM: 0.03, outputPerM: 0.13, cacheReadPerM: 0.006, contextWindow: 1_000_000 },
  { id: "stepfun/Step-3.7-Flash", inputPerM: 0.2, outputPerM: 1.15, cacheReadPerM: 0.04, contextWindow: 256_000 },
  { id: "stepfun/Step-3.5-Flash", inputPerM: 0.1, outputPerM: 0.3, cacheReadPerM: 0.02, contextWindow: 1_000_000 },
  { id: "tencent/hy3-paid", inputPerM: 0.14, outputPerM: 0.58, cacheReadPerM: 0.035, contextWindow: 262_144 },
  { id: "inclusionai/ling-3.0-flash-free", inputPerM: 0, outputPerM: 0, cacheReadPerM: 0, contextWindow: 256_000 },
  { id: "poolside/laguna-s-2.1-free", inputPerM: 0, outputPerM: 0, cacheReadPerM: 0, contextWindow: 256_000 },
  { id: "nvidia/nemotron-3-ultra-550b-a55b", inputPerM: 0.6, outputPerM: 2.4, cacheReadPerM: 0.12, contextWindow: 1_000_000 },
  { id: "thinkingmachines/inkling", inputPerM: 1.0, outputPerM: 4.05, cacheReadPerM: 0.17, contextWindow: 256_000 },
  { id: "thinkingmachines/inkling-small", inputPerM: 0.5, outputPerM: 1.2, cacheReadPerM: 0.1, contextWindow: 1_000_000 },

  { id: "claude-fable-5", inputPerM: 10.0, outputPerM: 50.0, cacheReadPerM: 1.0, contextWindow: 1_000_000 },
  { id: "claude-opus-5", inputPerM: 5.0, outputPerM: 25.0, cacheReadPerM: 0.5, contextWindow: 1_000_000 },
  { id: "claude-opus-4-8", inputPerM: 5.0, outputPerM: 25.0, cacheReadPerM: 0.5, contextWindow: 1_000_000 },
  { id: "claude-opus-4-7", inputPerM: 5.0, outputPerM: 25.0, cacheReadPerM: 0.5, contextWindow: 1_000_000 },
  { id: "claude-opus-4-6", inputPerM: 5.0, outputPerM: 25.0, cacheReadPerM: 0.5, contextWindow: 1_000_000 },
  { id: "claude-sonnet-5", inputPerM: 2.0, outputPerM: 10.0, cacheReadPerM: 0.2, contextWindow: 1_000_000 },
  { id: "claude-sonnet-4-6", inputPerM: 3.0, outputPerM: 15.0, cacheReadPerM: 0.3, contextWindow: 1_000_000 },
  { id: "claude-sonnet-4-5", inputPerM: 3.0, outputPerM: 15.0, cacheReadPerM: 0.3, contextWindow: 1_000_000 },
  { id: "claude-haiku-4-5", inputPerM: 1.0, outputPerM: 5.0, cacheReadPerM: 0.1, contextWindow: 200_000 },
  { id: "gpt-5.6-sol", inputPerM: 5.0, outputPerM: 30.0, cacheReadPerM: 0.5, contextWindow: 1_050_000 },
  { id: "gpt-5.6-terra", inputPerM: 2.0, outputPerM: 12.0, cacheReadPerM: 0.2, contextWindow: 1_050_000 },
  { id: "gpt-5.6-luna", inputPerM: 0.2, outputPerM: 1.2, cacheReadPerM: 0.02, contextWindow: 1_050_000 },
  { id: "gpt-5.5", inputPerM: 5.0, outputPerM: 30.0, cacheReadPerM: 0.5, contextWindow: 400_000 },
  { id: "gpt-5.4", inputPerM: 2.5, outputPerM: 15.0, cacheReadPerM: 0.25, contextWindow: 400_000 },
  { id: "gpt-5.4-mini", inputPerM: 0.75, outputPerM: 4.5, cacheReadPerM: 0.075, contextWindow: 400_000 },
  { id: "gpt-5.3-codex", inputPerM: 2.0, outputPerM: 8.0, cacheReadPerM: 0.5, contextWindow: 400_000 },
  { id: "google/gemini-3.7-flash", inputPerM: 0.75, outputPerM: 3.75, cacheReadPerM: 0.075, contextWindow: 1_048_576 },
  { id: "google/gemini-3.6-flash", inputPerM: 1.5, outputPerM: 7.5, cacheReadPerM: 0.15, contextWindow: 1_000_000 },
  { id: "google/gemini-3.5-flash", inputPerM: 1.5, outputPerM: 9.0, cacheReadPerM: 0.15, contextWindow: 1_000_000 },
  { id: "google/gemini-3.5-flash-lite", inputPerM: 0.3, outputPerM: 2.5, cacheReadPerM: 0.03, contextWindow: 1_000_000 },
  { id: "google/gemini-3.1-flash-lite", inputPerM: 0.25, outputPerM: 1.5, cacheReadPerM: 0.03, contextWindow: 1_000_000 },
  { id: "sakana/fugu-ultra", inputPerM: 5.0, outputPerM: 30.0, cacheReadPerM: 0.5, contextWindow: 1_000_000 },
  { id: "meta/muse-spark-1.2", inputPerM: 1.25, outputPerM: 4.25, cacheReadPerM: 0.15, contextWindow: 1_048_576 },
  { id: "meta/muse-spark-1.2-contributor", inputPerM: 0.1, outputPerM: 0.2, cacheReadPerM: 0.002, contextWindow: 1_048_576 },
  { id: "meta/muse-spark-1.1", inputPerM: 1.25, outputPerM: 4.25, cacheReadPerM: 0.15, contextWindow: 1_048_576 },
  { id: "xai/grok-4.6", inputPerM: 2.0, outputPerM: 6.0, cacheReadPerM: 0.5, contextWindow: 500_000 },
  { id: "xai/grok-4.5", inputPerM: 2.0, outputPerM: 6.0, cacheReadPerM: 0.5, contextWindow: 500_000 },
];

export function normalizeModelId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/^z-ai\//, "zai-org/");
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

const PAID_NAME_TO_ID: Record<string, string> = {
  "Tencent Hy3": "tencent/hy3-paid",
  "Kimi K3": "moonshotai/Kimi-K3",
  "Kimi K2.7 Code": "moonshotai/Kimi-K2.7-Code",
  "Kimi K2.7 Code HighSpeed": "moonshotai/Kimi-K2.7-Code-Highspeed",
  "Kimi K2.6": "moonshotai/Kimi-K2.6",
  "Kimi K2.5": "moonshotai/Kimi-K2.5",
  "GLM-5.3 Flash": "zai-org/GLM-5.3-Flash",
  "GLM-5.3-Flash": "zai-org/GLM-5.3-Flash",
  "GLM 5.3 Flash": "zai-org/GLM-5.3-Flash",
  "GLM-5.3": "zai-org/GLM-5.3",
  "GLM-5.2": "zai-org/GLM-5.2",
  "GLM-5.2 Fast": "zai-org/GLM-5.2-Fast",
  "GLM-5.1": "zai-org/GLM-5.1",
  "GLM-5": "zai-org/GLM-5",
  "MiniMax M3": "MiniMaxAI/MiniMax-M3",
  "MiniMax M2.7": "MiniMaxAI/MiniMax-M2.7",
  "MiniMax M2.5": "MiniMaxAI/MiniMax-M2.5",
  "DeepSeek V4 Pro (latest)": "deepseek/deepseek-v4-pro",
  "DeepSeek V4 Flash (latest)": "deepseek/deepseek-v4-flash",
  "DeepSeek V4 Flash Vision (exp)": "deepseek/deepseek-v4-flash-vision-exp",
  "Qwen 3.8 Max": "Qwen/Qwen3.8-Max",
  "Qwen 3.8 27B": "Qwen/Qwen3.8-27B",
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
  "Gemini 3.7 Flash": "google/gemini-3.7-flash",
  "Gemini 3.6 Flash": "google/gemini-3.6-flash",
  "Gemini 3.5 Flash": "google/gemini-3.5-flash",
  "Gemini 3.5 Flash Lite": "google/gemini-3.5-flash-lite",
  "Gemini 3.1 Flash Lite": "google/gemini-3.1-flash-lite",
  "Fugu Ultra": "sakana/fugu-ultra",
  "Muse Spark 1.2": "meta/muse-spark-1.2",
  "Muse Spark 1.2 Contributor": "meta/muse-spark-1.2-contributor",
  "Muse Spark 1.1": "meta/muse-spark-1.1",
  "Grok 4.6": "xai/grok-4.6",
  "Grok 4.5": "xai/grok-4.5",
  "Inkling": "thinkingmachines/inkling",
  "Inkling Small": "thinkingmachines/inkling-small",
};

const FREE_NAME_TO_ID: Record<string, string> = {
  "Ox Alpha": "stealth/ox-alpha",
  "Laguna S 2.1": "poolside/laguna-s-2.1-free",
  "Ling 3.0 Flash": "inclusionai/ling-3.0-flash-free",
  "MiniMax M3": "minimax/minimax-m3-free",
  "MiniMax M2.7": "minimax/minimax-m2.7-free",
};

const FREE_SLUG_VENDORS: Array<[RegExp, string]> = [
  [/^laguna-/, "poolside"],
  [/^ling-/, "inclusionai"],
  [/^minimax-m\d[^/]*-free$/, "minimax"],
  [/^ox-alpha/, "stealth"],
];

const PAID_SLUG_VENDORS: Array<[RegExp, string]> = [
  [/^kimi-/, "moonshotai"],
  [/^glm-/, "zai-org"],
  [/^minimax-m\d/, "minimaxai"],
  [/^deepseek-/, "deepseek"],
  [/^qwen-/, "qwen"],
  [/^step-/, "stepfun"],
  [/^mimo-/, "xiaomi"],
  [/^nemotron-/, "nvidia"],
  [/^gemini-/, "google"],
  [/^muse-spark-/, "meta"],
  [/^grok-/, "xai"],
  [/^inkling/, "thinkingmachines"],
  [/^fugu-/, "sakana"],
];

const NO_PREFIX_SLUGS: Array<RegExp> = [/^claude-/, /^gpt-/];

function fullModelId(slug: string): string {
  const id = (slug || "").trim();
  if (!id) return id;
  if (id.includes("/")) return id;
  for (const [re, vendor] of FREE_SLUG_VENDORS) {
    if (re.test(id)) return `${vendor}/${id}`;
  }
  for (const re of NO_PREFIX_SLUGS) {
    if (re.test(id)) return id;
  }
  for (const [re, vendor] of PAID_SLUG_VENDORS) {
    if (re.test(id)) return `${vendor}/${id}`;
  }
  return id;
}

function decodeFlightObject(raw: string): any | null {
  try {
    return JSON.parse(JSON.parse(`"${raw}"`));
  } catch {
    return null;
  }
}

function extractFlightObjects(html: string, marker: RegExp): any[] {
  const objs: any[] = [];
  const re = /\\"id\\":\\"([^\\"]+)\\"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const probe = html.slice(m.index, m.index + 800);
    if (!marker.test(probe)) continue;
    const b = html.lastIndexOf("{", m.index);
    if (b === -1) continue;
    let depth = 0, k = b, inStr = false;
    while (k < html.length) {
      const c = html[k];
      if (c === '"') inStr = !inStr;
      else if (!inStr) {
        if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      k++;
    }
    const obj = decodeFlightObject(html.slice(b, k + 1));
    if (obj) objs.push(obj);
  }
  return objs;
}

export function parseEmbeddedPricingJson(html: string): ModelPrice[] {
  const rows = extractFlightObjects(html, /\\"availability\\"|\\"contextWindow\\"/);
  const models: ModelPrice[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const rawId = String(row?.id || "");
    if (!rawId) continue;
    const input = Number(row?.tiers?.[0]?.rates?.input ?? row?.inputCost);
    const output = Number(row?.tiers?.[0]?.rates?.output ?? row?.outputCost);
    const cacheRead = row?.tiers?.[0]?.rates?.cacheRead ?? row?.cacheReadCost;
    if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) continue;
    const id = fullModelId(rawId);
    if (!id || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());
    const cw = Number(row?.contextWindow);
    const tod = row?.timeOfDay || null;
    const peak = tod?.peak ? {
      inputPerM: Number(tod.peak.input),
      outputPerM: Number(tod.peak.output),
      cacheReadPerM: Number(tod.peak.cacheRead),
    } : undefined;
    models.push({
      id,
      inputPerM: input,
      outputPerM: output,
      cacheReadPerM: Number.isFinite(Number(cacheRead)) ? Number(cacheRead) : undefined,
      contextWindow: Number.isFinite(cw) && cw > 0 ? cw : undefined,
      timeOfDay: tod?.windows && peak ? { windows: String(tod.windows), peak } : undefined,
    });
  }
  return models;
}

export function parsePeakWindows(windows: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const text = (windows || "").replace(/UTC/gi, "").replace(/&/g, ",").replace(/\band\b/gi, ",");
  for (const part of text.split(/[,;]+/)) {
    const m = /^\s*(\d{1,2})\s*[–—-]\s*(\d{1,2})\s*$/.exec(part);
    if (!m) continue;
    const start = parseInt(m[1], 10);
    const end = parseInt(m[2], 10);
    if (start < 0 || end > 24 || start >= end) continue;
    out.push([start, end]);
  }
  return out;
}

export function isPeakHour(windows: string, hours: number, minutes = 0): boolean {
  const t = hours + minutes / 60;
  for (const [start, end] of parsePeakWindows(windows)) {
    if (t > start && t < end) return true;
  }
  return false;
}

export interface EffectiveRates {
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM: number;
}

export function effectiveRates(price: ModelPrice, at: Date = new Date()): EffectiveRates {
  const fallbackCache = price.cacheReadPerM ?? price.inputPerM * 0.1;
  const base: EffectiveRates = {
    inputPerM: price.inputPerM,
    outputPerM: price.outputPerM,
    cacheReadPerM: fallbackCache,
  };
  const tod = price.timeOfDay;
  if (!tod?.peak || !tod.windows) return base;
  if (!isPeakHour(tod.windows, at.getUTCHours(), at.getUTCMinutes())) return base;
  return {
    inputPerM: tod.peak.inputPerM,
    outputPerM: tod.peak.outputPerM,
    cacheReadPerM: tod.peak.cacheReadPerM ?? fallbackCache,
  };
}

function rowName(html: string, from: number): string {
  const cellM = /<div class="flex min-w-0 items-center[^>]*>([\s\S]*?)<\/div>/.exec(html.slice(from, from + 4000));
  if (!cellM) return "";
  const textM = />([^<>]{2,60})</.exec(cellM[1]);
  return (textM ? textM[1] : "").replace(/\s+/g, " ").trim();
}

function currentPrice(cell: string): number | undefined {
  const withoutStruck = cell.replace(/<s>[\s\S]*?<\/s>/g, "");
  if (/Free/i.test(withoutStruck)) return 0;
  const prices = [...withoutStruck.matchAll(/\$([\d.]+)/g)];
  if (prices.length === 0) return undefined;
  const val = parseFloat(prices[prices.length - 1][1]);
  return Number.isNaN(val) ? undefined : val;
}

function extractCells(seg: string): string[] {
  const cells: string[] = [];
  const re = /<div class="[^"]*px-2 py-3[^"]*"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg)) !== null) {
    let start = m.index + m[0].length;
    while (start < seg.length && seg[start] !== ">") start++;
    start++;
    let depth = 1;
    let k = start;
    while (k < seg.length && depth > 0) {
      if (seg.startsWith("</div>", k)) {
        depth--;
        k += 6;
        continue;
      }
      if (seg.startsWith("<div", k)) {
        depth++;
        k += 4;
        continue;
      }
      k++;
    }
    if (depth === 0) cells.push(seg.slice(start, k - 6));
    re.lastIndex = Math.max(k, m.index + m[0].length);
  }
  return cells;
}

export function parsePricingPageHtml(html: string): ModelPrice[] {
  const marker = 'role="row"';
  const starts: number[] = [];
  let idx = html.indexOf(marker);
  while (idx !== -1) {
    starts.push(idx);
    idx = html.indexOf(marker, idx + 1);
  }
  const models: ModelPrice[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : Math.min(html.length, starts[i] + 8000);
    const seg = html.slice(starts[i], end);
    const name = rowName(seg, 0);
    if (!name) continue;
    const isFree = />FREE</.test(seg) || /href="#[a-z0-9-]*free/.test(seg);
    const id = (isFree ? FREE_NAME_TO_ID[name] : undefined) ?? PAID_NAME_TO_ID[name] ?? FREE_NAME_TO_ID[name];
    if (!id || seen.has(id.toLowerCase())) continue;
    const cells = extractCells(seg);
    const priceCells = cells.filter((c) => /\$|Free/i.test(c));
    if (priceCells.length < 3) continue;
    const input = currentPrice(priceCells[0]);
    const output = currentPrice(priceCells[1]);
    const cache = currentPrice(priceCells[2]);
    if (input === undefined || output === undefined) continue;
    const ctxCell = cells.find((c) => !/\$|Free/i.test(c));
    let contextWindow: number | undefined;
    if (ctxCell) {
      const ctxText = ctxCell.replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim();
      const ctxM = /^(\d+(?:\.\d+)?)([KM])$/i.exec(ctxText);
      if (ctxM) {
        const n = parseFloat(ctxM[1]);
        contextWindow = ctxM[2].toLowerCase() === "m" ? n * 1_000_000 : n * 1_000;
      }
    }
    seen.add(id.toLowerCase());
    models.push({
      id,
      inputPerM: input,
      outputPerM: output,
      cacheReadPerM: cache ?? input * 0.1,
      contextWindow,
    });
  }
  return models;
}

let cliModelsCache: Set<string> | null = null;

export function _resetCliModelsCacheForTests(): void {
  cliModelsCache = null;
}

export async function filterToAvailableModels(table: PricingTable, cmd: ModApi): Promise<PricingTable> {
  try {
    if (!cliModelsCache) {
      const r = await cmd.exec({ command: "commandcode", args: ["--list-models"] });
      if (r.code !== 0 || !r.stdout) return table;
      const ids = new Set<string>();
      for (const line of r.stdout.split("\n")) {
        const token = line.trim().split(/\s+/)[0] || "";
        if (!token || !token.includes("-") && !token.includes("/")) continue;
        if (/^(available|pass|docs|cmd|npm)/i.test(token)) continue;
        const norm = normalizeModelId(token);
        ids.add(norm);
        ids.add(basename(norm));
        ids.add(token.toLowerCase());
        ids.add(basename(token.toLowerCase()));
      }
      if (ids.size === 0) return table;
      cliModelsCache = ids;
    }
    const models = table.models.filter((m) => {
      const id = normalizeModelId(m.id);
      return cliModelsCache!.has(id) || cliModelsCache!.has(basename(id));
    });
    if (models.length === 0) return table;
    return { models, updatedAt: table.updatedAt };
  } catch {
    return table;
  }
}

export async function fetchCommandCodePricing(): Promise<PricingTable | undefined> {
  try {
    const res = await fetch("https://commandcode.ai/docs/resources/pricing-limits", {
      headers: { "User-Agent": "cost-tracker/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    const models = parseEmbeddedPricingJson(html);
    if (models.length === 0) {
      const fallback = parsePricingPageHtml(html);
      if (fallback.length === 0) return undefined;
      return { models: fallback, updatedAt: Date.now() };
    }
    return { models, updatedAt: Date.now() };
  } catch {
    return undefined;
  }
}

function mergeTables(base: PricingTable, live: PricingTable): PricingTable {
  const merged = new Map(base.models.map((m) => [normalizeModelId(m.id), m] as const));
  for (const m of live.models) {
    const key = normalizeModelId(m.id);
    const prev = merged.get(key);
    merged.set(key, prev
      ? {
          ...m,
          contextWindow: m.contextWindow ?? prev.contextWindow,
          timeOfDay: m.timeOfDay ?? prev.timeOfDay,
        }
      : m);
  }
  return { models: [...merged.values()], updatedAt: live.updatedAt };
}

function hardcodedTable(): PricingTable {
  return { models: [...HARDCODED_PRICING], updatedAt: Date.now() };
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

  const disk = await loadPricingFromDisk();
  if (disk) {
    pricingCache = disk;
    if (Date.now() - disk.updatedAt >= PRICING_TTL_MS) {
      void refreshPricingInBackground(cmd);
    }
    return disk;
  }

  const live = await fetchCommandCodePricing();
  if (live) {
    const table = mergeTables(hardcodedTable(), live);
    pricingCache = table;
    pricingMemoGen = null;
    await savePricingToDisk(table);
    void gateInBackground(cmd, table);
    return table;
  }

  pricingCache = hardcodedTable();
  return pricingCache;
}

async function gateInBackground(cmd: ModApi, table: PricingTable): Promise<void> {
  const gated = await filterToAvailableModels(table, cmd);
  if (gated === table || gated.models.length === 0) return;
  pricingCache = gated;
  pricingMemoGen = null;
  await savePricingToDisk(gated);
}

let pricingRefreshing = false;
export async function refreshPricingInBackground(cmd: ModApi): Promise<void> {
  if (pricingRefreshing) return;
  pricingRefreshing = true;
  try {
    const live = await fetchCommandCodePricing();
    if (live) {
      const merged = mergeTables(hardcodedTable(), live);
      const gated = await filterToAvailableModels(merged, cmd);
      const table = gated.models.length > 0 ? gated : merged;
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
  const rates = effectiveRates(price);
  const fresh = Math.max(0, input - cacheRead);
  return (fresh * rates.inputPerM + cacheRead * rates.cacheReadPerM + output * rates.outputPerM) / 1_000_000;
}

export function canonicalizeModel(model: string, table: PricingTable): string {
  if (!model || model === "unknown") return model;
  return fuzzyMatchModel(model, table)?.id ?? model;
}
