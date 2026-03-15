// @vitest-environment jsdom
// ============================================
// CopyFlow — SnippetsPanel Component Tests
// ============================================

import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/helpers';
import SnippetsPanel from './SnippetsPanel';

vi.mock('../../lib/snippets', () => ({
  getSnippets: vi.fn(() => Promise.resolve([])),
  addSnippet: vi.fn(() => Promise.resolve()),
  updateSnippet: vi.fn(() => Promise.resolve()),
  deleteSnippet: vi.fn(() => Promise.resolve()),
  resolveTemplate: vi.fn((content: string) => ({ text: content, cursorOffset: -1 })),
  isValidShortcut: vi.fn((s: string) => {
    if (!s || s.length < 2) return { valid: false, error: 'Invalid shortcut' };
    if (![';', '/', '!', '\\'].includes(s[0])) return { valid: false, error: 'Must start with ; / ! or \\' };
    return { valid: true };
  }),
}));

import { getSnippets, deleteSnippet } from '../../lib/snippets';
import type { Snippet } from '../../types';

const mockSnippets: Snippet[] = [
  { id: 's1', shortcut: ';sig', title: 'Signature', content: 'Best regards, Me', createdAt: 1000, updatedAt: 2000 },
  { id: 's2', shortcut: ';addr', title: 'Address', content: '123 Main St', createdAt: 1000, updatedAt: 2000 },
];

describe('SnippetsPanel — feature gate', () => {
  it('shows upgrade prompt when snippets disabled', () => {
    renderWithProviders(<SnippetsPanel snippetsEnabled={false} />);

    expect(screen.getByText('Text Expander')).toBeTruthy();
    expect(screen.getByText('Pro Feature')).toBeTruthy();
  });
});

describe('SnippetsPanel — enabled', () => {
  it('renders empty state with create button', async () => {
    vi.mocked(getSnippets).mockResolvedValue([]);
    renderWithProviders(<SnippetsPanel snippetsEnabled={true} />);

    await waitFor(() => {
      expect(screen.getByText('No snippets yet')).toBeTruthy();
    });
    expect(screen.getByText('Create your first snippet')).toBeTruthy();
  });

  it('renders snippet list', async () => {
    vi.mocked(getSnippets).mockResolvedValue(mockSnippets);
    renderWithProviders(<SnippetsPanel snippetsEnabled={true} />);

    await waitFor(() => {
      expect(screen.getByText(';sig')).toBeTruthy();
      expect(screen.getByText('Signature')).toBeTruthy();
      expect(screen.getByText(';addr')).toBeTruthy();
      expect(screen.getByText('Address')).toBeTruthy();
    });
  });

  it('filters snippets by search', async () => {
    const user = userEvent.setup();
    vi.mocked(getSnippets).mockResolvedValue(mockSnippets);
    renderWithProviders(<SnippetsPanel snippetsEnabled={true} />);

    await waitFor(() => {
      expect(screen.getByText(';sig')).toBeTruthy();
    });

    await user.type(screen.getByPlaceholderText('Search snippets...'), 'addr');

    await waitFor(() => {
      expect(screen.queryByText(';sig')).toBeNull();
      expect(screen.getByText(';addr')).toBeTruthy();
    });
  });

  it('shows snippet count badge', async () => {
    vi.mocked(getSnippets).mockResolvedValue(mockSnippets);
    renderWithProviders(<SnippetsPanel snippetsEnabled={true} />);

    await waitFor(() => {
      expect(screen.getByText('2')).toBeTruthy();
    });
  });

  it('shows no results message when search has no matches', async () => {
    const user = userEvent.setup();
    vi.mocked(getSnippets).mockResolvedValue(mockSnippets);
    renderWithProviders(<SnippetsPanel snippetsEnabled={true} />);

    await waitFor(() => {
      expect(screen.getByText(';sig')).toBeTruthy();
    });

    await user.type(screen.getByPlaceholderText('Search snippets...'), 'zzzzzzz');

    await waitFor(() => {
      expect(screen.getByText('No snippets match your search')).toBeTruthy();
    });
  });
});
