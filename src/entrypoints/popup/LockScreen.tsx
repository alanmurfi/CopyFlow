// ============================================
// CopyFlow — Lock Screen Component
// ============================================

import { useState, useRef, useEffect } from 'react';
import {
  Stack,
  Text,
  PasswordInput,
  Button,
  Box,
} from '@mantine/core';
import { IconLock, IconShieldLock } from '@tabler/icons-react';

interface UnlockResult {
  success: boolean;
  cooldownSeconds?: number;
}

interface LockScreenProps {
  onUnlock: (password: string) => Promise<UnlockResult>;
  isSetup: boolean; // true = first-time password setup, false = unlock existing
  onSetup?: (password: string) => Promise<boolean>;
}

export default function LockScreen({ onUnlock, isSetup, onSetup }: LockScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cooldown timer for rate limiting
  useEffect(() => {
    if (cooldown <= 0) {
      if (cooldownRef.current) {
        clearInterval(cooldownRef.current);
        cooldownRef.current = null;
      }
      return;
    }
    cooldownRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) return 0;
        return c - 1;
      });
    }, 1000);
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [cooldown > 0]);

  function getCooldownSeconds(fails: number): number {
    if (fails < 3) return 0;
    if (fails >= 10) return 60;
    // Exponential backoff: 1, 2, 4, 8, 16, 30, 30...
    return Math.min(2 ** (fails - 3), 30);
  }

  async function handleUnlock() {
    if (!password || cooldown > 0) return;
    setError('');
    setLoading(true);

    try {
      const result = await onUnlock(password);
      if (!result.success) {
        // Use server-side cooldown from background if provided, else fall back to local tracking
        const serverCooldown = result.cooldownSeconds ?? 0;
        const newFails = failCount + 1;
        setFailCount(newFails);
        const localCooldown = getCooldownSeconds(newFails);
        const wait = Math.max(serverCooldown, localCooldown);
        if (wait > 0) {
          setCooldown(wait);
          setError(`Wrong password. Try again in ${wait}s.`);
        } else {
          setError('Wrong password');
        }
        setPassword('');
      }
    } catch {
      setError('Unlock failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetup() {
    if (!password || !onSetup) return;
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const success = await onSetup(password);
      if (!success) {
        setError('Failed to enable encryption');
      }
    } catch {
      setError('Setup failed');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      if (isSetup) handleSetup();
      else handleUnlock();
    }
  }

  return (
    <Stack
      align="center"
      justify="center"
      gap="md"
      style={{ height: '100%', padding: 32 }}
    >
      <Box style={{ opacity: 0.6 }}>
        {isSetup ? <IconShieldLock size={48} /> : <IconLock size={48} />}
      </Box>

      <Text fw={700} size="lg" ta="center">
        {isSetup ? 'Enable Encryption' : 'CopyFlow is Locked'}
      </Text>

      <Text size="sm" c="dimmed" ta="center">
        {isSetup
          ? 'Set a password to encrypt your clipboard history. Min 8 characters.'
          : 'Enter your password to unlock your clipboard history.'}
      </Text>

      <Stack gap="xs" w="100%" maw={280}>
        <PasswordInput
          ref={inputRef}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={loading || cooldown > 0}
          size="sm"
        />

        {isSetup && (
          <PasswordInput
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            size="sm"
          />
        )}

        {error && (
          <Text size="xs" c="red" ta="center">
            {error}
          </Text>
        )}

        <Button
          onClick={isSetup ? handleSetup : handleUnlock}
          loading={loading}
          disabled={cooldown > 0 || !password || (isSetup && !confirmPassword)}
          fullWidth
          size="sm"
        >
          {cooldown > 0
            ? `Wait ${cooldown}s`
            : isSetup
              ? 'Enable Encryption'
              : 'Unlock'}
        </Button>
      </Stack>
    </Stack>
  );
}
