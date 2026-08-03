import { app } from 'electron';
import path from 'path';

export function getDatabasePath(): string {
  try {
    return path.join(app.getPath('userData'), 'stitch_history.db');
  } catch {
    // Fallback for tests or when app is not ready/mocked
    return path.join(process.cwd(), 'stitch_history_test.db');
  }
}
