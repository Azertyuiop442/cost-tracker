
import type { ProjectData } from './types.ts';
import { loadIndex, loadSessionFile } from './persistence.ts';
import { session, sessionFlushed } from './state.ts';
import { fmtCost, fmtTokens } from './format.ts';
import { workspaceMatches } from './workspace.ts';

let workspaceSectionsCache: Array<{ heading: string; lines: string[] }> | null = null;

export function purgeWorkspaceSectionsCache(): void {
  workspaceSectionsCache = null;
}

export async function workspaceHistorySections(): Promise<Array<{ heading: string; lines: string[] }>> {
  if (workspaceSectionsCache) return workspaceSectionsCache;
  try {
    const index = await loadIndex();
    if (!Array.isArray(index.sessions)) return [];
    const ws = process.cwd().replace(/\/$/, "");
    const sessionLines: string[] = [];
    const perTurnLines: string[] = [];

    if (session.turns.length > 0 && !sessionFlushed) {
      const today = new Date().toISOString().slice(0, 10);

      const hitPct = session.totalInput > 0 ? Math.min(100, Math.round((session.totalCacheRead / session.totalInput) * 100)) : 0;
      sessionLines.push(
        `${today} · ${String(session.turns.length)} turns (in progress) · ${fmtTokens(session.totalInput)} in · ${fmtTokens(session.totalOutput)} out · cache hit ${hitPct}% · ${fmtCost(session.totalCost)}`
      );
      for (const [i, t] of session.turns.entries()) {
        const model = (t.model || "?").split("/").pop() || t.model || "?";

        const thp = i === 0 ? 0 : t.inputTokens > 0 ? Math.min(100, Math.round((t.cacheReadTokens / t.inputTokens) * 100)) : 0;
        perTurnLines.push(`${today} ${model} · ${fmtTokens(t.inputTokens)} in · ${fmtTokens(t.outputTokens)} out · cache hit ${thp}% · ${fmtCost(t.cost)}`);
      }
    }

    const bound: ProjectData["sessions"] = [];
    for (const s of index.sessions) {
      if (workspaceMatches(s.workspace, ws)) bound.push(s);
    }
    for (const s of bound.slice(-20)) {
      const date = (s.date || "").slice(0, 10) || "?";
      const hitPct = (s.input || 0) > 0 ? Math.min(100, Math.round(((s.cacheRead || 0) / (s.input || 1)) * 100)) : 0;
      sessionLines.push(
        `${date} · ${String(s.turns || 0)} turns · ${fmtTokens(s.input || 0)} in · ${fmtTokens(s.output || 0)} out · cache hit ${hitPct}% · ${fmtCost(s.cost || 0)}`
      );
    }

    for (const s of bound.slice(-5)) {
      const sid = s.sessionId || s.date;
      const full = loadSessionFile(sid);
      const turns = full?.perTurn || s.perTurn || [];
      const date = (s.date || "").slice(0, 10) || "?";
      for (const t of turns) {
        const model = (t.model || "?").split("/").pop() || t.model || "?";

        const thp = typeof t.cacheHitPct === "number" ? Math.min(100, t.cacheHitPct) : t.input > 0 ? Math.min(100, Math.round(((t.cacheRead || 0) / t.input) * 100)) : 0;
        perTurnLines.push(`${date} ${model} · ${fmtTokens(t.input || 0)} in · ${fmtTokens(t.output || 0)} out · cache hit ${thp}% · ${fmtCost(t.cost || 0)}`);
      }
    }
    const out: Array<{ heading: string; lines: string[] }> = [];
    if (sessionLines.length > 0) out.push({ heading: "Workspace", lines: sessionLines });
    if (perTurnLines.length > 0) out.push({ heading: "Turns", lines: perTurnLines });

    out.push({
      heading: "Total",
      lines: [
        `${String(index.totals?.turns || 0)} turns · ${fmtTokens(index.totals?.input || 0)} in · ${fmtTokens(index.totals?.output || 0)} out · ${fmtCost(index.totals?.cost || 0)}`,
      ],
    });
    workspaceSectionsCache = out;
    return out;
  } catch {
    return [];
  }
}

