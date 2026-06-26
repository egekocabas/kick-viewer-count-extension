# Kick Viewer Count

Kick Viewer Count is a browser extension for Kick.com that shows viewer counts that are not displayed by the site. It captures data Kick pages already load and injects viewer count indicators on livestream cards, the sidebar, and channel headers where no native count is shown. On browse and category listing pages, where Kick may server-render cards without client-side listing API traffic, the extension makes same-origin Kick API requests for only the cards missing native counts.

All captured data stays in memory during the page session. The extension does not use an external backend and does not transmit viewer-count data outside the local browser.

Supported target browsers:

- Google Chrome
- Mozilla Firefox

## Local Development

Install dependencies and start a local WXT development build:

```sh
npm install
npm run dev
```

Browser-specific development commands are also available:

```sh
npm run dev:chrome
npm run dev:firefox
```

## Assets

Runtime extension assets live in `public/` and are copied into the packaged extension. WXT auto-discovers extension icons from `public/icons/16.png`, `public/icons/48.png`, and `public/icons/128.png`, so those files do not need to be manually listed in `wxt.config.ts`.

Store listing and source media are kept outside the extension bundle under `store-assets/`. The Chrome/Firefox listing screenshots currently lives at `store-assets/screenshots`, and the source icon SVG lives at `store-assets/icons/icon.svg`.

## Technical Overview

This project uses WXT and TypeScript with a minimal dependency footprint.

There are two runtime entrypoints:

- **`page-hook.content.ts`** — runs in the `MAIN` world at `document_start`, before any Kick scripts execute. Patches `Response.prototype.json` to intercept API responses, then forwards captured payloads to the content script via `window.postMessage`. Also patches `Function.prototype.toString` so that patched functions return their original native source string, defeating `.toString()`-based tamper checks. Running at `document_start` ensures Kick's own scripts never see an unpatched reference — they save the already-patched version from the beginning, so reference-equality anti-tamper checks also pass.

- **`content.ts`** — runs in the isolated extension world at `document_start`. Listens for `postMessage` events from the page hook, normalizes captured payloads into in-memory state, and schedules debounced DOM updates.

### Network capture

Captured responses come from these endpoints:

- Sidebar livestream recommendations: `https://web.kick.com/api/v1/recommendations/livestreams/sidebar`
- General livestream recommendations: `https://web.kick.com/api/v1/recommendations/livestreams`
- Featured livestreams: `https://web.kick.com/api/v1/livestreams/featured`
- Channel details: `https://kick.com/api/v2/channels/{slug}`
- Followed channels: `https://kick.com/api/v2/channels/followed`
- Current viewers: `https://kick.com/current-viewers`
- User livestreams: `https://kick.com/api/v1/user/livestreams`

Stream/list responses are normalized into shared stream models keyed by channel slug and, when available, livestream ID. The `/current-viewers` response is normalized separately by numeric livestream ID because it does not include channel slugs.

### DOM injection

DOM injection is slug-based rather than endpoint-page-based. Injectors look for Kick DOM elements that expose channel slugs, read the best fresh stream record from the in-memory store, and add or update extension-owned elements only when a native Kick viewer count is not already visible. Extension-added elements are marked with `data-kvc-viewer-count="true"`, `data-kvc-target`, and `data-kvc-slug`.

Current DOM injectors target:

- Livestream cards
- Sidebar following and recommended channel rows
- Live channel headers

DOM updates are debounced and run after SPA navigation, DOM mutations, and content script initialization. On `/browse` and `/category/*` routes, the content script actively fetches same-origin channel details for missing-count cards and polls `/current-viewers` for the discovered livestream IDs while the user remains on that route.

## License

MIT
