
import type { ModApi } from '@commandcode/harness';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, renameSync } from 'node:fs';
import type { PricingTable, SessionStats, UsageRecord } from './types.ts';
import { clamp, cacheSavingsFor, computeCost, ensurePricingFor, MAX_BRIDGE_TURNS, priceFor } from './pricing.ts';
import { displayName } from './display.ts';
import { fmtCost, fmtTokens } from './format.ts';

import { loadSessionFile } from './persistence.ts';
import { workspaceHistorySections } from './history.ts';
import { log } from './debug.ts';
import {
  computeSessionMarks,
  lastTurnCacheRatio,
  readSidebarSessions,
  type CurrentSessionLive,
  type SessionMark,
} from './session-marks.ts';

export const SIDEBAR_DIR = process.env.CC_SIDEBAR_DIR || "/tmp/cc-sidebar";
export const BRIDGE_DIR = `${SIDEBAR_DIR}/mods-data`;

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

export let restoredFromCheckpoint = false;
export function setRestoredFromCheckpoint(v: boolean): void { restoredFromCheckpoint = v; }

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

export let lastColdCache: { at: number; gapMs: number; fresh: number; extraCost: number; ratio: number } | null = null;

export function setLastColdCache(v: { at: number; gapMs: number; fresh: number; extraCost: number; ratio: number } | null): void {
  lastColdCache = v;
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

    const lastModel = (turns.length > 0 ? turns[turns.length - 1].model : "") || lastModelSeen;
    const table = await ensurePricingFor(cmd, lastModel);
    healZeroCostTurns(table);
    healZeroCostTurnsPure(turns, table);

    let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCost = 0;
    for (const t of turns) {
      totalInput += t.inputTokens;
      totalOutput += t.outputTokens;
      totalCacheRead += t.cacheReadTokens;
      totalCost += t.cost;
    }
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
    if (lastColdCache && Date.now() - lastColdCache.at < 30 * 60_000) {
      const gapMin = Math.round(lastColdCache.gapMs / 60_000);
      const gapStr = gapMin >= 1 ? `${gapMin}m` : `${Math.round(lastColdCache.gapMs / 1000)}s`;
      payload.segments.push({
        text: `cold +${fmtCost(lastColdCache.extraCost)}`,
        color: "red",
        bold: true,
      });
      payload.lastCold = {
        at: lastColdCache.at,
        gapMs: lastColdCache.gapMs,
        fresh: lastColdCache.fresh,
        extraCost: lastColdCache.extraCost,
        label: gapMin >= 1 ? `cache froid apres ${gapStr}` : "cache froid",
      };
    }
    const marks = sessionMarksFor(currentSessionId(), turns);
    if (marks.length > 0) payload.sessionMarks = marks;
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

function sessionMarksFor(sid: string, turns: UsageRecord[]): SessionMark[] {
  const now = Date.now();
  const last = turns.length > 0 ? turns[turns.length - 1] : null;
  const current: CurrentSessionLive | null = sid
    ? {
        id: sid,
        lastAt: last?.timestamp || now,
        ratio: last && last.inputTokens > 0 ? Math.min(1, last.cacheReadTokens / last.inputTokens) : null,
        coldAt: lastColdCache?.at,
      }
    : null;
  const ratioFor = (id: string): number | null => lastTurnCacheRatio(loadSessionFile(id)?.perTurn);
  return computeSessionMarks(readSidebarSessions(SIDEBAR_DIR), { now, ratioFor, current });
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

export function healZeroCostTurnsPure(turns: UsageRecord[], table: PricingTable): number {
  let delta = 0;
  for (const t of turns) {
    if (!t || t.cost !== 0) continue;
    if (!t.inputTokens && !t.outputTokens && !t.cacheReadTokens) continue;
    if (!priceFor(t.model, table)) continue;
    const cost = computeCost(t.model, t.inputTokens, t.outputTokens, t.cacheReadTokens, table);
    if (cost > 0) {
      t.cost = cost;
      delta += cost;
    }
  }
  return delta;
}

function rebuildSessionTotals(): void {
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCost = 0;
  const modelUsage: SessionStats["modelUsage"] = {};
  for (const t of session.turns) {
    totalInput += t.inputTokens;
    totalOutput += t.outputTokens;
    totalCacheRead += t.cacheReadTokens;
    totalCost += t.cost;
    const key = t.model || "unknown";
    if (!modelUsage[key]) modelUsage[key] = { turns: 0, cost: 0, input: 0, output: 0 };
    modelUsage[key].turns++;
    modelUsage[key].cost += t.cost;
    modelUsage[key].input += t.inputTokens;
    modelUsage[key].output += t.outputTokens;
  }
  setSession({ turns: session.turns, totalInput, totalOutput, totalCacheRead, totalCost, modelUsage });
}

export function healZeroCostTurns(table: PricingTable): void {
  const delta = healZeroCostTurnsPure(session.turns, table);
  if (delta <= 0) return;
  rebuildSessionTotals();
}

