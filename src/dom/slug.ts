const RESERVED_PATH_SEGMENTS = new Set([
  'about',
  'browse',
  'category',
  'dashboard',
  'following',
  'privacy',
  'search',
  'settings',
  'subscriptions',
  'terms',
]);

const CHANNEL_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

export function getKickChannelSlugFromHref(
  href: string | null | undefined,
  baseUrl = window.location.href,
): string | null {
  if (!href) {
    return null;
  }

  try {
    const url = new URL(href, baseUrl);

    if (!isKickHost(url)) {
      return null;
    }

    return getKickChannelSlugFromPath(url.pathname);
  } catch {
    return null;
  }
}

export function getCurrentKickChannelSlug(
  location: Location = window.location,
): string | null {
  return getKickChannelSlugFromPath(location.pathname);
}

export function getKickChannelSlugFromPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length !== 1) {
    return null;
  }

  const segment = segments[0];

  return segment
    ? normalizeKickChannelSlug(safeDecodeURIComponent(segment))
    : null;
}

export function normalizeKickChannelSlug(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized.length === 0 ||
    RESERVED_PATH_SEGMENTS.has(normalized) ||
    !CHANNEL_SLUG_PATTERN.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function isKickHost(url: URL): boolean {
  return url.hostname === 'kick.com' || url.hostname === 'www.kick.com';
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
