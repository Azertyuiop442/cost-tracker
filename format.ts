
import { BRIDGE_DIR, readBridgeJson, writeBridgeJson } from './state.ts';
import { f } from './display.ts';
import { mkdirSync } from 'node:fs';

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export function fmtCost(n: number): string {
  if (!isFinite(n) || n <= 0) return "$0.00";
  if (n >= 100) return "$" + n.toFixed(0);
  if (n >= 1) return "$" + n.toFixed(2);

  return "$" + n.toFixed(2);
}

export function fmtCtx(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return Math.abs(v - Math.round(v)) < 0.05 ? `${Math.round(v)}M` : `${v.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return Math.abs(v - Math.round(v)) < 0.05 ? `${Math.round(v)}K` : `${v.toFixed(1)}K`;
  }
  return String(n);
}

export function pickUsage(u: any): { inputTokens: number; outputTokens: number; cacheReadTokens: number } {
  return {
    inputTokens: pick(u, "input_tokens", "inputTokens", "input", "promptTokens", "prompt_tokens"),
    outputTokens: pick(u, "output_tokens", "outputTokens", "output", "completionTokens", "completion_tokens"),
    cacheReadTokens: pick(u, "cache_read_input_tokens", "cacheReadInputTokens", "cacheReadTokens", "cache_read", "cacheRead"),
  };
}

export function pick(u: any, ...keys: string[]): number {
  for (const k of keys) {
    const v = u?.[k];
    if (typeof v === "number") return v;
  }
  return 0;
}

export function cleanLen(s: string): number {
  return (s || "").replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b\]8;;.*?\x1b\\/g, "").length;
}

function visualPadEnd(s: string, targetWidth: number): string {
  return s + " ".repeat(Math.max(0, targetWidth - cleanLen(s)));
}

export function panel(title: string, lines: string[]): string {
  const termWidth = (process.stdout as any)?.columns || 72;
  const contentWidth = Math.max(cleanLen(title) + 2, ...lines.map(l => cleanLen(l)));
  const w = Math.min(termWidth, Math.max(34, contentWidth + 4));
  const innerW = w - 4;
  const trunc = (s: string): string => {
    const len = cleanLen(s);
    if (len <= innerW) return s;
    return s.slice(0, innerW - 1) + "…";
  };
  const top = "╔" + "═".repeat(w - 2) + "╗";
  const bot = "╚" + "═".repeat(w - 2) + "╝";
  const body = lines.map(l => "│ " + visualPadEnd(trunc(l), innerW) + " │");
  const parts = [top, ...body, bot];
  return parts.map(l => `\x1b[48;2;16;15;15m\x1b[38;2;206;205;195m${l}\x1b[0m`).join("\n");
}

export function pushCostModal(title: string, lines: string[], dash: boolean): { message?: string } {
  if (dash) {
    try {
      mkdirSync(BRIDGE_DIR, { recursive: true });
      const bridgePath = `${BRIDGE_DIR}/cost-tracker.json`;

      const existing = readBridgeJson<any>(bridgePath) || {};
      writeBridgeJson(
        bridgePath,
        {
          ...existing,
          modals: [
            {
              id: `cost-info-${Date.now()}`,
              title,
              pending: true,
              readonly: true,
              items: lines.slice(0, 40).map((l) => ({ label: l, value: "", detail: "" })),
              actions: [{ key: "esc", label: "Close", kind: "secondary" }],
            },
          ],
        },
      );
      return { message: undefined };
    } catch {

    }
  }
  return { message: "\n" + panel(title, lines) };
}

export function titledPanel(title: string, lines: string[]): string {
  const termWidth = (process.stdout as any)?.columns || 72;
  const contentWidth = Math.max(cleanLen(title) + 2, ...lines.map(l => cleanLen(l)));
  const w = Math.min(termWidth, Math.max(34, contentWidth + 4));
  const innerW = w - 4;
  const trunc = (s: string): string => {
    const len = cleanLen(s);
    if (len <= innerW) return s;
    return s.slice(0, innerW - 1) + "…";
  };
  const top = "╔" + "═".repeat(w - 2) + "╗";
  const bot = "╚" + "═".repeat(w - 2) + "╝";
  const titleLine = "║ " + visualPadEnd(trunc(f.bold(title)), innerW) + " ║";
  const sep = "╠" + "═".repeat(w - 2) + "╣";
  const body = lines.map(l => "│ " + visualPadEnd(trunc(l), innerW) + " │");
  const parts = [top, titleLine, sep, ...body, bot];
  return parts.map(l => `\x1b[48;2;16;15;15m\x1b[38;2;206;205;195m${l}\x1b[0m`).join("\n");
}

