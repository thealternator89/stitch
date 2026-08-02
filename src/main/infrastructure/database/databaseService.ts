import Database from 'better-sqlite3';
import { getDatabasePath } from './databasePath';
import { DbSession, DbLlmUsage } from '../../../types';

let dbInstance: Database.Database | null = null;

export function initializeDatabase(customPath?: string): void {
  if (dbInstance) {
    return;
  }
  const dbPath = customPath || getDatabasePath();
  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  // Create tables
  dbInstance
    .prepare(
      `
    CREATE TABLE IF NOT EXISTS usage_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name TEXT NOT NULL,
      context_reference TEXT,
      timestamp INTEGER NOT NULL,
      ai_output TEXT,
      pushed TEXT
    )
  `,
    )
    .run();

  dbInstance
    .prepare(
      `
    CREATE TABLE IF NOT EXISTS llm_usages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cache_read_tokens INTEGER NOT NULL,
      cost REAL NOT NULL,
      multiplier REAL,
      FOREIGN KEY(session_id) REFERENCES usage_sessions(id) ON DELETE CASCADE
    )
  `,
    )
    .run();
}

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    initializeDatabase();
  }
  return dbInstance!;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function createSession(
  toolName: string,
  contextReference: string | null,
  aiOutput: string | null = null,
): number {
  const db = getDatabase();
  const timestamp = Date.now();
  const stmt = db.prepare(`
    INSERT INTO usage_sessions (tool_name, context_reference, timestamp, ai_output, pushed)
    VALUES (?, ?, ?, ?, NULL)
  `);
  const info = stmt.run(toolName, contextReference, timestamp, aiOutput);
  return info.lastInsertRowid as number;
}

export function addLlmUsage(
  sessionId: number,
  label: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cost: number,
  multiplier: number | null = null,
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO llm_usages (session_id, label, model, input_tokens, output_tokens, cache_read_tokens, cost, multiplier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    sessionId,
    label,
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cost,
    multiplier,
  );
}

export function updateSessionAiOutput(
  sessionId: number,
  aiOutput: string,
): void {
  const db = getDatabase();
  const stmt = db.prepare(
    'UPDATE usage_sessions SET ai_output = ? WHERE id = ?',
  );
  stmt.run(aiOutput, sessionId);
}

export function recordPush(sessionId: number, pushedText: string): void {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE usage_sessions SET pushed = ? WHERE id = ?');
  stmt.run(pushedText, sessionId);
}

export function incrementPushedCommentCount(sessionId: number): void {
  const db = getDatabase();
  const row = db
    .prepare('SELECT pushed FROM usage_sessions WHERE id = ?')
    .get(sessionId) as { pushed: string | null } | undefined;

  let count = 0;
  if (row && row.pushed) {
    const match = row.pushed.match(/^(\d+)\s+PR\s+comment/i);
    if (match) {
      count = parseInt(match[1], 10);
    }
  }
  count++;
  const text = `${count} PR comment${count > 1 ? 's' : ''}`;
  recordPush(sessionId, text);
}

export function incrementPushedStoryCount(sessionId: number): void {
  const db = getDatabase();
  const row = db
    .prepare('SELECT pushed FROM usage_sessions WHERE id = ?')
    .get(sessionId) as { pushed: string | null } | undefined;

  let count = 0;
  if (row && row.pushed) {
    const match = row.pushed.match(/^(\d+)\s+stor/i);
    if (match) {
      count = parseInt(match[1], 10);
    }
  }
  count++;
  const text = `${count} stor${count > 1 ? 'ies' : 'y'}`;
  recordPush(sessionId, text);
}

export function getHistory(): DbSession[] {
  const db = getDatabase();
  const sessions = db
    .prepare('SELECT * FROM usage_sessions ORDER BY timestamp DESC')
    .all() as {
    id: number;
    tool_name: string;
    context_reference: string | null;
    timestamp: number;
    ai_output: string | null;
    pushed: string | null;
  }[];

  const result: DbSession[] = [];

  for (const session of sessions) {
    const usages = db
      .prepare('SELECT * FROM llm_usages WHERE session_id = ?')
      .all(session.id) as {
      id: number;
      session_id: number;
      label: string;
      model: string;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cost: number;
      multiplier: number | null;
    }[];

    const mappedUsages: DbLlmUsage[] = usages.map((u) => ({
      id: u.id,
      sessionId: u.session_id,
      label: u.label,
      model: u.model,
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheReadTokens: u.cache_read_tokens,
      cost: u.cost,
      multiplier: u.multiplier !== null ? u.multiplier : undefined,
    }));

    result.push({
      id: session.id,
      toolName: session.tool_name,
      contextReference: session.context_reference,
      timestamp: session.timestamp,
      aiOutput: session.ai_output,
      pushed: session.pushed,
      llmUsages: mappedUsages,
    });
  }

  return result;
}

export function clearHistory(): void {
  const db = getDatabase();
  // Clear sessions, cascaded delete handles llm_usages
  db.prepare('DELETE FROM usage_sessions').run();
}
