
import type { ProjectData } from './types.ts';

export function dedupeIdlessSessionsPure(
  sessions: ProjectData["sessions"]
): { kept: ProjectData["sessions"]; deleteIds: string[] } {
  const kept: ProjectData["sessions"] = [];
  const deleteIds: string[] = [];
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    if (!s.sessionId && s.workspace && s.date) {
      const key = `${s.workspace}|${s.date.slice(0, 10)}`;
      const idx = byDay.get(key);
      if (idx === undefined) {
        byDay.set(key, kept.length);
        kept.push(s);
      } else {

        const existing = kept[idx];
        if ((s.turns || 0) > (existing.turns || 0)) {
          kept[idx] = s;
          if (existing.date) deleteIds.push(existing.date);
        } else {
          if (s.date) deleteIds.push(s.date);
        }
      }
    } else {
      kept.push(s);
    }
  }
  return { kept, deleteIds };
}

