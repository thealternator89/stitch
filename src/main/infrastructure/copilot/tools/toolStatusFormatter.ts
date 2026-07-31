/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'path';

function extractCommandNames(cmd: string): string {
  if (!cmd) return 'unknown';
  // Split by command chaining operators: &&, ||, ;, |, or newlines
  const segments = cmd.split(/&&|\|\||;|\||\r?\n/);
  const names: string[] = [];
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    // Extract the first word (the executable name)
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)/);
    if (match) {
      names.push(match[1]);
    }
  }
  return names.length > 0 ? names.join(', ') : 'unknown';
}

export function formatToolStatus(
  type: 'start' | 'end',
  tool: string,
  success?: boolean,
  error?: string,
  args?: any,
): string | null {
  if (tool === 'report_intent') {
    if (type === 'start' && args?.intent) {
      return args.intent;
    }
    return null;
  }

  let detail = '';
  if (tool === 'grep') {
    detail = args?.pattern ? ` (${args.pattern})` : '';
  } else if (tool === 'view') {
    if (args?.path) {
      // Get last segment of path (filename)
      const filename = path.basename(args.path);
      detail = ` (${filename})`;
    } else {
      detail = ' (unknown)';
    }
  } else if (tool === 'bash' || tool === 'powershell') {
    const commandNames = extractCommandNames(args?.command);
    detail = ` (${commandNames})`;
  } else {
    // For other tools, we show the tool name as is (or can add more details)
  }

  if (type === 'start') {
    return `${tool}${detail}`;
  } else {
    // type === 'end'
    if (success) {
      return null; // don't output end logs on success
    } else {
      return `Tool failed: ${tool}${detail}${error ? ` - ${error}` : ''}`;
    }
  }
}
