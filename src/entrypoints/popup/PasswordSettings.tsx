// ============================================
// CopyFlow — Password Settings Component
// ============================================

import { useState, useEffect } from 'react';
import {
  Stack,
  Text,
  PasswordInput,
  Button,
  Group,
  Divider,
  NumberInput,
  Switch,
  Alert,
} from '@mantine/core';
import { IconArrowLeft, IconDownload, IconCloud, IconCloudOff } from '@tabler/icons-react';
import {
  getSettings,
  updateSettings,
  setEncryptionMeta,
  removeEncryptionMeta,
  migrateToEncrypted,
  migrateToPlaintext,
  reencryptEntries,
  exportData,
} from '../../lib/storage';
import {
  generateSalt,
  saltToBase64,
  saltFromBase64,
  deriveCryptoKey,
  hashPassword,
  verifyPassword,
} from '../../lib/crypto';
import { storeSessionKey, clearSessionKey } from '../../lib/session';
import { getEncryptionMeta } from '../../lib/storage';
import { migrateSnippetsToEncrypted, migrateSnippetsToPlaintext, reencryptSnippets } from '../../lib/snippets';
import { getLastSyncTime, clearSync } from '../../lib/sync';
import type { EncryptionMeta } from '../../types';

interface PasswordSettingsProps {
  passwordEnabled: boolean;
  autoLockMinutes: number;
  onClose: () => void;
  onStateChange: () => void; // called after enable/disable to refresh parent
}

export default function PasswordSettings({
  passwordEnabled,
  autoLockMinutes,
  onClose,
  onStateChange,
}: PasswordSettingsProps) {
  const [step, setStep] = useState<'warning' | 'setup'>('warning');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoLock, setAutoLock] = useState<number>(autoLockMinutes);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (passwordEnabled) {
      getSettings().then((s) => setSyncEnabled(s.syncEnabled));
      getLastSyncTime().then((t) => setLastSyncTime(t));
    }
  }, [passwordEnabled]);

  async function handleSyncToggle(enabled: boolean) {
    setSyncEnabled(enabled);
    await updateSettings({ syncEnabled: enabled });
    if (!enabled) {
      await clearSync();
      setLastSyncTime(null);
    }
    onStateChange();
  }

  async function handleSyncNow() {
    setSyncing(true);
    try {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, () => resolve());
      });
      const t = await getLastSyncTime();
      setLastSyncTime(t);
    } catch {
      // Sync failed silently
    } finally {
      setSyncing(false);
    }
  }

  async function handleExportBackup() {
    try {
      const json = await exportData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `copyflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CopyFlow: Export failed:', err);
    }
  }

  async function handleEnable() {
    setError('');
    setSuccess('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const salt = generateSalt();
      const passwordHash = await hashPassword(newPassword, salt);
      const key = await deriveCryptoKey(newPassword, salt);

      // Store encryption metadata
      const meta: EncryptionMeta = {
        version: 1,
        salt: saltToBase64(salt),
        passwordHash,
      };
      await setEncryptionMeta(meta);

      // Store session key so user stays unlocked
      await storeSessionKey(key);

      // Encrypt existing entries and snippets
      await migrateToEncrypted(key);
      await migrateSnippetsToEncrypted(key);

      // Update settings
      await updateSettings({ passwordEnabled: true });

      setSuccess('Encryption enabled');
      setNewPassword('');
      setConfirmPassword('');
      onStateChange();
    } catch (err) {
      console.error('CopyFlow: Enable encryption failed:', err);
      setError('Failed to enable encryption');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    setError('');
    setSuccess('');

    if (!disablePassword) {
      setError('Enter your current password');
      return;
    }

    setLoading(true);
    try {
      const meta = await getEncryptionMeta();
      if (!meta) {
        setError('No encryption metadata found');
        return;
      }

      const salt = saltFromBase64(meta.salt);
      const valid = await verifyPassword(disablePassword, salt, meta.passwordHash);
      if (!valid) {
        setError('Wrong password');
        setLoading(false);
        return;
      }

      const key = await deriveCryptoKey(disablePassword, salt);

      // Decrypt all entries and snippets back to plaintext
      await migrateToPlaintext(key);
      await migrateSnippetsToPlaintext(key);

      // Remove encryption metadata and session key
      await removeEncryptionMeta();
      await clearSessionKey();

      // Update settings
      await updateSettings({ passwordEnabled: false, autoLockMinutes: 0 });

      setSuccess('Encryption disabled');
      setDisablePassword('');
      onStateChange();
    } catch (err) {
      console.error('CopyFlow: Disable encryption failed:', err);
      setError('Failed to disable encryption');
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword() {
    setError('');
    setSuccess('');

    if (!currentPassword) {
      setError('Enter your current password');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const meta = await getEncryptionMeta();
      if (!meta) {
        setError('No encryption metadata found');
        return;
      }

      const oldSalt = saltFromBase64(meta.salt);
      const valid = await verifyPassword(currentPassword, oldSalt, meta.passwordHash);
      if (!valid) {
        setError('Wrong current password');
        setLoading(false);
        return;
      }

      // Derive old key to decrypt
      const oldKey = await deriveCryptoKey(currentPassword, oldSalt);

      // Generate new salt and key
      const newSalt = generateSalt();
      const newHash = await hashPassword(newPassword, newSalt);
      const newKey = await deriveCryptoKey(newPassword, newSalt);

      // Atomic re-encryption: decrypt with old key and re-encrypt with new key
      // in a single storage write — no plaintext-on-disk window.
      await reencryptEntries(oldKey, newKey);
      await reencryptSnippets(oldKey, newKey);

      // Update metadata
      const newMeta: EncryptionMeta = {
        version: 1,
        salt: saltToBase64(newSalt),
        passwordHash: newHash,
      };
      await setEncryptionMeta(newMeta);

      // Update session key
      await storeSessionKey(newKey);

      setSuccess('Password changed');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('CopyFlow: Change password failed:', err);
      setError('Failed to change password');
    } finally {
      setLoading(false);
    }
  }

  async function handleAutoLockChange(value: number) {
    setAutoLock(value);
    await updateSettings({ autoLockMinutes: value });
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
    <Stack gap="md" p="md" pb="xl">
      <Group gap="xs">
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<IconArrowLeft size={14} />}
          onClick={onClose}
        >
          Back
        </Button>
        <Text fw={700} size="md">Password & Encryption</Text>
      </Group>

      {passwordEnabled ? (
        <>
          <Text size="sm" c="dimmed">
            Encryption is active. Your clipboard data is encrypted at rest.
          </Text>

          <Divider label="Change password" labelPosition="left" />

          <PasswordInput
            label="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.currentTarget.value)}
            disabled={loading}
            size="xs"
          />
          <PasswordInput
            label="New password"
            description="Min 8 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.currentTarget.value)}
            disabled={loading}
            size="xs"
          />
          <PasswordInput
            label="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.currentTarget.value)}
            disabled={loading}
            size="xs"
          />

          <Button
            size="xs"
            onClick={handleChangePassword}
            loading={loading}
            disabled={!currentPassword || !newPassword || !confirmPassword}
          >
            Change Password
          </Button>

          <Divider label="Auto-lock" labelPosition="left" />

          <NumberInput
            label="Auto-lock after (minutes)"
            description="0 = disabled"
            value={autoLock}
            onChange={(val) => handleAutoLockChange(typeof val === 'number' ? val : 0)}
            min={0}
            max={1440}
            size="xs"
          />

          <Divider label="Chrome Sync" labelPosition="left" />

          <Switch
            label="Sync pinned clips & snippets"
            description="Encrypted sync across devices (same password required)"
            checked={syncEnabled}
            onChange={(e) => handleSyncToggle(e.currentTarget.checked)}
            size="xs"
          />

          {syncEnabled && (
            <>
              <Alert variant="light" color="yellow" icon={<IconCloud size={16} />} p="xs">
                <Text size="xs">
                  All synced data is encrypted with your password. Use the same password on all devices.
                </Text>
              </Alert>

              <Group gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconCloud size={14} />}
                  onClick={handleSyncNow}
                  loading={syncing}
                >
                  Sync Now
                </Button>
                <Text size="xs" c="dimmed">
                  {lastSyncTime
                    ? `Last sync: ${new Date(lastSyncTime).toLocaleTimeString()}`
                    : 'Not synced yet'}
                </Text>
              </Group>
            </>
          )}

          <Divider label="Disable encryption" labelPosition="left" />

          <Text size="xs" c="dimmed">
            This will decrypt all your data and remove password protection.
          </Text>

          <PasswordInput
            placeholder="Enter current password to disable"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.currentTarget.value)}
            disabled={loading}
            size="xs"
          />

          <Button
            size="xs"
            color="red"
            variant="light"
            onClick={handleDisable}
            loading={loading}
            disabled={!disablePassword}
          >
            Disable Encryption
          </Button>

          {error && (
            <Text size="xs" c="red" ta="center">
              {error}
            </Text>
          )}
          {success && (
            <Text size="xs" c="green" ta="center">
              {success}
            </Text>
          )}
        </>
      ) : step === 'warning' ? (
        <>
          <Text size="sm" fw={600} c="orange">⚠ Data Loss Risk</Text>
          <Text size="sm" c="dimmed">
            If you forget your password, your clipboard data cannot be recovered.
            Export a backup first — backups are not password-protected and can
            always be restored.
          </Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconDownload size={14} />}
            onClick={handleExportBackup}
          >
            Export Backup
          </Button>
          <Text
            size="xs"
            c="dimmed"
            style={{ cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => setStep('setup')}
          >
            I understand, continue without exporting →
          </Text>
        </>
      ) : (
        <>
          <Text size="sm" c="dimmed">
            Enable encryption to protect your clipboard data with a password.
            All entries will be encrypted at rest using AES-256.
          </Text>

          <PasswordInput
            label="Password"
            description="Min 8 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.currentTarget.value)}
            disabled={loading}
            size="xs"
          />
          <PasswordInput
            label="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.currentTarget.value)}
            disabled={loading}
            size="xs"
          />

          <Button
            size="xs"
            onClick={handleEnable}
            loading={loading}
            disabled={!newPassword || !confirmPassword}
          >
            Enable Encryption
          </Button>
        </>
      )}

      {error && (
        <Text size="xs" c="red" ta="center">
          {error}
        </Text>
      )}
      {success && (
        <Text size="xs" c="green" ta="center">
          {success}
        </Text>
      )}
    </Stack>
    </div>
  );
}
