export class ConfluenceService {
  private url: string;
  private user: string;
  private token: string;

  constructor(url: string, user: string, token: string) {
    this.url = (url ?? '').toString().trim();
    this.user = (user ?? '').toString().trim();
    this.token = (token ?? '').toString().trim();
  }

  private getAuthHeader(): { header: string; scheme: 'Basic' | 'Bearer' } {
    if (this.user) {
      const auth = Buffer.from(`${this.user}:${this.token}`).toString('base64');
      return { header: `Basic ${auth}`, scheme: 'Basic' };
    }
    return { header: `Bearer ${this.token}`, scheme: 'Bearer' };
  }

  async fetchPage(pageId: string) {
    if (!this.url || !this.token) {
      throw new Error('ConfluenceService is missing base URL or token.');
    }

    // Normalize base URL: add scheme if missing and strip trailing slash
    let baseUrl = this.url;
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    if (!baseUrl.includes('/wiki')) {
      baseUrl += '/wiki';
    }

    const apiUrl = `${baseUrl}/rest/api/content/${encodeURIComponent(pageId)}?expand=body.storage`;

    const { header: authHeader, scheme } = this.getAuthHeader();

    console.log('Confluence API URL:', apiUrl);
    console.log('Confluence auth scheme:', scheme);

    try {
      // In newer Node/Electron versions, fetch is globally available
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const bodyText = await response
          .text()
          .catch((e) => `(parse failed: ${e.message ?? 'unknown'})`);
        throw new Error(
          `Failed to fetch Confluence page: ${response.status} ${response.statusText} ${bodyText}`,
        );
      }

      const data = await response.json();
      return {
        id: data.id,
        title: data.title,
        body: data.body?.storage?.value || '',
      };
    } catch (error) {
      console.error('Error fetching Confluence page:', error);
      throw error;
    }
  }
}
