
import { mkdirSync, existsSync, unlinkSync } from 'node:fs';
import type { ModApi } from '@commandcode/harness';
import type { SessionStats, UsageRecord, ProjectData } from './types.ts';
import { currentSessionId, harnessSessionId, lastModelSeen, lastSeenSessionId, readBridgeJson, session, sessionFlushed, ttyCache, writeBridgeJson, setSession, setSessionFlushed, setLastModelSeen, setLastSeenSessionId, setHarnessSessionId } from './state.ts';
import { deleteSessionFile, loadIndex, loadSessionFile, saveIndex, saveSessionFile, sessionFileName } from './persistence.ts';
import { cacheSavingsFor, getPricing, normalizeModelId } from './pricing.ts';
import { purgeWorkspaceSectionsCache } from './history.ts';
import { log } from './debug.ts';

const CHECKPOINT_DIR = `${process.env.CC_SIDEBAR_DIR || "/tmp/cc-sidebar"}/cost-tracker-checkpoints`;

export function checkpointPath(): string {
  const sid = currentSessionId();
  const key = (sid || ttyCache || "unknown").replace(/[^A-Za-z0-9_.-]/g, "_");
  return `${CHECKPOINT_DIR}/cp-${key}.json`;
}

function checkpointCandidates(): string[] {
  const sid = currentSessionId();
  const keys = new Set<string>();
  if (sid) keys.add(sid);

  try {
    const argv = process.argv.join(" ");
    const m = argv.match(/--session\s+([A-Za-z0-9_.-]+)/);
    if (m) keys.add(m[1]);
  } catch {}
  if (ttyCache) keys.add(ttyCache);
  keys.add("unknown");
  return [...keys];
}

export function clearCheckpoint(): void {
  try {
    for (const p of checkpointPaths()) {
      if (existsSync(p)) unlinkSync(p);
    }
  } catch {}
}

export function checkpointPaths(): string[] {
  const out = new Set<string>();
  for (const key of checkpointCandidates()) {
    out.add(`${CHECKPOINT_DIR}/cp-${key}.json`);
  }
  return [...out];
}

interface CheckpointShape {
  session: SessionStats;
  sessionFlushed: boolean;
  lastModelSeen: string;
  lastSeenSessionId: string;
  harnessSessionId: string;
  checkpointedAt: number;
}

export function saveCheckpoint(): void {
  try {
    const cp: CheckpointShape = {
      session,
      sessionFlushed,
      lastModelSeen,
      lastSeenSessionId,
      harnessSessionId,
      checkpointedAt: Date.now(),
    };
    mkdirSync(CHECKPOINT_DIR, { recursive: true });

    writeBridgeJson(checkpointPath(), cp);
    if (ttyCache) {
      writeBridgeJson(`${CHECKPOINT_DIR}/cp-${ttyCache}.json`, cp);
    }
  } catch {}
}

export function restoreCheckpoint(): boolean {
  try {

    const candidates = checkpointCandidates();
    log(`restore: candidates=[${candidates.join(", ")}] sid="${currentSessionId()}"`);
    for (const key of candidates) {
      const cpP = `${CHECKPOINT_DIR}/cp-${key}.json`;
      const hasCp = existsSync(cpP);
      const sessP = `${process.env.HOME}/.commandcode/mods/cost-tracker-history/${sessionFileName(key)}`;
      const hasSess = existsSync(sessP);
      log(`restore:   ${key} → checkpoint=${hasCp ? "yes" : "no"} sessionFile=${hasSess ? "yes" : "no"}`);
    }

    let cp: CheckpointShape | null = null;
    let loadedKey = "";
    for (const key of candidates) {
      const p = `${CHECKPOINT_DIR}/cp-${key}.json`;
      const c = readBridgeJson<CheckpointShape>(p);
      if (c?.session && Array.isArray(c.session.turns)) {
        cp = c;
        loadedKey = key;
        break;
      }
    }

    let flushed: ReturnType<typeof loadSessionFile> = null;
    let flushedSid = "";
    const sid = currentSessionId() || loadedKey;
    if (sid) {
      flushed = loadSessionFile(sid);
      flushedSid = sid;
    } else {
      for (const key of candidates) {
        const f = loadSessionFile(key);
        if (f && (f.turns || 0) > 0) {
          flushed = f;
          flushedSid = key;
          break;
        }
      }
    }
    if (!cp && flushed && (flushed.turns || 0) > 0) {
      log(`restore: no checkpoint, restoring ${flushed.turns} flushed turns from ${flushedSid}`);

      const flushedTurns: UsageRecord[] = (flushed.perTurn || []).map((t) => ({
        model: t.model || "unknown",
        inputTokens: t.input || 0,
        outputTokens: t.output || 0,
        cacheReadTokens: t.cacheRead || 0,
        cost: t.cost || 0,
        timestamp: t.time || 0,
      }));
      restoreFromTurns(flushedTurns, "", false);
      log(`restore: DONE from flushed file (${flushedTurns.length} turns)`);
      return true;
    }
    if (!cp) {
      log(`restore: FAILED - no checkpoint AND no flushed session file (widget will show 0)`);
      return false;
    }
    log(`restore: checkpoint found (key=${loadedKey})`);
    const memSession = cp.session;

    const flushedTurns: UsageRecord[] = (flushed?.perTurn || []).map((t) => ({
      model: t.model || "unknown",
      inputTokens: t.input || 0,
      outputTokens: t.output || 0,
      cacheReadTokens: t.cacheRead || 0,
      cost: t.cost || 0,
      timestamp: t.time || 0,
    }));

    const seen = new Set<number>();
    const merged: UsageRecord[] = [];
    for (const t of [...flushedTurns, ...memSession.turns]) {
      if (t.timestamp && seen.has(t.timestamp)) continue;
      if (t.timestamp) seen.add(t.timestamp);
      merged.push(t);
    }

    restoreFromTurns(merged, cp.lastModelSeen || "", !!cp.sessionFlushed);
    setLastSeenSessionId(cp.lastSeenSessionId || "");
    setHarnessSessionId(cp.harnessSessionId || "");
    return true;
  } catch {
    return false;
  }
}

function restoreFromTurns(turns: UsageRecord[], lastModel: string, flushed: boolean): void {
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCost = 0;
  const modelUsage: SessionStats["modelUsage"] = {};
  for (const t of turns) {
    totalInput += t.inputTokens;
    totalOutput += t.outputTokens;
    totalCacheRead += t.cacheReadTokens;
    totalCost += t.cost;
    const key = normalizeModelId(t.model);
    if (!modelUsage[key]) modelUsage[key] = { turns: 0, cost: 0, input: 0, output: 0 };
    modelUsage[key].turns++;
    modelUsage[key].cost += t.cost;
    modelUsage[key].input += t.inputTokens;
    modelUsage[key].output += t.outputTokens;
  }
  setSession({ turns, totalInput, totalOutput, totalCacheRead, totalCost, modelUsage });
  setSessionFlushed(flushed);
  setLastModelSeen(lastModel);
}

export function scheduleCheckpoint(): void {
  saveCheckpoint();
}

const seenRequestIds = new Set<string>();
export function requestAlreadySeen(requestId: unknown): boolean {
  if (!requestId) return false;
  const key = String(requestId);
  if (seenRequestIds.has(key)) return true;
  seenRequestIds.add(key);

  if (seenRequestIds.size > 4_000) seenRequestIds.clear();
  return false;
}

export function findResumeMatch(
  sessions: ProjectData["sessions"],
  sessionId: string,
  workspace: string,
  today: string
): number {
  if (!sessionId) return -1;
  return sessions.findIndex(
    (s) =>
      !s.sessionId &&
      (s.date || "").startsWith(today) &&
      s.workspace === workspace
  );
}

export async function flushSessionToProject(cmd: ModApi): Promise<void> {
  if (session.turns.length === 0) return;
  try {
    log(`flush: begin (${session.turns.length} turns, sid=${currentSessionId() || "?"})`);
    const table = await getPricing(cmd);
    const index = await loadIndex();
    const sessionId = currentSessionId();

  let existingIdx = sessionId
    ? index.sessions.findIndex((s) => s.sessionId === sessionId)
    : -1;
  if (existingIdx < 0 && !sessionId) {
    const today = new Date().toISOString().slice(0, 10);
    existingIdx = index.sessions.findIndex(
      (s) => !s.sessionId && (s.date || "").startsWith(today) && s.workspace === process.cwd()
    );
  }

  if (existingIdx < 0 && sessionId) {
    const today = new Date().toISOString().slice(0, 10);
    const orphanIdx = findResumeMatch(
      index.sessions,
      sessionId,
      process.cwd(),
      today
    );
    if (orphanIdx >= 0) {
      index.sessions[orphanIdx].sessionId = sessionId;
      existingIdx = orphanIdx;
    }
  }

  const oldEntry = existingIdx >= 0 ? index.sessions[existingIdx] : null;

  const oldFileId = sessionId && !oldEntry?.sessionId
    ? (oldEntry?.date || "")
    : (sessionId || (oldEntry?.date ? oldEntry.date : ""));
  const existingFile = oldFileId ? loadSessionFile(oldFileId) : null;
  const existingTurns = existingFile?.perTurn || [];
  const mergedPerTurn = existingTurns.map((t) => ({ ...t }));
  const seenTimes = new Set(existingTurns.map((t) => t.time).filter(Boolean));
  for (const t of session.turns) {
    if (t.timestamp && seenTimes.has(t.timestamp)) continue;
    if (t.timestamp) seenTimes.add(t.timestamp);
    mergedPerTurn.push({
      model: t.model,
      input: t.inputTokens,
      output: t.outputTokens,
      cacheRead: t.cacheReadTokens,
      cost: t.cost,
      time: t.timestamp,
      cacheHitPct: t.inputTokens > 0 ? Math.min(100, Math.round((t.cacheReadTokens / t.inputTokens) * 100)) : 0,
    });
  }

  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCost = 0, totalSaved = 0;
  const mergedModels: Record<string, { turns: number; cost: number }> = {};
  for (const t of mergedPerTurn) {
    totalInput += t.input || 0;
    totalOutput += t.output || 0;
    totalCacheRead += t.cacheRead || 0;
    totalCost += t.cost || 0;
    totalSaved += cacheSavingsFor(t.model, t.cacheRead || 0, table);
    const key = normalizeModelId(t.model);
    if (!mergedModels[key]) mergedModels[key] = { turns: 0, cost: 0 };
    mergedModels[key].turns++;
    mergedModels[key].cost += t.cost || 0;
  }

  const entry = {
    date: new Date().toISOString(),
    workspace: process.cwd(),
    sessionId: sessionId || undefined,
    turns: mergedPerTurn.length,
    input: totalInput,
    output: totalOutput,

    cacheRead: totalCacheRead,
    cost: totalCost,
    saved: totalSaved,
    models: mergedModels,
    perTurn: mergedPerTurn,
  };

  if (existingIdx >= 0) {
    const old = index.sessions[existingIdx];
    index.totals.turns -= old.turns || 0;
    index.totals.input -= old.input || 0;
    index.totals.output -= old.output || 0;
    index.totals.cacheRead -= old.cacheRead || 0;
    index.totals.cost -= old.cost || 0;
    index.totals.saved -= old.saved || 0;
    for (const [id, m] of Object.entries(old.models || {})) {
      if (index.modelTotals[id]) {
        index.modelTotals[id].turns -= m.turns;
        index.modelTotals[id].cost -= m.cost;
      }
    }

    if (old.date && (!sessionId || !old.sessionId)) deleteSessionFile(old.date);
    index.sessions[existingIdx] = entry;
  } else {
    index.sessions.push(entry);
  }

  index.totals.turns += entry.turns || 0;
  index.totals.input += entry.input || 0;
  index.totals.output += entry.output || 0;
  index.totals.cacheRead += entry.cacheRead || 0;
  index.totals.cost += entry.cost || 0;
  index.totals.saved += totalSaved;

  for (const [id, s] of Object.entries(entry.models || {})) {
    if (!index.modelTotals[id]) index.modelTotals[id] = { turns: 0, cost: 0 };
    index.modelTotals[id].turns += s.turns;
    index.modelTotals[id].cost += s.cost;
  }

  saveSessionFile(entry);
  await saveIndex(index);
  setSessionFlushed(true);
  log(`flush: OK (${mergedPerTurn.length} turns saved, sid=${sessionId || "id-less"})`);

  setSession({ turns: [], totalInput: 0, totalOutput: 0, totalCacheRead: 0, totalCost: 0, modelUsage: {} });

  clearCheckpoint();
  purgeWorkspaceSectionsCache();
  } catch (e) {
    log(`flush: FAILED ${String(e).slice(0, 200)}`);
  }
}

