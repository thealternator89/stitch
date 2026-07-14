import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  encryptSettings,
  decryptSettings,
  migrateStoredSettings,
} from '../settingsSecureStorage';
import { AppSettings } from '../../../types';

const { mockSafeStorage } = vi.hoisted(() => {
  return {
    mockSafeStorage: {
      isEncryptionAvailable: vi.fn().mockReturnValue(true),
      encryptString: vi
        .fn()
        .mockImplementation((val: string) => Buffer.from(`mock_enc_${val}`)),
      decryptString: vi.fn().mockImplementation((buf: Buffer) => {
        const str = buf.toString();
        if (str.startsWith('mock_enc_')) {
          return str.substring('mock_enc_'.length);
        }
        throw new Error('Invalid encrypted buffer');
      }),
    },
  };
});

vi.mock('electron', () => {
  return {
    safeStorage: mockSafeStorage,
  };
});

describe('settingsSecureStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
  });

  describe('encryptSecret', () => {
    it('should encrypt a secret if safeStorage encryption is available', () => {
      const result = encryptSecret('my-secret-key');
      expect(result).toBe('secure:v1:bW9ja19lbmNfbXktc2VjcmV0LWtleQ==');
      expect(mockSafeStorage.encryptString).toHaveBeenCalledWith(
        'my-secret-key',
      );
    });

    it('should return the original string if it is already encrypted', () => {
      const result = encryptSecret('secure:v1:alreadyencrypted');
      expect(result).toBe('secure:v1:alreadyencrypted');
      expect(mockSafeStorage.encryptString).not.toHaveBeenCalled();
    });

    it('should return the original string if encryption is not available', () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
      const result = encryptSecret('my-secret-key');
      expect(result).toBe('my-secret-key');
      expect(mockSafeStorage.encryptString).not.toHaveBeenCalled();
    });

    it('should return the original value for empty/undefined values', () => {
      expect(encryptSecret('')).toBe('');
      expect(encryptSecret(undefined)).toBeUndefined();
    });

    it('should fallback to plain text if safeStorage.encryptString throws', () => {
      mockSafeStorage.encryptString.mockImplementationOnce(() => {
        throw new Error('Encryption failed');
      });
      const result = encryptSecret('my-secret-key');
      expect(result).toBe('my-secret-key');
    });
  });

  describe('decryptSecret', () => {
    it('should decrypt an encrypted secret', () => {
      // 'mock_enc_hello' in base64 is 'bW9ja19lbmNfaGVsbG8='
      const result = decryptSecret('secure:v1:bW9ja19lbmNfaGVsbG8=');
      expect(result).toBe('hello');
      expect(mockSafeStorage.decryptString).toHaveBeenCalled();
    });

    it('should return the original string if it is not encrypted', () => {
      const result = decryptSecret('plain-text');
      expect(result).toBe('plain-text');
      expect(mockSafeStorage.decryptString).not.toHaveBeenCalled();
    });

    it('should return the original string if encryption is not available', () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
      const result = decryptSecret('secure:v1:bW9ja19lbmNfaGVsbG8=');
      expect(result).toBe('secure:v1:bW9ja19lbmNfaGVsbG8=');
      expect(mockSafeStorage.decryptString).not.toHaveBeenCalled();
    });

    it('should return undefined if safeStorage.decryptString throws', () => {
      mockSafeStorage.decryptString.mockImplementationOnce(() => {
        throw new Error('Decryption failed');
      });
      const result = decryptSecret('secure:v1:bW9ja19lbmNfaGVsbG8=');
      expect(result).toBeUndefined();
    });
  });

  describe('encryptSettings', () => {
    it('should encrypt secret settings and leave other settings intact', () => {
      const settings: AppSettings = {
        copilotToken: 'copilot-abc',
        connectors: {
          atlassian: {
            url: 'https://confluence',
            token: 'confluence-xyz',
          },
          azureDevOps: {
            org: 'my-org',
            pat: 'pat-123',
          },
        },
      };

      const result = encryptSettings(settings);
      expect(result.copilotToken).toBe(
        'secure:v1:bW9ja19lbmNfY29waWxvdC1hYmM=',
      );
      expect(result.connectors?.atlassian?.url).toBe('https://confluence');
      expect(result.connectors?.atlassian?.token).toBe(
        'secure:v1:bW9ja19lbmNfY29uZmx1ZW5jZS14eXo=',
      );
      expect(result.connectors?.azureDevOps?.org).toBe('my-org');
      expect(result.connectors?.azureDevOps?.pat).toBe(
        'secure:v1:bW9ja19lbmNfcGF0LTEyMw==',
      );
    });
  });

  describe('decryptSettings', () => {
    it('should decrypt secret settings and leave other settings intact', () => {
      const settings: AppSettings = {
        copilotToken: 'secure:v1:bW9ja19lbmNfY29waWxvdC1hYmM=',
        connectors: {
          atlassian: {
            url: 'https://confluence',
            token: 'secure:v1:bW9ja19lbmNfY29uZmx1ZW5jZS14eXo=',
          },
          azureDevOps: {
            org: 'my-org',
            pat: 'secure:v1:bW9ja19lbmNfcGF0LTEyMw==',
          },
        },
      };

      const result = decryptSettings(settings);
      expect(result.copilotToken).toBe('copilot-abc');
      expect(result.connectors?.atlassian?.url).toBe('https://confluence');
      expect(result.connectors?.atlassian?.token).toBe('confluence-xyz');
      expect(result.connectors?.azureDevOps?.org).toBe('my-org');
      expect(result.connectors?.azureDevOps?.pat).toBe('pat-123');
    });
  });

  describe('migrateStoredSettings', () => {
    it('should migrate plain-text secrets in the store and populate version/types/connectors if encryption is available', async () => {
      const mockStoreSettings = {
        azureOrg: 'my-org',
        azurePat: 'pat-123',
        copilotToken: 'secure:v1:already-encrypted',
      };

      const mockStore = {
        get: vi.fn().mockReturnValue(mockStoreSettings),
        set: vi.fn(),
      };

      await migrateStoredSettings(mockStore);

      expect(mockStore.get).toHaveBeenCalledWith('settings');
      expect(mockStore.set).toHaveBeenCalledWith('settings', {
        copilotToken: 'secure:v1:already-encrypted',
        version: 2,
        featureType: 'Feature',
        storyType: 'Product Backlog Item',
        taskType: 'Task',
        testTaskTitle: 'Testing',
        connectors: {
          azureDevOps: {
            org: 'my-org',
            project: '',
            pat: 'secure:v1:bW9ja19lbmNfcGF0LTEyMw==',
          },
        },
        sources: {
          issues: 'azureDevOps',
          code: 'azureDevOps',
          docs: 'atlassian',
        },
      });
    });

    it('should do nothing if all secrets are already encrypted and version is present (v2)', async () => {
      const mockStoreSettings = {
        copilotToken: 'secure:v1:xyz',
        version: 2,
        featureType: 'Feature',
        storyType: 'Product Backlog Item',
        taskType: 'Task',
        testTaskTitle: 'Testing',
        connectors: {
          azureDevOps: {
            org: 'my-org',
            project: 'my-proj',
            pat: 'secure:v1:bW9ja19lbmNfYWJj',
          },
        },
        sources: {
          issues: 'azureDevOps',
          code: 'azureDevOps',
          docs: 'atlassian',
        },
      };

      const mockStore = {
        get: vi.fn().mockReturnValue(mockStoreSettings),
        set: vi.fn(),
      };

      await migrateStoredSettings(mockStore);
      expect(mockStore.set).not.toHaveBeenCalled();
    });

    it('should do nothing (regarding encryption) if encryption is not available, but should still migrate version to v2 if missing', async () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
      const mockStoreSettings = {
        azureOrg: 'my-org',
        azurePat: 'pat-123',
      };

      const mockStore = {
        get: vi.fn().mockReturnValue(mockStoreSettings),
        set: vi.fn(),
      };

      await migrateStoredSettings(mockStore);
      expect(mockStore.set).toHaveBeenCalledWith('settings', {
        version: 2,
        featureType: 'Feature',
        storyType: 'Product Backlog Item',
        taskType: 'Task',
        testTaskTitle: 'Testing',
        connectors: {
          azureDevOps: {
            org: 'my-org',
            project: '',
            pat: 'pat-123',
          },
        },
        sources: {
          issues: 'azureDevOps',
          code: 'azureDevOps',
          docs: 'atlassian',
        },
      });
    });

    it('should do nothing if no settings exist in the store', async () => {
      const mockStore = {
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn(),
      };

      await migrateStoredSettings(mockStore);
      expect(mockStore.set).not.toHaveBeenCalled();
    });

    it('should migrate settings to v2 and populate version and default types if version is missing', async () => {
      const mockStoreSettings = {
        azureOrg: 'my-org',
        azurePat: 'secure:v1:bW9ja19lbmNfYWJj',
      };

      const mockStore = {
        get: vi.fn().mockReturnValue(mockStoreSettings),
        set: vi.fn(),
      };

      await migrateStoredSettings(mockStore);

      expect(mockStore.set).toHaveBeenCalledWith('settings', {
        version: 2,
        featureType: 'Feature',
        storyType: 'Product Backlog Item',
        taskType: 'Task',
        testTaskTitle: 'Testing',
        connectors: {
          azureDevOps: {
            org: 'my-org',
            project: '',
            pat: 'secure:v1:bW9ja19lbmNfYWJj',
          },
        },
        sources: {
          issues: 'azureDevOps',
          code: 'azureDevOps',
          docs: 'atlassian',
        },
      });
    });

    it('should not overwrite existing custom work item types during migration', async () => {
      const mockStoreSettings = {
        azureOrg: 'my-org',
        azurePat: 'secure:v1:bW9ja19lbmNfYWJj',
        featureType: 'CustomFeature',
        storyType: 'CustomStory',
        taskType: 'CustomTask',
        testTaskTitle: 'CustomTesting',
      };

      const mockStore = {
        get: vi.fn().mockReturnValue(mockStoreSettings),
        set: vi.fn(),
      };

      await migrateStoredSettings(mockStore);

      expect(mockStore.set).toHaveBeenCalledWith('settings', {
        version: 2,
        featureType: 'CustomFeature',
        storyType: 'CustomStory',
        taskType: 'CustomTask',
        testTaskTitle: 'CustomTesting',
        connectors: {
          azureDevOps: {
            org: 'my-org',
            project: '',
            pat: 'secure:v1:bW9ja19lbmNfYWJj',
          },
        },
        sources: {
          issues: 'azureDevOps',
          code: 'azureDevOps',
          docs: 'atlassian',
        },
      });
    });
  });
});
