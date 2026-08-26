
export interface UsageRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;
  timestamp: number;
}

export interface ModelPrice {
  id: string;
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM?: number;

  contextWindow?: number;
}

export interface PricingTable {
  models: ModelPrice[];
  updatedAt: number;
}

export interface SessionStats {
  turns: UsageRecord[];
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCost: number;
  modelUsage: Record<string, { turns: number; cost: number; input: number; output: number }>;
}

export interface ProjectData {
  sessions: Array<{
    date: string;

    workspace?: string;

    sessionId?: string;
    turns: number;
    input: number;
    output: number;
    cacheRead: number;
    cost: number;
    saved: number;
    models: Record<string, { turns: number; cost: number }>;

    perTurn?: Array<{
      model: string;
      input: number;
      output: number;
      cacheRead: number;
      cost: number;
      time: number;

      cacheHitPct?: number;
    }>;
  }>;
  totals: {
    turns: number;
    input: number;
    output: number;
    cacheRead: number;
    cost: number;
    saved: number;
  };
  modelTotals: Record<string, { turns: number; cost: number }>;
}

