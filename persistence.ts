
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, renameSync } from 'node:fs';
import type { ProjectData } from './types.ts';
import { session, harnessSessionId } from './state.ts';
import { priceFor } from './pricing.ts';
import { log } from './debug.ts';

export const HISTORY_DIR = `${process.env.HOME}/.commandcode/mods/cost-tracker-history`;

export function sessionFileName(sessionId: string): string {
  const safe = (sessionId || `sess-${Date.now()}`).replace(/[^A-Za-z0-9_.-]/g, "_");
  return `${safe}.json`;
}

export function deleteSessionFile(sessionId: string): void {
  if (!sessionId) return;
  try {
    const path = `${HISTORY_DIR}/${sessionFileName(sessionId)}`;
    if (existsSync(path)) unlinkSync(path);
  } catch {}
}

export async function loadIndex(): Promise<ProjectData> {
  try {
    const path = `${HISTORY_DIR}/index.json`;
    if (!existsSync(path)) return emptyProject();
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as ProjectData;
    if (parsed?.totals) return parsed;
  } catch {}
  return emptyProject();
}

export async function saveIndex(data: ProjectData): Promise<void> {
  try {
    mkdirSync(HISTORY_DIR, { recursive: true });

    const compact: ProjectData = {
      sessions: data.sessions.map((s) => {
        const { perTurn: _pt, ...rest } = s;
        return rest as ProjectData["sessions"][number];
      }),
      totals: data.totals,
      modelTotals: data.modelTotals,
    };
    writeFileSync(`${HISTORY_DIR}/index.json`, JSON.stringify(compact, null, 2), "utf-8");
  } catch (e) {
    log(`saveIndex FAILED: ${String(e).slice(0, 200)}`);
  }
}

export function loadSessionFile(sessionId: string): ProjectData["sessions"][number] | null {
  try {
    const path = `${HISTORY_DIR}/${sessionFileName(sessionId)}`;
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function saveSessionFile(entry: ProjectData["sessions"][number]): void {
  try {
    mkdirSync(HISTORY_DIR, { recursive: true });
    const id = entry.sessionId || entry.date;
    writeFileSync(`${HISTORY_DIR}/${sessionFileName(id)}`, JSON.stringify(entry, null, 2), "utf-8");
  } catch (e) {
    log(`saveSessionFile FAILED (id=${entry.sessionId || entry.date}): ${String(e).slice(0, 200)}`);
  }
}

export function emptyProject(): ProjectData {
  return {
    sessions: [],
    totals: { turns: 0, input: 0, output: 0, cacheRead: 0, cost: 0, saved: 0 },
    modelTotals: {},
  };
}

function currentSessionId(): string {
  const fromHarness = harnessSessionId.trim();
  if (fromHarness) return fromHarness;
  return (process.env.COMMANDCODE_SESSION_ID || "").trim();
}

