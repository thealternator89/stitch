import { safeStorage } from 'electron';
import { AppSettings } from '../../types';

const ENCRYPT_PREFIX = 'secure:v1:';

/**
 * Encrypts a single secret string using safeStorage if available.
 */
export function encryptSecret(
  plainText: string | undefined,
): string | undefined {
  if (!plainText) return plainText;
  if (plainText.startsWith(ENCRYPT_PREFIX)) {
    return plainText; // already encrypted
  }
  if (
    !safeStorage ||
    !safeStorage.isEncryptionAvailable ||
    !safeStorage.isEncryptionAvailable()
  ) {
    return plainText;
  }
  try {
    const encryptedBuffer = safeStorage.encryptString(plainText);
    return `${ENCRYPT_PREFIX}${encryptedBuffer.toString('base64')}`;
  } catch (error) {
    console.error('Failed to encrypt secret:', error);
    return plainText;
  }
}

/**
 * Decrypts a single secret string using safeStorage if available.
 */
export function decryptSecret(
  encryptedText: string | undefined,
): string | undefined {
  if (!encryptedText) return encryptedText;
  if (!encryptedText.startsWith(ENCRYPT_PREFIX)) {
    return encryptedText; // not encrypted
  }
  if (
    !safeStorage ||
    !safeStorage.isEncryptionAvailable ||
    !safeStorage.isEncryptionAvailable()
  ) {
    console.warn('Encryption is not available, cannot decrypt secret');
    return encryptedText;
  }
  try {
    const base64Data = encryptedText.substring(ENCRYPT_PREFIX.length);
    const encryptedBuffer = Buffer.from(base64Data, 'base64');
    return safeStorage.decryptString(encryptedBuffer);
  } catch (error) {
    console.error('Failed to decrypt secret:', error);
    return undefined;
  }
}

/**
 * Returns a new settings object with sensitive values encrypted.
 */
export function encryptSettings(settings: AppSettings): AppSettings {
  if (!settings) return settings;
  const encryptedSettings = { ...settings };

  // Encrypt copilotToken (still top-level)
  if (typeof encryptedSettings.copilotToken === 'string') {
    encryptedSettings.copilotToken = encryptSecret(
      encryptedSettings.copilotToken,
    );
  }

  // Encrypt nested connector secrets
  if (encryptedSettings.connectors) {
    encryptedSettings.connectors = { ...encryptedSettings.connectors };
    for (const key of Object.keys(encryptedSettings.connectors)) {
      const conn = encryptedSettings.connectors[key];
      if (conn && typeof conn === 'object') {
        const encryptedConn = { ...conn };
        for (const secretKey of ['token', 'pat', 'password', 'secret']) {
          if (typeof encryptedConn[secretKey] === 'string') {
            encryptedConn[secretKey] = encryptSecret(encryptedConn[secretKey]);
          }
        }
        encryptedSettings.connectors[key] = encryptedConn;
      }
    }
  }

  return encryptedSettings;
}

/**
 * Returns a new settings object with sensitive values decrypted.
 */
export function decryptSettings(settings: AppSettings): AppSettings {
  if (!settings) return settings;
  const decryptedSettings = { ...settings };

  // Decrypt copilotToken
  if (typeof decryptedSettings.copilotToken === 'string') {
    decryptedSettings.copilotToken = decryptSecret(
      decryptedSettings.copilotToken,
    );
  }

  // Decrypt nested connector secrets
  if (decryptedSettings.connectors) {
    decryptedSettings.connectors = { ...decryptedSettings.connectors };
    for (const key of Object.keys(decryptedSettings.connectors)) {
      const conn = decryptedSettings.connectors[key];
      if (conn && typeof conn === 'object') {
        const decryptedConn = { ...conn };
        for (const secretKey of ['token', 'pat', 'password', 'secret']) {
          if (typeof decryptedConn[secretKey] === 'string') {
            decryptedConn[secretKey] = decryptSecret(decryptedConn[secretKey]);
          }
        }
        decryptedSettings.connectors[key] = decryptedConn;
      }
    }
  }

  return decryptedSettings;
}

/**
 * Scans the store's settings and encrypts any plain-text secrets in place.
 */
export async function migrateStoredSettings(store: {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}): Promise<void> {
  if (!store) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawSettings = store.get('settings') as any;
  if (!rawSettings) return;

  let needsWrite = false;
  const updatedSettings = JSON.parse(JSON.stringify(rawSettings));

  // Version 1 Migration: populate featureType and storyType defaults if missing
  if (updatedSettings.version === undefined || updatedSettings.version < 1) {
    updatedSettings.version = 1;
    if (updatedSettings.featureType === undefined) {
      updatedSettings.featureType = 'Feature';
    }
    if (updatedSettings.storyType === undefined) {
      updatedSettings.storyType = 'Product Backlog Item';
    }
    if (updatedSettings.taskType === undefined) {
      updatedSettings.taskType = 'Task';
    }
    if (updatedSettings.testTaskTitle === undefined) {
      updatedSettings.testTaskTitle = 'Testing';
    }
    needsWrite = true;
  }

  // Version 2 Migration: migrate to connectors system
  if (updatedSettings.version < 2) {
    updatedSettings.version = 2;

    if (!updatedSettings.connectors) {
      updatedSettings.connectors = {};
    }
    if (!updatedSettings.sources) {
      updatedSettings.sources = {
        issues: 'azureDevOps',
        code: 'azureDevOps',
        docs: 'atlassian',
      };
    }

    // Confluence
    const confluenceTokenDecrypted = decryptSecret(
      updatedSettings.confluenceToken,
    );
    if (
      updatedSettings.confluenceUrl !== undefined ||
      updatedSettings.confluenceUser !== undefined ||
      confluenceTokenDecrypted !== undefined
    ) {
      updatedSettings.connectors.atlassian = {
        url: updatedSettings.confluenceUrl ?? '',
        username: updatedSettings.confluenceUser ?? '',
        token: confluenceTokenDecrypted ?? '',
      };
    }

    // Azure DevOps
    const azurePatDecrypted = decryptSecret(updatedSettings.azurePat);
    if (
      updatedSettings.azureOrg !== undefined ||
      updatedSettings.azureProject !== undefined ||
      azurePatDecrypted !== undefined
    ) {
      updatedSettings.connectors.azureDevOps = {
        org: updatedSettings.azureOrg ?? '',
        project: updatedSettings.azureProject ?? '',
        pat: azurePatDecrypted ?? '',
      };
    }

    // Delete legacy top-level properties
    delete updatedSettings.confluenceUrl;
    delete updatedSettings.confluenceUser;
    delete updatedSettings.confluenceToken;
    delete updatedSettings.azureOrg;
    delete updatedSettings.azureProject;
    delete updatedSettings.azurePat;

    needsWrite = true;
  }

  // Plain text secrets encryption check for connectors & copilotToken
  if (
    safeStorage &&
    safeStorage.isEncryptionAvailable &&
    safeStorage.isEncryptionAvailable()
  ) {
    // Encrypt copilotToken if plain text
    if (
      typeof updatedSettings.copilotToken === 'string' &&
      updatedSettings.copilotToken &&
      !updatedSettings.copilotToken.startsWith(ENCRYPT_PREFIX)
    ) {
      const encrypted = encryptSecret(updatedSettings.copilotToken);
      if (encrypted && encrypted.startsWith(ENCRYPT_PREFIX)) {
        updatedSettings.copilotToken = encrypted;
        needsWrite = true;
      }
    }

    // Encrypt connector secrets if plain text
    if (updatedSettings.connectors) {
      for (const key of Object.keys(updatedSettings.connectors)) {
        const conn = updatedSettings.connectors[key];
        if (conn && typeof conn === 'object') {
          for (const secretKey of ['token', 'pat', 'password', 'secret']) {
            const val = conn[secretKey];
            if (
              typeof val === 'string' &&
              val &&
              !val.startsWith(ENCRYPT_PREFIX)
            ) {
              const encrypted = encryptSecret(val);
              if (encrypted && encrypted.startsWith(ENCRYPT_PREFIX)) {
                conn[secretKey] = encrypted;
                needsWrite = true;
              }
            }
          }
        }
      }
    }
  }

  if (needsWrite) {
    store.set('settings', updatedSettings);
  }
}
