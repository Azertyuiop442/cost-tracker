
import { readFileSync } from 'node:fs';
import type { ModApi } from '@commandcode/harness';
import { priceFor, isPeakHour, parsePeakWindows } from './pricing.ts';
import type { PricingTable } from './types.ts';

const ALERTS_FILE = `${process.env.HOME}/.commandcode/mods/cost-tracker-history/peak-alerts.json`;

let lastAlertKey = '';

function loadAlertIds(): Set<string> {
  try {
    const raw = readFileSync(ALERTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return new Set(
        Object.entries(parsed)
          .filter(([, v]) => v === true)
          .map(([k]) => k.replace(/^peakAlert\./, ''))
      );
    }
  } catch {}
  return new Set();
}

export function maybeNotifyPeak(
  cmd: ModApi,
  model: string,
  pricing: PricingTable,
  utcNow: Date = new Date()
): void {
  try {
    const ids = loadAlertIds();
    if (ids.size === 0) return;
    const price = priceFor(model, pricing);
    if (!price?.timeOfDay?.windows) return;
    const windows = price.timeOfDay.windows;
    const hour = utcNow.getUTCHours();
    const minute = utcNow.getUTCMinutes();
    if (!isPeakHour(windows, hour, minute)) {

      lastAlertKey = '';
      return;
    }
    const key = `${model}@${parsePeakWindows(windows).map(([s]) => s).join(',')}`;
    if (key === lastAlertKey) return;
    for (const id of ids) {
      if (
        id.toLowerCase() === price.id.toLowerCase() ||
        (id.split('/').pop() ?? '').toLowerCase() ===
          (price.id.split('/').pop() ?? '').toLowerCase()
      ) {
        lastAlertKey = key;
        void cmd.ui.notify(
          `[cost-tracker] PEAK HOURS active for ${price.id} (${windows}) - \
billing surcharge right now ($${price.timeOfDay.peak.inputCost}/$${price.timeOfDay.peak.outputCost} per M)`
        );
        return;
      }
    }
  } catch {}
}

