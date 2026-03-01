// ============================================
// CopyFlow — Snippet Editor Component
// ============================================

import { useState, useRef, useEffect } from 'react';
import {
  Stack,
  TextInput,
  Textarea,
  Button,
  Group,
  Text,
  Badge,
  Box,
} from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { isValidShortcut, resolveTemplate } from '../../lib/snippets';
import type { Snippet } from '../../types';

interface SnippetEditorProps {
  snippet?: Snippet; // undefined = create, defined = edit
  existingShortcuts: string[]; // for uniqueness check
  onSave: (data: { shortcut: string; title: string; content: string }) => void;
  onCancel: () => void;
}

const TEMPLATE_VARS = [
  { label: 'date', value: '{{date}}' },
  { label: 'time', value: '{{time}}' },
  { label: 'day', value: '{{day}}' },
  { label: 'clipboard', value: '{{clipboard}}' },
  { label: 'cursor', value: '{{cursor}}' },
];

export default function SnippetEditor({
  snippet,
  existingShortcuts,
  onSave,
  onCancel,
}: SnippetEditorProps) {
  const [shortcut, setShortcut] = useState(snippet?.shortcut ?? '');
  const [title, setTitle] = useState(snippet?.title ?? '');
  const [content, setContent] = useState(snippet?.content ?? '');
  const [error, setError] = useState('');
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    contentRef.current?.focus();
  }, []);

  function handleSave() {
    setError('');

    // Validate shortcut
    const validation = isValidShortcut(shortcut);
    if (!validation.valid) {
      setError(validation.error!);
      return;
    }

    // Check uniqueness (exclude self when editing)
    const otherShortcuts = snippet
      ? existingShortcuts.filter((s) => s !== snippet.shortcut)
      : existingShortcuts;
    if (otherShortcuts.includes(shortcut)) {
      setError('This shortcut is already in use');
      return;
    }

    if (!content.trim()) {
      setError('Content cannot be empty');
      return;
    }

    onSave({ shortcut, title: title.trim(), content });
  }

  function insertVariable(variable: string) {
    const textarea = contentRef.current;
    if (!textarea) {
      setContent((prev) => prev + variable);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = content.slice(0, start) + variable + content.slice(end);
    setContent(newContent);

    // Restore cursor position after the inserted variable
    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + variable.length;
      textarea.selectionStart = textarea.selectionEnd = newPos;
    });
  }

  // Live preview
  const preview = resolveTemplate(content, '(clipboard)');

  return (
    <Stack gap="sm" p="md" style={{ height: '100%' }}>
      <Group gap="xs">
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<IconArrowLeft size={14} />}
          onClick={onCancel}
        >
          Back
        </Button>
        <Text fw={700} size="md">
          {snippet ? 'Edit Snippet' : 'New Snippet'}
        </Text>
      </Group>

      <TextInput
        label="Shortcut"
        description="Must start with ; / ! or \"
        placeholder=";sig"
        value={shortcut}
        onChange={(e) => setShortcut(e.currentTarget.value)}
        size="xs"
      />

      <TextInput
        label="Title"
        description="Optional display name"
        placeholder="Email signature"
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        size="xs"
      />

      <Box>
        <Text size="xs" fw={500} mb={4}>Content</Text>
        <Group gap={4} mb={4}>
          {TEMPLATE_VARS.map((v) => (
            <Badge
              key={v.label}
              size="xs"
              variant="light"
              style={{ cursor: 'pointer' }}
              onClick={() => insertVariable(v.value)}
            >
              {v.label}
            </Badge>
          ))}
        </Group>
        <Textarea
          ref={contentRef}
          placeholder="Type your snippet content here..."
          value={content}
          onChange={(e) => setContent(e.currentTarget.value)}
          autosize
          minRows={3}
          maxRows={8}
          size="xs"
          styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleSave();
            }
          }}
        />
      </Box>

      {content && (
        <Box>
          <Text size="xs" c="dimmed" mb={2}>Preview:</Text>
          <Text
            size="xs"
            style={{
              fontFamily: 'monospace',
              background: 'var(--mantine-color-gray-light)',
              borderRadius: 4,
              padding: 8,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {preview.text}
          </Text>
        </Box>
      )}

      {error && (
        <Text size="xs" c="red" ta="center">{error}</Text>
      )}

      <Group>
        <Button size="xs" onClick={handleSave}>
          {snippet ? 'Save Changes' : 'Create Snippet'}
        </Button>
        <Button size="xs" variant="subtle" onClick={onCancel}>
          Cancel
        </Button>
        <Text size="xs" c="dimmed">Ctrl+Enter to save</Text>
      </Group>
    </Stack>
  );
}
