import * as azdev from 'azure-devops-node-api';
import { IGitApi } from 'azure-devops-node-api/GitApi';
import { GitPullRequestSearchCriteria } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { GitService } from '../../infrastructure/git/gitService';
import { PRMetadata, AppSettings } from '../../../types';

export class PRReviewerService {
  constructor(private gitService: GitService) {}

  parsePRUrl(url: string): {
    org: string;
    project: string;
    repoName: string;
    prNumber: number;
  } | null {
    const trimmed = url.trim();

    // Pattern 1: dev.azure.com
    // https://dev.azure.com/org/project/_git/repo/pullrequest/123
    const devAzureRegex =
      /https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/i;
    let match = devAzureRegex.exec(trimmed);
    if (match) {
      return {
        org: match[1],
        project: match[2],
        repoName: match[3],
        prNumber: parseInt(match[4]),
      };
    }

    // Pattern 2: visualstudio.com
    // https://org.visualstudio.com/project/_git/repo/pullrequest/123
    const vsRegex =
      /https:\/\/([^/]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/i;
    match = vsRegex.exec(trimmed);
    if (match) {
      return {
        org: match[1],
        project: match[2],
        repoName: match[3],
        prNumber: parseInt(match[4]),
      };
    }

    return null;
  }

  parseRemoteUrl(url: string): {
    org: string;
    project: string;
    repoName: string;
  } | null {
    const trimmed = url.trim();

    // Pattern 1: HTTPS dev.azure.com
    // https://dev.azure.com/org/project/_git/repo
    // or https://user@dev.azure.com/org/project/_git/repo
    const httpsRegex =
      /https:\/\/(?:[^/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/.]+)/i;
    let match = httpsRegex.exec(trimmed);
    if (match) {
      return {
        org: match[1],
        project: match[2],
        repoName: match[3],
      };
    }

    // Pattern 2: SSH dev.azure.com
    // git@ssh.dev.azure.com:v3/org/project/repo
    const sshRegex = /git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/.]+)/i;
    match = sshRegex.exec(trimmed);
    if (match) {
      return {
        org: match[1],
        project: match[2],
        repoName: match[3],
      };
    }

    // Pattern 3: Legacy HTTPS visualstudio.com
    // https://org.visualstudio.com/project/_git/repo
    const vsRegex =
      /https:\/\/([^/]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/.]+)/i;
    match = vsRegex.exec(trimmed);
    if (match) {
      return {
        org: match[1],
        project: match[2],
        repoName: match[3],
      };
    }

    return null;
  }

  private getOrgUrl(org: string): string {
    if (org.startsWith('http://') || org.startsWith('https://')) {
      return org;
    }
    return `https://dev.azure.com/${org}`;
  }

  async getPRDetails(
    repoPath: string,
    prUrlOrId: string,
    settings: AppSettings,
  ): Promise<PRMetadata> {
    let prNumber = parseInt(prUrlOrId);
    let org = settings.azureOrg || '';
    let project = settings.azureProject || '';

    const parsedUrl = this.parsePRUrl(prUrlOrId);
    if (parsedUrl) {
      prNumber = parsedUrl.prNumber;
      org = parsedUrl.org;
      project = parsedUrl.project;
    } else if (isNaN(prNumber)) {
      throw new Error(`Invalid Pull Request URL or ID format: "${prUrlOrId}"`);
    } else {
      // Try to detect org and project from remote URL
      const remoteUrl = await this.gitService.getRemoteUrl(repoPath);
      if (remoteUrl) {
        const parsedRemote = this.parseRemoteUrl(remoteUrl);
        if (parsedRemote) {
          org = org || parsedRemote.org;
          project = project || parsedRemote.project;
        }
      }
    }

    if (!org) {
      throw new Error(
        'Azure DevOps Organization is not configured in settings and could not be detected from git remote.',
      );
    }
    if (!project) {
      throw new Error(
        'Azure DevOps Project is not configured in settings and could not be detected from git remote.',
      );
    }

    const pat = settings.azurePat;
    if (!pat) {
      throw new Error(
        'Azure DevOps PAT token is missing. Please configure it in Settings.',
      );
    }

    const orgUrl = this.getOrgUrl(org);
    const authHandler = azdev.getPersonalAccessTokenHandler(pat);
    const connection = new azdev.WebApi(orgUrl, authHandler);
    const gitApi: IGitApi = await connection.getGitApi();

    try {
      const pr = await gitApi.getPullRequestById(prNumber);
      if (!pr) {
        throw new Error(`Pull Request #${prNumber} not found.`);
      }

      if (!pr.targetRefName) {
        throw new Error(
          `Pull Request #${prNumber} is missing target branch ref.`,
        );
      }

      const cleanRef = (ref: string) => ref.replace(/^refs\/heads\//, '');

      return {
        id: pr.pullRequestId?.toString() || prNumber.toString(),
        title: pr.title || '',
        description: pr.description || '',
        sourceBranch: cleanRef(pr.sourceRefName || ''),
        targetBranch: cleanRef(pr.targetRefName || ''),
        author: pr.createdBy?.displayName || '',
        repositoryName: pr.repository?.name || '',
        hostType: 'azure',
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch PR from Azure DevOps API: ${errMsg}`);
    }
  }

  async getProjectPRs(
    searchType: 'assigned' | 'created' | 'all',
    settings: AppSettings,
  ): Promise<PRMetadata[]> {
    const org = settings.azureOrg || '';
    const project = settings.azureProject || '';
    const pat = settings.azurePat;

    if (!org) {
      throw new Error(
        'Azure DevOps Organization is not configured in settings.',
      );
    }
    if (!project) {
      throw new Error('Azure DevOps Project is not configured in settings.');
    }
    if (!pat) {
      throw new Error(
        'Azure DevOps PAT token is missing. Please configure it in Settings.',
      );
    }

    const orgUrl = this.getOrgUrl(org);
    const authHandler = azdev.getPersonalAccessTokenHandler(pat);
    const connection = new azdev.WebApi(orgUrl, authHandler);
    const gitApi: IGitApi = await connection.getGitApi();

    try {
      let reviewerId: string | undefined;
      let creatorId: string | undefined;

      if (searchType === 'assigned' || searchType === 'created') {
        const connectionData = await connection.connect();
        const currentUserId = connectionData.authorizedUser?.id;
        if (!currentUserId) {
          throw new Error(
            'Could not resolve current authenticated user identity ID.',
          );
        }
        if (searchType === 'assigned') {
          reviewerId = currentUserId;
        } else {
          creatorId = currentUserId;
        }
      }

      const searchCriteria: GitPullRequestSearchCriteria = {
        status: 1, // Active
      };
      if (reviewerId) searchCriteria.reviewerId = reviewerId;
      if (creatorId) searchCriteria.creatorId = creatorId;

      const prs = await gitApi.getPullRequestsByProject(
        project,
        searchCriteria,
      );
      const cleanRef = (ref: string) => ref.replace(/^refs\/heads\//, '');

      return prs.map((pr) => ({
        id: pr.pullRequestId?.toString() || '',
        title: pr.title || '',
        description: pr.description || '',
        sourceBranch: cleanRef(pr.sourceRefName || ''),
        targetBranch: cleanRef(pr.targetRefName || ''),
        author: pr.createdBy?.displayName || '',
        repositoryName: pr.repository?.name || '',
        hostType: 'azure',
      }));
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to query PRs from Azure DevOps: ${errMsg}`);
    }
  }

  async checkoutAndDiff(
    repoPath: string,
    prNumber: number,
    expectedRepoName?: string,
  ): Promise<{ commitSha: string }> {
    const isRepo = await this.gitService.checkGitRepo(repoPath);
    if (!isRepo) {
      throw new Error('The selected path is not a valid Git repository.');
    }

    if (expectedRepoName) {
      const remoteUrl = await this.gitService.getRemoteUrl(repoPath);
      if (remoteUrl) {
        const parsedRemote = this.parseRemoteUrl(remoteUrl);
        if (
          parsedRemote &&
          parsedRemote.repoName.toLowerCase() !== expectedRepoName.toLowerCase()
        ) {
          throw new Error(
            `The selected repository "${parsedRemote.repoName}" does not match the Pull Request repository "${expectedRepoName}".`,
          );
        }
      }
    }

    const isDirty = await this.gitService.hasUncommittedChanges(repoPath);
    if (isDirty) {
      throw new Error(
        'The local git repository has uncommitted changes. Please commit, stash, or revert them first.',
      );
    }

    const commitSha = await this.gitService.fetchAndCheckoutPR(
      repoPath,
      prNumber,
    );
    return { commitSha };
  }
}
