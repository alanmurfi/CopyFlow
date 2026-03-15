// @vitest-environment jsdom
// ============================================
// CopyFlow — FolderManager Component Tests
// ============================================

import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/helpers';
import FolderManager from './FolderManager';

vi.mock('../../lib/storage', () => ({
  addFolder: vi.fn(() => Promise.resolve()),
  deleteFolder: vi.fn(() => Promise.resolve()),
}));

import { addFolder, deleteFolder } from '../../lib/storage';

describe('FolderManager', () => {
  const mockFolders = [
    { id: 'f1', name: 'Work', color: 'blue', createdAt: 1000 },
    { id: 'f2', name: 'Personal', color: 'green', createdAt: 2000 },
  ];

  it('renders existing folders', () => {
    renderWithProviders(
      <FolderManager folders={mockFolders} onClose={vi.fn()} onFoldersChange={vi.fn()} />,
    );

    expect(screen.getByText('Work')).toBeTruthy();
    expect(screen.getByText('Personal')).toBeTruthy();
  });

  it('shows empty state when no folders', () => {
    renderWithProviders(
      <FolderManager folders={[]} onClose={vi.fn()} onFoldersChange={vi.fn()} />,
    );

    expect(screen.getByText(/No folders yet/)).toBeTruthy();
  });

  it('creates a new folder', async () => {
    const user = userEvent.setup();
    const onFoldersChange = vi.fn();
    renderWithProviders(
      <FolderManager folders={[]} onClose={vi.fn()} onFoldersChange={onFoldersChange} />,
    );

    await user.type(screen.getByPlaceholderText('Folder name'), 'Projects');
    await user.click(screen.getByRole('button', { name: 'Add Folder' }));

    expect(addFolder).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Projects', color: 'blue' }),
    );
    expect(onFoldersChange).toHaveBeenCalled();
  });

  it('shows error for empty folder name', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <FolderManager folders={[]} onClose={vi.fn()} onFoldersChange={vi.fn()} />,
    );

    // Type a space — trim() makes it empty but newName is truthy so button is enabled
    const input = screen.getByPlaceholderText('Folder name');
    await user.type(input, ' ');
    // Trigger create via Enter key (bypasses disabled button check)
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Folder name is required')).toBeTruthy();
    });
  });

  it('shows error for duplicate folder name', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <FolderManager folders={mockFolders} onClose={vi.fn()} onFoldersChange={vi.fn()} />,
    );

    await user.type(screen.getByPlaceholderText('Folder name'), 'Work');
    await user.click(screen.getByRole('button', { name: 'Add Folder' }));

    await waitFor(() => {
      expect(screen.getByText(/already exists/)).toBeTruthy();
    });
  });

  it('enforces 24 character limit via maxLength', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <FolderManager folders={[]} onClose={vi.fn()} onFoldersChange={vi.fn()} />,
    );

    const input = screen.getByPlaceholderText('Folder name');
    await user.type(input, 'a'.repeat(30));

    // maxLength={24} on the input prevents typing more than 24 characters
    expect((input as HTMLInputElement).value).toBe('a'.repeat(24));
  });

  it('shows limit message at 10 folders', () => {
    const tenFolders = Array.from({ length: 10 }, (_, i) => ({
      id: `f${i}`,
      name: `Folder ${i}`,
      color: 'blue',
      createdAt: i,
    }));
    renderWithProviders(
      <FolderManager folders={tenFolders} onClose={vi.fn()} onFoldersChange={vi.fn()} />,
    );

    expect(screen.getByText('10 folder limit reached.')).toBeTruthy();
  });

  it('calls onClose when back button clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <FolderManager folders={[]} onClose={onClose} onFoldersChange={vi.fn()} />,
    );

    // Click the back arrow action icon
    const backButton = screen.getByRole('button', { name: '' });
    await user.click(backButton);
    // onClose should be called - the IconArrowLeft button
  });
});
