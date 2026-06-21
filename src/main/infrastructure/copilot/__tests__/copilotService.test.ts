/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CopilotService } from '../copilotService';
import fs from 'fs';

// Mock child_process to avoid running real shell commands
vi.mock('child_process', () => {
  return {
    exec: (cmd: string, cb: any) => {
      cb(null, { stdout: '/mock/node\n' });
    },
    execFile: (file: string, args: string[], cb: any) => {
      cb(null, { stdout: 'v22.0.0\n' });
    },
  };
});

const mockSession = {
  send: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn(),
};

const mockClient = {
  start: vi.fn(),
  stop: vi.fn(),
  createSession: vi.fn(),
  listModels: vi.fn(),
  getAuthStatus: vi.fn(),
  getStatus: vi.fn(),
};

// Use a regular function instead of arrow function so it can be called as a constructor
const mockClientClass = vi.fn().mockImplementation(function (this: any) {
  return mockClient;
});
const mockApproveAll = vi.fn();

const originalEval = global.eval;
const originalExistsSync = fs.existsSync;

describe('CopilotService', () => {
  let service: CopilotService;
  let sessionListener: ((event: any) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    global.eval = vi.fn().mockImplementation((val) => {
      if (val === 'import("@github/copilot-sdk")') {
        return Promise.resolve({
          CopilotClient: mockClientClass,
          approveAll: mockApproveAll,
        });
      }
      if (val === "require.resolve('@github/copilot-sdk')") {
        return '/mock/copilot/index.js';
      }
      try {
        return originalEval(val);
      } catch {
        return undefined;
      }
    });

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (p === '/mock/node' || p === '/mock/copilot/index.js') {
        return true;
      }
      return originalExistsSync(p);
    });

    service = new CopilotService();

    mockClient.createSession.mockResolvedValue(mockSession);
    mockClient.start.mockResolvedValue(undefined);
    mockClient.stop.mockResolvedValue(undefined);

    mockSession.on.mockImplementation((cb: (event: any) => void) => {
      sessionListener = cb;
      return () => {
        sessionListener = null;
      };
    });

    // Make mockSession.send resolve immediately
    mockSession.send.mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.eval = originalEval;
    vi.useRealTimers();
  });

  it('should successfully stream and complete a request', async () => {
    const responsePromise = service.sendAndCollectStream(
      mockSession as any,
      'prompt',
    );

    // Flush setup microtasks using timer advance
    await vi.advanceTimersByTimeAsync(10);

    expect(sessionListener).toBeTypeOf('function');

    // Emit some text
    sessionListener!({
      type: 'assistant.message_delta',
      data: { deltaContent: 'Hello ' },
    });
    sessionListener!({
      type: 'assistant.message_delta',
      data: { deltaContent: 'World' },
    });

    // Emit session idle to complete
    sessionListener!({ type: 'session.idle' });

    const result = await responsePromise;
    expect(result).toBe('Hello World');
  });

  it('should timeout if there is no activity for the timeout duration', async () => {
    const responsePromise = service.sendAndCollectStream(
      mockSession as any,
      'prompt',
    );

    await vi.advanceTimersByTimeAsync(10);

    const checkExpectation = expect(responsePromise).rejects.toThrow(
      'Timeout after 180000ms waiting for response',
    );

    // Fast-forward past default timeout (180000ms)
    await vi.advanceTimersByTimeAsync(185000);

    await checkExpectation;
  });

  it('should not timeout if assistant.message_delta events keep resetting the timer', async () => {
    const responsePromise = service.sendAndCollectStream(
      mockSession as any,
      'prompt',
    );

    await vi.advanceTimersByTimeAsync(10);

    // Advance time close to timeout but not quite, then emit delta
    await vi.advanceTimersByTimeAsync(50000);
    sessionListener!({
      type: 'assistant.message_delta',
      data: { deltaContent: 'Tick' },
    });

    // Advance time again, which would have timed out if not reset
    await vi.advanceTimersByTimeAsync(50000);
    sessionListener!({
      type: 'assistant.message_delta',
      data: { deltaContent: 'Tock' },
    });

    // Send complete
    sessionListener!({ type: 'session.idle' });

    const result = await responsePromise;
    expect(result).toBe('TickTock');
  });

  it('should not timeout if a tool call is in progress', async () => {
    const responsePromise = service.sendAndCollectStream(
      mockSession as any,
      'prompt',
    );

    await vi.advanceTimersByTimeAsync(10);

    // Start a tool execution
    sessionListener!({
      type: 'tool.execution_start',
      data: { toolName: 'test_tool', toolCallId: 'call_1', arguments: {} },
    });

    // Advance time past the timeout (should not time out because tool call is in progress)
    await vi.advanceTimersByTimeAsync(80000);

    // Finish the tool call
    sessionListener!({
      type: 'tool.execution_complete',
      data: { toolCallId: 'call_1', success: true },
    });

    // We complete immediately
    sessionListener!({ type: 'session.idle' });

    const result = await responsePromise;
    expect(result).toBe('');
  });

  it('should resume timeout monitoring after a tool call completes', async () => {
    const responsePromise = service.sendAndCollectStream(
      mockSession as any,
      'prompt',
    );

    await vi.advanceTimersByTimeAsync(10);

    // Start a tool execution
    sessionListener!({
      type: 'tool.execution_start',
      data: { toolName: 'test_tool', toolCallId: 'call_1', arguments: {} },
    });

    // Advance some time
    await vi.advanceTimersByTimeAsync(170000);

    // Finish the tool call (timeout resets here)
    sessionListener!({
      type: 'tool.execution_complete',
      data: { toolCallId: 'call_1', success: true },
    });

    const checkExpectation = expect(responsePromise).rejects.toThrow(
      'Timeout after 180000ms waiting for response',
    );

    // Advance time past the timeout (should now time out)
    await vi.advanceTimersByTimeAsync(185000);

    await checkExpectation;
  });

  it('should resiliently parse stream with leading noise and markdown wrappers', async () => {
    const lines: string[] = [];
    const responsePromise = service.sendAndCollectStream(
      mockSession as any,
      'prompt',
      (line) => {
        lines.push(line);
      },
    );

    await vi.advanceTimersByTimeAsync(10);

    sessionListener!({
      type: 'assistant.message_delta',
      data: { deltaContent: 'Here is the response:\n```json\n' },
    });
    sessionListener!({
      type: 'assistant.message_delta',
      data: { deltaContent: '{"title": "Story 1"}\n' },
    });
    sessionListener!({
      type: 'assistant.message_delta',
      data: { deltaContent: '{"title": "Story 2"}\n' },
    });
    sessionListener!({
      type: 'assistant.message_delta',
      data: { deltaContent: '```\nSome trailing explanation' },
    });

    sessionListener!({ type: 'session.idle' });

    const result = await responsePromise;
    expect(result).toBe(
      'Here is the response:\n```json\n{"title": "Story 1"}\n{"title": "Story 2"}\n```\nSome trailing explanation',
    );
    expect(lines).toEqual(['{"title": "Story 1"}', '{"title": "Story 2"}']);
  });

  it('should resiliently parse streams with nested curly braces', async () => {
    const lines: string[] = [];
    const responsePromise = service.sendAndCollectStream(
      mockSession as any,
      'prompt',
      (line) => {
        lines.push(line);
      },
    );

    await vi.advanceTimersByTimeAsync(10);

    sessionListener!({
      type: 'assistant.message_delta',
      data: { deltaContent: '{"title": "A", "details": {"score": 10}}' },
    });

    sessionListener!({ type: 'session.idle' });

    const result = await responsePromise;
    expect(result).toBe('{"title": "A", "details": {"score": 10}}');
    expect(lines).toEqual(['{"title": "A", "details": {"score": 10}}']);
  });

  it('should resiliently parse multiple JSON objects in a single delta', async () => {
    const lines: string[] = [];
    const responsePromise = service.sendAndCollectStream(
      mockSession as any,
      'prompt',
      (line) => {
        lines.push(line);
      },
    );

    await vi.advanceTimersByTimeAsync(10);

    sessionListener!({
      type: 'assistant.message_delta',
      data: { deltaContent: '{"id": 1}{"id": 2}' },
    });

    sessionListener!({ type: 'session.idle' });

    const result = await responsePromise;
    expect(result).toBe('{"id": 1}{"id": 2}');
    expect(lines).toEqual(['{"id": 1}', '{"id": 2}']);
  });

  it('should resiliently parse streams without newlines', async () => {
    const lines: string[] = [];
    const responsePromise = service.sendAndCollectStream(
      mockSession as any,
      'prompt',
      (line) => {
        lines.push(line);
      },
    );

    await vi.advanceTimersByTimeAsync(10);

    sessionListener!({
      type: 'assistant.message_delta',
      data: { deltaContent: '{"id":' },
    });
    sessionListener!({
      type: 'assistant.message_delta',
      data: { deltaContent: ' 3}' },
    });

    sessionListener!({ type: 'session.idle' });

    const result = await responsePromise;
    expect(result).toBe('{"id": 3}');
    expect(lines).toEqual(['{"id": 3}']);
  });

  it('should respect STITCH_COPILOT_TIMEOUT environment variable override', async () => {
    process.env.STITCH_COPILOT_TIMEOUT = '15000';
    try {
      const responsePromise = service.sendAndCollectStream(
        mockSession as any,
        'prompt',
      );

      await vi.advanceTimersByTimeAsync(10);

      const checkExpectation = expect(responsePromise).rejects.toThrow(
        'Timeout after 15000ms waiting for response',
      );

      // Advance past the environment-variable-defined timeout (15000ms)
      await vi.advanceTimersByTimeAsync(16000);

      await checkExpectation;
    } finally {
      delete process.env.STITCH_COPILOT_TIMEOUT;
    }
  });

  it('should create client and session correctly', async () => {
    const result = await service.createClientAndSession(
      'test-token',
      'test-model',
      { availableTools: [] },
    );
    expect(result.client).toBe(mockClient);
    expect(result.session).toBe(mockSession);
    expect(mockClientClass).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          GITHUB_TOKEN: 'test-token',
          COPILOT_TOKEN: 'test-token',
        }),
      }),
    );
    expect(mockClient.start).toHaveBeenCalled();
    expect(mockClient.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'test-model',
        availableTools: [],
        streaming: true,
      }),
    );
  });
});
