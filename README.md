# Kick Viewer Count

Kick Viewer Count is a public browser extension project for Kick.com. It surfaces viewer-count-related data that Kick pages already load themselves and adds extension-owned viewer count indicators where the page does not display a count.

All captured data stays in memory during the page session. The extension does not use an external backend and does not transmit viewer-count data outside the local browser.

Supported target browsers:

- Google Chrome
- Mozilla Firefox
- Microsoft Edge

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
npm run dev:edge
```

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

DOM updates are debounced and run after SPA navigation, DOM mutations, and content script initialization. The extension does not directly call Kick APIs.

## License

MIT
