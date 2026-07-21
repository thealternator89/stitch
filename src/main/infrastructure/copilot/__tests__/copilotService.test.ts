/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CopilotService } from '../copilotService';
import fs from 'fs';

// Mock electron
vi.mock('electron', () => {
  return {
    app: {
      getPath: (name: string) => {
        if (name === 'userData') {
          return '/mock/userData';
        }
        return '/mock/path';
      },
    },
  };
});

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
const originalReadFileSync = fs.readFileSync;

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

    vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
      const normalized = p.toString().replace(/\\/g, '/');
      if (
        normalized === '/mock/node' ||
        normalized ===
          '/mock/userData/copilot-cli/node_modules/@github/copilot' ||
        normalized ===
          '/mock/userData/copilot-cli/node_modules/@github/copilot/package.json' ||
        normalized ===
          '/mock/userData/copilot-cli/node_modules/@github/copilot/npm-loader.js'
      ) {
        return true;
      }
      return originalExistsSync(p);
    });

    vi.spyOn(fs, 'readFileSync').mockImplementation((p: any, options?: any) => {
      const normalized = p.toString().replace(/\\/g, '/');
      if (
        normalized ===
        '/mock/userData/copilot-cli/node_modules/@github/copilot/package.json'
      ) {
        return JSON.stringify({ version: '1.0.61', bin: 'npm-loader.js' });
      }
      return originalReadFileSync(p, options);
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
    fs.readFileSync = originalReadFileSync;
    fs.existsSync = originalExistsSync;
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

  it('should throw an error if Node.js path or Copilot script path cannot be resolved', async () => {
    // Mock files not existing so paths cannot be resolved
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    await expect(
      service.createClientAndSession('test-token', 'test-model', {}),
    ).rejects.toThrow(
      'Copilot CLI client cannot be started: Node.js executable or Copilot CLI script path could not be resolved',
    );
  });

  describe('Prompt Logging (STITCH_PROMPT_LOG)', () => {
    afterEach(() => {
      delete process.env.STITCH_PROMPT_LOG;
    });

    it('should write the prompt to file and create directories if STITCH_PROMPT_LOG is configured', async () => {
      const logPath = '/mock/path/to/my/prompt.log';
      process.env.STITCH_PROMPT_LOG = logPath;

      const mockExistsSync = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const mockMkdirSync = vi
        .spyOn(fs, 'mkdirSync')
        .mockImplementation(() => undefined as any);
      const mockAppendFileSync = vi
        .spyOn(fs, 'appendFileSync')
        .mockImplementation(() => {});

      const testService = new CopilotService();
      const responsePromise = testService.sendAndCollectStream(
        mockSession as any,
        'my-test-prompt-content',
      );

      await vi.advanceTimersByTimeAsync(10);
      sessionListener!({ type: 'session.idle' });
      await responsePromise;

      expect(mockExistsSync).toHaveBeenCalledWith('/mock/path/to/my');
      expect(mockMkdirSync).toHaveBeenCalledWith('/mock/path/to/my', {
        recursive: true,
      });
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        logPath,
        expect.stringContaining('my-test-prompt-content'),
        'utf8',
      );
    });

    it('should not write to file if STITCH_PROMPT_LOG is not configured', async () => {
      const mockAppendFileSync = vi.spyOn(fs, 'appendFileSync');

      const testService = new CopilotService();
      const responsePromise = testService.sendAndCollectStream(
        mockSession as any,
        'my-test-prompt-content',
      );

      await vi.advanceTimersByTimeAsync(10);
      sessionListener!({ type: 'session.idle' });
      await responsePromise;

      expect(mockAppendFileSync).not.toHaveBeenCalled();
    });

    it('should print an error to console but not block if writing to file fails', async () => {
      const logPath = '/mock/path/to/my/prompt.log';
      process.env.STITCH_PROMPT_LOG = logPath;

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {
        throw new Error('Disk full');
      });
      const mockConsoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const testService = new CopilotService();
      const responsePromise = testService.sendAndCollectStream(
        mockSession as any,
        'my-test-prompt-content',
      );

      await vi.advanceTimersByTimeAsync(10);
      sessionListener!({ type: 'session.idle' });
      const result = await responsePromise;

      expect(result).toBe(''); // completed successfully
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write prompt log'),
        expect.stringContaining('Disk full'),
      );
    });
  });

  describe('usage tracking', () => {
    it('should track and accumulate usage from assistant.usage events and default missing values to 0', async () => {
      const responsePromise = service.sendAndCollectStream(
        mockSession as any,
        'prompt',
      );

      await vi.advanceTimersByTimeAsync(10);

      expect(sessionListener).toBeTypeOf('function');

      // Emit assistant.usage event
      sessionListener!({
        type: 'assistant.usage',
        data: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 10,
          cost: 1.5,
          model: 'claude-3.5-sonnet',
        },
      });

      // Emit another usage event with some missing values to test fallback
      sessionListener!({
        type: 'assistant.usage',
        data: {
          inputTokens: 200,
          // outputTokens, cacheReadTokens are missing
        },
      });

      // Finalize the stream
      sessionListener!({
        type: 'session.idle',
      });

      await responsePromise;

      // Verify stats attached to session
      expect((mockSession as any).usage).toEqual({
        inputTokens: 300,
        outputTokens: 50,
        cacheReadTokens: 10,
        cost: 1.5,
        model: 'claude-3.5-sonnet',
      });
    });

    it('should NOT print to console if session.isPrReviewer is true', async () => {
      const customMockSession = {
        ...mockSession,
        isPrReviewer: true,
      };

      const responsePromise = service.sendAndCollectStream(
        customMockSession as any,
        'prompt',
      );

      await vi.advanceTimersByTimeAsync(10);

      sessionListener!({
        type: 'assistant.usage',
        data: {
          inputTokens: 10,
          outputTokens: 20,
          cacheReadTokens: 5,
          cost: 0.5,
        },
      });

      sessionListener!({
        type: 'session.idle',
      });

      await responsePromise;

      expect(customMockSession.usage).toEqual({
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 5,
        cost: 0.5,
      });
    });
  });
});
