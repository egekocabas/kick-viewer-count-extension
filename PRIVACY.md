# Privacy Policy

Effective date: June 26, 2026

Kick Viewer Count is a browser extension that shows viewer counts on Kick.com pages where Kick does not display them directly.

## Data Collection

Kick Viewer Count does not collect, sell, share, or transmit personal data to the developer or to any external analytics, advertising, or tracking service.

The extension does not use an external backend. It does not create user accounts, does not ask for personal information, and does not persist viewer-count data outside the current browser page session.

## How the Extension Works

The extension runs only on `https://kick.com/*`. It reads Kick page content and Kick API responses that the page loads in the browser, then adds viewer-count labels to matching Kick page elements when Kick has not already shown a native viewer count.

On browse and category pages, Kick may render livestream cards without a client-side listing API response. In that case, the extension may make same-origin requests to `kick.com` endpoints such as channel details and current viewers. These requests are sent directly from the user's browser to Kick using the browser's normal Kick session context. The responses are used only in memory to update the current page.

## Local Storage

Kick Viewer Count does not store viewer-count data, browsing history, authentication tokens, cookies, or user preferences in extension storage.

## Third Parties

The extension communicates only with Kick.com as part of its viewer-count functionality. It does not send extension data to the developer or to third-party services.

## Permissions

Kick Viewer Count requests access only to Kick.com pages so it can read page content, observe Kick API responses, and add viewer-count labels to the page.

## Contact

For questions or privacy concerns, open an issue at:

https://github.com/egekocabas/kick-viewer-count-extension/issues
