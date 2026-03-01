// ============================================
// CopyFlow — Snippets Panel Component
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Stack,
  Text,
  ScrollArea,
  Group,
  ActionIcon,
  TextInput,
  Badge,
  Tooltip,
  Box,
  Button,
} from '@mantine/core';
import {
  IconSearch,
  IconTrash,
  IconEdit,
  IconPlus,
  IconX,
  IconCopy,
  IconCheck,
  IconLock,
} from '@tabler/icons-react';
import {
  getSnippets,
  addSnippet,
  updateSnippet,
  deleteSnippet,
  resolveTemplate,
} from '../../lib/snippets';
import type { Snippet } from '../../types';
import SnippetEditor from './SnippetEditor';

interface SnippetsPanelProps {
  snippetsEnabled: boolean;
}

export default function SnippetsPanel({ snippetsEnabled }: SnippetsPanelProps) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [search, setSearch] = useState('');
  const [editingSnippet, setEditingSnippet] = useState<Snippet | 'new' | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (snippetsEnabled) loadSnippets();
  }, [snippetsEnabled]);

  async function loadSnippets() {
    try {
      const data = await getSnippets();
      setSnippets(data);
    } catch (err) {
      console.error('CopyFlow: Failed to load snippets:', err);
    }
  }

  function notifyBackground() {
    chrome.runtime.sendMessage({ type: 'SNIPPETS_CHANGED' }).catch(() => {});
  }

  const handleSave = useCallback(async (data: { shortcut: string; title: string; content: string }) => {
    try {
      if (editingSnippet === 'new') {
        const snippet: Snippet = {
          id: uuidv4(),
          shortcut: data.shortcut,
          title: data.title,
          content: data.content,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await addSnippet(snippet);
      } else if (editingSnippet) {
        await updateSnippet(editingSnippet.id, {
          shortcut: data.shortcut,
          title: data.title,
          content: data.content,
        });
      }
      setEditingSnippet(null);
      await loadSnippets();
      notifyBackground();
    } catch (err) {
      console.error('CopyFlow: Failed to save snippet:', err);
    }
  }, [editingSnippet]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteSnippet(id);
    await loadSnippets();
    notifyBackground();
  }, []);

  const handleCopyExpanded = useCallback(async (snippet: Snippet) => {
    const resolved = resolveTemplate(snippet.content);
    try {
      await chrome.runtime.sendMessage({
        type: 'COPY_TO_CLIPBOARD',
        text: resolved.text,
      });
      setCopiedId(snippet.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  // Feature gate — show upgrade prompt
  if (!snippetsEnabled) {
    return (
      <Stack align="center" justify="center" gap="md" style={{ height: '100%', padding: 32 }}>
        <Box style={{ opacity: 0.5 }}>
          <IconLock size={48} />
        </Box>
        <Text fw={700} size="lg" ta="center">
          Text Expander
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          Create shortcuts that expand into full text snippets as you type.
          Supports template variables like {'{{date}}'}, {'{{time}}'}, and more.
        </Text>
        <Badge variant="light" color="blue" size="lg">
          Pro Feature
        </Badge>
        <Text size="xs" c="dimmed" ta="center">
          Upgrade to CopyFlow Pro to unlock text expander and snippet templates.
        </Text>
      </Stack>
    );
  }

  // Editor view
  if (editingSnippet) {
    return (
      <SnippetEditor
        snippet={editingSnippet === 'new' ? undefined : editingSnippet}
        existingShortcuts={snippets.map((s) => s.shortcut)}
        onSave={handleSave}
        onCancel={() => setEditingSnippet(null)}
      />
    );
  }

  // Filter snippets
  const filtered = snippets.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.shortcut.toLowerCase().includes(q) ||
      s.title.toLowerCase().includes(q) ||
      s.content.toLowerCase().includes(q)
    );
  });

  return (
    <Stack gap={0} style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Box px="md" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Group justify="space-between" mb="xs">
          <Group gap="xs">
            <Text fw={700} size="md">Snippets</Text>
            <Badge variant="light" size="sm">{snippets.length}</Badge>
          </Group>
          <Tooltip label="New snippet">
            <ActionIcon variant="light" size="sm" onClick={() => setEditingSnippet('new')}>
              <IconPlus size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>

        <TextInput
          placeholder="Search snippets..."
          leftSection={<IconSearch size={16} />}
          rightSection={
            search ? (
              <ActionIcon variant="subtle" size="xs" onClick={() => setSearch('')}>
                <IconX size={12} />
              </ActionIcon>
            ) : null
          }
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          size="sm"
        />
      </Box>

      {/* Snippet list */}
      <ScrollArea px="md" py="xs" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <Stack align="center" justify="center" py="xl" gap="xs">
            <Text c="dimmed" size="sm" ta="center">
              {search ? 'No snippets match your search' : 'No snippets yet'}
            </Text>
            {!search && (
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={() => setEditingSnippet('new')}
              >
                Create your first snippet
              </Button>
            )}
          </Stack>
        ) : (
          <Stack gap="xs">
            {filtered.map((snippet) => (
              <SnippetItem
                key={snippet.id}
                snippet={snippet}
                isCopied={copiedId === snippet.id}
                onEdit={() => setEditingSnippet(snippet)}
                onDelete={() => handleDelete(snippet.id)}
                onCopy={() => handleCopyExpanded(snippet)}
              />
            ))}
          </Stack>
        )}
      </ScrollArea>
    </Stack>
  );
}

// ---- Snippet Item ----

interface SnippetItemProps {
  snippet: Snippet;
  isCopied: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
}

function SnippetItem({ snippet, isCopied, onEdit, onDelete, onCopy }: SnippetItemProps) {
  const preview = snippet.content.length > 80
    ? snippet.content.slice(0, 77) + '...'
    : snippet.content;

  return (
    <Box
      p="xs"
      style={{
        borderRadius: 'var(--mantine-radius-sm)',
        border: '1px solid var(--mantine-color-default-border)',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onClick={onEdit}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--mantine-color-gray-light-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <Group justify="space-between" mb={2}>
        <Group gap="xs">
          <Badge size="sm" variant="filled" color="blue" style={{ fontFamily: 'monospace' }}>
            {snippet.shortcut}
          </Badge>
          {snippet.title && (
            <Text size="sm" fw={500} lineClamp={1}>
              {snippet.title}
            </Text>
          )}
        </Group>
      </Group>

      <Text size="xs" c="dimmed" lineClamp={2} style={{ wordBreak: 'break-word' }}>
        {preview}
      </Text>

      <Group gap={2} mt={4} justify="flex-end" onClick={(e) => e.stopPropagation()}>
        <Tooltip label={isCopied ? 'Copied!' : 'Copy expanded'}>
          <ActionIcon
            variant="subtle"
            size="xs"
            color={isCopied ? 'green' : undefined}
            onClick={onCopy}
          >
            {isCopied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Edit">
          <ActionIcon variant="subtle" size="xs" onClick={onEdit}>
            <IconEdit size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Delete">
          <ActionIcon variant="subtle" size="xs" color="red" onClick={onDelete}>
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Box>
  );
}
