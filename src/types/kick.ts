export const KICK_MESSAGE_SOURCE = 'kick-viewer-count-extension' as const;
export const KICK_API_RESPONSE_MESSAGE_TYPE = 'KICK_API_RESPONSE' as const;

export type KickEndpointType =
  | 'SIDEBAR_LIVESTREAMS'
  | 'RECOMMENDED_LIVESTREAMS'
  | 'FEATURED_LIVESTREAMS'
  | 'CHANNEL_DETAILS'
  | 'FOLLOWED_CHANNELS'
  | 'CURRENT_VIEWERS'
  | 'USER_LIVESTREAMS';

export type KickStreamEndpointType = Exclude<KickEndpointType, 'CURRENT_VIEWERS'>;

export interface CaptureMetadata {
  endpoint: KickEndpointType;
  capturedAt: number;
  requestUrl: string;
  pageUrl: string;
}

export interface NormalizedKickStream {
  sourceEndpoint: KickEndpointType;
  channelSlug: string;
  channelUsername?: string;
  channelId?: number;
  livestreamId?: string;
  chatroomId?: string;
  title?: string;
  viewerCount: number;
  showViewCount: boolean;
  isLive?: boolean;
  categoryName?: string;
  categorySlug?: string;
  thumbnailUrl?: string;
  startTime?: string;
  capturedAt: number;
  requestUrl: string;
  pageUrl: string;
}

export interface NormalizedCurrentViewerEntry {
  sourceEndpoint: 'CURRENT_VIEWERS';
  livestreamId: number;
  viewerCount: number;
  showViewCount: boolean;
  capturedAt: number;
  requestUrl: string;
  pageUrl: string;
}

export interface CapturedKickApiMessage {
  source: typeof KICK_MESSAGE_SOURCE;
  type: typeof KICK_API_RESPONSE_MESSAGE_TYPE;
  endpoint: KickEndpointType;
  url: string;
  timestamp: number;
  payload: unknown;
}

export function isCapturedKickApiMessage(
  value: unknown,
): value is CapturedKickApiMessage {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.source === KICK_MESSAGE_SOURCE &&
    value.type === KICK_API_RESPONSE_MESSAGE_TYPE &&
    isKickEndpointType(value.endpoint) &&
    typeof value.url === 'string' &&
    Number.isFinite(value.timestamp) &&
    'payload' in value
  );
}

export function isKickEndpointType(value: unknown): value is KickEndpointType {
  return (
    value === 'SIDEBAR_LIVESTREAMS' ||
    value === 'RECOMMENDED_LIVESTREAMS' ||
    value === 'FEATURED_LIVESTREAMS' ||
    value === 'CHANNEL_DETAILS' ||
    value === 'FOLLOWED_CHANNELS' ||
    value === 'CURRENT_VIEWERS' ||
    value === 'USER_LIVESTREAMS'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export type KickApiEndpoint = KickEndpointType;
