import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubCodeReviewService } from '../gitHubCodeReviewService';
import {
  ATTRIBUTION_STATEMENT_GENERATED,
  ATTRIBUTION_STATEMENT_ASSISTED,
} from '../../constants';

describe('GitHubCodeReviewService', () => {
  let service: GitHubCodeReviewService;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    service = new GitHubCodeReviewService('test-token', 'test-owner');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  describe('parsePRUrl', () => {
    it('should parse valid GitHub PR URL', () => {
      const parsed = service.parsePRUrl(
        'https://github.com/my-org/my-repo/pull/456',
      );
      expect(parsed).toEqual({
        org: 'my-org',
        project: 'my-org',
        repoName: 'my-repo',
        prNumber: 456,
      });
    });

    it('should return null for invalid URL format', () => {
      const parsed = service.parsePRUrl(
        'https://github.com/my-org/my-repo/issues/456',
      );
      expect(parsed).toBeNull();
    });
  });

  describe('parseRemoteUrl', () => {
    it('should parse HTTPS git remote URLs', () => {
      const parsed = service.parseRemoteUrl(
        'https://github.com/test-owner/test-repo.git',
      );
      expect(parsed).toEqual({
        org: 'test-owner',
        project: 'test-owner',
        repoName: 'test-repo',
      });
    });

    it('should parse SSH git remote URLs', () => {
      const parsed = service.parseRemoteUrl(
        'git@github.com:test-owner/test-repo.git',
      );
      expect(parsed).toEqual({
        org: 'test-owner',
        project: 'test-owner',
        repoName: 'test-repo',
      });
    });

    it('should return null for unmapped hosts', () => {
      const parsed = service.parseRemoteUrl(
        'https://gitlab.com/test-owner/test-repo.git',
      );
      expect(parsed).toBeNull();
    });
  });

  describe('getPRDetails', () => {
    it('should fetch and map pull request metadata using parsed URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          number: 456,
          title: 'A Great Feature',
          body: 'PR Description',
          head: { ref: 'feature-branch' },
          base: { ref: 'main', repo: { id: 789, name: 'my-repo' } },
          user: { login: 'octocat' },
          html_url: 'https://github.com/my-org/my-repo/pull/456',
        }),
      });

      const result = await service.getPRDetails(
        '/dummy/path',
        'https://github.com/my-org/my-repo/pull/456',
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/my-org/my-repo/pulls/456',
        expect.any(Object),
      );

      expect(result).toEqual({
        id: '456',
        title: 'A Great Feature',
        description: 'PR Description',
        sourceBranch: 'feature-branch',
        targetBranch: 'main',
        author: 'octocat',
        authorUniqueName: 'octocat',
        repositoryName: 'my-repo',
        repositoryId: '789',
        hostType: 'github',
        url: 'https://github.com/my-org/my-repo/pull/456',
      });
    });

    it('should use remoteUrl fallback if PR URL is not fully provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          number: 456,
          title: 'Fallback Feature',
          head: { ref: 'feature-branch' },
          base: { ref: 'main', repo: { id: 789, name: 'remote-repo' } },
        }),
      });

      const result = await service.getPRDetails(
        '/dummy/path',
        '456',
        'https://github.com/remote-owner/remote-repo.git',
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/remote-owner/remote-repo/pulls/456',
        expect.any(Object),
      );

      expect(result.repositoryName).toBe('remote-repo');
    });
  });

  describe('getProjectPRs', () => {
    it('should list open PRs and filter for assigned type', async () => {
      // 1. mock get authenticated user
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ login: 'octocat' }),
      });

      // 2. mock get search results (reviewer)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              number: 1,
              title: 'PR One',
              body: 'Test body',
              html_url: 'https://github.com/test-owner/test-repo/pull/1',
              repository_url:
                'https://api.github.com/repos/test-owner/test-repo',
              user: { login: 'someuser' },
            },
          ],
        }),
      });

      // 3. mock get search results (assignee)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
        }),
      });

      const prs = await service.getProjectPRs('assigned');

      expect(prs).toHaveLength(1);
      expect(prs[0].id).toBe('1');
    });

    it('should query GitHub search endpoint', async () => {
      const ownerOnlyService = new GitHubCodeReviewService(
        'test-token',
        'test-owner',
      );

      // 1. mock get authenticated user
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ login: 'octocat' }),
      });

      // 2. mock get search results (reviewer)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              number: 456,
              title: 'Owner-wide PR',
              body: 'Test body',
              html_url: 'https://github.com/test-owner/repo-a/pull/456',
              repository_url: 'https://api.github.com/repos/test-owner/repo-a',
              user: { login: 'some-user' },
            },
          ],
        }),
      });

      // 3. mock get search results (assignee)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
        }),
      });

      const prs = await ownerOnlyService.getProjectPRs('assigned');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/search/issues?q=' +
          encodeURIComponent(
            'user:test-owner is:pr is:open review-requested:octocat',
          ),
        expect.any(Object),
      );

      expect(prs).toHaveLength(1);
      expect(prs[0]).toEqual({
        id: '456',
        title: 'Owner-wide PR',
        description: 'Test body',
        sourceBranch: '',
        targetBranch: '',
        author: 'some-user',
        authorUniqueName: 'some-user',
        repositoryName: 'repo-a',
        repositoryId: '',
        hostType: 'github',
        url: 'https://github.com/test-owner/repo-a/pull/456',
      });
    });
  });

  describe('getLinkedTickets', () => {
    it('should return parsed issue numbers from PR body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          body: 'Fixes #987 and resolved https://github.com/test-owner/test-repo/issues/654',
        }),
      });

      const tickets = await service.getLinkedTickets(
        'https://github.com/test-owner/test-repo/pull/456',
      );

      expect(tickets).toEqual(['987', '654']);
    });
  });

  describe('postPRComment', () => {
    it('should post general comments as issue comments', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await service.postPRComment(
        'path',
        'https://github.com/test-owner/test-repo/pull/456',
        {
          type: 'general',
          comment: 'Great changes!',
          edited: false,
        },
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/issues/456/comments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            body: `Great changes!\n${ATTRIBUTION_STATEMENT_GENERATED}`,
          }),
        }),
      );
    });

    it('should post line comments as review comments using the latest commit SHA', async () => {
      // 1st request: fetch PR details for head commit SHA
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          head: { sha: 'abcdef123456' },
        }),
      });

      // 2nd request: post review comment
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await service.postPRComment(
        'path',
        'https://github.com/test-owner/test-repo/pull/456',
        {
          type: 'line',
          file: '/src/main.ts',
          line: 12,
          comment: 'Nice clean code',
          edited: true,
        },
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/pulls/456/comments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            body: `Nice clean code\n${ATTRIBUTION_STATEMENT_ASSISTED}`,
            commit_id: 'abcdef123456',
            path: 'src/main.ts',
            line: 12,
            side: 'RIGHT',
          }),
        }),
      );
    });
  });
});
