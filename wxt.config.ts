import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'CopyFlow — Clipboard Manager',
    description: 'Save everything you copy. Search, pin, and organise your clipboard history.',
    version: '0.1.0',
    permissions: [
      'clipboardRead',
      'clipboardWrite',
      'storage',
      'offscreen',
      'activeTab',
      'tabs',
      'contextMenus',
      'scripting',
    ],
    icons: {
      16: 'icon/icon-16.png',
      48: 'icon/icon-48.png',
      128: 'icon/icon-128.png',
    },
    commands: {
      '_execute_action': {
        suggested_key: {
          default: 'Alt+Shift+V',
          mac: 'Alt+Shift+V',
        },
        description: 'Open CopyFlow clipboard history',
      },
    },
  },
});
