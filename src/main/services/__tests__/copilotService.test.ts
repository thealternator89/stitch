/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CopilotService } from '../copilotService';
import { AppSettings, TicketData } from '../../../types';
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
    const settings: AppSettings = { copilotToken: 'test-token', prompts: {} };
    const ticket: TicketData = {
      id: '1',
      title: 'Test ticket',
      description: 'desc',
    };

    const responsePromise = service.generateTestCases(ticket, '', '', settings);

    // Flush setup microtasks using timer advance
    await vi.advanceTimersByTimeAsync(10);

    // Ensure session is set up and event listener is registered
    expect(mockClient.createSession).toHaveBeenCalled();
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
    const settings: AppSettings = { copilotToken: 'test-token', prompts: {} };
    const ticket: TicketData = {
      id: '1',
      title: 'Test ticket',
      description: 'desc',
    };

    const responsePromise = service.generateTestCases(ticket, '', '', settings);

    await vi.advanceTimersByTimeAsync(10);

    const checkExpectation = expect(responsePromise).rejects.toThrow(
      'Timeout after 60000ms waiting for response',
    );

    // Fast-forward past default timeout (60000ms)
    await vi.advanceTimersByTimeAsync(65000);

    await checkExpectation;
  });

  it('should not timeout if assistant.message_delta events keep resetting the timer', async () => {
    const settings: AppSettings = { copilotToken: 'test-token', prompts: {} };
    const ticket: TicketData = {
      id: '1',
      title: 'Test ticket',
      description: 'desc',
    };

    const responsePromise = service.generateTestCases(ticket, '', '', settings);

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
    const settings: AppSettings = { copilotToken: 'test-token', prompts: {} };
    const ticket: TicketData = {
      id: '1',
      title: 'Test ticket',
      description: 'desc',
    };

    const responsePromise = service.generateTestCases(ticket, '', '', settings);

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
    const settings: AppSettings = { copilotToken: 'test-token', prompts: {} };
    const ticket: TicketData = {
      id: '1',
      title: 'Test ticket',
      description: 'desc',
    };

    const responsePromise = service.generateTestCases(ticket, '', '', settings);

    await vi.advanceTimersByTimeAsync(10);

    // Start a tool execution
    sessionListener!({
      type: 'tool.execution_start',
      data: { toolName: 'test_tool', toolCallId: 'call_1', arguments: {} },
    });

    // Advance some time
    await vi.advanceTimersByTimeAsync(50000);

    // Finish the tool call (timeout resets here)
    sessionListener!({
      type: 'tool.execution_complete',
      data: { toolCallId: 'call_1', success: true },
    });

    const checkExpectation = expect(responsePromise).rejects.toThrow(
      'Timeout after 60000ms waiting for response',
    );

    // Advance time past the timeout (should now time out)
    await vi.advanceTimersByTimeAsync(65000);

    await checkExpectation;
  });
});
