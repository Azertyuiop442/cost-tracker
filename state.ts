
import type { ModApi } from '@commandcode/harness';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, renameSync } from 'node:fs';
import type { SessionStats, UsageRecord } from './types.ts';
import { clamp, cacheSavingsFor } from './pricing.ts';
import { displayName } from './display.ts';
import { MAX_BRIDGE_TURNS, priceFor, getPricing } from './pricing.ts';
import { fmtCost, fmtTokens } from './format.ts';

import { loadSessionFile } from './persistence.ts';
import { workspaceHistorySections } from './history.ts';
import { log } from './debug.ts';

export const BRIDGE_DIR = `${process.env.CC_SIDEBAR_DIR || "/tmp/cc-sidebar"}/mods-data`;

export let bridgeSeq = 0;

export function writeBridgeJson(target: string, payload: unknown): void {
  try {
    const json = JSON.stringify(payload);
    const tmp = `${target}.${process.pid}.tmp`;
    writeFileSync(tmp, json, "utf-8");
    renameSync(tmp, target);
  } catch {}
}

export function readBridgeJson<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

export let autoDisplay = true;

export let dashboardDetected = false;
export let session: SessionStats = {
  turns: [], totalInput: 0, totalOutput: 0, totalCacheRead: 0, totalCost: 0, modelUsage: {},
};

export let sessionFlushed = false;

export let lastSeenSessionId = "";

export let harnessSessionId = "";

export let lastModelSeen = "";

export let ttyCache: string | null = null;
export async function getTty(cmd: ModApi): Promise<string> {
  if (ttyCache) return ttyCache;
  try {

    const r = await cmd.exec({
      command: "bash",
      args: [
        "-c",
        `p=$$; for i in 1 2 3 4 5; do t=$(ps -o tty= -p $p 2>/dev/null | tr -d ' '); if [ -n "$t" ] && [ "$t" != "?" ] && [ "$t" != "??" ]; then echo "$t"; exit 0; fi; p=$(ps -o ppid= -p $p 2>/dev/null | tr -d ' '); [ -z "$p" ] && break; done; exit 1`,
      ],
    });
    const t = (r.stdout || "").trim().replace(/^\/dev\//, "");
    if (t && t !== "?" && t !== "??") {
      ttyCache = t;
      log(`getTty resolved: ${t}`);
    } else {
      log(`getTty: empty (stdout=${JSON.stringify(r.stdout)})`);
    }
  } catch (e) {
    log(`getTty FAILED: ${String(e).slice(0, 200)}`);
  }
  return ttyCache || "";
}

export async function pushDashboardStats(cmd: ModApi): Promise<void> {
  try {
    log(`push start (tty=${ttyCache || "?"})`);

    const cfgJson = readBridgeJson<any>("/tmp/cc-sidebar/config.json");
    if (cfgJson?.["cost-tracker"] === false || cfgJson?.["costTracker"] === false) {
      try { unlinkSync("/tmp/cc-sidebar/mods-data/cost-tracker.json"); } catch {}
      return;
    }

    const s = session;

    const sidForWidget = currentSessionId();
    const flushedFile = sidForWidget ? loadSessionFile(sidForWidget) : null;
    const flushedTurns: UsageRecord[] = (flushedFile?.perTurn || []).map((t) => ({
      model: t.model || "unknown",
      inputTokens: t.input || 0,
      outputTokens: t.output || 0,
      cacheReadTokens: t.cacheRead || 0,
      cost: t.cost || 0,
      timestamp: t.time || 0,
    }));

    const seenT = new Set(flushedTurns.map((t) => t.timestamp).filter(Boolean));
    for (const t of s.turns) {
      if (t.timestamp && seenT.has(t.timestamp)) continue;
      if (t.timestamp) seenT.add(t.timestamp);
      flushedTurns.push(t);
    }
    const turns = flushedTurns;

    let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCost = 0;
    const memEmpty = s.turns.length === 0;
    if (memEmpty && flushedFile) {
      totalInput = flushedFile.input || 0;
      totalOutput = flushedFile.output || 0;
      totalCacheRead = flushedFile.cacheRead || 0;
      totalCost = flushedFile.cost || 0;
    } else {
      totalInput = s.totalInput + (flushedFile?.input || 0);
      totalOutput = s.totalOutput + (flushedFile?.output || 0);
      totalCacheRead = s.totalCacheRead + (flushedFile?.cacheRead || 0);
      totalCost = s.totalCost + (flushedFile?.cost || 0);
    }

    const lastModel = (turns.length > 0 ? turns[turns.length - 1].model : "") || lastModelSeen;
    const table = await getPricing(cmd);
    const lastPrice = lastModel ? priceFor(lastModel, table) : undefined;

    const contextMax = lastPrice?.contextWindow ?? 1_000_000;

    const used = clamp(lastNonZeroInput(turns), 0, contextMax);
    const pct = contextMax > 0 ? used / contextMax : 0;

    const cacheHitPct = totalInput > 0 ? Math.min(100, Math.round((totalCacheRead / totalInput) * 100)) : 0;
    let totalSaved = 0;
    for (const turn of turns) {
      totalSaved += cacheSavingsFor(turn.model, turn.cacheReadTokens, table);
    }

    const payload: any = {
      seq: ++bridgeSeq,
      modId: "cost-tracker",
      updatedAt: Date.now(),
      model: lastModel ? displayName(lastModel) : "",

      modelId: lastModel || "",
      unknownPricing: !lastPrice,
      segments: [
        { text: fmtCost(totalCost), color: "yellow", bold: true },
        { text: `${fmtTokens(totalInput)} in`, color: "text", bold: false },
        { text: `${fmtTokens(totalOutput)} out`, color: "text", bold: false },
      ],

      turns: turns.slice(-MAX_BRIDGE_TURNS).map((t) => ({
        model: t.model,
        input: t.inputTokens,
        output: t.outputTokens,
        cacheRead: t.cacheReadTokens,
        cost: t.cost,
        cacheHitPct: t.inputTokens > 0 ? Math.min(100, Math.round((t.cacheReadTokens / t.inputTokens) * 100)) : 0,
      })),
      workspace: process.cwd(),
      contextUsage: { used, max: contextMax, pct, compacted: Date.now() - lastCompactionAt < 60_000 },
    };
    if (totalCacheRead > 0) {
      payload.segments.push({ text: `cache hit ${cacheHitPct}%`, color: "green", bold: false });
    }
    if (totalSaved > 0) {
      payload.segments.push({ text: `saved ${fmtCost(totalSaved)}`, color: "green", bold: false });
    }
    payload.segments.push({ text: `${turns.length} turns`, color: "subtext0", bold: false });

    payload.sections = await workspaceHistorySections();

    const tty = await getTty(cmd);
    mkdirSync(BRIDGE_DIR, { recursive: true });
    if (tty) {
      writeBridgeJson(`${BRIDGE_DIR}/cost-tracker-${tty}.json`, payload);
    }
    writeBridgeJson(`${BRIDGE_DIR}/cost-tracker.json`, payload);
    log(`push OK (seq=${payload.seq}, scoped=${tty ? "yes" : "no"})`);
  } catch (e) {
    log(`push FAILED: ${String(e).slice(0, 300)}`);
  }
}

export function currentSessionId(): string {
  const fromHarness = (harnessSessionId || "").trim();
  if (fromHarness) return fromHarness;
  return (process.env.COMMANDCODE_SESSION_ID || "").trim();
}

export function setHarnessSessionId(id: string): void {
  harnessSessionId = id;
}

export function setSession(stats: SessionStats): void { session = stats; }
export function setSessionFlushed(v: boolean): void { sessionFlushed = v; }
export function setLastModelSeen(m: string): void { lastModelSeen = m; }
export function setLastSeenSessionId(id: string): void { lastSeenSessionId = id; }

export function setAutoDisplay(v: boolean): void { autoDisplay = v; }
export function setDashboardDetected(v: boolean): void { dashboardDetected = v; }

export let lastCompactionAt = 0;
export function setLastCompactionAt(t: number): void { lastCompactionAt = t; }

export function lastNonZeroInput(turns: Array<{ inputTokens: number }>): number {
  for (let i = (turns || []).length - 1; i >= 0; i--) {
    const v = turns[i]?.inputTokens || 0;
    if (v > 0) return v;
  }
  return 0;
}

