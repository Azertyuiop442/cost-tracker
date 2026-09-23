

import { existsSync, readFileSync } from 'node:fs';

export const CACHE_ALIVE_MS = 5 * 60_000;
export const CACHE_DECAY_MS = 25 * 60_000;
export const MARK_RED_MAX = 0.5;
export const MARK_GREEN_MIN = 0.9;
export const COLD_MARK_MS = 30 * 60_000;

export interface SidebarSession {
  id: string;
  lastAt: number;
}

export interface SessionMark {
  sessionId: string;
  color: string;
  cacheHitPct: number;
}

export interface CurrentSessionLive {
  id: string;
  lastAt: number;
  ratio: number | null;
  coldAt?: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function cacheFreshness(ageMs: number, aliveMs = CACHE_ALIVE_MS, decayMs = CACHE_DECAY_MS): number {
  if (!Number.isFinite(ageMs) || ageMs <= aliveMs) return 1;
  if (decayMs <= 0) return 0;
  return clamp01(1 - (ageMs - aliveMs) / decayMs);
}

export function effectiveCacheRatio(ratio: number | null, ageMs: number): number {
  const base = ratio === null || !Number.isFinite(ratio) ? 1 : clamp01(ratio);
  return Number((base * cacheFreshness(ageMs)).toFixed(4));
}

export function markColorFor(effective: number): string {
  if (effective < MARK_RED_MAX) return 'red';
  if (effective < MARK_GREEN_MIN) return 'orange';
  return 'green';
}

export function buildMark(id: string, lastAt: number, ratio: number | null, now: number): SessionMark {
  const age = Math.max(0, now - lastAt);
  const effective = effectiveCacheRatio(ratio, age);
  return { sessionId: id, color: markColorFor(effective), cacheHitPct: Math.round(effective * 100) };
}

export function readSidebarSessions(sidebarDir: string): SidebarSession[] {
  try {
    const path = `${sidebarDir}/sessions.json`;
    if (!existsSync(path)) return [];
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { sessions?: Array<{ id?: unknown; lastAt?: unknown }> };
    if (!Array.isArray(parsed?.sessions)) return [];
    const out: SidebarSession[] = [];
    for (const raw of parsed.sessions) {
      const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
      const lastAt = Number(raw?.lastAt);
      if (!id || !Number.isFinite(lastAt)) continue;
      out.push({ id, lastAt });
    }
    return out;
  } catch {
    return [];
  }
}

export function computeSessionMarks(
  sessions: readonly SidebarSession[],
  opts: {
    now: number;
    ratioFor: (id: string) => number | null;
    current?: CurrentSessionLive | null;
  },
): SessionMark[] {
  const now = opts.now;
  const current = opts.current ?? null;
  const marks: SessionMark[] = [];
  const seen = new Set<string>();
  for (const session of sessions) {
    seen.add(session.id);
    const isCurrent = Boolean(current && current.id === session.id);
    const lastAt = isCurrent && current ? Math.max(session.lastAt, current.lastAt) : session.lastAt;
    const ratio = isCurrent && current ? (current.ratio ?? opts.ratioFor(session.id)) : opts.ratioFor(session.id);
    if (isCurrent && current?.coldAt && now - current.coldAt < COLD_MARK_MS) {
      marks.push({ sessionId: session.id, color: 'red', cacheHitPct: 0 });
      continue;
    }
    marks.push(buildMark(session.id, lastAt, ratio, now));
  }
  if (current?.id && !seen.has(current.id)) {
    const cold = Boolean(current.coldAt && now - current.coldAt < COLD_MARK_MS);
    marks.push(
      cold
        ? { sessionId: current.id, color: 'red', cacheHitPct: 0 }
        : buildMark(current.id, current.lastAt, current.ratio, now),
    );
  }
  return marks;
}

export function lastTurnCacheRatio(perTurn: Array<{ input?: number; cacheRead?: number }> | undefined): number | null {
  if (!Array.isArray(perTurn) || perTurn.length === 0) return null;
  for (let i = perTurn.length - 1; i >= 0; i--) {
    const input = Number(perTurn[i]?.input) || 0;
    if (input > 0) return clamp01((Number(perTurn[i]?.cacheRead) || 0) / input);
  }
  return null;
}
