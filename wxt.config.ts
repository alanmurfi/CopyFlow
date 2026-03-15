import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'CopyFlow — Clipboard Manager',
    description: 'Save everything you copy. Search, pin, and organise your clipboard history.',
    version: '0.3.0',
    permissions: [
      'clipboardRead',
      'clipboardWrite',
      'storage',
      'unlimitedStorage',
      'offscreen',
      'activeTab',
      'tabs',
      'contextMenus',
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
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-src 'self'; font-src 'self'",
    },
  },
});
