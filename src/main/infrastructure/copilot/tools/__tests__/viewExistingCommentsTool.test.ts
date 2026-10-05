import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createViewExistingCommentsTool } from '../viewExistingCommentsTool';
import { CodeReviewProvider } from '../../../providers/CodeReviewProvider';
import { ExistingPRCommentThread } from '../../../../../types';

describe('createViewExistingCommentsTool', () => {
  let mockProvider: Partial<CodeReviewProvider>;
  let mockThreads: ExistingPRCommentThread[];

  beforeEach(() => {
    mockThreads = [
      {
        id: 101,
        status: 'active',
        isResolved: false,
        type: 'general',
        comments: [
          {
            id: 1,
            author: 'Alice',
            content: 'Please check auth flow and security tokens.',
            publishedDate: '2026-10-01T10:00:00Z',
          },
        ],
      },
      {
        id: 102,
        status: 'fixed',
        isResolved: true,
        type: 'line',
        file: 'src/auth/service.ts',
        lineRange: {
          startLine: 10,
          endLine: 15,
        },
        comments: [
          {
            id: 1,
            author: 'Bob',
            content: 'Token validation is missing here.',
            publishedDate: '2026-10-01T11:00:00Z',
          },
        ],
      },
      {
        id: 103,
        status: 'closed',
        isResolved: true,
        type: 'general',
        comments: [
          {
            id: 1,
            author: 'Charlie',
            content: 'General architecture discussion about database access.',
            publishedDate: '2026-10-01T12:00:00Z',
          },
        ],
      },
      {
        id: 104,
        status: 'active',
        isResolved: false,
        type: 'line',
        file: 'src/utils/helpers.ts',
        lineRange: {
          startLine: 50,
          endLine: 55,
        },
        comments: [
          {
            id: 1,
            author: 'Dave',
            content: 'Unused helper function.',
            publishedDate: '2026-10-01T13:00:00Z',
          },
        ],
      },
    ];

    mockProvider = {
      getPRCommentThreads: vi.fn().mockResolvedValue(mockThreads),
    };
  });

  it('should have correct name, parameters, and description', () => {
    const tool = createViewExistingCommentsTool(
      mockProvider as CodeReviewProvider,
      '/repo/path',
      '123',
    );
    expect(tool.name).toBe('get_existing_comments');
    expect(tool.parameters.properties).toHaveProperty('keywords');
    expect(tool.parameters.properties).toHaveProperty('file');
    expect(tool.parameters.properties).toHaveProperty('startLine');
    expect(tool.parameters.properties).toHaveProperty('endLine');
  });

  it('should return error if provider does not support getPRCommentThreads', async () => {
    const unsupportedProvider: Partial<CodeReviewProvider> = {};
    const tool = createViewExistingCommentsTool(
      unsupportedProvider as CodeReviewProvider,
      '/repo/path',
      '123',
    );
    const result = await tool.handler({});
    expect(result).toContain('does not support fetching existing PR comments');
  });

  it('should filter general comments by keywords when file is omitted', async () => {
    const tool = createViewExistingCommentsTool(
      mockProvider as CodeReviewProvider,
      '/repo/path',
      '123',
    );

    // Searching for "tokens" without a file - only thread 101 is general and contains "tokens".
    // Thread 102 also contains "Token", but it is a line comment, so it MUST NOT match when file is omitted!
    const result = await tool.handler({ keywords: 'tokens' });

    expect(result).toContain('Thread #101');
    expect(result).toContain('General PR Comment');
    expect(result).toContain('Please check auth flow and security tokens.');
    // Must NOT contain thread 102
    expect(result).not.toContain('Thread #102');
  });

  it('should filter line comments by file and keywords (file-based keyword search)', async () => {
    const tool = createViewExistingCommentsTool(
      mockProvider as CodeReviewProvider,
      '/repo/path',
      '123',
    );

    // Searching for "validation" on "src/auth/service.ts"
    const result = await tool.handler({
      file: 'src/auth/service.ts',
      keywords: 'validation',
    });

    expect(result).toContain('Thread #102');
    expect(result).toContain('Line Comment on src/auth/service.ts:10-15');
    expect(result).toContain('Token validation is missing here.');
    // Must NOT contain general thread 101
    expect(result).not.toContain('Thread #101');
    // Must NOT contain other files (thread 104)
    expect(result).not.toContain('Thread #104');
  });

  it('should filter line comments by file and line range', async () => {
    const tool = createViewExistingCommentsTool(
      mockProvider as CodeReviewProvider,
      '/repo/path',
      '123',
    );

    const result = await tool.handler({
      file: 'src/auth/service.ts',
      startLine: 12,
      endLine: 14,
    });

    expect(result).toContain('Thread #102');
    expect(result).toContain('Line Comment on src/auth/service.ts:10-15');
    expect(result).toContain('Resolved: YES');
    expect(result).toContain('Token validation is missing here.');
    expect(result).not.toContain('Thread #101');
    expect(result).not.toContain('Thread #104');
  });

  it('should cache threads and avoid fetching again on multiple calls', async () => {
    const tool = createViewExistingCommentsTool(
      mockProvider as CodeReviewProvider,
      '/repo/path',
      '123',
    );

    await tool.handler({ keywords: 'auth' });
    await tool.handler({ file: 'src/utils/helpers.ts' });

    expect(mockProvider.getPRCommentThreads).toHaveBeenCalledTimes(1);
  });

  it('should return all threads if neither keywords nor file filter is provided', async () => {
    const tool = createViewExistingCommentsTool(
      mockProvider as CodeReviewProvider,
      '/repo/path',
      '123',
    );

    const result = await tool.handler({});

    expect(result).toContain('Found 4 relevant comment thread(s)');
    expect(result).toContain('Thread #101');
    expect(result).toContain('Thread #102');
    expect(result).toContain('Thread #103');
    expect(result).toContain('Thread #104');
  });

  it('should return not found message when no threads match', async () => {
    const tool = createViewExistingCommentsTool(
      mockProvider as CodeReviewProvider,
      '/repo/path',
      '123',
    );

    const result = await tool.handler({ keywords: 'nonexistent-topic' });
    expect(result).toContain(
      'No existing comment threads found matching the specified criteria.',
    );
  });
});
