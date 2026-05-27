/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfluenceService } from '../confluenceService';

describe('ConfluenceService', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor and Auth Header generation', () => {
    it('should generate Basic Auth when user is provided', async () => {
      const service = new ConfluenceService(
        'myorg.atlassian.net',
        'user@example.com',
        'token123',
      );
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '123',
          title: 'Test Page',
          body: { storage: { value: '<p>Hello</p>' } },
        }),
      } as Response);

      await service.fetchPage('123');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://myorg.atlassian.net/wiki/rest/api/content/123',
        ),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Basic ${Buffer.from('user@example.com:token123').toString('base64')}`,
          }),
        }),
      );
    });

    it('should generate Bearer Auth when user is not provided', async () => {
      const service = new ConfluenceService(
        'myorg.atlassian.net',
        '',
        'token123',
      );
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '123',
          title: 'Test Page',
          body: { storage: { value: '<p>Hello</p>' } },
        }),
      } as Response);

      await service.fetchPage('123');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://myorg.atlassian.net/wiki/rest/api/content/123',
        ),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token123',
          }),
        }),
      );
    });
  });

  describe('URL Normalization', () => {
    it('should normalize url correctly', async () => {
      const testCases = [
        {
          input: 'myorg.atlassian.net',
          expected:
            'https://myorg.atlassian.net/wiki/rest/api/content/123?expand=body.storage',
        },
        {
          input: 'http://myorg.atlassian.net/',
          expected:
            'http://myorg.atlassian.net/wiki/rest/api/content/123?expand=body.storage',
        },
        {
          input: 'https://myorg.atlassian.net/wiki',
          expected:
            'https://myorg.atlassian.net/wiki/rest/api/content/123?expand=body.storage',
        },
      ];

      for (const { input, expected } of testCases) {
        fetchSpy.mockClear();
        fetchSpy.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '123', title: 'Test Page' }),
        } as Response);

        const service = new ConfluenceService(
          input,
          'user@example.com',
          'token',
        );
        await service.fetchPage('123');

        expect(fetchSpy).toHaveBeenCalledWith(expected, expect.any(Object));
      }
    });
  });

  describe('fetchPage scenarios', () => {
    it('should return normalized DocPageData on success', async () => {
      const service = new ConfluenceService(
        'myorg.atlassian.net',
        'user',
        'token',
      );
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '555',
          title: 'Stitch Requirements',
          body: {
            storage: {
              value: '<h1>Requirement 1</h1>',
            },
          },
        }),
      } as Response);

      const result = await service.fetchPage('555');

      expect(result).toEqual({
        id: '555',
        title: 'Stitch Requirements',
        body: '<h1>Requirement 1</h1>',
      });
    });

    it('should throw an error if ConfluenceService is missing URL or token', async () => {
      const service = new ConfluenceService('', 'user', '');
      await expect(service.fetchPage('123')).rejects.toThrow(
        'ConfluenceService is missing base URL or token.',
      );
    });

    it('should throw detailed error if response is not ok', async () => {
      const service = new ConfluenceService(
        'myorg.atlassian.net',
        'user',
        'token',
      );
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Missing read permission',
      } as Response);

      await expect(service.fetchPage('123')).rejects.toThrow(
        'Failed to fetch Confluence page: 403 Forbidden Missing read permission',
      );
    });
  });

  describe('searchPages scenarios', () => {
    it('should search pages by text and map results on success', async () => {
      const service = new ConfluenceService(
        'myorg.atlassian.net',
        'user',
        'token',
      );

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: '101',
              title: 'Project Requirements',
              body: { storage: { value: '<p>Req content</p>' } },
            },
            {
              id: '102',
              title: 'API Spec Requirements',
              body: { storage: { value: '<p>API content</p>' } },
            },
          ],
        }),
      } as Response);

      const result = await service.searchPages('Requirements');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://myorg.atlassian.net/wiki/rest/api/content/search?cql=title%20~%20%22Requirements%22%20and%20type%20%3D%20%22page%22&expand=body.storage&limit=20',
        expect.any(Object),
      );

      expect(result).toEqual([
        {
          id: '101',
          title: 'Project Requirements',
          body: '<p>Req content</p>',
        },
        {
          id: '102',
          title: 'API Spec Requirements',
          body: '<p>API content</p>',
        },
      ]);
    });

    it('should prioritize exact matching Page ID first if query is numeric', async () => {
      const service = new ConfluenceService(
        'myorg.atlassian.net',
        'user',
        'token',
      );

      // First fetch: exact page fetch
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '555',
          title: 'Stitch Requirements',
          body: { storage: { value: '<h1>Exact match body</h1>' } },
        }),
      } as Response);

      // Second fetch: search pages fetch
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: '555',
              title: 'Stitch Requirements',
              body: { storage: { value: '<h1>Exact match body</h1>' } },
            },
            {
              id: '888',
              title: 'Other page 555',
              body: { storage: { value: '<p>Other body</p>' } },
            },
          ],
        }),
      } as Response);

      const result = await service.searchPages('555');

      expect(fetchSpy).toHaveBeenNthCalledWith(
        1,
        'https://myorg.atlassian.net/wiki/rest/api/content/555?expand=body.storage',
        expect.any(Object),
      );

      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        'https://myorg.atlassian.net/wiki/rest/api/content/search?cql=title%20~%20%22555%22%20and%20type%20%3D%20%22page%22&expand=body.storage&limit=20',
        expect.any(Object),
      );

      expect(result).toEqual([
        {
          id: '555',
          title: 'Stitch Requirements',
          body: '<h1>Exact match body</h1>',
        },
        {
          id: '888',
          title: 'Other page 555',
          body: '<p>Other body</p>',
        },
      ]);
    });
  });
});
