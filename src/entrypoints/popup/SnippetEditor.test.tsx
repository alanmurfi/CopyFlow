// @vitest-environment jsdom
// ============================================
// CopyFlow — SnippetEditor Component Tests
// ============================================

import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/helpers';
import SnippetEditor from './SnippetEditor';

vi.mock('../../lib/snippets', () => ({
  isValidShortcut: vi.fn((s: string) => {
    if (!s) return { valid: false, error: 'Shortcut is required' };
    if (s.length < 2) return { valid: false, error: 'Shortcut must be at least 2 characters' };
    if (![';', '/', '!', '\\'].includes(s[0])) return { valid: false, error: 'Must start with ; / ! or \\' };
    return { valid: true };
  }),
  resolveTemplate: vi.fn((content: string) => ({ text: content, cursorOffset: -1 })),
}));

describe('SnippetEditor — create mode', () => {
  it('renders create form with empty fields', () => {
    renderWithProviders(
      <SnippetEditor
        existingShortcuts={[]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('New Snippet')).toBeTruthy();
    expect(screen.getByPlaceholderText(';sig')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create Snippet' })).toBeTruthy();
  });

  it('shows error when shortcut is invalid', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(
      <SnippetEditor existingShortcuts={[]} onSave={onSave} onCancel={vi.fn()} />,
    );

    // Type invalid shortcut (no trigger char)
    await user.type(screen.getByPlaceholderText(';sig'), 'bad');
    await user.type(screen.getByPlaceholderText('Type your snippet content here...'), 'content');
    await user.click(screen.getByRole('button', { name: 'Create Snippet' }));

    await waitFor(() => {
      // "Must start with" appears in both the description and the error text
      const matches = screen.getAllByText(/Must start with/);
      expect(matches.length).toBe(2); // description + error
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows error when content is empty', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(
      <SnippetEditor existingShortcuts={[]} onSave={onSave} onCancel={vi.fn()} />,
    );

    await user.type(screen.getByPlaceholderText(';sig'), ';test');
    await user.click(screen.getByRole('button', { name: 'Create Snippet' }));

    await waitFor(() => {
      expect(screen.getByText('Content cannot be empty')).toBeTruthy();
    });
  });

  it('shows error when shortcut already exists', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(
      <SnippetEditor existingShortcuts={[';sig']} onSave={onSave} onCancel={vi.fn()} />,
    );

    await user.type(screen.getByPlaceholderText(';sig'), ';sig');
    await user.type(screen.getByPlaceholderText('Type your snippet content here...'), 'content');
    await user.click(screen.getByRole('button', { name: 'Create Snippet' }));

    await waitFor(() => {
      expect(screen.getByText('This shortcut is already in use')).toBeTruthy();
    });
  });

  it('calls onSave with valid data', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(
      <SnippetEditor existingShortcuts={[]} onSave={onSave} onCancel={vi.fn()} />,
    );

    await user.type(screen.getByPlaceholderText(';sig'), ';hello');
    await user.type(screen.getByPlaceholderText('Email signature'), 'My Title');
    await user.type(screen.getByPlaceholderText('Type your snippet content here...'), 'Hello World');
    await user.click(screen.getByRole('button', { name: 'Create Snippet' }));

    expect(onSave).toHaveBeenCalledWith({
      shortcut: ';hello',
      title: 'My Title',
      content: 'Hello World',
    });
  });

  it('calls onCancel when Back button clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderWithProviders(
      <SnippetEditor existingShortcuts={[]} onSave={vi.fn()} onCancel={onCancel} />,
    );

    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows template variable badges', () => {
    renderWithProviders(
      <SnippetEditor existingShortcuts={[]} onSave={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByText('date')).toBeTruthy();
    expect(screen.getByText('clipboard')).toBeTruthy();
    expect(screen.getByText('cursor')).toBeTruthy();
  });
});

describe('SnippetEditor — edit mode', () => {
  const existingSnippet = {
    id: 's1',
    shortcut: ';sig',
    title: 'Signature',
    content: 'Best regards',
    createdAt: 1000,
    updatedAt: 2000,
  };

  it('renders edit form with existing values', () => {
    renderWithProviders(
      <SnippetEditor
        snippet={existingSnippet}
        existingShortcuts={[';sig', ';other']}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Edit Snippet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeTruthy();
    expect(screen.getByDisplayValue(';sig')).toBeTruthy();
    expect(screen.getByDisplayValue('Signature')).toBeTruthy();
    expect(screen.getByDisplayValue('Best regards')).toBeTruthy();
  });

  it('allows keeping the same shortcut when editing', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(
      <SnippetEditor
        snippet={existingSnippet}
        existingShortcuts={[';sig', ';other']}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(onSave).toHaveBeenCalled();
  });
});
