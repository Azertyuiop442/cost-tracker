
import type { ModApi } from "@commandcode/harness";
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, renameSync } from "node:fs";

export type {
  UsageRecord, ModelPrice, PricingTable, SessionStats, ProjectData,
} from "./types.ts";
export {
  normalizeModelId, basename, fuzzyMatchModel, clamp, isValidPricingTable,
  computeCost, cacheSavingsFor, priceFor, getPricing, canonicalizeModel,
} from "./pricing.ts";
export { fmtTokens, fmtCost, fmtCtx, pickUsage, cleanLen } from "./format.ts";
export { workspaceMatches } from "./workspace.ts";
export { dedupeIdlessSessionsPure } from "./dedupe.ts";

import type { ProjectData, UsageRecord, SessionStats } from "./types.ts";
import { workspaceMatches } from "./workspace.ts";
import { dedupeIdlessSessionsPure } from "./dedupe.ts";
import {
  BRIDGE_DIR, autoDisplay, currentSessionId, dashboardDetected, getTty,
  harnessSessionId, lastModelSeen, lastSeenSessionId, pushDashboardStats,
  readBridgeJson, session, sessionFlushed, writeBridgeJson,
  setSession, setSessionFlushed, setDashboardDetected, setAutoDisplay,
  setHarnessSessionId, setLastSeenSessionId, setLastModelSeen,
  setLastCompactionAt,
} from "./state.ts";
import { computeCost, getPricing, normalizeModelId, priceFor, canonicalizeModel } from "./pricing.ts";
import { displayName, f } from "./display.ts";
import { fmtCost, fmtTokens, panel, pick, pickUsage, pushCostModal } from "./format.ts";
import { HISTORY_DIR, deleteSessionFile, loadIndex, saveIndex, sessionFileName } from "./persistence.ts";
import { purgeWorkspaceSectionsCache } from "./history.ts";
import {
  clearCheckpoint, flushSessionToProject, requestAlreadySeen,
  restoreCheckpoint, scheduleCheckpoint,
} from "./checkpoint.ts";
import { log } from "./debug.ts";

async function cleanProjectHistory(cmd: ModApi, scope: string): Promise<{ message: string } | undefined> {
  try {
    if (scope === "session") {
      setSession({ turns: [], totalInput: 0, totalOutput: 0, totalCacheRead: 0, totalCost: 0, modelUsage: {} });
      setSessionFlushed(false);
      purgeWorkspaceSectionsCache();
      clearCheckpoint();
      await pushDashboardStats(cmd);
      return { message: panel("cost clean", [f.green(f.bold("current session cleared"))]) };
    }
    const index = await loadIndex();
    if (index.sessions.length === 0) {
      return { message: panel("cost clean", [f.muted("no saved history")]) };
    }
    const ws = process.cwd().replace(/\/$/, "");
    const purgeAll = scope === "all";
    let removed = 0;
    let removedTurns = 0;
    const kept: ProjectData["sessions"] = [];
    for (const s of index.sessions) {
      const matches = purgeAll || workspaceMatches(s.workspace, ws);
      if (matches) {
        removed++;
        removedTurns += s.turns || 0;
        if (s.sessionId || s.date) {
          deleteSessionFile(s.sessionId || s.date);
        } else {
          kept.push(s);
        }
      } else {
        kept.push(s);
      }
    }
    if (removed === 0) {
      return { message: panel("cost clean", [f.muted(`no history matching workspace: ${ws}`)]) };
    }
    index.sessions = kept;
    index.updatedAt = Date.now();
    await saveIndex(index);
    purgeWorkspaceSectionsCache();
    await pushDashboardStats(cmd);
    const scopeLabel = purgeAll ? "all workspaces" : "this workspace";
    return {
      message: panel("cost clean", [
        f.green(f.bold(`purged ${removed} session(s) (${removedTurns} turns)`)),
        f.muted(`scope: ${scopeLabel}`),
      ]),
    };
  } catch (e: any) {
    return { message: panel("cost clean", [f.red(`error: ${e?.message || e}`)]) };
  }
}

export default function costTracker(cmd: ModApi) {
  setDashboardDetected(false);
  setHarnessSessionId(undefined);
  setLastSeenSessionId(undefined);
  setLastModelSeen(undefined);
  setLastCompactionAt(undefined);
  setSession({
    turns: [],
    totalInput: 0,
    totalOutput: 0,
    totalCacheRead: 0,
    totalCost: 0,
    modelUsage: {},
  });
  setSessionFlushed(false);

  restoreCheckpoint();

  pushDashboardStats(cmd).catch((e: unknown) => log(`startup push: ${String(e)}`));
  setInterval(() => {
    pushDashboardStats(cmd).catch((e: unknown) => log(`heartbeat: ${String(e)}`));
  }, 30_000);

  cmd.commands({
    "cost": async () => {
      const pricing = await getPricing(cmd);
      const s = session;
      const turnsCount = s.turns.length;

      let totalSaved = 0;
      for (const t of s.turns) {
        totalSaved += cacheSavingsFor(t.model, t.cacheReadTokens, pricing);
      }

      const activeModel = lastModelSeen || s.turns[s.turns.length - 1]?.model;
      const lastInput = s.turns[s.turns.length - 1]?.inputTokens || 0;
      let ctxGauge = "";
      if (activeModel) {
        const mp = priceFor(activeModel, pricing);
        if (mp?.contextWindow && mp.contextWindow > 0 && lastInput > 0) {
          const pct = Math.min(100, Math.round((lastInput / mp.contextWindow) * 100));
          const colorFn = pct >= 80 ? f.red : pct >= 50 ? f.peach : f.green;
          ctxGauge = `  ${f.muted("context:")} ${colorFn(`${fmtTokens(lastInput)}/${fmtTokens(mp.contextWindow)} (${pct}%)`)}`;
        }
      }

      const costStr = fmtCost(s.totalCost);
      const lines = [
        f.bold(costStr) + (totalSaved > 0 ? `  ${f.green(`saved ${fmtCost(totalSaved)}`)}` : "") + ctxGauge,
        `${f.muted("tokens:")} ${fmtTokens(s.totalInput)} in · ${fmtTokens(s.totalOutput)} out · ${fmtTokens(s.totalCacheRead)} cache`,
        `${f.muted("turns:")}  ${turnsCount}${turnsCount > 0 ? `  ${f.muted(`avg/turn: ${fmtCost(s.totalCost / turnsCount)}`)}` : ""}`,
      ];

      const models = Object.entries(s.modelUsage);
      if (models.length > 0) {
        lines.push(f.muted("─".repeat(24)));
        for (const [m, u] of models) {
          const pct = s.totalCost > 0 ? Math.round((u.cost / s.totalCost) * 100) : 0;
          const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
          const name = displayName(m);
          lines.push(`${f.cyan(name.padEnd(16))} ${fmtCost(u.cost).padStart(8)}  ${f.muted(bar)} ${String(pct).padStart(3)}%`);
        }
      }

      if (turnsCount === 0) {
        lines.push(f.muted("no turns recorded yet in this session"));
      }

      return { message: panel("cost session", lines) };
    },

    "cost-toggle": async () => {
      setAutoDisplay(!autoDisplay);
      return {
        message: panel("cost", [
          `auto-display is now ${autoDisplay ? f.green(f.bold("ON")) : f.red(f.bold("OFF"))}`,
        ]),
      };
    },

    "cost-reset": async () => {
      setSession({
        turns: [],
        totalInput: 0,
        totalOutput: 0,
        totalCacheRead: 0,
        totalCost: 0,
        modelUsage: {},
      });
      setSessionFlushed(false);
      purgeWorkspaceSectionsCache();
      clearCheckpoint();
      await pushDashboardStats(cmd);
      return { message: panel("cost", [f.green(f.bold("session stats reset"))]) };
    },

    "cost-total": async () => {
      const pricing = await getPricing(cmd);
      const s = session;
      let totalSaved = 0;
      for (const t of s.turns) {
        totalSaved += cacheSavingsFor(t.model, t.cacheReadTokens, pricing);
      }
      const savedStr = totalSaved > 0 ? `  ${f.green(`(saved ${fmtCost(totalSaved)})`)}` : "";
      return {
        message: `${f.bold(fmtCost(s.totalCost))}${savedStr} ${f.muted(`· ${s.turns.length} turns · ${fmtTokens(s.totalInput + s.totalOutput)} tokens`)}`,
      };
    },

    "cost-history": async () => {
      const s = session;
      if (s.turns.length === 0) {
        return { message: panel("cost history", [f.muted("no turns recorded in this session")]) };
      }
      const lines: string[] = [];
      s.turns.forEach((t, i) => {
        const time = new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const name = displayName(t.model);
        lines.push(
          `${f.muted(`#${String(i + 1).padStart(2)}`)} ${f.muted(time)} ${f.cyan(name.padEnd(14))} ` +
          `${fmtTokens(t.inputTokens).padStart(6)} in ${fmtTokens(t.outputTokens).padStart(6)} out ` +
          `${t.cacheReadTokens > 0 ? f.green(`${fmtTokens(t.cacheReadTokens)} cache `) : ""}` +
          `${f.bold(fmtCost(t.cost).padStart(8))}`
        );
      });
      return { message: panel(`cost history (${s.turns.length} turns)`, lines) };
    },

    "cost-models": async () => {
      const s = session;
      const models = Object.entries(s.modelUsage);
      if (models.length === 0) {
        return { message: panel("cost models", [f.muted("no models used in this session")]) };
      }
      const lines: string[] = [];
      for (const [m, u] of models) {
        const pct = s.totalCost > 0 ? Math.round((u.cost / s.totalCost) * 100) : 0;
        lines.push(
          `${f.cyan(displayName(m).padEnd(18))} ` +
          `${fmtCost(u.cost).padStart(8)}  ` +
          `${f.muted(`${u.turns} turns`)}  ` +
          `${f.muted(`${fmtTokens(u.input)} in / ${fmtTokens(u.output)} out`)}  ` +
          `${f.bold(`${pct}%`)}`
        );
      }
      return { message: panel("cost models breakdown", lines) };
    },

    "cost-project": async () => {
      const index = await loadIndex();
      if (index.sessions.length === 0 && session.turns.length === 0) {
        return { message: panel("cost project", [f.muted("no project history recorded")]) };
      }
      let totalCost = 0;
      let totalSaved = 0;
      let totalTurns = 0;
      let totalInput = 0;
      let totalOutput = 0;
      for (const s of index.sessions) {
        totalCost += s.cost || 0;
        totalSaved += s.saved || 0;
        totalTurns += s.turns || 0;
        totalInput += s.input || 0;
        totalOutput += s.output || 0;
      }
      const lines = [
        `${f.bold("Lifetime Project Usage")}`,
        `${f.muted("Total Cost:")}     ${f.bold(fmtCost(totalCost))} ${totalSaved > 0 ? f.green(`(saved ${fmtCost(totalSaved)})`) : ""}`,
        `${f.muted("Total Turns:")}    ${totalTurns}`,
        `${f.muted("Total Tokens:")}   ${fmtTokens(totalInput + totalOutput)} (${fmtTokens(totalInput)} in · ${fmtTokens(totalOutput)} out)`,
        `${f.muted("Saved Sessions:")} ${index.sessions.length}`,
      ];
      return { message: panel("cost project lifetime", lines) };
    },

    "cost-clean": async (args: string) => {
      const scope = (args || "").trim().toLowerCase() || "workspace";
      return cleanProjectHistory(cmd, scope);
    },

    "cost-help": async () => {
      const lines = [
        `${f.cyan("/cost")}          ${f.muted(" - Show current session cost summary & context gauge")}`,
        `${f.cyan("/cost-history")}  ${f.muted(" - Show per-turn breakdown with timestamps")}`,
        `${f.cyan("/cost-models")}   ${f.muted(" - Show breakdown per AI model used")}`,
        `${f.cyan("/cost-project")}  ${f.muted(" - Show lifetime project costs & prompt cache savings")}`,
        `${f.cyan("/cost-total")}    ${f.muted(" - Compact single-line summary")}`,
        `${f.cyan("/cost-toggle")}   ${f.muted(" - Toggle auto-display on/off after each turn")}`,
        `${f.cyan("/cost-reset")}    ${f.muted(" - Reset current in-memory session stats")}`,
        `${f.cyan("/cost-clean")}    ${f.muted(" - Clean history [session|workspace|all]")}`,
      ];
      return { message: panel("cost tracker commands", lines) };
    },
  });

  cmd.hooks({
    onStop: async (context: any) => {
      try {
        const usage = pickUsage(context?.usage || context?.response?.usage);
        const model = context?.model || lastModelSeen || "unknown";
        if (model && model !== "unknown") setLastModelSeen(model);
        if (context?.sessionId) setHarnessSessionId(context.sessionId);

        if (usage && (usage.inputTokens > 0 || usage.outputTokens > 0 || usage.cacheReadTokens > 0)) {
          const pricing = await getPricing(cmd);
          const turnCost = computeCost(model, usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, pricing);

          const record: UsageRecord = {
            model: canonicalizeModel(model, pricing),
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cacheReadTokens: usage.cacheReadTokens,
            cost: turnCost,
            timestamp: Date.now(),
          };

          const s = session;
          s.turns.push(record);
          s.totalInput += usage.inputTokens;
          s.totalOutput += usage.outputTokens;
          s.totalCacheRead += usage.cacheReadTokens;
          s.totalCost += turnCost;

          if (!s.modelUsage[record.model]) {
            s.modelUsage[record.model] = { turns: 0, cost: 0, input: 0, output: 0 };
          }
          s.modelUsage[record.model].turns++;
          s.modelUsage[record.model].cost += turnCost;
          s.modelUsage[record.model].input += usage.inputTokens;
          s.modelUsage[record.model].output += usage.outputTokens;

          scheduleCheckpoint();
          await pushDashboardStats(cmd);

          if (autoDisplay) {
            const saved = cacheSavingsFor(record.model, record.cacheReadTokens, pricing);
            const savedStr = saved > 0 ? ` ${f.green(`(-${fmtCost(saved)})`)}` : "";
            return {
              message: `${f.cyan("💰")} ${f.bold(fmtCost(turnCost))}${savedStr} ${f.muted(`(session: ${fmtCost(s.totalCost)})`)}`,
            };
          }
        }
      } catch (err) {
        log(`onStop error: ${err}`);
      }
      return undefined;
    },
  });
}

