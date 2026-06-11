// lib/queue.ts — Server-side utilities for reading/writing queue items

import fs from "fs";
import path from "path";
import type { QueueItem, ItemStatus } from "@/types/queue";

const ROOT_DIR = path.resolve(process.cwd(), "..");
const DATA_DIR = path.join(ROOT_DIR, "data");

export const QUEUE_DIR    = path.join(DATA_DIR, "queue");
export const APPROVED_DIR = path.join(DATA_DIR, "approved");
export const REJECTED_DIR = path.join(DATA_DIR, "rejected");

// Ensure directories exist
[QUEUE_DIR, APPROVED_DIR, REJECTED_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

function dirForStatus(status: ItemStatus): string {
  if (status === "approved") return APPROVED_DIR;
  if (status === "rejected") return REJECTED_DIR;
  return QUEUE_DIR;
}

function readJsonFile(filePath: string): QueueItem | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as QueueItem;
  } catch {
    return null;
  }
}

/** Read all items from a given directory */
function readDir(dir: string): QueueItem[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJsonFile(path.join(dir, f)))
    .filter((item): item is QueueItem => item !== null)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
}

/** Read all queue items across all three status buckets */
export function getAllItems(): QueueItem[] {
  return [
    ...readDir(QUEUE_DIR),
    ...readDir(APPROVED_DIR),
    ...readDir(REJECTED_DIR),
  ];
}

/** Read only pending items */
export function getPendingItems(): QueueItem[] {
  return readDir(QUEUE_DIR);
}

/** Read counts for the header stats */
export function getCounts(): {
  pending: number;
  approved: number;
  rejected: number;
} {
  return {
    pending:  readDir(QUEUE_DIR).length,
    approved: readDir(APPROVED_DIR).length,
    rejected: readDir(REJECTED_DIR).length,
  };
}

/** Move an item between status buckets and update its status field */
export function updateItemStatus(
  id: string,
  newStatus: "approved" | "rejected"
): { ok: boolean; error?: string } {
  // Search in all dirs
  const searchDirs = [QUEUE_DIR, APPROVED_DIR, REJECTED_DIR];
  let srcPath: string | null = null;

  for (const dir of searchDirs) {
    const candidate = path.join(dir, `${id}.json`);
    if (fs.existsSync(candidate)) {
      srcPath = candidate;
      break;
    }
  }

  if (!srcPath) {
    return { ok: false, error: `Item ${id} not found` };
  }

  const item = readJsonFile(srcPath);
  if (!item) {
    return { ok: false, error: `Could not read item ${id}` };
  }

  item.status = newStatus;
  const destDir  = dirForStatus(newStatus);
  const destPath = path.join(destDir, `${id}.json`);

  try {
    fs.writeFileSync(destPath, JSON.stringify(item, null, 2), "utf-8");
    // Remove from source only if different location
    if (srcPath !== destPath) {
      fs.unlinkSync(srcPath);
    }
    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Read the HTML content of a diagram file */
export function getDiagramHtml(relativePath: string): string | null {
  const absPath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(absPath)) return null;
  return fs.readFileSync(absPath, "utf-8");
}
