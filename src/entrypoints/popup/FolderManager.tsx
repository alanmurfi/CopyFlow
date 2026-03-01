import { useState } from 'react';
import {
  Stack,
  Text,
  Group,
  ActionIcon,
  TextInput,
  Button,
  Box,
} from '@mantine/core';
import { IconArrowLeft, IconX } from '@tabler/icons-react';
import { v4 as uuidv4 } from 'uuid';
import { addFolder, deleteFolder } from '../../lib/storage';
import type { Folder } from '../../types';

const FOLDER_COLORS = ['blue', 'green', 'orange', 'red', 'grape', 'teal'] as const;
type FolderColor = (typeof FOLDER_COLORS)[number];

interface FolderManagerProps {
  folders: Folder[];
  onClose: () => void;
  onFoldersChange: () => void;
}

export default function FolderManager({ folders, onClose, onFoldersChange }: FolderManagerProps) {
  const [newName, setNewName] = useState('');
  const [selectedColor, setSelectedColor] = useState<FolderColor>('blue');
  const [nameError, setNameError] = useState('');

  const atLimit = folders.length >= 10;

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) {
      setNameError('Folder name is required');
      return;
    }
    if (trimmed.length > 24) {
      setNameError('Max 24 characters');
      return;
    }
    if (folders.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) {
      setNameError('A folder with this name already exists');
      return;
    }
    await addFolder({ id: uuidv4(), name: trimmed, color: selectedColor, createdAt: Date.now() });
    setNewName('');
    setSelectedColor('blue');
    setNameError('');
    onFoldersChange();
  }

  async function handleDelete(id: string) {
    await deleteFolder(id);
    onFoldersChange();
  }

  return (
    <Stack gap={0} style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Box px="md" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Group gap="xs">
          <ActionIcon variant="subtle" size="sm" onClick={onClose}>
            <IconArrowLeft size={16} />
          </ActionIcon>
          <Text fw={600}>Folders</Text>
        </Group>
      </Box>

      {/* Folder list */}
      <Box px="md" py="sm" style={{ flex: 1, overflowY: 'auto' }}>
        {folders.length === 0 ? (
          <Text size="sm" c="dimmed" py="sm">
            No folders yet — create one below.
          </Text>
        ) : (
          <Stack gap="xs">
            {folders.map((f) => (
              <Group key={f.id} justify="space-between">
                <Group gap="xs">
                  <Box
                    w={12}
                    h={12}
                    style={{
                      borderRadius: '50%',
                      background: `var(--mantine-color-${f.color}-6)`,
                      flexShrink: 0,
                    }}
                  />
                  <Text size="sm">{f.name}</Text>
                </Group>
                <ActionIcon
                  variant="subtle"
                  size="xs"
                  color="red"
                  onClick={() => handleDelete(f.id)}
                >
                  <IconX size={12} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        )}
      </Box>

      {/* Create form */}
      <Box
        px="md"
        py="sm"
        style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
      >
        {atLimit ? (
          <Text size="sm" c="dimmed">
            10 folder limit reached.
          </Text>
        ) : (
          <Stack gap="xs">
            <TextInput
              placeholder="Folder name"
              value={newName}
              onChange={(e) => {
                setNewName(e.currentTarget.value);
                setNameError('');
              }}
              size="sm"
              maxLength={24}
              error={nameError || undefined}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />
            <Group gap="xs">
              {FOLDER_COLORS.map((color) => (
                <Box
                  key={color}
                  w={20}
                  h={20}
                  style={{
                    borderRadius: '50%',
                    background: `var(--mantine-color-${color}-6)`,
                    cursor: 'pointer',
                    outline: selectedColor === color ? '2px solid var(--mantine-color-blue-6)' : '2px solid transparent',
                    outlineOffset: 2,
                    transition: 'outline 0.1s',
                  }}
                  onClick={() => setSelectedColor(color)}
                />
              ))}
            </Group>
            <Button size="xs" onClick={handleCreate} disabled={!newName.trim()}>
              Add Folder
            </Button>
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
