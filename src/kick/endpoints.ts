import type { KickEndpointType } from '../types/kick';

export interface KickEndpointDefinition {
  type: KickEndpointType;
  debugName: string;
  origin: string;
  pathname: string;
  matchesUrl(url: URL): boolean;
}

function exactEndpoint(
  type: KickEndpointType,
  debugName: string,
  origin: string,
  pathname: string,
): KickEndpointDefinition {
  return {
    type,
    debugName,
    origin,
    pathname,
    matchesUrl(url) {
      return url.origin === origin && url.pathname === pathname;
    },
  };
}

export const KICK_ENDPOINT_DEFINITIONS = [
  exactEndpoint(
    'SIDEBAR_LIVESTREAMS',
    'sidebar livestream recommendations',
    'https://web.kick.com',
    '/api/v1/recommendations/livestreams/sidebar',
  ),
  exactEndpoint(
    'RECOMMENDED_LIVESTREAMS',
    'general livestream recommendations',
    'https://web.kick.com',
    '/api/v1/recommendations/livestreams',
  ),
  exactEndpoint(
    'FEATURED_LIVESTREAMS',
    'featured livestreams',
    'https://web.kick.com',
    '/api/v1/livestreams/featured',
  ),
  exactEndpoint(
    'FOLLOWED_CHANNELS',
    'followed channels',
    'https://kick.com',
    '/api/v2/channels/followed',
  ),
  exactEndpoint(
    'CURRENT_VIEWERS',
    'current viewers',
    'https://kick.com',
    '/current-viewers',
  ),
  exactEndpoint(
    'USER_LIVESTREAMS',
    'user livestreams',
    'https://kick.com',
    '/api/v1/user/livestreams',
  ),
] as const satisfies readonly KickEndpointDefinition[];

export function classifyKickEndpointUrl(
  rawUrl: string | undefined,
  baseUrl: string,
): KickEndpointDefinition | undefined {
  if (!rawUrl) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl, baseUrl);
    return KICK_ENDPOINT_DEFINITIONS.find((definition) =>
      definition.matchesUrl(url),
    );
  } catch {
    return undefined;
  }
}

export function getKickEndpointDefinition(
  endpoint: KickEndpointType,
): KickEndpointDefinition | undefined {
  return KICK_ENDPOINT_DEFINITIONS.find((definition) => definition.type === endpoint);
}
