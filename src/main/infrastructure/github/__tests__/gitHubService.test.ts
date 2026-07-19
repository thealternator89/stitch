import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubService } from '../gitHubService';
import { ATTRIBUTION_STATEMENT_GENERATED } from '../../constants';

describe('GitHubService', () => {
  let service: GitHubService;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    service = new GitHubService('test-token', 'test-owner');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  describe('fetchTicket', () => {
    it('should successfully fetch an issue and map it to TicketData with composite ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          number: 123,
          title: 'Test Issue Title',
          body: 'Test Issue Body',
        }),
      });

      const result = await service.fetchTicket('test-repo/123');

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
        id: 'test-repo/123',
        title: 'Test Issue Title',
        description: 'Test Issue Body',
        acceptanceCriteria: '',
      });
    });

    it('should fetch composite ticket ID successfully parsing repository', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          number: 789,
          title: 'Composite Title',
          body: 'Composite Body',
        }),
      });

      const result = await service.fetchTicket('another-repo/789');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/another-repo/issues/789',
        expect.any(Object),
      );

      expect(result.id).toBe('another-repo/789');
    });

    it('should throw an error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Issue not found',
      });

      await expect(service.fetchTicket('test-repo/123')).rejects.toThrow(
        'GitHub API error (404): Issue not found',
      );
    });
  });

  describe('addComment', () => {
    it('should post a comment using composite ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await service.addComment('custom-repo/123', 'Sample comment text');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/custom-repo/issues/123/comments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            body: `Sample comment text\n\n${ATTRIBUTION_STATEMENT_GENERATED}`,
          }),
        }),
      );
    });
  });

  describe('createTicket', () => {
    it('should post issue to repository using parent composite ID and link as sub-issue', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ number: 456, id: 9999 }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await service.createTicket(
        'Task',
        'custom-repo/123',
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
        'https://api.github.com/repos/test-owner/custom-repo/issues',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            title: 'Sub-task title',
            body: expectedBody,
            labels: ['Task'],
          }),
        }),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/custom-repo/issues/123/sub_issues',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            sub_issue_id: 9999,
          }),
        }),
      );
    });

    it('should not apply labels if type is empty string', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ number: 456, id: 9999 }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await service.createTicket(
        '',
        'custom-repo/123',
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
        'https://api.github.com/repos/test-owner/custom-repo/issues',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            title: 'Sub-task title',
            body: expectedBody,
            labels: [],
          }),
        }),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/custom-repo/issues/123/sub_issues',
        expect.any(Object),
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
            {
              number: 123,
              title: 'Exact Match',
              body: 'Body 123',
              repository_url:
                'https://api.github.com/repos/test-owner/test-repo',
            },
            {
              number: 456,
              title: 'Search Result',
              body: 'Body 456',
              repository_url:
                'https://api.github.com/repos/test-owner/test-repo',
            },
          ],
        }),
      });

      const results = await service.searchTickets('test-repo/123', 'Feature');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/issues/123',
        expect.any(Object),
      );

      const expectedQuery = encodeURIComponent(
        'user:test-owner is:issue test-repo/123 label:"Feature"',
      );
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.github.com/search/issues?q=${expectedQuery}`,
        expect.any(Object),
      );

      expect(results).toEqual([
        {
          id: 'test-repo/123',
          title: 'Exact Match',
          description: 'Body 123',
          acceptanceCriteria: '',
        },
        {
          id: 'test-repo/456',
          title: 'Search Result',
          description: 'Body 456',
          acceptanceCriteria: '',
        },
      ]);
    });

    it('should query globally across user', async () => {
      const ownerOnlyService = new GitHubService('test-token', 'test-owner');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              number: 999,
              title: 'Global Issue',
              body: 'Global Body',
              repository_url:
                'https://api.github.com/repos/test-owner/another-repo',
            },
          ],
        }),
      });

      const results = await ownerOnlyService.searchTickets('query-text');

      const expectedQuery = encodeURIComponent(
        'user:test-owner is:issue query-text',
      );
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.github.com/search/issues?q=${expectedQuery}`,
        expect.any(Object),
      );

      expect(results).toEqual([
        {
          id: 'another-repo/999',
          title: 'Global Issue',
          description: 'Global Body',
          acceptanceCriteria: '',
        },
      ]);
    });
  });
});
