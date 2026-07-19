import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubService } from '../gitHubService';
import {
  ATTRIBUTION_STATEMENT_GENERATED,
  ATTRIBUTION_STATEMENT_ASSISTED,
} from '../../constants';

describe('GitHubService', () => {
  let service: GitHubService;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    service = new GitHubService('test-token', 'test-owner', 'test-repo');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  describe('fetchTicket', () => {
    it('should successfully fetch an issue and map it to TicketData', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          number: 123,
          title: 'Test Issue Title',
          body: 'Test Issue Body',
        }),
      });

      const result = await service.fetchTicket('123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/issues/123',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            Accept: 'application/vnd.github+json',
          }),
        }),
      );

      expect(result).toEqual({
        id: '123',
        title: 'Test Issue Title',
        description: 'Test Issue Body',
        acceptanceCriteria: '',
      });
    });

    it('should throw an error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Issue not found',
      });

      await expect(service.fetchTicket('123')).rejects.toThrow(
        'GitHub API error (404): Issue not found',
      );
    });
  });

  describe('addComment', () => {
    it('should post a comment with default attribution', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await service.addComment('123', 'Sample comment text');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/issues/123/comments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            body: `Sample comment text\n\n${ATTRIBUTION_STATEMENT_GENERATED}`,
          }),
        }),
      );
    });

    it('should post a comment with edited attribution if specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await service.addComment('123', 'Sample comment text', { edited: true });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/issues/123/comments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            body: `Sample comment text\n\n${ATTRIBUTION_STATEMENT_ASSISTED}`,
          }),
        }),
      );
    });
  });

  describe('createTicket', () => {
    it('should post issue to repository with labels and parent issue reference in description', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ number: 456 }),
      });

      await service.createTicket(
        'Task',
        '123',
        {
          title: 'Sub-task title',
          description: 'Sub-task description',
        },
        { edited: false },
      );

      const expectedBody = [
        'Sub-task description',
        '',
        ATTRIBUTION_STATEMENT_GENERATED,
        '',
        'Parent Issue: #123',
      ].join('\n');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/issues',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            title: 'Sub-task title',
            body: expectedBody,
            labels: ['Task'],
          }),
        }),
      );
    });
  });

  describe('searchTickets', () => {
    it('should fetch exact match by ID if numeric and query search results', async () => {
      // 1st request: fetch exact match issue (OK)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          number: 123,
          title: 'Exact Match',
          body: 'Body 123',
        }),
      });

      // 2nd request: search query (returns list containing exact match and a new one)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { number: 123, title: 'Exact Match', body: 'Body 123' },
            { number: 456, title: 'Search Result', body: 'Body 456' },
          ],
        }),
      });

      const results = await service.searchTickets('123', 'Feature');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/issues/123',
        expect.any(Object),
      );

      const expectedQuery = encodeURIComponent(
        'repo:test-owner/test-repo is:issue 123 label:"Feature"',
      );
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.github.com/search/issues?q=${expectedQuery}`,
        expect.any(Object),
      );

      expect(results).toEqual([
        {
          id: '123',
          title: 'Exact Match',
          description: 'Body 123',
          acceptanceCriteria: '',
        },
        {
          id: '456',
          title: 'Search Result',
          description: 'Body 456',
          acceptanceCriteria: '',
        },
      ]);
    });
  });
});
