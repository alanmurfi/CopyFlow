import {
  Stack,
  Text,
  Title,
  Group,
  Box,
  ThemeIcon,
  SimpleGrid,
  Badge,
  Paper,
} from '@mantine/core';
import {
  IconClipboard,
  IconCircleCheck,
  IconKeyboard,
  IconShieldLock,
  IconFileExport,
  IconDeviceFloppy,
  IconLock,
  IconTextCaption,
  IconFolder,
} from '@tabler/icons-react';

export default function Welcome() {
  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '48px 16px',
        background: 'var(--mantine-color-body)',
      }}
    >
      <Stack maw={640} w="100%" gap="xl">
        {/* Header */}
        <Stack align="center" gap="xs">
          <Group gap="sm">
            <IconClipboard size={36} color="var(--mantine-color-blue-6)" />
            <Title order={1} fw={800}>CopyFlow</Title>
          </Group>
          <Group gap="xs">
            <ThemeIcon color="green" variant="light" radius="xl" size="md">
              <IconCircleCheck size={16} />
            </ThemeIcon>
            <Title order={3} fw={600} c="green">You&apos;re all set!</Title>
          </Group>
          <Text c="dimmed" ta="center" maw={480}>
            CopyFlow is now running in the background, automatically saving everything you copy.
          </Text>
        </Stack>

        {/* Three steps */}
        <Stack gap="sm">
          <Title order={4} fw={600}>How it works</Title>
          <Stack gap="xs">
            <Step
              number="1"
              title="Copy anything"
              description="Text is saved automatically — no extra steps needed."
            />
            <Step
              number="2"
              title="Open CopyFlow"
              description="Click the toolbar icon or press Alt+Shift+V to open your clipboard history."
            />
            <Step
              number="3"
              title="Search, pin, edit, paste"
              description="Find any clip instantly, pin your favorites, edit content, or paste with one click."
            />
          </Stack>
        </Stack>

        {/* Feature highlights */}
        <Stack gap="sm">
          <Title order={4} fw={600}>What&apos;s included</Title>
          <SimpleGrid cols={2} spacing="sm">
            <FeatureCard
              icon={<IconShieldLock size={18} />}
              title="AES-256 Encryption"
              description="Optional password protection for your clipboard data."
            />
            <FeatureCard
              icon={<IconKeyboard size={18} />}
              title="Keyboard Shortcuts"
              description="Navigate with j/k, copy with Enter, search with /."
            />
            <FeatureCard
              icon={<IconFileExport size={18} />}
              title="Export & Import"
              description="Your data is portable — back up or restore anytime."
            />
            <FeatureCard
              icon={<IconTextCaption size={18} />}
              title="Text Snippets"
              description="Type a shortcut like /addr and it expands to full text."
            />
            <FeatureCard
              icon={<IconFolder size={18} />}
              title="Folders"
              description="Organize clips into color-coded folders."
            />
            <FeatureCard
              icon={<IconDeviceFloppy size={18} />}
              title="100% Local"
              description="Everything stored on your device. No cloud sync."
            />
          </SimpleGrid>
        </Stack>

        {/* Privacy callout */}
        <Paper
          p="md"
          radius="md"
          style={{
            background: 'var(--mantine-color-green-light)',
            border: '1px solid var(--mantine-color-green-light-hover)',
          }}
        >
          <Group gap="sm" align="flex-start">
            <ThemeIcon color="green" variant="light" size="lg" radius="md">
              <IconLock size={18} />
            </ThemeIcon>
            <Stack gap={2}>
              <Text fw={600} size="sm">Your privacy is protected</Text>
              <Text size="sm" c="dimmed">
                No servers. No tracking. No analytics. Everything stays on your device and is
                never sent anywhere.
              </Text>
            </Stack>
          </Group>
        </Paper>

        {/* CTA */}
        <Stack align="center" gap="xs">
          <Badge size="lg" variant="light" color="blue" leftSection={<IconClipboard size={14} />}>
            Click the toolbar icon to open CopyFlow
          </Badge>
          <Text size="xs" c="dimmed">
            Or press <Text component="span" fw={600} size="xs">Alt+Shift+V</Text> from any page
          </Text>
        </Stack>
      </Stack>
    </Box>
  );
}

// ---- Step Component ----

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <Group gap="sm" align="flex-start">
      <ThemeIcon
        radius="xl"
        size="md"
        color="blue"
        variant="light"
        style={{ flexShrink: 0, marginTop: 2 }}
      >
        <Text size="xs" fw={700}>{number}</Text>
      </ThemeIcon>
      <Stack gap={2}>
        <Text fw={600} size="sm">{title}</Text>
        <Text size="sm" c="dimmed">{description}</Text>
      </Stack>
    </Group>
  );
}

// ---- Feature Card Component ----

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Paper p="sm" radius="md" withBorder>
      <Group gap="xs" mb={4} align="center">
        <ThemeIcon size="sm" variant="light" color="blue" radius="sm">
          {icon}
        </ThemeIcon>
        <Text fw={600} size="sm">{title}</Text>
      </Group>
      <Text size="xs" c="dimmed">{description}</Text>
    </Paper>
  );
}
