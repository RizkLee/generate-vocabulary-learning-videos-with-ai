import fs from "fs";
import path from "path";
import type { CostEntry, CostSummary } from "../types/index";
import { loadConfig } from "./config.js";

const COST_FILE = path.resolve("data/cost-log.json");

/** 各服务的估算单价 */
const COST_ESTIMATES: Record<string, number> = {
  "gemini-flash": 0.001,
  "gemini-tts": 0.01,
  "veo-8s": 1.2,
  "veo-8s-noaudio": 0.8,
  pixabay: 0,
  stt: 0.001,
};

function loadEntries(): CostEntry[] {
  if (!fs.existsSync(COST_FILE)) return [];
  return JSON.parse(fs.readFileSync(COST_FILE, "utf-8"));
}

function saveEntries(entries: CostEntry[]): void {
  fs.mkdirSync(path.dirname(COST_FILE), { recursive: true });
  fs.writeFileSync(COST_FILE, JSON.stringify(entries, null, 2));
}

/** 记录一次 API 调用的费用 */
export function logCost(
  service: CostEntry["service"],
  operation: string,
  cost: number,
  wordId: string,
): void {
  const entries = loadEntries();
  entries.push({
    service,
    operation,
    cost,
    timestamp: new Date().toISOString(),
    wordId,
  });
  saveEntries(entries);
}

/** 获取费用摘要 */
export function getCostSummary(): CostSummary {
  const entries = loadEntries();
  const total = entries.reduce((sum, e) => sum + e.cost, 0);
  const configuredBudget = Number(loadConfig().budget);
  const budget = Number.isFinite(configuredBudget) ? configuredBudget : 50;
  return {
    total: Math.round(total * 1000) / 1000,
    budget,
    remaining: Math.round((budget - total) * 1000) / 1000,
    entries,
  };
}

/** 检查是否超出预算 */
export function checkBudget(estimatedCost: number): {
  ok: boolean;
  remaining: number;
} {
  const summary = getCostSummary();
  return {
    ok: summary.remaining >= estimatedCost,
    remaining: summary.remaining,
  };
}

/** 获取预估费用 */
export function estimateCost(operation: string): number {
  return COST_ESTIMATES[operation] || 0;
}
