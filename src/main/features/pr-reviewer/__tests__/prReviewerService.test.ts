/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  PRReviewerService,
  extractFileContextSync,
  parseFrontmatter,
  buildPhaseReviewPrompt,
} from '../prReviewerService';

const mockGetPullRequestById = vi.fn();
const mockGetPullRequestsByProject = vi.fn();
const mockCreateThread = vi.fn();
const mockGetPullRequestWorkItemRefs = vi.fn();
const mockConnect = vi.fn().mockResolvedValue({
  authorizedUser: { id: 'mock-user-id' },
});

const mockGetGitApi = vi.fn().mockResolvedValue({
  getPullRequestById: mockGetPullRequestById,
  getPullRequestsByProject: mockGetPullRequestsByProject,
  createThread: mockCreateThread,
  getPullRequestWorkItemRefs: mockGetPullRequestWorkItemRefs,
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

const mockPowerSaveBlockerStart = vi.fn().mockReturnValue(42);
const mockPowerSaveBlockerStop = vi.fn();
const mockPowerSaveBlockerIsStarted = vi.fn().mockReturnValue(true);

vi.mock('electron', () => {
  return {
    powerSaveBlocker: {
      start: (type: string) => mockPowerSaveBlockerStart(type),
      stop: (id: number) => mockPowerSaveBlockerStop(id),
      isStarted: (id: number) => mockPowerSaveBlockerIsStarted(id),
    },
  };
});

describe('PRReviewerService', () => {
  let prReviewerService: PRReviewerService;
  let mockGitService: any;
  let mockCopilotService: any;

  beforeEach(() => {
    mockGitService = {
      checkGitRepo: vi.fn(),
      getRemoteUrl: vi.fn(),
      hasUncommittedChanges: vi.fn(),
      fetchAndCheckoutPR: vi.fn(),
      getDiffFiles: vi.fn(),
      getFileDiff: vi.fn(),
      getCurrentRef: vi.fn().mockResolvedValue('mock-original-ref'),
      restoreRef: vi.fn().mockResolvedValue(undefined),
    };
    mockCopilotService = {
      createClientAndSession: vi.fn(),
      sendAndCollectStream: vi.fn(),
    };
    prReviewerService = new PRReviewerService(
      mockGitService,
      mockCopilotService,
      async () => null,
      async () => null,
    );
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
    mockGetPullRequestById.mockReset();
    mockGetPullRequestsByProject.mockReset();
    mockGetPullRequestWorkItemRefs.mockReset();
    mockConnect.mockClear();
    mockGetGitApi.mockClear();
    mockPowerSaveBlockerStart.mockClear().mockReturnValue(42);
    mockPowerSaveBlockerStop.mockClear();
    mockPowerSaveBlockerIsStarted.mockClear().mockReturnValue(true);
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
        repository: { name: 'my-repo' },
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
        repositoryName: 'my-repo',
        hostType: 'azure',
        url: 'https://dev.azure.com/conf-org/conf-proj/_git/my-repo/pullrequest/123',
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
          url: 'https://dev.azure.com/conf-org/conf-proj/_git/my-repo-name/pullrequest/444',
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

  describe('reviewPR', () => {
    const settings = {
      copilotToken: 'mock-token',
      copilotModel: 'mock-model',
    };

    beforeEach(() => {
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue([
        {
          id: '010-definition-of-done.md',
          title: 'Definition of Done',
          body: 'Review guidelines',
        },
      ]);
    });

    it('should launch copilot with repo path and stream review results', async () => {
      const mockFiles = [
        { path: 'src/index.ts', status: 'modified' },
        { path: 'src/utils.ts', status: 'added' },
      ];
      mockGitService.getDiffFiles.mockResolvedValue(mockFiles);

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue(
        '{"type":"general","comment":"LGTM"}',
      );

      const onLineCallback = vi.fn();
      const result = await prReviewerService.reviewPR(
        '/mock/repo',
        'main',
        settings,
        {
          modelOverride: 'gpt-4',
          customInstructions: 'Please focus on security.',
          enabledPhaseIds: ['010-definition-of-done.md'],
          onLine: onLineCallback,
        },
      );

      expect(mockGitService.getDiffFiles).toHaveBeenCalledWith(
        '/mock/repo',
        'main',
      );
      expect(mockCopilotService.createClientAndSession).toHaveBeenCalledWith(
        'mock-token',
        'gpt-4',
        { workingDirectory: '/mock/repo' },
      );

      const expectedPrompt = buildPhaseReviewPrompt(
        mockFiles,
        'Definition of Done',
        'Review guidelines',
        'Please focus on security.',
      );
      expect(mockCopilotService.sendAndCollectStream).toHaveBeenCalledWith(
        mockSession,
        expectedPrompt,
        expect.any(Function),
      );

      expect(mockSession.disconnect).toHaveBeenCalled();
      expect(mockClient.stop).toHaveBeenCalled();
      expect(result).toBe(
        '\n--- Phase Definition of Done Result ---\n{"type":"general","comment":"LGTM"}',
      );
    });

    it('should cleanly stop client and session even when review throws an error', async () => {
      mockGitService.getDiffFiles.mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ]);

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockRejectedValue(
        new Error('Copilot Error'),
      );

      await expect(
        prReviewerService.reviewPR('/mock/repo', 'main', settings, {
          enabledPhaseIds: ['010-definition-of-done.md'],
        }),
      ).rejects.toThrow('Copilot Error');

      expect(mockSession.disconnect).toHaveBeenCalled();
      expect(mockClient.stop).toHaveBeenCalled();
    });

    it('should start powerSaveBlocker at the beginning and stop it at the end of review', async () => {
      mockGitService.getDiffFiles.mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ]);

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue(
        '{"type":"general","comment":"LGTM"}',
      );

      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        enabledPhaseIds: ['010-definition-of-done.md'],
      });

      expect(mockPowerSaveBlockerStart).toHaveBeenCalledWith(
        'prevent-app-suspension',
      );
      expect(mockPowerSaveBlockerStop).toHaveBeenCalledWith(42);
    });

    it('should stop powerSaveBlocker even when review throws an error', async () => {
      mockGitService.getDiffFiles.mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ]);

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockRejectedValue(
        new Error('Copilot Error'),
      );

      await expect(
        prReviewerService.reviewPR('/mock/repo', 'main', settings, {
          enabledPhaseIds: ['010-definition-of-done.md'],
        }),
      ).rejects.toThrow('Copilot Error');

      expect(mockPowerSaveBlockerStart).toHaveBeenCalledWith(
        'prevent-app-suspension',
      );
      expect(mockPowerSaveBlockerStop).toHaveBeenCalledWith(42);
    });

    it('should wrap onLine callback and inject codeLines when type is line', async () => {
      mockGitService.getDiffFiles.mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ]);

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });

      const mockExistsSync = vi
        .spyOn(fs, 'existsSync')
        .mockImplementation((filePath: any) => {
          return !filePath.toString().endsWith('config.json');
        });
      const mockReadFileSync = vi
        .spyOn(fs, 'readFileSync')
        .mockReturnValue('const a = 1;\nconst b = 2;\nconst c = 3;');

      let capturedCallback: any;
      mockCopilotService.sendAndCollectStream.mockImplementation(
        async (
          _session: any,
          _prompt: string,
          onLine?: (line: string) => void,
        ) => {
          capturedCallback = onLine;
          return 'done';
        },
      );

      const onLineCallback = vi.fn();
      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        onLine: onLineCallback,
        enabledPhaseIds: ['010-definition-of-done.md'],
      });

      expect(capturedCallback).toBeDefined();

      // Trigger line comment
      capturedCallback(
        '{"type":"line","file":"src/index.ts","line":2,"context":1,"comment":"Review"}',
      );

      // The wrapped callback should parse, inject codeLines, and serialize it back
      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'line',
          file: 'src/index.ts',
          line: 2,
          context: 1,
          comment: 'Review',
          phase: 'Definition of Done',
          codeLines: [
            { line: 1, text: 'const a = 1;', isTarget: false },
            { line: 2, text: 'const b = 2;', isTarget: true },
            { line: 3, text: 'const c = 3;', isTarget: false },
          ],
        }),
      );

      mockExistsSync.mockRestore();
      mockReadFileSync.mockRestore();
    });

    it('should wrap onLine callback and pass status message untouched when type is status', async () => {
      mockGitService.getDiffFiles.mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ]);

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });

      let capturedCallback: any;
      mockCopilotService.sendAndCollectStream.mockImplementation(
        async (
          _session: any,
          _prompt: string,
          onLine?: (line: string) => void,
        ) => {
          capturedCallback = onLine;
          return 'done';
        },
      );

      const onLineCallback = vi.fn();
      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        onLine: onLineCallback,
        enabledPhaseIds: ['010-definition-of-done.md'],
      });

      expect(capturedCallback).toBeDefined();

      // Trigger status comment
      capturedCallback('{"type":"status","status":"Checking index.ts"}');

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'status',
          status: 'Checking index.ts',
        }),
      );
    });

    it('should throw an error if no review phases are selected', async () => {
      await expect(
        prReviewerService.reviewPR('/mock/repo', 'main', settings, {
          enabledPhaseIds: [],
        }),
      ).rejects.toThrow(
        'No review phases selected. Please select at least one phase to start the review.',
      );
    });

    it('should throw an error if no review phases are found on disk', async () => {
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue([]);
      await expect(
        prReviewerService.reviewPR('/mock/repo', 'main', settings, {
          enabledPhaseIds: ['some-phase.md'],
        }),
      ).rejects.toThrow(
        'No custom review phases found on disk. Please configure them in ~/.stitch/pr-reviewer/phases',
      );
    });

    it('should throw an error if an enabled phase has a templateError', async () => {
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue([
        {
          id: '010-templated.md',
          title: 'Templated Phase',
          body: 'My phase content',
          template: 'missing-template.md',
          templateError: 'Template file not found: missing-template.md',
        },
      ]);

      await expect(
        prReviewerService.reviewPR('/mock/repo', 'main', settings, {
          enabledPhaseIds: ['010-templated.md'],
        }),
      ).rejects.toThrow('Template file not found: missing-template.md');
    });

    it('should fetch and attach linked Azure DevOps stories, resolve doc links, and register the request_documentation tool when phase requires Story', async () => {
      const mockFiles = [{ path: 'src/index.ts', status: 'modified' }];
      mockGitService.getDiffFiles.mockResolvedValue(mockFiles);

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue(
        '{"type":"general","comment":"Reviewed story"}',
      );

      mockGetPullRequestById.mockResolvedValue({
        pullRequestId: 123,
        title: 'Pr Title',
        description: 'Pr Description',
        sourceRefName: 'refs/heads/feature-x',
        targetRefName: 'refs/heads/main',
        createdBy: { displayName: 'John Doe' },
        repository: { id: 'repo-123', name: 'my-repo' },
      });
      mockGetPullRequestWorkItemRefs.mockResolvedValue([{ id: 'story-123' }]);

      const mockIssueTracker = {
        fetchTicket: vi.fn().mockResolvedValue({
          id: 'story-123',
          title: 'My Story Title',
          description:
            'Please read https://confluence.com/page/456 for details.',
          acceptanceCriteria: 'Criteria content',
        }),
      };
      const mockDocProvider = {
        isDocPageUrl: vi.fn().mockReturnValue(true),
        extractPageId: vi.fn().mockReturnValue('page-456'),
        fetchPage: vi.fn().mockResolvedValue({
          id: 'page-456',
          title: 'My Confluence Doc',
          body: 'Confluence content',
        }),
      };

      const customPRReviewerService = new PRReviewerService(
        mockGitService,
        mockCopilotService,
        async () => mockIssueTracker as any,
        async () => mockDocProvider as any,
      );

      vi.spyOn(customPRReviewerService, 'loadPhasesFromDisk').mockResolvedValue(
        [
          {
            id: '020-story-phase.md',
            title: 'Story Phase',
            body: 'Phase body contents',
            attach: 'Story',
          },
        ],
      );

      const localSettings = {
        copilotToken: 'mock-token',
        copilotModel: 'mock-model',
        azureOrg: 'conf-org',
        azureProject: 'conf-proj',
        azurePat: 'conf-pat',
      };

      const onLineCallback = vi.fn();
      await customPRReviewerService.reviewPR(
        '/mock/repo',
        'main',
        localSettings,
        {
          enabledPhaseIds: ['020-story-phase.md'],
          prId: '123',
          onLine: onLineCallback,
        },
      );

      expect(mockGetPullRequestWorkItemRefs).toHaveBeenCalledWith(
        'repo-123',
        123,
      );
      expect(mockIssueTracker.fetchTicket).toHaveBeenCalledWith('story-123');

      expect(mockCopilotService.createClientAndSession).toHaveBeenCalledWith(
        'mock-token',
        undefined,
        expect.objectContaining({
          workingDirectory: '/mock/repo',
          tools: expect.any(Array),
        }),
      );

      const expectedPrompt = buildPhaseReviewPrompt(
        mockFiles,
        'Story Phase',
        'Phase body contents',
        '',
        undefined,
        'Ticket ID: story-123\nTitle: My Story Title\nDescription: Please read https://confluence.com/page/456 for details.\nAcceptance Criteria: Criteria content',
        [{ id: 'page-456', title: 'My Confluence Doc' }],
      );

      expect(mockCopilotService.sendAndCollectStream).toHaveBeenCalledWith(
        mockSession,
        expectedPrompt,
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('should skip the phase if attach is Story but no stories are linked to the PR', async () => {
      const mockFiles = [{ path: 'src/index.ts', status: 'modified' }];
      mockGitService.getDiffFiles.mockResolvedValue(mockFiles);

      mockGetPullRequestById.mockResolvedValue({
        pullRequestId: 123,
        title: 'Pr Title',
        description: 'Pr Description',
        sourceRefName: 'refs/heads/feature-x',
        targetRefName: 'refs/heads/main',
        createdBy: { displayName: 'John Doe' },
        repository: { id: 'repo-123', name: 'my-repo' },
      });
      mockGetPullRequestWorkItemRefs.mockResolvedValue([]);

      const mockIssueTracker = { fetchTicket: vi.fn() };
      const mockDocProvider = { fetchPage: vi.fn() };

      const customPRReviewerService = new PRReviewerService(
        mockGitService,
        mockCopilotService,
        async () => mockIssueTracker as any,
        async () => mockDocProvider as any,
      );

      vi.spyOn(customPRReviewerService, 'loadPhasesFromDisk').mockResolvedValue(
        [
          {
            id: '020-story-phase.md',
            title: 'Story Phase',
            body: 'Phase body contents',
            attach: 'Story',
          },
        ],
      );

      const localSettings = {
        copilotToken: 'mock-token',
        copilotModel: 'mock-model',
        azureOrg: 'conf-org',
        azureProject: 'conf-proj',
        azurePat: 'conf-pat',
      };

      const onLineCallback = vi.fn();
      await customPRReviewerService.reviewPR(
        '/mock/repo',
        'main',
        localSettings,
        {
          enabledPhaseIds: ['020-story-phase.md'],
          prId: '123',
          onLine: onLineCallback,
        },
      );

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'phase-skip',
          phaseId: '020-story-phase.md',
          phaseTitle: 'Story Phase',
          reason: 'No linked stories found for this Pull Request',
        }),
      );
      expect(mockCopilotService.createClientAndSession).not.toHaveBeenCalled();
    });
  });

  describe('extractFileContextSync', () => {
    it('should return null for directory traversal attempts', () => {
      const result = extractFileContextSync(
        '/mock/repo',
        '../outside.ts',
        10,
        2,
      );
      expect(result).toBeNull();
    });

    it('should return slice of file contents', () => {
      const mockExistsSync = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const mockReadFileSync = vi
        .spyOn(fs, 'readFileSync')
        .mockReturnValue('line1\nline2\nline3\nline4\nline5');

      const result = extractFileContextSync('/mock/repo', 'src/index.ts', 3, 1);
      expect(result).toEqual([
        { line: 2, text: 'line2', isTarget: false },
        { line: 3, text: 'line3', isTarget: true },
        { line: 4, text: 'line4', isTarget: false },
      ]);

      mockExistsSync.mockRestore();
      mockReadFileSync.mockRestore();
    });

    it('should handle boundaries gracefully', () => {
      const mockExistsSync = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const mockReadFileSync = vi
        .spyOn(fs, 'readFileSync')
        .mockReturnValue('line1\nline2');

      const result = extractFileContextSync('/mock/repo', 'src/index.ts', 1, 5);
      expect(result).toEqual([
        { line: 1, text: 'line1', isTarget: true },
        { line: 2, text: 'line2', isTarget: false },
      ]);

      mockExistsSync.mockRestore();
      mockReadFileSync.mockRestore();
    });
  });

  describe('postPRComment', () => {
    const settings = {
      azurePat: 'mock-token',
      azureOrg: 'mock-org',
      azureProject: 'mock-project',
      promptComplexity: 'normal',
    };

    it('should successfully post a general comment', async () => {
      mockGetPullRequestById.mockResolvedValue({
        repository: { id: 'mock-repo-id' },
      });
      mockCreateThread.mockResolvedValue({});

      await prReviewerService.postPRComment(
        '/mock/repo',
        '123',
        {
          type: 'general',
          comment: 'This is a general comment',
        },
        settings,
      );

      expect(mockGetPullRequestById).toHaveBeenCalledWith(123);
      expect(mockCreateThread).toHaveBeenCalledWith(
        {
          comments: [
            {
              parentCommentId: 0,
              content:
                'This is a general comment\n' +
                [
                  '> Generated with Stitch and GitHub Copilot.',
                  '> Like any AI generated content, mistakes and hallucinations can occur. Please review before relying on it.',
                ].join('\n'),
              commentType: 1,
            },
          ],
          status: 1,
        },
        'mock-repo-id',
        123,
        'mock-project',
      );
    });

    it('should successfully post a line comment with threadContext', async () => {
      mockGetPullRequestById.mockResolvedValue({
        repository: { id: 'mock-repo-id' },
      });
      mockCreateThread.mockResolvedValue({});

      await prReviewerService.postPRComment(
        '/mock/repo',
        '123',
        {
          type: 'line',
          file: 'src/index.ts',
          line: 42,
          comment: 'Fix this line',
        },
        settings,
      );

      expect(mockGetPullRequestById).toHaveBeenCalledWith(123);
      expect(mockCreateThread).toHaveBeenCalledWith(
        {
          comments: [
            {
              parentCommentId: 0,
              content:
                'Fix this line\n' +
                [
                  '> Generated with Stitch and GitHub Copilot.',
                  '> Like any AI generated content, mistakes and hallucinations can occur. Please review before relying on it.',
                ].join('\n'),
              commentType: 1,
            },
          ],
          status: 1,
          threadContext: {
            filePath: '/src/index.ts',
            rightFileStart: { line: 42, offset: 1 },
            rightFileEnd: { line: 43, offset: 1 },
          },
        },
        'mock-repo-id',
        123,
        'mock-project',
      );
    });

    it('should format Windows file paths with backslashes and ensure starting forward slash when posting a line comment', async () => {
      mockGetPullRequestById.mockResolvedValue({
        repository: { id: 'mock-repo-id' },
      });
      mockCreateThread.mockResolvedValue({});

      await prReviewerService.postPRComment(
        '/mock/repo',
        '123',
        {
          type: 'line',
          file: 'PartySystemApi\\src\\PartySystem.Domain\\Migrations\\20260624014055_Update-Table-OrganisationType-RemoveIdentity.cs',
          line: 10,
          comment: 'Fix this migration',
        },
        settings,
      );

      expect(mockCreateThread).toHaveBeenCalledWith(
        expect.objectContaining({
          threadContext: {
            filePath:
              '/PartySystemApi/src/PartySystem.Domain/Migrations/20260624014055_Update-Table-OrganisationType-RemoveIdentity.cs',
            rightFileStart: { line: 10, offset: 1 },
            rightFileEnd: { line: 11, offset: 1 },
          },
        }),
        'mock-repo-id',
        123,
        'mock-project',
      );
    });
  });

  describe('parseFrontmatter', () => {
    it('should parse valid frontmatter and extract body', () => {
      const content =
        '---\ntitle: test-phase\ngroup: dotnet\ninclude: "**/*.cs"\n---\nbody-content';
      const result = parseFrontmatter(content);
      expect(result).toEqual({
        frontmatter: {
          title: 'test-phase',
          group: 'dotnet',
          include: '**/*.cs',
        },
        body: 'body-content',
      });
    });

    it('should handle carriage returns and quotes in values', () => {
      const content =
        '---\r\ntitle: \'test-phase\'\r\ninclude: "**/abc/*"\r\n---\r\nbody-content-2';
      const result = parseFrontmatter(content);
      expect(result).toEqual({
        frontmatter: {
          title: 'test-phase',
          include: '**/abc/*',
        },
        body: 'body-content-2',
      });
    });

    it('should parse array format using JSON-like arrays', () => {
      const content =
        '---\ntitle: test-phase\ninclude: ["*.ts", "*.js"]\nexclude: [\'*.spec.ts\', \'*.test.ts\']\n---\nbody-content';
      const result = parseFrontmatter(content);
      expect(result).toEqual({
        frontmatter: {
          title: 'test-phase',
          include: ['*.ts', '*.js'],
          exclude: ['*.spec.ts', '*.test.ts'],
        },
        body: 'body-content',
      });
    });

    it('should parse array format using YAML lists', () => {
      const content =
        '---\ntitle: test-phase\ninclude:\n  - "*.ts"\n  - \'*.js\'\nexclude:\n  - "*.spec.ts"\n  - "*.test.ts"\n---\nbody-content';
      const result = parseFrontmatter(content);
      expect(result).toEqual({
        frontmatter: {
          title: 'test-phase',
          include: ['*.ts', '*.js'],
          exclude: ['*.spec.ts', '*.test.ts'],
        },
        body: 'body-content',
      });
    });

    it('should parse array with glob comma braces correctly', () => {
      const content =
        '---\ntitle: test-phase\ninclude: ["{a,b}.ts", "c.js"]\n---\nbody';
      const result = parseFrontmatter(content);
      expect(result).toEqual({
        frontmatter: {
          title: 'test-phase',
          include: ['{a,b}.ts', 'c.js'],
        },
        body: 'body',
      });
    });

    it('should parse empty arrays correctly', () => {
      const content = '---\ntitle: test-phase\ninclude: []\n---\nbody';
      const result = parseFrontmatter(content);
      expect(result).toEqual({
        frontmatter: {
          title: 'test-phase',
          include: [],
        },
        body: 'body',
      });
    });
  });

  describe('loadPhasesFromDisk', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return empty array if phases directory does not exist', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const result = await prReviewerService.loadPhasesFromDisk();
      expect(result).toEqual([]);
    });

    it('should scaffold phases and templates directories if they do not exist', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const mockMkdirSync = vi
        .spyOn(fs, 'mkdirSync')
        .mockImplementation(() => undefined as any);

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toEqual([]);
      expect(mockMkdirSync).toHaveBeenCalledTimes(2);
      const homeDir = os.homedir();
      expect(mockMkdirSync).toHaveBeenCalledWith(
        path.join(homeDir, '.stitch', 'pr-reviewer', 'phases'),
        { recursive: true },
      );
      expect(mockMkdirSync).toHaveBeenCalledWith(
        path.join(homeDir, '.stitch', 'pr-reviewer', 'templates'),
        { recursive: true },
      );
    });

    it('should load phases, assign default Ungrouped group, and sort correctly', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        return !filePath.toString().endsWith('config.json');
      });
      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        '030-python.md',
        '010-definition-of-done.md',
        '020-dotnet.md',
        '040-js.md',
      ] as any);

      const filesContent: Record<string, string> = {
        '010-definition-of-done.md':
          '---\ntitle: DoD\ngroup: Security\n---\nDoD body',
        '020-dotnet.md': '---\ntitle: .NET\n---\nDotnet body',
        '030-python.md':
          '---\ntitle: Python\ngroup: Security\n---\nPython body',
        '040-js.md': '---\ntitle: JS\ngroup: Analytics\n---\nJS body',
      };

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        const basename = path.basename(filePath);
        return filesContent[basename] || '';
      });

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toHaveLength(4);

      // Verify exact order:
      // 1. Ungrouped first: '020-dotnet.md'
      // 2. Alphabetically by group: 'Analytics' ('040-js.md') then 'Security'
      // 3. Within 'Security', alphabetically by filename: '010-definition-of-done.md' then '030-python.md'
      expect(result[0].id).toBe('020-dotnet.md');
      expect(result[0].group).toBe('Ungrouped');

      expect(result[1].id).toBe('040-js.md');
      expect(result[1].group).toBe('Analytics');

      expect(result[2].id).toBe('010-definition-of-done.md');
      expect(result[2].group).toBe('Security');

      expect(result[3].id).toBe('030-python.md');
      expect(result[3].group).toBe('Security');
    });

    it('should successfully load a template and interpolate body', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        return !filePath.toString().endsWith('config.json');
      });
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['010-templated.md'] as any);

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('pr-reviewer/phases/010-templated.md')) {
          return '---\ntitle: Templated Phase\ntemplate: my-template.md\n---\nMy phase content';
        }
        if (normalized.includes('pr-reviewer/templates/my-template.md')) {
          return 'Template header\n<%content%>\nTemplate footer';
        }
        return '';
      });

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('010-templated.md');
      expect(result[0].title).toBe('Templated Phase');
      expect(result[0].template).toBe('my-template.md');
      expect(result[0].body).toBe(
        'Template header\nMy phase content\nTemplate footer',
      );
    });

    it('should load phase with templateError set if template file is missing', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('pr-reviewer/templates/missing-template.md')) {
          return false;
        }
        if (normalized.includes('config.json')) {
          return false;
        }
        return true;
      });
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['010-templated.md'] as any);

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('pr-reviewer/phases/010-templated.md')) {
          return '---\ntitle: Templated Phase\ntemplate: missing-template.md\n---\nMy phase content';
        }
        return '';
      });

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('010-templated.md');
      expect(result[0].templateError).toContain('Template file not found:');
      expect(result[0].templateError).toContain('missing-template.md');
    });

    it('should block template directory traversal and set templateError', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        return !filePath.toString().endsWith('config.json');
      });
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['010-templated.md'] as any);

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('pr-reviewer/phases/010-templated.md')) {
          return '---\ntitle: Traversal Phase\ntemplate: ../../passwd\n---\nMy phase content';
        }
        return '';
      });

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('010-templated.md');
      expect(result[0].templateError).toContain(
        'Directory traversal detected in template path: ../../passwd',
      );
    });

    it('should load phase with templateError set if template does not contain <%content%> placeholder', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        return !filePath.toString().endsWith('config.json');
      });
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['010-templated.md'] as any);

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('pr-reviewer/phases/010-templated.md')) {
          return '---\ntitle: Templated Phase\ntemplate: my-template.md\n---\nMy phase content';
        }
        if (normalized.includes('pr-reviewer/templates/my-template.md')) {
          return 'Template header but no placeholder';
        }
        return '';
      });

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('010-templated.md');
      expect(result[0].templateError).toContain(
        'Template "my-template.md" is missing the required <%content%> placeholder.',
      );
    });

    it('should sort groups according to config.json when available', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('pr-reviewer/config.json')) {
          return true;
        }
        return true;
      });

      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        '030-python.md',
        '010-definition-of-done.md',
        '020-dotnet.md',
        '040-js.md',
      ] as any);

      const filesContent: Record<string, string> = {
        'config.json': JSON.stringify({
          groups: ['Security', 'Analytics'],
        }),
        '010-definition-of-done.md':
          '---\ntitle: DoD\ngroup: Security\n---\nDoD body',
        '020-dotnet.md': '---\ntitle: .NET\n---\nDotnet body',
        '030-python.md':
          '---\ntitle: Python\ngroup: Security\n---\nPython body',
        '040-js.md': '---\ntitle: JS\ngroup: Analytics\n---\nJS body',
      };

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        const basename = path.basename(filePath);
        return filesContent[basename] || '';
      });

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toHaveLength(4);

      // Verify custom sorting order:
      // 1. Ungrouped first: '020-dotnet.md'
      // 2. 'Security' ('010-definition-of-done.md', '030-python.md') - sorted first in config.json groups
      // 3. 'Analytics' ('040-js.md') - sorted second in config.json groups
      expect(result[0].id).toBe('020-dotnet.md');
      expect(result[0].group).toBe('Ungrouped');

      expect(result[1].id).toBe('010-definition-of-done.md');
      expect(result[1].group).toBe('Security');

      expect(result[2].id).toBe('030-python.md');
      expect(result[2].group).toBe('Security');

      expect(result[3].id).toBe('040-js.md');
      expect(result[3].group).toBe('Analytics');
    });

    it('should sort fallback groups (not in config.json) last and alphabetically', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('pr-reviewer/config.json')) {
          return true;
        }
        return true;
      });

      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        '010-definition-of-done.md',
        '020-dotnet.md',
        '030-python.md',
        '040-js.md',
        '050-perf.md',
      ] as any);

      const filesContent: Record<string, string> = {
        'config.json': JSON.stringify({
          groups: ['Analytics'],
        }),
        '010-definition-of-done.md':
          '---\ntitle: DoD\ngroup: Security\n---\nDoD body',
        '020-dotnet.md': '---\ntitle: .NET\n---\nDotnet body',
        '030-python.md':
          '---\ntitle: Python\ngroup: Security\n---\nPython body',
        '040-js.md': '---\ntitle: JS\ngroup: Analytics\n---\nJS body',
        '050-perf.md': '---\ntitle: Perf\ngroup: Performance\n---\nPerf body',
      };

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        const basename = path.basename(filePath);
        return filesContent[basename] || '';
      });

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toHaveLength(5);

      // Verify custom/fallback sorting:
      // 1. Ungrouped first: '020-dotnet.md'
      // 2. Specified group: 'Analytics' ('040-js.md')
      // 3. Fallback groups sorted alphabetically: 'Performance' ('050-perf.md') then 'Security' ('010-definition-of-done.md', '030-python.md')
      expect(result[0].id).toBe('020-dotnet.md');
      expect(result[1].id).toBe('040-js.md');
      expect(result[2].id).toBe('050-perf.md');
      expect(result[3].id).toBe('010-definition-of-done.md');
      expect(result[4].id).toBe('030-python.md');
    });

    it('should ignore invalid config.json or missing groups and sort alphabetically', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('pr-reviewer/config.json')) {
          return true;
        }
        return true;
      });

      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        '030-python.md',
        '010-definition-of-done.md',
        '020-dotnet.md',
        '040-js.md',
      ] as any);

      const filesContent: Record<string, string> = {
        'config.json': 'invalid-json',
        '010-definition-of-done.md':
          '---\ntitle: DoD\ngroup: Security\n---\nDoD body',
        '020-dotnet.md': '---\ntitle: .NET\n---\nDotnet body',
        '030-python.md':
          '---\ntitle: Python\ngroup: Security\n---\nPython body',
        '040-js.md': '---\ntitle: JS\ngroup: Analytics\n---\nJS body',
      };

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        const basename = path.basename(filePath);
        return filesContent[basename] || '';
      });

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await prReviewerService.loadPhasesFromDisk();

      // Alphabetical sorting fallback:
      // 1. Ungrouped: '020-dotnet.md'
      // 2. Analytics: '040-js.md'
      // 3. Security: '010-definition-of-done.md', '030-python.md'
      expect(result[0].id).toBe('020-dotnet.md');
      expect(result[1].id).toBe('040-js.md');
      expect(result[2].id).toBe('010-definition-of-done.md');
      expect(result[3].id).toBe('030-python.md');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('reviewPR multi-phase', () => {
    const settings = {
      copilotToken: 'mock-token',
      copilotModel: 'mock-model',
    };

    it('should execute review phases sequentially and filter by globs', async () => {
      const mockFiles = [
        { path: 'src/Program.cs', status: 'modified' },
        { path: 'src/index.js', status: 'added' },
      ];
      mockGitService.getDiffFiles.mockResolvedValue(mockFiles);

      const mockPhases = [
        {
          id: '010-dotnet.md',
          title: '.NET Review',
          include: '**/*.cs',
          body: 'Check dotnet code style',
        },
        {
          id: '020-js.md',
          title: 'JS Review',
          include: '**/*.js',
          body: 'Check js code style',
        },
        {
          id: '030-python.md',
          title: 'Python Review',
          include: '**/*.py',
          body: 'Check python code style',
        },
      ];
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue(
        mockPhases,
      );

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue(
        '{"type":"general","comment":"Comment"}',
      );

      const onLineCallback = vi.fn();
      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        enabledPhaseIds: ['010-dotnet.md', '020-js.md', '030-python.md'],
        onLine: onLineCallback,
      });

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'phase-start',
          phaseId: '010-dotnet.md',
          phaseTitle: '.NET Review',
        }),
      );

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'phase-start',
          phaseId: '020-js.md',
          phaseTitle: 'JS Review',
        }),
      );

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'phase-skip',
          phaseId: '030-python.md',
          phaseTitle: 'Python Review',
          reason: 'No matching files found',
        }),
      );

      expect(mockCopilotService.createClientAndSession).toHaveBeenCalledTimes(
        2,
      );
      expect(mockSession.disconnect).toHaveBeenCalledTimes(2);
      expect(mockClient.stop).toHaveBeenCalledTimes(2);
    });

    it('should execute review phases matching file changes using array include and exclude filters', async () => {
      const mockFiles = [
        { path: 'src/Program.cs', status: 'modified' },
        { path: 'src/index.js', status: 'added' },
        { path: 'src/main.test.ts', status: 'added' },
      ];
      mockGitService.getDiffFiles.mockResolvedValue(mockFiles);

      const mockPhases = [
        {
          id: '010-src.md',
          title: 'Source Review',
          include: ['**/*.cs', '**/*.js'],
          body: 'Check source code style',
        },
        {
          id: '020-tests.md',
          title: 'Test Review',
          include: ['**/*.test.ts', '**/*.spec.ts'],
          exclude: ['**/*.js'],
          body: 'Check test style',
        },
        {
          id: '030-ignored.md',
          title: 'Ignored Review',
          include: ['**/*.py'],
          body: 'Check python style',
        },
        {
          id: '040-excluded.md',
          title: 'Excluded Review',
          include: ['**/*.cs', '**/*.js'],
          exclude: ['**/*.cs', '**/*.js'],
          body: 'Check excluded style',
        },
      ];
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue(
        mockPhases,
      );

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue(
        '{"type":"general","comment":"Comment"}',
      );

      const onLineCallback = vi.fn();
      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        enabledPhaseIds: [
          '010-src.md',
          '020-tests.md',
          '030-ignored.md',
          '040-excluded.md',
        ],
        onLine: onLineCallback,
      });

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'phase-start',
          phaseId: '010-src.md',
          phaseTitle: 'Source Review',
        }),
      );

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'phase-start',
          phaseId: '020-tests.md',
          phaseTitle: 'Test Review',
        }),
      );

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'phase-skip',
          phaseId: '030-ignored.md',
          phaseTitle: 'Ignored Review',
          reason: 'No matching files found',
        }),
      );

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'phase-skip',
          phaseId: '040-excluded.md',
          phaseTitle: 'Excluded Review',
          reason: 'No matching files found',
        }),
      );

      expect(mockCopilotService.createClientAndSession).toHaveBeenCalledTimes(
        2,
      );
      expect(mockSession.disconnect).toHaveBeenCalledTimes(2);
      expect(mockClient.stop).toHaveBeenCalledTimes(2);
    });

    it('should attach PR description when phase configuration requires it', async () => {
      const mockFiles = [{ path: 'src/Program.cs', status: 'modified' }];
      mockGitService.getDiffFiles.mockResolvedValue(mockFiles);

      const mockPhases = [
        {
          id: '010-dod.md',
          title: 'DoD Review',
          attach: "['description']",
          body: 'Check requirements',
        },
      ];
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue(
        mockPhases,
      );

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue(
        '{"type":"general","comment":"Comment"}',
      );

      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        enabledPhaseIds: ['010-dod.md'],
        prDescription: 'This is the description of the PR.',
        onLine: vi.fn(),
      });

      const expectedPrompt = buildPhaseReviewPrompt(
        mockFiles,
        'DoD Review',
        'Check requirements',
        '',
        'This is the description of the PR.',
      );

      expect(mockCopilotService.sendAndCollectStream).toHaveBeenCalledWith(
        mockSession,
        expectedPrompt,
        expect.any(Function),
      );
    });

    it('should fetch PR description dynamically using getPRDetails if prId is provided', async () => {
      const mockFiles = [{ path: 'src/Program.cs', status: 'modified' }];
      mockGitService.getDiffFiles.mockResolvedValue(mockFiles);

      const mockPhases = [
        {
          id: '010-dod.md',
          title: 'DoD Review',
          attach: "['description']",
          body: 'Check requirements',
        },
      ];
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue(
        mockPhases,
      );

      const getPRDetailsSpy = vi
        .spyOn(prReviewerService, 'getPRDetails')
        .mockResolvedValue({
          id: '123',
          title: 'Title',
          description: 'Dynamically fetched full description of the PR.',
          sourceBranch: 'feature',
          targetBranch: 'main',
          author: 'John Author',
          repositoryName: 'repo',
          hostType: 'azure',
        });

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue(
        '{"type":"general","comment":"Comment"}',
      );

      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        enabledPhaseIds: ['010-dod.md'],
        prId: '123',
        prDescription: 'Truncated description...',
        onLine: vi.fn(),
      });

      const expectedPrompt = buildPhaseReviewPrompt(
        mockFiles,
        'DoD Review',
        'Check requirements',
        '',
        'Dynamically fetched full description of the PR.',
      );

      expect(getPRDetailsSpy).toHaveBeenCalledWith(
        '/mock/repo',
        '123',
        settings,
      );
      expect(mockCopilotService.sendAndCollectStream).toHaveBeenCalledWith(
        mockSession,
        expectedPrompt,
        expect.any(Function),
      );
    });
  });

  describe('checkoutAndDiff with original state tracking', () => {
    beforeEach(() => {
      mockGitService.getCurrentRef = vi
        .fn()
        .mockResolvedValue('original-branch-ref');
      mockGitService.restoreRef = vi.fn().mockResolvedValue(undefined);
    });

    it('should capture original ref and check out PR', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(true);
      mockGitService.hasUncommittedChanges.mockResolvedValue(false);
      mockGitService.fetchAndCheckoutPR.mockResolvedValue('pr-sha');

      const result = await prReviewerService.checkoutAndDiff('/mock/repo', 123);
      expect(result).toEqual({ commitSha: 'pr-sha' });
      expect(mockGitService.getCurrentRef).toHaveBeenCalledWith('/mock/repo');
    });

    it('should restore previous checkout first if checking out again on the same repo', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(true);
      mockGitService.hasUncommittedChanges.mockResolvedValue(false);
      mockGitService.fetchAndCheckoutPR.mockResolvedValue('pr-sha');

      // First checkout
      await prReviewerService.checkoutAndDiff('/mock/repo', 123);
      expect(mockGitService.restoreRef).not.toHaveBeenCalled();

      // Second checkout on same repo
      await prReviewerService.checkoutAndDiff('/mock/repo', 456);
      expect(mockGitService.restoreRef).toHaveBeenCalledWith(
        '/mock/repo',
        'original-branch-ref',
      );
    });
  });

  describe('reviewPR with automatic restoration', () => {
    const settings = {
      copilotToken: 'mock-token',
      copilotModel: 'mock-model',
    };

    beforeEach(() => {
      mockGitService.getCurrentRef = vi
        .fn()
        .mockResolvedValue('original-branch-ref');
      mockGitService.restoreRef = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue([
        {
          id: '010-dod.md',
          title: 'DoD Review',
          body: 'Check requirements',
        },
      ]);
    });

    it('should automatically restore repository to original ref in finally block', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(true);
      mockGitService.hasUncommittedChanges.mockResolvedValue(false);
      mockGitService.fetchAndCheckoutPR.mockResolvedValue('pr-sha');

      // Checkout PR (captures original-branch-ref)
      await prReviewerService.checkoutAndDiff('/mock/repo', 123);

      mockGitService.getDiffFiles.mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ]);
      const mockSession = { disconnect: vi.fn().mockResolvedValue(undefined) };
      const mockClient = { stop: vi.fn().mockResolvedValue(undefined) };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue('done');

      // Run review
      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        enabledPhaseIds: ['010-dod.md'],
      });

      // Verify restoreRef was called with original-branch-ref
      expect(mockGitService.restoreRef).toHaveBeenCalledWith(
        '/mock/repo',
        'original-branch-ref',
      );
    });
  });
});
