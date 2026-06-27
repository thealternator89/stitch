/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PRReviewerService } from '../prReviewerService';

const mockGetPullRequestById = vi.fn();
const mockGetPullRequestsByProject = vi.fn();
const mockConnect = vi.fn().mockResolvedValue({
  authorizedUser: { id: 'mock-user-id' },
});

const mockGetGitApi = vi.fn().mockResolvedValue({
  getPullRequestById: mockGetPullRequestById,
  getPullRequestsByProject: mockGetPullRequestsByProject,
});
const mockWebApi = {
  getGitApi: mockGetGitApi,
  connect: mockConnect,
};

vi.mock('azure-devops-node-api', () => {
  return {
    getPersonalAccessTokenHandler: vi.fn(),
    WebApi: function () {
      return mockWebApi;
    },
  };
});

describe('PRReviewerService', () => {
  let prReviewerService: PRReviewerService;
  let mockGitService: any;

  beforeEach(() => {
    mockGitService = {
      checkGitRepo: vi.fn(),
      getRemoteUrl: vi.fn(),
      hasUncommittedChanges: vi.fn(),
      fetchAndCheckoutPR: vi.fn(),
      getDiffFiles: vi.fn(),
      getFileDiff: vi.fn(),
    };
    prReviewerService = new PRReviewerService(mockGitService);
    mockGetPullRequestById.mockReset();
    mockGetPullRequestsByProject.mockReset();
    mockConnect.mockClear();
    mockGetGitApi.mockClear();
  });

  describe('parsePRUrl', () => {
    it('should parse valid dev.azure.com pullrequest URLs', () => {
      const result = prReviewerService.parsePRUrl(
        'https://dev.azure.com/myorg/myproject/_git/myrepo/pullrequest/12345',
      );
      expect(result).toEqual({
        org: 'myorg',
        project: 'myproject',
        repoName: 'myrepo',
        prNumber: 12345,
      });
    });

    it('should parse valid visualstudio.com pullrequest URLs', () => {
      const result = prReviewerService.parsePRUrl(
        'https://myorg.visualstudio.com/myproject/_git/myrepo/pullrequest/54321',
      );
      expect(result).toEqual({
        org: 'myorg',
        project: 'myproject',
        repoName: 'myrepo',
        prNumber: 54321,
      });
    });

    it('should return null for invalid URLs', () => {
      const result = prReviewerService.parsePRUrl(
        'https://dev.azure.com/myorg/myproject',
      );
      expect(result).toBeNull();
    });
  });

  describe('parseRemoteUrl', () => {
    it('should parse valid HTTPS remote URLs', () => {
      const result = prReviewerService.parseRemoteUrl(
        'https://dev.azure.com/myorg/myproject/_git/myrepo',
      );
      expect(result).toEqual({
        org: 'myorg',
        project: 'myproject',
        repoName: 'myrepo',
      });
    });

    it('should parse valid HTTPS remote URLs with userInfo', () => {
      const result = prReviewerService.parseRemoteUrl(
        'https://user@dev.azure.com/myorg/myproject/_git/myrepo',
      );
      expect(result).toEqual({
        org: 'myorg',
        project: 'myproject',
        repoName: 'myrepo',
      });
    });

    it('should parse SSH remote URLs', () => {
      const result = prReviewerService.parseRemoteUrl(
        'git@ssh.dev.azure.com:v3/myorg/myproject/myrepo',
      );
      expect(result).toEqual({
        org: 'myorg',
        project: 'myproject',
        repoName: 'myrepo',
      });
    });
  });

  describe('getPRDetails', () => {
    const settings = {
      azureOrg: 'conf-org',
      azureProject: 'conf-proj',
      azurePat: 'conf-pat',
    };

    it('should fetch PR details successfully using settings when given numeric ID', async () => {
      mockGetPullRequestById.mockResolvedValue({
        pullRequestId: 123,
        title: 'Pr Title',
        description: 'Pr Description',
        sourceRefName: 'refs/heads/feature-x',
        targetRefName: 'refs/heads/main',
        createdBy: { displayName: 'John Doe' },
      });

      const details = await prReviewerService.getPRDetails(
        '/mock/repo',
        '123',
        settings,
      );
      expect(details).toEqual({
        id: '123',
        title: 'Pr Title',
        description: 'Pr Description',
        sourceBranch: 'feature-x',
        targetBranch: 'main',
        author: 'John Doe',
        repositoryName: '',
        hostType: 'azure',
      });
    });

    it('should parse URL and use its org/project when given a full URL', async () => {
      mockGetPullRequestById.mockResolvedValue({
        pullRequestId: 999,
        title: 'Url PR',
        description: 'Url Desc',
        sourceRefName: 'refs/heads/feature-url',
        targetRefName: 'refs/heads/master',
        createdBy: { displayName: 'Jane Doe' },
      });

      const details = await prReviewerService.getPRDetails(
        '/mock/repo',
        'https://dev.azure.com/url-org/url-proj/_git/myrepo/pullrequest/999',
        settings,
      );
      expect(details.id).toBe('999');
      expect(details.sourceBranch).toBe('feature-url');
      expect(details.targetBranch).toBe('master');
    });

    it('should throw if target branch ref is missing', async () => {
      mockGetPullRequestById.mockResolvedValue({
        pullRequestId: 123,
        title: 'Pr Title',
      });

      await expect(
        prReviewerService.getPRDetails('/mock/repo', '123', settings),
      ).rejects.toThrow('missing target branch ref');
    });
  });

  describe('checkoutAndDiff', () => {
    it('should throw error if repository path is not a git repo', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(false);

      await expect(
        prReviewerService.checkoutAndDiff('/mock/repo', 123),
      ).rejects.toThrow('not a valid Git repository');
    });

    it('should throw error if repository is dirty', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(true);
      mockGitService.hasUncommittedChanges.mockResolvedValue(true);

      await expect(
        prReviewerService.checkoutAndDiff('/mock/repo', 123),
      ).rejects.toThrow('uncommitted changes');
    });

    it('should checkout and return commit SHA if repository is clean', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(true);
      mockGitService.hasUncommittedChanges.mockResolvedValue(false);
      mockGitService.fetchAndCheckoutPR.mockResolvedValue('sha-value');

      const result = await prReviewerService.checkoutAndDiff('/mock/repo', 123);
      expect(result).toEqual({ commitSha: 'sha-value' });
    });

    it('should throw error if repository name does not match expected name', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(true);
      mockGitService.getRemoteUrl.mockResolvedValue(
        'https://dev.azure.com/org/proj/_git/mismatched-repo',
      );

      await expect(
        prReviewerService.checkoutAndDiff('/mock/repo', 123, 'expected-repo'),
      ).rejects.toThrow('does not match the Pull Request repository');
    });
  });

  describe('getProjectPRs', () => {
    const settings = {
      azureOrg: 'conf-org',
      azureProject: 'conf-proj',
      azurePat: 'conf-pat',
    };

    it('should query pull requests for project and return mapped results', async () => {
      mockGetPullRequestsByProject.mockResolvedValue([
        {
          pullRequestId: 444,
          title: 'My active PR',
          description: 'PR Description',
          sourceRefName: 'refs/heads/feature-x',
          targetRefName: 'refs/heads/main',
          createdBy: { displayName: 'John Author' },
          repository: { name: 'my-repo-name' },
        },
      ]);

      const result = await prReviewerService.getProjectPRs('all', settings);
      expect(result).toEqual([
        {
          id: '444',
          title: 'My active PR',
          description: 'PR Description',
          sourceBranch: 'feature-x',
          targetBranch: 'main',
          author: 'John Author',
          repositoryName: 'my-repo-name',
          hostType: 'azure',
        },
      ]);

      expect(mockGetPullRequestsByProject).toHaveBeenCalledWith('conf-proj', {
        status: 1,
      });
    });

    it('should filter by reviewer if searchType is assigned', async () => {
      mockConnect.mockResolvedValue({
        authorizedUser: { id: 'user-guid-123' },
      });
      mockGetPullRequestsByProject.mockResolvedValue([]);

      await prReviewerService.getProjectPRs('assigned', settings);

      expect(mockConnect).toHaveBeenCalled();
      expect(mockGetPullRequestsByProject).toHaveBeenCalledWith('conf-proj', {
        status: 1,
        reviewerId: 'user-guid-123',
      });
    });

    it('should filter by creator if searchType is created', async () => {
      mockConnect.mockResolvedValue({
        authorizedUser: { id: 'user-guid-123' },
      });
      mockGetPullRequestsByProject.mockResolvedValue([]);

      await prReviewerService.getProjectPRs('created', settings);

      expect(mockConnect).toHaveBeenCalled();
      expect(mockGetPullRequestsByProject).toHaveBeenCalledWith('conf-proj', {
        status: 1,
        creatorId: 'user-guid-123',
      });
    });
  });
});
