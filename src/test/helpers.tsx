// ============================================
// CopyFlow — Test Helpers
// ============================================

import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// Wrapper that provides MantineProvider for all component tests
function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider>
      {children}
    </MantineProvider>
  );
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export { default as userEvent } from '@testing-library/user-event';
