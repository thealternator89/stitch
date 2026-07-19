import { CodeReviewProvider } from '../providers/CodeReviewProvider';
import { PRMetadata } from '../../../types';
import { getAttributionStatement } from '../constants';

export class GitHubCodeReviewService implements CodeReviewProvider {
  constructor(
    private token: string,
    private defaultOwner: string,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const url = `https://api.github.com${path}`;
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Stitch-App',
      ...options.headers,
    };
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `GitHub API error (${response.status}): ${body || response.statusText}`,
      );
    }
    if (response.status === 204) {
      return;
    }
    return response.json();
  }

  parsePRUrl(url: string): {
    org: string;
    project: string;
    repoName: string;
    prNumber: number;
  } | null {
    const trimmed = url.trim();
    const githubPrRegex =
      /https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i;
    const match = githubPrRegex.exec(trimmed);
    if (match) {
      return {
        org: match[1],
        project: match[1],
        repoName: match[2],
        prNumber: parseInt(match[3]),
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
    const httpsRegex =
      /https?:\/\/(?:[^/]+@)?github\.com\/([^/]+)\/([^/.]+)(?:\.git)?/i;
    let match = httpsRegex.exec(trimmed);
    if (match) {
      return {
        org: match[1],
        project: match[1],
        repoName: match[2].replace(/\.git$/, ''),
      };
    }

    const sshRegex =
      /(?:git@|ssh:\/\/git@)github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?/i;
    match = sshRegex.exec(trimmed);
    if (match) {
      return {
        org: match[1],
        project: match[1],
        repoName: match[2].replace(/\.git$/, ''),
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
    let owner = this.defaultOwner;
    let repoName: string | undefined = undefined;

    const parsedUrl = this.parsePRUrl(prUrlOrId);
    if (parsedUrl) {
      prNumber = parsedUrl.prNumber;
      owner = parsedUrl.org;
      repoName = parsedUrl.repoName;
    } else if (isNaN(prNumber)) {
      throw new Error(`Invalid Pull Request URL or ID format: "${prUrlOrId}"`);
    } else {
      if (remoteUrl) {
        const parsedRemote = this.parseRemoteUrl(remoteUrl);
        if (parsedRemote) {
          owner = parsedRemote.org;
          repoName = parsedRemote.repoName;
        }
      }
    }

    if (!owner || !repoName) {
      throw new Error(
        'GitHub Owner and Repository are not configured in settings and could not be detected from git remote.',
      );
    }

    try {
      const pr = await this.request(
        `/repos/${owner}/${repoName}/pulls/${prNumber}`,
      );
      if (!pr) {
        throw new Error(`Pull Request #${prNumber} not found.`);
      }

      return {
        id: pr.number.toString(),
        title: pr.title || '',
        description: pr.body || '',
        sourceBranch: pr.head?.ref || '',
        targetBranch: pr.base?.ref || '',
        author: pr.user?.login || '',
        authorUniqueName: pr.user?.login || '',
        repositoryName: repoName,
        repositoryId: pr.base?.repo?.id?.toString() || '',
        hostType: 'github',
        url: pr.html_url,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch PR from GitHub API: ${errMsg}`, {
        cause: error,
      });
    }
  }

  async getProjectPRs(
    searchType: 'assigned' | 'created' | 'all',
  ): Promise<PRMetadata[]> {
    if (!this.defaultOwner) {
      throw new Error(
        'GitHub Owner/Organization must be configured in settings to fetch project PRs.',
      );
    }

    try {
      let myLogin = '';
      if (searchType === 'assigned' || searchType === 'created') {
        const user = await this.request('/user');
        myLogin = user?.login || '';
      }

      let q = `user:${this.defaultOwner} is:pr is:open`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let items: any[] = [];

      if (searchType === 'created') {
        q += ` author:${myLogin}`;
        const res = await this.request(
          `/search/issues?q=${encodeURIComponent(q)}`,
        );
        items = res.items || [];
      } else if (searchType === 'assigned') {
        const qReviewer = `${q} review-requested:${myLogin}`;
        const qAssignee = `${q} assignee:${myLogin}`;

        const [resReviewer, resAssignee] = await Promise.all([
          this.request(`/search/issues?q=${encodeURIComponent(qReviewer)}`),
          this.request(`/search/issues?q=${encodeURIComponent(qAssignee)}`),
        ]);

        const combined = [
          ...(resReviewer.items || []),
          ...(resAssignee.items || []),
        ];
        const seen = new Set<string>();
        for (const item of combined) {
          const key = `${item.repository_url}/${item.number}`;
          if (!seen.has(key)) {
            seen.add(key);
            items.push(item);
          }
        }
      } else {
        const res = await this.request(
          `/search/issues?q=${encodeURIComponent(q)}`,
        );
        items = res.items || [];
      }

      const getRepoName = (repoUrl: string) => {
        const parts = repoUrl.split('/');
        return parts[parts.length - 1] || '';
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return items.map((item: any) => ({
        id: item.number.toString(),
        title: item.title || '',
        description: item.body || '',
        sourceBranch: '',
        targetBranch: '',
        author: item.user?.login || '',
        authorUniqueName: item.user?.login || '',
        repositoryName: getRepoName(item.repository_url),
        repositoryId: '',
        hostType: 'github',
        url: item.html_url,
      }));
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to query PRs from GitHub: ${errMsg}`, {
        cause: error,
      });
    }
  }

  async getLinkedTickets(
    prUrlOrId: string,
    _repositoryId?: string,
  ): Promise<string[]> {
    let prNumber = parseInt(prUrlOrId);
    let owner = this.defaultOwner;
    let repoName: string | undefined = undefined;

    const parsedUrl = this.parsePRUrl(prUrlOrId);
    if (parsedUrl) {
      prNumber = parsedUrl.prNumber;
      owner = parsedUrl.org;
      repoName = parsedUrl.repoName;
    }

    if (!owner || !repoName) {
      throw new Error(
        'GitHub Owner and Repository name are required to fetch linked tickets.',
      );
    }

    try {
      const pr = await this.request(
        `/repos/${owner}/${repoName}/pulls/${prNumber}`,
      );
      const body = pr.body || '';
      const ticketIds: string[] = [];
      const regex = /(?:#|issues\/)(\d+)/g;
      let match;
      while ((match = regex.exec(body)) !== null) {
        ticketIds.push(match[1]);
      }
      return Array.from(new Set(ticketIds));
    } catch (error: unknown) {
      console.warn(
        `Failed to fetch/parse linked tickets for PR #${prUrlOrId}:`,
        error,
      );
      return [];
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
    let owner = this.defaultOwner;
    let repoName: string | undefined = undefined;

    const parsedUrl = this.parsePRUrl(prUrlOrId);
    if (parsedUrl) {
      prNumber = parsedUrl.prNumber;
      owner = parsedUrl.org;
      repoName = parsedUrl.repoName;
    } else if (isNaN(prNumber)) {
      throw new Error(`Invalid Pull Request URL or ID format: "${prUrlOrId}"`);
    } else {
      if (remoteUrl) {
        const parsedRemote = this.parseRemoteUrl(remoteUrl);
        if (parsedRemote) {
          owner = parsedRemote.org;
          repoName = parsedRemote.repoName;
        }
      }
    }

    if (!owner || !repoName) {
      throw new Error(
        'GitHub Owner and Repository are not configured in settings and could not be detected from git remote.',
      );
    }

    const disclaimer = ['', getAttributionStatement(comment.edited)].join('\n');
    const contentWithDisclaimer = comment.comment + disclaimer;

    try {
      if (comment.type === 'general') {
        await this.request(
          `/repos/${owner}/${repoName}/issues/${prNumber}/comments`,
          {
            method: 'POST',
            body: JSON.stringify({ body: contentWithDisclaimer }),
            headers: { 'Content-Type': 'application/json' },
          },
        );
      } else if (comment.type === 'line' && comment.file && comment.line) {
        const prDetails = await this.request(
          `/repos/${owner}/${repoName}/pulls/${prNumber}`,
        );
        const commitId = prDetails.head?.sha;
        if (!commitId) {
          throw new Error('Could not resolve latest commit SHA for the PR.');
        }

        let formattedPath = comment.file.replace(/\\/g, '/');
        if (formattedPath.startsWith('/')) {
          formattedPath = formattedPath.substring(1);
        }

        await this.request(
          `/repos/${owner}/${repoName}/pulls/${prNumber}/comments`,
          {
            method: 'POST',
            body: JSON.stringify({
              body: contentWithDisclaimer,
              commit_id: commitId,
              path: formattedPath,
              line: comment.line,
              side: 'RIGHT',
            }),
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to post PR comment to GitHub: ${errMsg}`, {
        cause: error,
      });
    }
  }
}
