# Kick Viewer Count

Kick Viewer Count is a public browser extension project for Kick.com. It surfaces viewer-count-related data that Kick pages already load themselves and adds extension-owned viewer count indicators where the page does not display a count.

The extension is currently in early development. The active runtime is a conservative DOM-only baseline while network capture is redesigned to avoid page monkey-patching.

Any future captured data should stay in memory during the page session. This phase does not use an external backend or transmit viewer-count data outside the local browser.

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

The active architecture has one runtime entrypoint:

- A content script that runs on `https://kick.com/*` at `document_idle`.

The content script runs in the isolated extension world and does not patch Kick's page-owned `window.fetch`, `XMLHttpRequest`, `Response`, or other network primitives. It starts after page bootstrap, observes DOM mutations, and updates only extension-owned DOM elements.

Network response capture is intentionally disabled for now. Endpoint matching and normalizers are still present so a safer capture strategy can reuse them without scattering URL checks through the codebase.

The current registry covers viewer-count-related data from:

- Sidebar livestream recommendations: `https://web.kick.com/api/v1/recommendations/livestreams/sidebar`
- General livestream recommendations: `https://web.kick.com/api/v1/recommendations/livestreams`
- Featured livestreams: `https://web.kick.com/api/v1/livestreams/featured`
- Followed channels: `https://kick.com/api/v2/channels/followed`
- Current viewers: `https://kick.com/current-viewers`
- User livestreams: `https://kick.com/api/v1/user/livestreams`

When network capture is reintroduced, captured payloads should be validated, normalized into compact internal TypeScript models, stored in memory, and used to schedule debounced DOM updates.

Stream/list responses are normalized into shared stream models keyed by channel slug and, when available, livestream ID. The `/current-viewers` response is normalized separately by numeric livestream ID because it does not include channel slugs.

DOM injection is slug-based rather than endpoint-page-based. Injectors look for Kick DOM elements that expose channel slugs, read the best fresh stream record from the in-memory store, and add or update extension-owned elements only when a native Kick viewer count is not already visible. Extension-added elements are marked with `data-kvc-viewer-count="true"`, `data-kvc-target`, and `data-kvc-slug`.

Current DOM injectors target:

- Livestream cards
- Sidebar following and recommended channel rows
- Live channel headers

DOM updates are debounced and run after SPA navigation, DOM mutations, and content script initialization. The extension currently does not directly call Kick APIs.

## Network Capture Direction

Avoid page monkey-patching for network capture. Do not patch Kick's page-owned `fetch`, `XMLHttpRequest`, `Response`, or history objects in the main world.

The browser `webRequest` API is useful for observing request metadata across Chrome, Edge, and Firefox, but it is not a cross-browser way to read response bodies. Firefox exposes `webRequest.filterResponseData()` for response streams, while Chrome and Edge do not expose an equivalent response-body API for normal extensions.

The likely cross-browser direction is an extension-owned background fetch flow with narrow host permissions and strictly allowlisted endpoints, or a DOM/page-data extraction flow that does not touch page network primitives. Any background fetch handler must construct allowlisted URLs itself rather than accepting arbitrary URLs from content scripts.

Popup UI, options UI, and store packaging are intentionally left for later phases.

## License

MIT
