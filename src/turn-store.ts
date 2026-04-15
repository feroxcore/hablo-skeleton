import type { StoredTurnRecord } from "./types";

interface TurnStoreEnv {
  TURN_STATE?: KVNamespace;
}

interface SessionTurnPointer {
  turnId: string;
  createdAt: string;
}

const memoryTurns = new Map<string, StoredTurnRecord>();
const memorySessionIndex = new Map<string, SessionTurnPointer[]>();

function turnKey(turnId: string) {
  return `turn:${turnId}`;
}

function sessionIndexKey(sessionId: string, createdAt: string, turnId: string) {
  return `session:${sessionId}:turn:${createdAt}:${turnId}`;
}

function normalizeLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 20;
  }

  return Math.min(Math.floor(parsed), 100);
}

function sortDescByCreatedAt<T extends { createdAt: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function parseRecord(value: unknown): StoredTurnRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<StoredTurnRecord>;
  if (!record.turnId || !record.sessionId || !record.createdAt || !record.status) {
    return null;
  }

  return record as StoredTurnRecord;
}

export function parseTurnsLimit(searchParams: URLSearchParams): number {
  return normalizeLimit(searchParams.get("limit"));
}

export async function persistTurnRecord(
  env: TurnStoreEnv,
  record: StoredTurnRecord
): Promise<void> {
  if (env.TURN_STATE) {
    await env.TURN_STATE.put(turnKey(record.turnId), JSON.stringify(record));
    await env.TURN_STATE.put(
      sessionIndexKey(record.sessionId, record.createdAt, record.turnId),
      JSON.stringify({
        turnId: record.turnId,
        createdAt: record.createdAt,
        status: record.status
      })
    );
    return;
  }

  memoryTurns.set(record.turnId, record);

  const existing = memorySessionIndex.get(record.sessionId) ?? [];
  const withoutCurrent = existing.filter((item) => item.turnId !== record.turnId);
  withoutCurrent.push({
    turnId: record.turnId,
    createdAt: record.createdAt
  });
  memorySessionIndex.set(
    record.sessionId,
    sortDescByCreatedAt(withoutCurrent)
  );
}

export async function getTurnRecord(
  env: TurnStoreEnv,
  turnId: string
): Promise<StoredTurnRecord | null> {
  if (env.TURN_STATE) {
    const value = await env.TURN_STATE.get(turnKey(turnId), "json");
    return parseRecord(value);
  }

  return memoryTurns.get(turnId) ?? null;
}

export async function listSessionTurnRecords(
  env: TurnStoreEnv,
  sessionId: string,
  limit: number
): Promise<StoredTurnRecord[]> {
  if (env.TURN_STATE) {
    const prefix = `session:${sessionId}:turn:`;
    const pointers: SessionTurnPointer[] = [];
    let cursor: string | undefined;
    let listComplete = false;

    while (!listComplete) {
      const page = await env.TURN_STATE.list({ prefix, limit: 1000, cursor });
      pointers.push(
        ...page.keys
          .map((key) => {
            const parts = key.name.split(":");
            const turnId = parts.at(-1);
            const createdAt = parts.at(-2);
            if (!turnId || !createdAt) {
              return null;
            }

            return { turnId, createdAt };
          })
          .filter((item): item is SessionTurnPointer => item !== null)
      );

      listComplete = page.list_complete;
      cursor = !page.list_complete && "cursor" in page ? page.cursor : undefined;
    }

    const topPointers = sortDescByCreatedAt(pointers).slice(0, limit);

    const records = await Promise.all(
      topPointers.map((pointer) => getTurnRecord(env, pointer.turnId))
    );

    return records.filter((record): record is StoredTurnRecord => record !== null);
  }

  const pointers = memorySessionIndex.get(sessionId) ?? [];
  const target = sortDescByCreatedAt(pointers).slice(0, limit);
  const records = target
    .map((pointer) => memoryTurns.get(pointer.turnId))
    .filter((record): record is StoredTurnRecord => Boolean(record));

  return records;
}
