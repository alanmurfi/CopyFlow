// @vitest-environment jsdom
// ============================================
// CopyFlow — LockScreen Component Tests
// ============================================

import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/helpers';
import LockScreen from './LockScreen';

describe('LockScreen — unlock mode', () => {
  it('renders unlock UI with password input and button', () => {
    const onUnlock = vi.fn().mockResolvedValue({ success: true });
    renderWithProviders(<LockScreen onUnlock={onUnlock} isSetup={false} />);

    expect(screen.getByText('CopyFlow is Locked')).toBeTruthy();
    expect(screen.getByPlaceholderText('Password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeTruthy();
  });

  it('calls onUnlock with password when button clicked', async () => {
    const user = userEvent.setup();
    const onUnlock = vi.fn().mockResolvedValue({ success: true });
    renderWithProviders(<LockScreen onUnlock={onUnlock} isSetup={false} />);

    await user.type(screen.getByPlaceholderText('Password'), 'mypassword');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(onUnlock).toHaveBeenCalledWith('mypassword');
  });

  it('shows error on wrong password', async () => {
    const user = userEvent.setup();
    const onUnlock = vi.fn().mockResolvedValue({ success: false });
    renderWithProviders(<LockScreen onUnlock={onUnlock} isSetup={false} />);

    await user.type(screen.getByPlaceholderText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => {
      expect(screen.getByText('Wrong password')).toBeTruthy();
    });
  });

  it('shows cooldown message after rate-limited failure', async () => {
    const user = userEvent.setup();
    const onUnlock = vi.fn().mockResolvedValue({ success: false, cooldownSeconds: 5 });
    renderWithProviders(<LockScreen onUnlock={onUnlock} isSetup={false} />);

    await user.type(screen.getByPlaceholderText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => {
      expect(screen.getByText(/Try again in/)).toBeTruthy();
    });
  });

  it('disables button when password is empty', () => {
    const onUnlock = vi.fn();
    renderWithProviders(<LockScreen onUnlock={onUnlock} isSetup={false} />);

    const button = screen.getByRole('button', { name: 'Unlock' });
    expect(button).toBeDisabled();
  });
});

describe('LockScreen — setup mode', () => {
  it('renders setup UI with two password fields', () => {
    const onUnlock = vi.fn();
    const onSetup = vi.fn().mockResolvedValue(true);
    renderWithProviders(<LockScreen onUnlock={onUnlock} isSetup={true} onSetup={onSetup} />);

    // "Enable Encryption" appears as both a heading and button label
    expect(screen.getAllByText('Enable Encryption').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByPlaceholderText('Password')).toBeTruthy();
    expect(screen.getByPlaceholderText('Confirm password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enable Encryption' })).toBeTruthy();
  });

  it('shows error when passwords do not match', async () => {
    const user = userEvent.setup();
    const onUnlock = vi.fn();
    const onSetup = vi.fn().mockResolvedValue(true);
    renderWithProviders(<LockScreen onUnlock={onUnlock} isSetup={true} onSetup={onSetup} />);

    await user.type(screen.getByPlaceholderText('Password'), 'password123');
    await user.type(screen.getByPlaceholderText('Confirm password'), 'different');
    await user.click(screen.getByRole('button', { name: 'Enable Encryption' }));

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeTruthy();
    });
  });

  it('shows error when password is too short', async () => {
    const user = userEvent.setup();
    const onUnlock = vi.fn();
    const onSetup = vi.fn().mockResolvedValue(true);
    renderWithProviders(<LockScreen onUnlock={onUnlock} isSetup={true} onSetup={onSetup} />);

    await user.type(screen.getByPlaceholderText('Password'), 'short');
    await user.type(screen.getByPlaceholderText('Confirm password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Enable Encryption' }));

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeTruthy();
    });
  });

  it('calls onSetup when passwords match and are valid', async () => {
    const user = userEvent.setup();
    const onUnlock = vi.fn();
    const onSetup = vi.fn().mockResolvedValue(true);
    renderWithProviders(<LockScreen onUnlock={onUnlock} isSetup={true} onSetup={onSetup} />);

    await user.type(screen.getByPlaceholderText('Password'), 'validpass123');
    await user.type(screen.getByPlaceholderText('Confirm password'), 'validpass123');
    await user.click(screen.getByRole('button', { name: 'Enable Encryption' }));

    await waitFor(() => {
      expect(onSetup).toHaveBeenCalledWith('validpass123');
    });
  });
});
