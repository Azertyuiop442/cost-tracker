
import { appendFileSync, statSync, writeFileSync, renameSync, existsSync } from "node:fs";

const LOG_PATH = `${process.env.CC_SIDEBAR_DIR || "/tmp/cc-sidebar"}/cost-tracker.log`;
const PREV_PATH = `${LOG_PATH}.prev`;
const MAX_BYTES = 2 * 1024 * 1024;

let rotated = false;

function rotateOnce(): void {
  if (rotated) return;
  rotated = true;
  try {
    if (existsSync(LOG_PATH)) {
      renameSync(LOG_PATH, PREV_PATH);
    }
  } catch {}
}

export function log(msg: string): void {
  try {
    rotateOnce();
    const line = `${new Date().toISOString().slice(11, 23)} [cost-tracker] ${msg}\n`;
    try {
      if (statSync(LOG_PATH).size > MAX_BYTES) writeFileSync(LOG_PATH, line);
      else appendFileSync(LOG_PATH, line);
    } catch {
      appendFileSync(LOG_PATH, line);
    }
  } catch {}
}

