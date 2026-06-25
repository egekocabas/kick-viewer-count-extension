import { defineConfig } from 'wxt';

export default defineConfig({
  webExt: {
    disabled: true,
  },
  manifest: ({ browser }) => ({
    name: 'Kick Viewer Count',
    description: 'Shows hidden viewer counts on Kick.com.',
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: '@kick-viewer-count-extension.egekocabas',
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {}),
  }),
});
