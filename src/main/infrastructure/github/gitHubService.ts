import { IssueTrackerProvider } from '../providers/IssueTrackerProvider';
import { TicketData } from '../../../types';
import { getAttributionStatement } from '../constants';

export class GitHubService implements IssueTrackerProvider {
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

  private parseTicketId(ticketId: string): {
    owner: string;
    repo: string;
    number: string;
  } {
    const trimmed = ticketId.trim();
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      if (parts.length === 3) {
        return { owner: parts[0], repo: parts[1], number: parts[2] };
      } else if (parts.length === 2) {
        if (!this.defaultOwner) {
          throw new Error(
            'GitHub Owner/Organization must be configured in settings to parse two-part ticket IDs (e.g. "repo-name/123").',
          );
        }
        return { owner: this.defaultOwner, repo: parts[0], number: parts[1] };
      }
    }
    if (!this.defaultOwner) {
      throw new Error(
        'GitHub Owner/Organization must be configured in settings.',
      );
    }
    throw new Error(
      `Repository name must be specified or included in the ticket ID (e.g. "repo-name/123") because no default repository is configured.`,
    );
  }

  async fetchTicket(ticketId: string): Promise<TicketData> {
    const { owner, repo, number } = this.parseTicketId(ticketId);
    try {
      const issue = await this.request(
        `/repos/${owner}/${repo}/issues/${number}`,
      );
      return {
        id: `${repo}/${issue.number}`,
        title: issue.title || '',
        description: issue.body || '',
        acceptanceCriteria: '',
      };
    } catch (error) {
      console.error('Error fetching GitHub issue:', error);
      throw error;
    }
  }

  async addComment(
    ticketId: string,
    text: string,
    options?: { edited?: boolean },
  ): Promise<void> {
    const { owner, repo, number } = this.parseTicketId(ticketId);
    const body = [text, '', getAttributionStatement(options?.edited)].join(
      '\n',
    );
    await this.request(`/repos/${owner}/${repo}/issues/${number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async createTicket(
    type: string,
    parentTicketId: string,
    data: TicketData,
    options?: { edited?: boolean },
  ): Promise<void> {
    const { owner, repo, number } = this.parseTicketId(parentTicketId);
    const attribution = getAttributionStatement(options?.edited);
    const body = [
      data.description || '',
      '',
      attribution,
      '',
      `Parent Issue: #${number}`,
    ].join('\n');

    const labels = type ? [type] : [];
    const createdIssue = await this.request(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: data.title,
        body,
        labels,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (createdIssue && createdIssue.id) {
      try {
        await this.request(
          `/repos/${owner}/${repo}/issues/${number}/sub_issues`,
          {
            method: 'POST',
            body: JSON.stringify({
              sub_issue_id: createdIssue.id,
            }),
            headers: { 'Content-Type': 'application/json' },
          },
        );
      } catch (err) {
        console.error(
          'Failed to link created issue as sub-issue on GitHub:',
          err,
        );
      }
    }
  }

  async searchTickets(query: string, type?: string): Promise<TicketData[]> {
    if (!this.defaultOwner) {
      throw new Error(
        'GitHub Owner/Organization must be configured in settings to search tickets.',
      );
    }
    const cleanQuery = query.trim();
    const isCompositeId = /^[^/]+\/\d+$/.test(cleanQuery);
    const isNumber = /^\d+$/.test(cleanQuery);
    const results: TicketData[] = [];

    if (isNumber || isCompositeId) {
      try {
        const exactMatch = await this.fetchTicket(cleanQuery);
        results.push(exactMatch);
      } catch {
        // Suppress and continue
      }
    }

    try {
      let q = `user:${this.defaultOwner} is:issue ${cleanQuery}`;
      if (type) {
        q += ` label:"${type}"`;
      }
      const searchResponse = await this.request(
        `/search/issues?q=${encodeURIComponent(q)}`,
      );
      const items = searchResponse.items || [];
      const getRepoName = (repoUrl: string) => {
        const parts = repoUrl.split('/');
        return parts[parts.length - 1] || '';
      };

      for (const item of items) {
        const repoName = getRepoName(item.repository_url);
        const compositeId = `${repoName}/${item.number}`;
        if (results.some((r) => r.id === compositeId)) {
          continue;
        }
        results.push({
          id: compositeId,
          title: item.title || '',
          description: item.body || '',
          acceptanceCriteria: '',
        });
      }
      return results.slice(0, 20);
    } catch (error) {
      console.error('Error searching GitHub issues:', error);
      throw error;
    }
  }
}
