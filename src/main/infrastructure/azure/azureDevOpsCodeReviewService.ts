import * as azdev from 'azure-devops-node-api';
import { IGitApi } from 'azure-devops-node-api/GitApi';
import {
  GitPullRequestSearchCriteria,
  GitPullRequestCommentThread,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { CodeReviewProvider } from '../providers/CodeReviewProvider';
import { PRMetadata } from '../../../types';
import { getAttributionStatement } from '../constants';

export class AzureDevOpsCodeReviewService implements CodeReviewProvider {
  private gitApi: IGitApi | null = null;
  private connection: azdev.WebApi | null = null;

  constructor(
    private org: string,
    private pat: string,
    private defaultProject: string,
  ) {}

  private getOrgUrl(orgName: string): string {
    if (orgName.startsWith('http://') || orgName.startsWith('https://')) {
      return orgName;
    }
    return `https://dev.azure.com/${orgName}`;
  }

  private async getClientForOrg(orgName: string): Promise<IGitApi> {
    if (orgName.toLowerCase() === this.org.toLowerCase() && this.gitApi) {
      return this.gitApi;
    }
    const orgUrl = this.getOrgUrl(orgName);
    const authHandler = azdev.getPersonalAccessTokenHandler(this.pat);
    const connection = new azdev.WebApi(orgUrl, authHandler);
    const gitApi = await connection.getGitApi();
    if (orgName.toLowerCase() === this.org.toLowerCase()) {
      this.connection = connection;
      this.gitApi = gitApi;
    }
    return gitApi;
  }

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

  async getPRDetails(
    repoPath: string,
    prUrlOrId: string,
    remoteUrl?: string | null,
  ): Promise<PRMetadata> {
    let prNumber = parseInt(prUrlOrId);
    let org = this.org;
    let project = this.defaultProject;

    const parsedUrl = this.parsePRUrl(prUrlOrId);
    if (parsedUrl) {
      prNumber = parsedUrl.prNumber;
      org = parsedUrl.org;
      project = parsedUrl.project;
    } else if (isNaN(prNumber)) {
      throw new Error(`Invalid Pull Request URL or ID format: "${prUrlOrId}"`);
    } else {
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

    const gitApi = await this.getClientForOrg(org);

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
      const orgUrl = this.getOrgUrl(org);
      const baseUrl = orgUrl.endsWith('/') ? orgUrl.slice(0, -1) : orgUrl;
      const prId = pr.pullRequestId?.toString() || prNumber.toString();
      const repoName = pr.repository?.name || '';
      const webUrl = `${baseUrl}/${project}/_git/${repoName}/pullrequest/${prId}`;

      return {
        id: prId,
        title: pr.title || '',
        description: pr.description || '',
        sourceBranch: cleanRef(pr.sourceRefName || ''),
        targetBranch: cleanRef(pr.targetRefName || ''),
        author: pr.createdBy?.displayName || '',
        authorUniqueName: pr.createdBy?.uniqueName || '',
        repositoryName: repoName,
        repositoryId: pr.repository?.id,
        hostType: 'azure',
        url: webUrl,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch PR from Azure DevOps API: ${errMsg}`, {
        cause: error,
      });
    }
  }

  async getProjectPRs(
    searchType: 'assigned' | 'created' | 'all',
  ): Promise<PRMetadata[]> {
    const gitApi = await this.getClientForOrg(this.org);
    const orgUrl = this.getOrgUrl(this.org);

    try {
      let reviewerId: string | undefined;
      let creatorId: string | undefined;

      if (searchType === 'assigned' || searchType === 'created') {
        const orgUrl = this.getOrgUrl(this.org);
        const authHandler = azdev.getPersonalAccessTokenHandler(this.pat);
        const connection =
          this.connection || new azdev.WebApi(orgUrl, authHandler);
        if (!this.connection) {
          this.connection = connection;
        }
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
        this.defaultProject,
        searchCriteria,
      );
      const cleanRef = (ref: string) => ref.replace(/^refs\/heads\//, '');
      return prs.map((pr) => {
        const prId = pr.pullRequestId?.toString() || '';
        const repoName = pr.repository?.name || '';
        const baseUrl = orgUrl.endsWith('/') ? orgUrl.slice(0, -1) : orgUrl;
        const webUrl = prId
          ? `${baseUrl}/${this.defaultProject}/_git/${repoName}/pullrequest/${prId}`
          : undefined;
        return {
          id: prId,
          title: pr.title || '',
          description: pr.description || '',
          sourceBranch: cleanRef(pr.sourceRefName || ''),
          targetBranch: cleanRef(pr.targetRefName || ''),
          author: pr.createdBy?.displayName || '',
          authorUniqueName: pr.createdBy?.uniqueName || '',
          repositoryName: repoName,
          hostType: 'azure',
          url: webUrl,
        };
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to query PRs from Azure DevOps: ${errMsg}`, {
        cause: error,
      });
    }
  }

  async getLinkedTickets(
    prId: string,
    repositoryId?: string,
  ): Promise<string[]> {
    if (!repositoryId) {
      throw new Error(
        'Repository ID is required to fetch linked tickets in Azure DevOps.',
      );
    }
    const gitApi = await this.getClientForOrg(this.org);
    const prNumber = parseInt(prId);

    try {
      const workItemRefs = await gitApi.getPullRequestWorkItemRefs(
        repositoryId,
        prNumber,
      );
      return (workItemRefs || [])
        .map((ref) => ref.id)
        .filter((id): id is string => typeof id === 'string' && id !== '');
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to fetch linked work items from Azure DevOps: ${errMsg}`,
        {
          cause: error,
        },
      );
    }
  }

  async postPRComment(
    repoPath: string,
    prUrlOrId: string,
    comment: {
      type: 'general' | 'line';
      file?: string;
      line?: number;
      comment: string;
      edited?: boolean;
    },
    remoteUrl?: string | null,
  ): Promise<void> {
    let prNumber = parseInt(prUrlOrId);
    let org = this.org;
    let project = this.defaultProject;

    const parsedUrl = this.parsePRUrl(prUrlOrId);
    if (parsedUrl) {
      prNumber = parsedUrl.prNumber;
      org = parsedUrl.org;
      project = parsedUrl.project;
    } else if (isNaN(prNumber)) {
      throw new Error(`Invalid Pull Request URL or ID format: "${prUrlOrId}"`);
    } else {
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

    const gitApi = await this.getClientForOrg(org);

    // Fetch the pull request to get the repository ID
    const prDetails = await gitApi.getPullRequestById(prNumber);
    if (!prDetails || !prDetails.repository || !prDetails.repository.id) {
      throw new Error(`Pull Request #${prNumber} not found.`);
    }

    const repositoryId = prDetails.repository.id;

    const disclaimer = ['', getAttributionStatement(comment.edited)].join('\n');

    const contentWithDisclaimer = comment.comment + disclaimer;

    // Define the thread
    const thread: GitPullRequestCommentThread = {
      comments: [
        {
          parentCommentId: 0,
          content: contentWithDisclaimer,
          commentType: 1, // Text comment
        },
      ],
      status: 1, // Active
    };

    if (comment.type === 'line' && comment.file && comment.line) {
      let formattedPath = comment.file.replace(/\\/g, '/');
      if (!formattedPath.startsWith('/')) {
        formattedPath = '/' + formattedPath;
      }
      thread.threadContext = {
        filePath: formattedPath,
        rightFileStart: {
          line: comment.line,
          offset: 1,
        },
        rightFileEnd: {
          line: comment.line + 1,
          offset: 1,
        },
      };
    }

    try {
      await gitApi.createThread(thread, repositoryId, prNumber, project);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create comment thread: ${errMsg}`, {
        cause: error,
      });
    }
  }
}
