import { safeStorage } from 'electron';
import { AppSettings } from '../../types';

const ENCRYPT_PREFIX = 'secure:v1:';

const SECRET_KEYS = ['azurePat', 'copilotToken', 'confluenceToken'] as const;

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
  for (const key of SECRET_KEYS) {
    const val = settings[key];
    if (typeof val === 'string') {
      encryptedSettings[key] = encryptSecret(val);
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
  for (const key of SECRET_KEYS) {
    const val = settings[key];
    if (typeof val === 'string') {
      decryptedSettings[key] = decryptSecret(val);
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
  const rawSettings = store.get('settings') as AppSettings | undefined;
  if (!rawSettings) return;

  let needsWrite = false;
  const updatedSettings = { ...rawSettings };

  for (const key of SECRET_KEYS) {
    const val = rawSettings[key];
    if (typeof val === 'string' && val && !val.startsWith(ENCRYPT_PREFIX)) {
      if (
        safeStorage &&
        safeStorage.isEncryptionAvailable &&
        safeStorage.isEncryptionAvailable()
      ) {
        const encrypted = encryptSecret(val);
        if (encrypted && encrypted.startsWith(ENCRYPT_PREFIX)) {
          updatedSettings[key] = encrypted;
          needsWrite = true;
        }
      }
    }
  }

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

  if (needsWrite) {
    store.set('settings', updatedSettings);
  }
}
