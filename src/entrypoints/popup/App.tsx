import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Stack,
  Text,
  ScrollArea,
  Group,
  ActionIcon,
  TextInput,
  Textarea,
  Badge,
  Tooltip,
  Box,
  Menu,
  Loader,
  SegmentedControl,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconSearch,
  IconTrash,
  IconClipboard,
  IconPin,
  IconPinFilled,
  IconCopy,
  IconX,
  IconChevronDown,
  IconChevronUp,
  IconSun,
  IconMoon,
  IconCheck,
  IconEdit,
  IconDownload,
  IconUpload,
  IconDots,
  IconLock,
  IconShieldLock,
  IconFolder,
} from '@tabler/icons-react';
import {
  getEntries,
  addEntry,
  deleteEntry,
  updateEntry,
  clearAllEntries,
  getStorageUsage,
  exportData,
  importData,
  getSettings,
  getFolders,
  STORAGE_QUOTA_BYTES,
  STORAGE_QUOTA_WARN_THRESHOLD,
} from '../../lib/storage';
import { v4 as uuidv4 } from 'uuid';
import { isUnlocked } from '../../lib/session';
import { getFeatureFlags } from '../../lib/features';
import type { ClipboardEntry, Folder, Settings, FeatureFlags } from '../../types';
import LockScreen from './LockScreen';
import PasswordSettings from './PasswordSettings';
import SnippetsPanel from './SnippetsPanel';
import FolderManager from './FolderManager';

type View = 'main' | 'passwordSettings' | 'folderManager';
type Tab = 'clips' | 'snippets';

export default function App() {
  const [view, setView] = useState<View>('main');
  const [tab, setTab] = useState<Tab>('clips');
  const [isLocked, setIsLocked] = useState<boolean | null>(null); // null = loading
  const [settings, setSettings] = useState<Settings | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags | null>(null);
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState({ bytesUsed: 0, totalEntries: 0 });
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  // Check lock state and load settings on mount
  useEffect(() => {
    checkLockState();
    // Check for a quota exceeded flag set by background addEntry failure
    chrome.storage.local.get('copyflow_quota_exceeded').then((result) => {
      if (result['copyflow_quota_exceeded']) {
        setQuotaExceeded(true);
        chrome.storage.local.remove('copyflow_quota_exceeded').catch(() => {});
      }
    });
  }, []);

  // Load entries when unlocked
  useEffect(() => {
    if (isLocked === false) {
      loadEntries();
      loadFolders();
      loadStorageInfo();
    }
  }, [isLocked]);

  // Listen for storage changes
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes['copyflow_entries'] && isLocked === false) {
        // When encrypted, newValue is ciphertext — must go through getEntries() to decrypt
        loadEntries();
        loadStorageInfo();
      }
      if (changes['copyflow_folders'] && isLocked === false) {
        loadFolders();
      }
      if (changes['copyflow_quota_exceeded']?.newValue) {
        setQuotaExceeded(true);
        chrome.storage.local.remove('copyflow_quota_exceeded').catch(() => {});
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [isLocked]);

  // Poll clipboard for images while popup is open.
  // The popup is focused, so navigator.clipboard.read() works here — unlike the offscreen doc.
  useEffect(() => {
    if (isLocked !== false) return;

    let lastKey = '';
    let initialized = false;

    async function pollForImages() {
      try {
        // On first run, load existing image entries to avoid re-storing what's already saved
        if (!initialized) {
          const existing = await getEntries();
          const lastImage = existing.find((e) => e.type === 'image');
          lastKey = lastImage?.content ?? '';
          initialized = true;
        }

        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
            .find((t) => item.types.includes(t));
          if (!imageType) continue;

          const blob = await item.getType(imageType);
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('FileReader failed'));
            reader.readAsDataURL(blob);
          });

          const b64Start = dataUrl.indexOf(',') + 1;
          const key = '[image:' + dataUrl.slice(b64Start, b64Start + 40) + ']';

          if (key === lastKey) return;
          lastKey = key;

          await addEntry({
            id: uuidv4(),
            content: key,
            type: 'image',
            imageDataUrl: dataUrl,
            timestamp: Date.now(),
            pinned: false,
          });
          // addEntry writes to storage → chrome.storage.onChanged fires → loadEntries() updates UI
          return;
        }
      } catch {
        // clipboard.read() unavailable or threw — ignore
      }
    }

    const id = setInterval(pollForImages, 2000);
    return () => clearInterval(id);
  }, [isLocked]);

  async function checkLockState() {
    const [s, flags] = await Promise.all([getSettings(), getFeatureFlags()]);
    setSettings(s);
    setFeatureFlags(flags);
    if (!s.passwordEnabled) {
      setIsLocked(false);
      return;
    }
    const unlocked = await isUnlocked();
    setIsLocked(!unlocked);
  }

  async function loadEntries() {
    const data = await getEntries();
    setEntries(data);
  }

  async function loadFolders() {
    const data = await getFolders();
    setFolders(data);
  }

  async function loadStorageInfo() {
    const info = await getStorageUsage();
    setStorageInfo(info);
  }

  async function handleUnlock(password: string): Promise<boolean> {
    const response = await chrome.runtime.sendMessage({
      type: 'UNLOCK_EXTENSION',
      password,
    });
    if (response?.success) {
      setIsLocked(false);
      return true;
    }
    return false;
  }

  async function handleLock() {
    await chrome.runtime.sendMessage({ type: 'LOCK_EXTENSION' });
    setIsLocked(true);
    setEntries([]);
  }

  function handleStateChange() {
    // Re-check everything after password enable/disable/change
    checkLockState();
    loadEntries();
    loadStorageInfo();
    setView('main');
  }

  // --- Loading state ---
  if (isLocked === null || settings === null || featureFlags === null) {
    return (
      <Stack align="center" justify="center" style={{ height: '100%' }}>
        <Loader size="sm" />
      </Stack>
    );
  }

  // --- Lock screen ---
  if (isLocked) {
    return <LockScreen onUnlock={handleUnlock} isSetup={false} />;
  }

  // --- Password settings view ---
  if (view === 'passwordSettings') {
    return (
      <PasswordSettings
        passwordEnabled={settings.passwordEnabled}
        autoLockMinutes={settings.autoLockMinutes}
        onClose={() => setView('main')}
        onStateChange={handleStateChange}
      />
    );
  }

  // --- Folder manager view ---
  if (view === 'folderManager') {
    return (
      <FolderManager
        folders={folders}
        onClose={() => setView('main')}
        onFoldersChange={loadFolders}
      />
    );
  }

  // --- Main content ---
  return (
    <MainContent
      entries={entries}
      folders={folders}
      activeFolderId={activeFolderId}
      setActiveFolderId={setActiveFolderId}
      search={search}
      setSearch={setSearch}
      copiedId={copiedId}
      setCopiedId={setCopiedId}
      storageInfo={storageInfo}
      quotaExceeded={quotaExceeded}
      colorScheme={colorScheme}
      toggleColorScheme={toggleColorScheme}
      passwordEnabled={settings.passwordEnabled}
      snippetsEnabled={featureFlags.snippetsEnabled}
      tab={tab}
      onTabChange={setTab}
      onLock={handleLock}
      onOpenPasswordSettings={() => setView('passwordSettings')}
      onOpenFolderManager={() => setView('folderManager')}
      loadEntries={loadEntries}
    />
  );
}

// ---- Main Content Component ----

interface MainContentProps {
  entries: ClipboardEntry[];
  folders: Folder[];
  activeFolderId: string | null;
  setActiveFolderId: (id: string | null) => void;
  search: string;
  setSearch: (s: string) => void;
  copiedId: string | null;
  setCopiedId: (id: string | null) => void;
  storageInfo: { bytesUsed: number; totalEntries: number };
  quotaExceeded: boolean;
  colorScheme: string;
  toggleColorScheme: () => void;
  passwordEnabled: boolean;
  snippetsEnabled: boolean;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onLock: () => void;
  onOpenPasswordSettings: () => void;
  onOpenFolderManager: () => void;
  loadEntries: () => Promise<void>;
}

function MainContent({
  entries,
  folders,
  activeFolderId,
  setActiveFolderId,
  search,
  setSearch,
  copiedId,
  setCopiedId,
  storageInfo,
  quotaExceeded,
  colorScheme,
  toggleColorScheme,
  passwordEnabled,
  snippetsEnabled,
  tab,
  onTabChange,
  onLock,
  onOpenPasswordSettings,
  onOpenFolderManager,
  loadEntries,
}: MainContentProps) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [editTrigger, setEditTrigger] = useState(0);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const quotaPercent = storageInfo.bytesUsed / STORAGE_QUOTA_BYTES;

  // Filter entries by search and active folder
  const filtered = entries
    .filter((e) => e.content.toLowerCase().includes(search.toLowerCase()))
    .filter((e) => activeFolderId === null || e.folderId === activeFolderId);

  // Split into pinned + unpinned
  const pinned = filtered.filter((e) => e.pinned);
  const unpinned = filtered.filter((e) => !e.pinned);

  // Flat array for keyboard indexing
  const allClips = [...pinned, ...unpinned];

  // Reset focus when search or folder changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [search, activeFolderId]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0) {
      itemRefs.current[focusedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (tab !== 'clips') return;

    function handleKeyDown(e: KeyboardEvent) {
      const isSearchFocused = document.activeElement === searchInputRef.current;

      // When search is focused, only handle Escape and ArrowDown
      if (isSearchFocused) {
        if (e.key === 'Escape') {
          if (search) {
            setSearch('');
          } else {
            searchInputRef.current?.blur();
            setFocusedIndex(-1);
          }
          e.preventDefault();
        } else if (e.key === 'ArrowDown') {
          searchInputRef.current?.blur();
          setFocusedIndex(0);
          e.preventDefault();
        }
        return;
      }

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((i) => Math.min(i + 1, allClips.length - 1));
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((i) => Math.max(i - 1, -1));
          break;
        case 'Enter':
          if (focusedIndex >= 0 && allClips[focusedIndex]) {
            e.preventDefault();
            handleCopy(allClips[focusedIndex]);
          }
          break;
        case 'p':
          if (focusedIndex >= 0 && allClips[focusedIndex]) {
            e.preventDefault();
            handleTogglePin(allClips[focusedIndex]);
          }
          break;
        case 'd':
          if (focusedIndex >= 0 && allClips[focusedIndex]) {
            e.preventDefault();
            handleDelete(allClips[focusedIndex].id);
            setFocusedIndex((i) => Math.min(i, allClips.length - 2));
          }
          break;
        case 'e':
          if (focusedIndex >= 0 && allClips[focusedIndex]) {
            e.preventDefault();
            setEditTrigger((t) => t + 1);
          }
          break;
        case '/':
          e.preventDefault();
          searchInputRef.current?.focus();
          setFocusedIndex(-1);
          break;
        case 'Escape':
          if (search) {
            setSearch('');
          } else {
            setFocusedIndex(-1);
          }
          e.preventDefault();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tab, focusedIndex, allClips, search]);

  // Copy an entry to clipboard
  const handleCopy = useCallback(async (entry: ClipboardEntry) => {
    try {
      await chrome.runtime.sendMessage({
        type: 'COPY_TO_CLIPBOARD',
        text: entry.content,
      });
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  // Toggle pin
  const handleTogglePin = useCallback(async (entry: ClipboardEntry) => {
    await updateEntry(entry.id, { pinned: !entry.pinned });
    await loadEntries();
  }, []);

  // Delete single entry
  const handleDelete = useCallback(async (id: string) => {
    await deleteEntry(id);
    await loadEntries();
  }, []);

  // Move entry to folder
  const handleMoveToFolder = useCallback(async (id: string, folderId: string | undefined) => {
    await updateEntry(id, { folderId });
    await loadEntries();
  }, []);

  // Edit entry
  const handleSaveEdit = useCallback(async (id: string, newContent: string) => {
    await updateEntry(id, { content: newContent });
    await loadEntries();
  }, []);

  // Clear all
  async function handleClearAll() {
    if (entries.length === 0) return;
    await clearAllEntries();
    await loadEntries();
  }

  // Export
  async function handleExport() {
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
      console.error('Export failed:', err);
    }
  }

  // Import
  async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const result = await importData(text);
        await loadEntries();
        console.log(`CopyFlow: Imported ${result.entriesImported} new clips`);
      } catch (err) {
        console.error('Import failed:', err);
      }
    };
    input.click();
  }

  // Format timestamp
  function formatTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  // Truncate long text for display
  function truncate(text: string, max = 120): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + '...';
  }

  // Format bytes to human readable
  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const isDark = colorScheme === 'dark';

  return (
    <Stack gap={0} style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Box px="md" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Group justify="space-between" mb="xs">
          <Group gap="xs">
            <IconClipboard size={20} color="var(--mantine-color-blue-6)" />
            <Text fw={700} size="lg">CopyFlow</Text>
          </Group>
          <Group gap={4}>
            <Badge variant="light" size="sm">{entries.length}</Badge>
            {passwordEnabled && (
              <Tooltip label="Lock">
                <ActionIcon variant="subtle" size="sm" onClick={onLock}>
                  <IconLock size={14} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label={isDark ? 'Light mode' : 'Dark mode'}>
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={() => toggleColorScheme()}
              >
                {isDark ? <IconSun size={14} /> : <IconMoon size={14} />}
              </ActionIcon>
            </Tooltip>
            <Menu shadow="md" width={200} position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="subtle" size="sm">
                  <IconDots size={14} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconFolder size={14} />}
                  onClick={onOpenFolderManager}
                >
                  Folders
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<IconShieldLock size={14} />}
                  onClick={onOpenPasswordSettings}
                >
                  Password & Encryption
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<IconDownload size={14} />}
                  onClick={handleExport}
                  disabled={entries.length === 0}
                >
                  Export backup
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconUpload size={14} />}
                  onClick={handleImport}
                >
                  Import backup
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={handleClearAll}
                  disabled={entries.length === 0}
                >
                  Clear all clips
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>

        <SegmentedControl
          value={tab}
          onChange={(v) => onTabChange(v as Tab)}
          data={[
            { label: 'Clips', value: 'clips' },
            { label: 'Snippets', value: 'snippets' },
          ]}
          size="xs"
          fullWidth
        />

        {tab === 'clips' && (
          <>
            <TextInput
              placeholder="Search clips... (press / to focus)"
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
              mt="xs"
              ref={searchInputRef}
            />
            {folders.length > 0 && (
              <Group gap={4} mt={4} style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
                <Badge
                  variant={activeFolderId === null ? 'filled' : 'light'}
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                  onClick={() => setActiveFolderId(null)}
                >
                  All
                </Badge>
                {folders.map((f) => (
                  <Badge
                    key={f.id}
                    color={f.color}
                    variant={activeFolderId === f.id ? 'filled' : 'light'}
                    style={{ cursor: 'pointer', flexShrink: 0 }}
                    onClick={() => setActiveFolderId(f.id)}
                  >
                    {f.name}
                  </Badge>
                ))}
              </Group>
            )}
          </>
        )}
      </Box>

      {/* Snippets tab */}
      {tab === 'snippets' && (
        <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <SnippetsPanel snippetsEnabled={snippetsEnabled} />
        </Box>
      )}

      {/* Clip list */}
      {tab === 'clips' && (
      <ScrollArea px="md" py="xs" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <Stack align="center" justify="center" py="xl" gap="xs">
            <IconClipboard size={48} opacity={0.15} />
            <Text c="dimmed" size="sm" ta="center">
              {search
                ? 'No clips match your search'
                : activeFolderId
                ? 'No clips in this folder'
                : 'No clips yet'}
            </Text>
            {!search && !activeFolderId && (
              <Text c="dimmed" size="xs" ta="center">
                Copy something and it'll appear here.
              </Text>
            )}
          </Stack>
        ) : (
          <Stack gap="xs">
            {/* Pinned section */}
            {pinned.length > 0 && (
              <>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  Pinned
                </Text>
                {pinned.map((entry, i) => (
                  <ClipItem
                    key={entry.id}
                    entry={entry}
                    folders={folders}
                    copiedId={copiedId}
                    focused={focusedIndex === i}
                    forceEdit={focusedIndex === i ? editTrigger : 0}
                    itemRef={(el) => { itemRefs.current[i] = el; }}
                    onCopy={handleCopy}
                    onTogglePin={handleTogglePin}
                    onDelete={handleDelete}
                    onSaveEdit={handleSaveEdit}
                    onMoveToFolder={handleMoveToFolder}
                    formatTime={formatTime}
                    truncate={truncate}
                  />
                ))}
              </>
            )}

            {/* Recent section */}
            {unpinned.length > 0 && (
              <>
                {pinned.length > 0 && (
                  <Text size="xs" c="dimmed" fw={600} tt="uppercase" mt="xs">
                    Recent
                  </Text>
                )}
                {unpinned.map((entry, i) => {
                  const globalIndex = pinned.length + i;
                  return (
                    <ClipItem
                      key={entry.id}
                      entry={entry}
                      folders={folders}
                      copiedId={copiedId}
                      focused={focusedIndex === globalIndex}
                      forceEdit={focusedIndex === globalIndex ? editTrigger : 0}
                      itemRef={(el) => { itemRefs.current[globalIndex] = el; }}
                      onCopy={handleCopy}
                      onTogglePin={handleTogglePin}
                      onDelete={handleDelete}
                      onSaveEdit={handleSaveEdit}
                      onMoveToFolder={handleMoveToFolder}
                      formatTime={formatTime}
                      truncate={truncate}
                    />
                  );
                })}
              </>
            )}
          </Stack>
        )}
      </ScrollArea>
      )}

      {/* Footer — storage info */}
      <Box
        px="md"
        py={6}
        style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
      >
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {storageInfo.totalEntries} clips · {formatBytes(storageInfo.bytesUsed)} used
          </Text>
          <Text size="xs" c="dimmed">
            CopyFlow v0.2.0
          </Text>
        </Group>
        {quotaExceeded && (
          <Text size="xs" c="red" mt={2}>
            ⚠ Storage full — export or delete old clips
          </Text>
        )}
        {!quotaExceeded && quotaPercent >= STORAGE_QUOTA_WARN_THRESHOLD && (
          <Text size="xs" c={quotaPercent >= 0.95 ? 'red' : 'orange'} mt={2}>
            ⚠ Storage {Math.round(quotaPercent * 100)}% full — export or delete old clips
          </Text>
        )}
      </Box>
    </Stack>
  );
}

// ---- Clip Item Component ----

interface ClipItemProps {
  entry: ClipboardEntry;
  folders: Folder[];
  copiedId: string | null;
  focused?: boolean;
  forceEdit?: number;
  itemRef?: (el: HTMLDivElement | null) => void;
  onCopy: (entry: ClipboardEntry) => void;
  onTogglePin: (entry: ClipboardEntry) => void;
  onDelete: (id: string) => void;
  onSaveEdit: (id: string, newContent: string) => void;
  onMoveToFolder: (id: string, folderId: string | undefined) => void;
  formatTime: (ts: number) => string;
  truncate: (text: string, max?: number) => string;
}

function ClipItem({
  entry,
  folders,
  copiedId,
  focused,
  forceEdit,
  itemRef,
  onCopy,
  onTogglePin,
  onDelete,
  onSaveEdit,
  onMoveToFolder,
  formatTime,
  truncate,
}: ClipItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(entry.content);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const isCopied = copiedId === entry.id;
  const isLong = entry.content.length > 120;

  const activeFolder = entry.folderId ? folders.find((f) => f.id === entry.folderId) : null;

  // Focus textarea when editing starts
  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [editing]);

  // Trigger edit from keyboard shortcut
  useEffect(() => {
    if (forceEdit && forceEdit > 0) {
      setEditValue(entry.content);
      setEditing(true);
      setExpanded(true);
    }
  }, [forceEdit]);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditValue(entry.content);
    setEditing(true);
    setExpanded(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditValue(entry.content);
  }

  function saveEdit() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== entry.content) {
      onSaveEdit(entry.id, trimmed);
    }
    setEditing(false);
  }

  return (
    <Box
      ref={itemRef}
      p="xs"
      style={{
        borderRadius: 'var(--mantine-radius-sm)',
        border: focused
          ? '1px solid var(--mantine-color-default-border)'
          : '1px solid var(--mantine-color-default-border)',
        borderLeft: focused ? '2px solid var(--mantine-color-blue-6)' : '1px solid var(--mantine-color-default-border)',
        cursor: editing ? 'default' : 'pointer',
        transition: 'background 0.15s',
        background: focused ? 'var(--mantine-color-gray-light-hover)' : 'transparent',
      }}
      onClick={() => {
        if (editing) return;
        if (isLong) {
          setExpanded(!expanded);
        } else {
          onCopy(entry);
        }
      }}
      onMouseEnter={(e) => {
        if (!editing) e.currentTarget.style.background = 'var(--mantine-color-gray-light-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = focused ? 'var(--mantine-color-gray-light-hover)' : 'transparent';
      }}
    >
      {/* Image preview */}
      {entry.type === 'image' && entry.imageDataUrl && (
        <img
          src={entry.imageDataUrl}
          alt="Copied image"
          style={{
            maxWidth: '100%',
            maxHeight: expanded ? 300 : 80,
            borderRadius: 4,
            marginBottom: 4,
            objectFit: 'contain',
            transition: 'max-height 0.2s',
          }}
        />
      )}

      {/* Text content — editing, expanded, or collapsed */}
      {editing ? (
        <Box onClick={(e) => e.stopPropagation()}>
          <Textarea
            ref={editRef}
            value={editValue}
            onChange={(e) => setEditValue(e.currentTarget.value)}
            autosize
            minRows={2}
            maxRows={8}
            size="xs"
            styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                saveEdit();
              }
              if (e.key === 'Escape') {
                cancelEdit();
              }
            }}
          />
          <Group gap={4} mt={4}>
            <Text
              size="xs"
              fw={600}
              c="blue"
              style={{ cursor: 'pointer' }}
              onClick={saveEdit}
            >
              Save
            </Text>
            <Text
              size="xs"
              c="dimmed"
              style={{ cursor: 'pointer' }}
              onClick={cancelEdit}
            >
              Cancel
            </Text>
            <Text size="xs" c="dimmed">· Ctrl+Enter / Esc</Text>
          </Group>
        </Box>
      ) : expanded ? (
        <Text
          size="sm"
          style={{
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            maxHeight: 200,
            overflowY: 'auto',
            background: 'var(--mantine-color-gray-light)',
            borderRadius: 4,
            padding: 8,
            fontSize: 12,
            fontFamily: 'monospace',
          }}
        >
          {entry.content}
        </Text>
      ) : (
        <Text size="sm" lineClamp={2} style={{ wordBreak: 'break-word' }}>
          {truncate(entry.content)}
        </Text>
      )}

      {/* Metadata row */}
      <Group justify="space-between" mt={4}>
        <Group gap={4}>
          <Text size="xs" c="dimmed">
            {formatTime(entry.timestamp)}
          </Text>
          {entry.sourceTitle && (
            <Text size="xs" c="dimmed" lineClamp={1} maw={120}>
              · {entry.sourceTitle}
            </Text>
          )}
          {activeFolder && (
            <Badge
              size="xs"
              color={activeFolder.color}
              variant="dot"
              style={{ cursor: 'default' }}
            >
              {activeFolder.name}
            </Badge>
          )}
          {isLong && !editing && (
            <Text size="xs" c="blue" style={{ cursor: 'pointer' }}>
              {expanded ? (
                <Group gap={2}><IconChevronUp size={12} /> less</Group>
              ) : (
                <Group gap={2}><IconChevronDown size={12} /> more</Group>
              )}
            </Text>
          )}
        </Group>

        {/* Action buttons */}
        {!editing && (
          <Group gap={2} onClick={(e) => e.stopPropagation()}>
            <Tooltip label="Edit">
              <ActionIcon variant="subtle" size="xs" onClick={startEdit}>
                <IconEdit size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={entry.pinned ? 'Unpin' : 'Pin'}>
              <ActionIcon variant="subtle" size="xs" onClick={() => onTogglePin(entry)}>
                {entry.pinned ? (
                  <IconPinFilled size={14} />
                ) : (
                  <IconPin size={14} />
                )}
              </ActionIcon>
            </Tooltip>
            {/* Folder assignment */}
            {folders.length > 0 && (
              <Menu shadow="md" width={160} position="bottom-end">
                <Menu.Target>
                  <Tooltip label="Move to folder">
                    <ActionIcon
                      variant="subtle"
                      size="xs"
                      color={activeFolder ? activeFolder.color : undefined}
                    >
                      <IconFolder size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                  {entry.folderId && (
                    <>
                      <Menu.Item onClick={() => onMoveToFolder(entry.id, undefined)}>
                        No folder
                      </Menu.Item>
                      <Menu.Divider />
                    </>
                  )}
                  {folders.map((f) => (
                    <Menu.Item
                      key={f.id}
                      leftSection={
                        <Box
                          w={10}
                          h={10}
                          style={{
                            borderRadius: '50%',
                            background: `var(--mantine-color-${f.color}-6)`,
                            flexShrink: 0,
                          }}
                        />
                      }
                      onClick={() => onMoveToFolder(entry.id, f.id)}
                    >
                      {f.name}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            )}
            <Tooltip label={isCopied ? 'Copied!' : 'Copy'}>
              <ActionIcon
                variant="subtle"
                size="xs"
                color={isCopied ? 'green' : undefined}
                onClick={() => onCopy(entry)}
              >
                {isCopied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete">
              <ActionIcon variant="subtle" size="xs" color="red" onClick={() => onDelete(entry.id)}>
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Group>
    </Box>
  );
}
