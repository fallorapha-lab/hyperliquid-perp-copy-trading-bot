import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { AppConfig } from "../config.js";

type PaperLogRecord = Record<string, string | number | boolean | null | undefined>;

export function resolvePaperLogPath(config: AppConfig): string | null {
  if (!config.paperLogEnabled) return null;
  const p = config.paperLogFile?.trim();
  return p || null;
}

/**
 * Appends one JSON Lines record (newline-delimited JSON) for analysis / auditing.
 */
export async function appendPaperLog(
  logFilePath: string | null | undefined,
  record: PaperLogRecord,
): Promise<void> {
  if (!logFilePath?.trim()) return;
  const path = logFilePath.trim();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...record,
  }) + "\n";
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, line, "utf8");
}
