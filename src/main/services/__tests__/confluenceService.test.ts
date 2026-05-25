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
});
