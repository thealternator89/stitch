import { IssueTrackerProvider } from '../providers/IssueTrackerProvider';
import { TicketData } from '../../../types';
import { getAttributionStatement } from '../constants';

export class GitHubService implements IssueTrackerProvider {
  constructor(
    private token: string,
    private defaultOwner: string,
    private defaultRepo: string,
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

  async fetchTicket(ticketId: string): Promise<TicketData> {
    if (!this.defaultOwner || !this.defaultRepo) {
      throw new Error(
        'Default GitHub Owner and Repository must be configured in settings to fetch tickets.',
      );
    }
    try {
      const issue = await this.request(
        `/repos/${this.defaultOwner}/${this.defaultRepo}/issues/${ticketId}`,
      );
      return {
        id: issue.number.toString(),
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
    if (!this.defaultOwner || !this.defaultRepo) {
      throw new Error(
        'Default GitHub Owner and Repository must be configured in settings to add comments.',
      );
    }
    const body = [text, '', getAttributionStatement(options?.edited)].join(
      '\n',
    );
    await this.request(
      `/repos/${this.defaultOwner}/${this.defaultRepo}/issues/${ticketId}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ body }),
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  async createTicket(
    type: string,
    parentTicketId: string,
    data: TicketData,
    options?: { edited?: boolean },
  ): Promise<void> {
    if (!this.defaultOwner || !this.defaultRepo) {
      throw new Error(
        'Default GitHub Owner and Repository must be configured in settings to create tickets.',
      );
    }
    const attribution = getAttributionStatement(options?.edited);
    const body = [
      data.description || '',
      '',
      attribution,
      '',
      `Parent Issue: #${parentTicketId}`,
    ].join('\n');

    await this.request(
      `/repos/${this.defaultOwner}/${this.defaultRepo}/issues`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: data.title,
          body,
          labels: [type],
        }),
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  async searchTickets(query: string, type?: string): Promise<TicketData[]> {
    if (!this.defaultOwner || !this.defaultRepo) {
      throw new Error(
        'Default GitHub Owner and Repository must be configured in settings to search tickets.',
      );
    }
    const cleanQuery = query.trim();
    const isNumber = /^\d+$/.test(cleanQuery);
    const results: TicketData[] = [];

    if (isNumber) {
      try {
        const exactMatch = await this.fetchTicket(cleanQuery);
        results.push(exactMatch);
      } catch {
        // Suppress and continue
      }
    }

    try {
      let q = `repo:${this.defaultOwner}/${this.defaultRepo} is:issue ${cleanQuery}`;
      if (type) {
        q += ` label:"${type}"`;
      }
      const searchResponse = await this.request(
        `/search/issues?q=${encodeURIComponent(q)}`,
      );
      const items = searchResponse.items || [];
      for (const item of items) {
        if (results.some((r) => r.id === item.number.toString())) {
          continue;
        }
        results.push({
          id: item.number.toString(),
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
