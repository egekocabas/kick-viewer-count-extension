import { getKickEndpointDefinition } from './endpoints';
import type {
  CaptureMetadata,
  KickEndpointType,
  KickStreamEndpointType,
  NormalizedCurrentViewerEntry,
  NormalizedKickStream,
} from '../types/kick';

type StreamCaptureMetadata = Omit<CaptureMetadata, 'endpoint'> & {
  endpoint: KickStreamEndpointType;
};

type NormalizedCaptureResult =
  | {
      kind: 'streams';
      entries: NormalizedKickStream[];
    }
  | {
      kind: 'currentViewers';
      entries: NormalizedCurrentViewerEntry[];
    };

interface EndpointNormalizer {
  endpoint: KickEndpointType;
  debugName: string;
  normalize(payload: unknown, metadata: CaptureMetadata): NormalizedCaptureResult;
}

export const KICK_ENDPOINT_NORMALIZERS: Record<KickEndpointType, EndpointNormalizer> = {
  SIDEBAR_LIVESTREAMS: createStreamNormalizer(
    'SIDEBAR_LIVESTREAMS',
    normalizeRecommendationLivestreamsFromDataLivestreams,
  ),
  RECOMMENDED_LIVESTREAMS: createStreamNormalizer(
    'RECOMMENDED_LIVESTREAMS',
    normalizeRecommendationLivestreamsFromDataArray,
  ),
  FEATURED_LIVESTREAMS: createStreamNormalizer(
    'FEATURED_LIVESTREAMS',
    normalizeRecommendationLivestreamsFromDataLivestreams,
  ),
  CHANNEL_DETAILS: createStreamNormalizer(
    'CHANNEL_DETAILS',
    normalizeChannelDetails,
  ),
  FOLLOWED_CHANNELS: createStreamNormalizer(
    'FOLLOWED_CHANNELS',
    normalizeFollowedChannels,
  ),
  CURRENT_VIEWERS: {
    endpoint: 'CURRENT_VIEWERS',
    debugName:
      getKickEndpointDefinition('CURRENT_VIEWERS')?.debugName ?? 'current viewers',
    normalize(payload, metadata) {
      return {
        kind: 'currentViewers',
        entries: normalizeCurrentViewers(payload, {
          ...metadata,
          endpoint: 'CURRENT_VIEWERS',
        }),
      };
    },
  },
  USER_LIVESTREAMS: createStreamNormalizer(
    'USER_LIVESTREAMS',
    normalizeUserLivestreams,
  ),
};

export function normalizeCapturedKickPayload(
  payload: unknown,
  metadata: CaptureMetadata,
): NormalizedCaptureResult {
  return KICK_ENDPOINT_NORMALIZERS[metadata.endpoint].normalize(payload, metadata);
}

export function normalizeRecommendationLivestreamsFromDataLivestreams(
  payload: unknown,
  metadata: StreamCaptureMetadata,
): NormalizedKickStream[] {
  const livestreams = readDataLivestreams(payload);
  return livestreams
    .map((item) => normalizeRecommendationLivestream(item, metadata))
    .filter((entry): entry is NormalizedKickStream => entry !== undefined);
}

export function normalizeRecommendationLivestreamsFromDataArray(
  payload: unknown,
  metadata: StreamCaptureMetadata,
): NormalizedKickStream[] {
  const livestreams = readDataArray(payload);
  return livestreams
    .map((item) => normalizeRecommendationLivestream(item, metadata))
    .filter((entry): entry is NormalizedKickStream => entry !== undefined);
}

export function normalizeFollowedChannels(
  payload: unknown,
  metadata: StreamCaptureMetadata,
): NormalizedKickStream[] {
  if (!isRecord(payload) || !Array.isArray(payload.channels)) {
    return [];
  }

  return payload.channels
    .map((item) => normalizeFollowedChannel(item, metadata))
    .filter((entry): entry is NormalizedKickStream => entry !== undefined);
}

export function normalizeUserLivestreams(
  payload: unknown,
  metadata: StreamCaptureMetadata,
): NormalizedKickStream[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item) => normalizeUserLivestream(item, metadata))
    .filter((entry): entry is NormalizedKickStream => entry !== undefined);
}

export function normalizeChannelDetails(
  payload: unknown,
  metadata: StreamCaptureMetadata,
): NormalizedKickStream[] {
  const stream = normalizeChannelDetailsPayload(payload, metadata);

  return stream ? [stream] : [];
}

export function normalizeCurrentViewers(
  payload: unknown,
  metadata: Omit<CaptureMetadata, 'endpoint'> & { endpoint: 'CURRENT_VIEWERS' },
): NormalizedCurrentViewerEntry[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item) => normalizeCurrentViewerEntry(item, metadata))
    .filter((entry): entry is NormalizedCurrentViewerEntry => entry !== undefined);
}

function createStreamNormalizer(
  endpoint: KickStreamEndpointType,
  normalize: (
    payload: unknown,
    metadata: StreamCaptureMetadata,
  ) => NormalizedKickStream[],
): EndpointNormalizer {
  return {
    endpoint,
    debugName: getKickEndpointDefinition(endpoint)?.debugName ?? endpoint,
    normalize(payload, metadata) {
      return {
        kind: 'streams',
        entries: normalize(payload, {
          ...metadata,
          endpoint,
        }),
      };
    },
  };
}

function readDataLivestreams(payload: unknown): unknown[] {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return [];
  }

  return Array.isArray(payload.data.livestreams)
    ? payload.data.livestreams
    : [];
}

function readDataArray(payload: unknown): unknown[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return [];
  }

  return payload.data;
}

function normalizeRecommendationLivestream(
  value: unknown,
  metadata: StreamCaptureMetadata,
): NormalizedKickStream | undefined {
  if (!isRecord(value) || !isRecord(value.channel)) {
    return undefined;
  }

  const channelSlug = readNonEmptyString(value.channel.slug)?.toLowerCase();
  const viewerCount = readFiniteNumber(value.viewer_count);

  if (!channelSlug || viewerCount === undefined) {
    return undefined;
  }

  const category = readCategory(value.category);
  const stream = createBaseStream(metadata, channelSlug, viewerCount, {
    showViewCount: readBoolean(value.show_view_count, true),
  });

  assignIfPresent(stream, 'channelUsername', readNonEmptyString(value.channel.username));
  assignIfPresent(stream, 'channelId', readFiniteNumber(value.channel.id));
  assignIfPresent(stream, 'livestreamId', readIdString(value.id));
  assignIfPresent(stream, 'chatroomId', readIdString(value.chatroom_id));
  assignIfPresent(stream, 'title', readNonEmptyString(value.title));
  assignIfPresent(stream, 'categoryName', category.name);
  assignIfPresent(stream, 'categorySlug', category.slug);
  assignIfPresent(stream, 'startTime', readNonEmptyString(value.start_time));

  return stream;
}

function normalizeFollowedChannel(
  value: unknown,
  metadata: StreamCaptureMetadata,
): NormalizedKickStream | undefined {
  if (!isRecord(value) || value.is_live !== true) {
    return undefined;
  }

  const channelSlug = readNonEmptyString(value.channel_slug)?.toLowerCase();
  const viewerCount = readFiniteNumber(value.viewer_count);

  if (!channelSlug || viewerCount === undefined) {
    return undefined;
  }

  const stream = createBaseStream(metadata, channelSlug, viewerCount, {
    showViewCount: readBoolean(value.show_view_count, true),
    isLive: true,
  });

  assignIfPresent(stream, 'channelUsername', readNonEmptyString(value.user_username));
  assignIfPresent(stream, 'title', readNonEmptyString(value.session_title));
  assignIfPresent(stream, 'categoryName', readNonEmptyString(value.category_name));

  return stream;
}

function normalizeUserLivestream(
  value: unknown,
  metadata: StreamCaptureMetadata,
): NormalizedKickStream | undefined {
  if (!isRecord(value) || value.is_live !== true || !isRecord(value.channel)) {
    return undefined;
  }

  const channelSlug = readNonEmptyString(value.channel.slug)?.toLowerCase();
  const viewerCount =
    readFiniteNumber(value.viewer_count) ?? readFiniteNumber(value.viewers);

  if (!channelSlug || viewerCount === undefined) {
    return undefined;
  }

  const category = readFirstCategory(value.categories);
  const thumbnail = isRecord(value.thumbnail)
    ? readNonEmptyString(value.thumbnail.src)
    : undefined;
  const user = isRecord(value.channel.user) ? value.channel.user : undefined;
  const stream = createBaseStream(metadata, channelSlug, viewerCount, {
    showViewCount: readBoolean(value.show_view_count, true),
    isLive: true,
  });

  assignIfPresent(stream, 'channelUsername', readNonEmptyString(user?.username));
  assignIfPresent(
    stream,
    'channelId',
    readFiniteNumber(value.channel.id) ?? readFiniteNumber(value.channel_id),
  );
  assignIfPresent(stream, 'livestreamId', readIdString(value.id));
  assignIfPresent(stream, 'title', readNonEmptyString(value.session_title));
  assignIfPresent(stream, 'categoryName', category.name);
  assignIfPresent(stream, 'categorySlug', category.slug);
  assignIfPresent(stream, 'thumbnailUrl', thumbnail);
  assignIfPresent(stream, 'startTime', readNonEmptyString(value.start_time));

  return stream;
}

function normalizeChannelDetailsPayload(
  value: unknown,
  metadata: StreamCaptureMetadata,
): NormalizedKickStream | undefined {
  if (!isRecord(value) || !isRecord(value.livestream)) {
    return undefined;
  }

  const livestream = value.livestream;
  const livestreamChannel = isRecord(livestream.channel)
    ? livestream.channel
    : undefined;
  const channelSlug =
    readNonEmptyString(value.slug)?.toLowerCase() ??
    readNonEmptyString(livestreamChannel?.slug)?.toLowerCase();
  const viewerCount =
    readFiniteNumber(livestream.viewer_count) ??
    readFiniteNumber(livestream.viewers);
  const isLive = readBoolean(livestream.is_live ?? value.is_live, true);

  if (!channelSlug || viewerCount === undefined || !isLive) {
    return undefined;
  }

  const category = readCategory(livestream.category);
  const fallbackCategory = readFirstCategory(livestream.categories);
  const thumbnail = isRecord(livestream.thumbnail)
    ? readNonEmptyString(livestream.thumbnail.src)
    : undefined;
  const user = isRecord(value.user) ? value.user : undefined;
  const stream = createBaseStream(metadata, channelSlug, viewerCount, {
    showViewCount: readBoolean(
      livestream.show_view_count ?? value.show_view_count,
      true,
    ),
    isLive: true,
  });

  assignIfPresent(
    stream,
    'channelUsername',
    readNonEmptyString(value.username) ??
      readNonEmptyString(user?.username) ??
      readNonEmptyString(livestreamChannel?.username),
  );
  assignIfPresent(
    stream,
    'channelId',
    readFiniteNumber(value.id) ?? readFiniteNumber(livestream.channel_id),
  );
  assignIfPresent(stream, 'livestreamId', readIdString(livestream.id));
  assignIfPresent(stream, 'chatroomId', readIdString(livestream.chatroom_id));
  assignIfPresent(
    stream,
    'title',
    readNonEmptyString(livestream.session_title) ??
      readNonEmptyString(livestream.title),
  );
  assignIfPresent(stream, 'categoryName', category.name ?? fallbackCategory.name);
  assignIfPresent(stream, 'categorySlug', category.slug ?? fallbackCategory.slug);
  assignIfPresent(stream, 'thumbnailUrl', thumbnail);
  assignIfPresent(stream, 'startTime', readNonEmptyString(livestream.start_time));

  return stream;
}

function normalizeCurrentViewerEntry(
  value: unknown,
  metadata: Omit<CaptureMetadata, 'endpoint'> & { endpoint: 'CURRENT_VIEWERS' },
): NormalizedCurrentViewerEntry | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const livestreamId = readFiniteNumber(value.livestream_id);
  const viewerCount = readFiniteNumber(value.viewers);

  if (livestreamId === undefined || viewerCount === undefined) {
    return undefined;
  }

  return {
    sourceEndpoint: 'CURRENT_VIEWERS',
    livestreamId,
    viewerCount,
    showViewCount: readBoolean(value.show_view_count, true),
    capturedAt: metadata.capturedAt,
    requestUrl: metadata.requestUrl,
    pageUrl: metadata.pageUrl,
  };
}

function createBaseStream(
  metadata: StreamCaptureMetadata,
  channelSlug: string,
  viewerCount: number,
  options: {
    showViewCount: boolean;
    isLive?: boolean;
  },
): NormalizedKickStream {
  const stream: NormalizedKickStream = {
    sourceEndpoint: metadata.endpoint,
    channelSlug,
    viewerCount,
    showViewCount: options.showViewCount,
    capturedAt: metadata.capturedAt,
    requestUrl: metadata.requestUrl,
    pageUrl: metadata.pageUrl,
  };

  assignIfPresent(stream, 'isLive', options.isLive);

  return stream;
}

function readCategory(value: unknown): { name?: string; slug?: string } {
  if (!isRecord(value)) {
    return {};
  }

  return {
    name: readNonEmptyString(value.name),
    slug: readNonEmptyString(value.slug),
  };
}

function readFirstCategory(value: unknown): { name?: string; slug?: string } {
  if (!Array.isArray(value)) {
    return {};
  }

  return readCategory(value[0]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function readIdString(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return readNonEmptyString(value);
}

function readBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true' || normalized === '1') {
      return true;
    }

    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }

  return defaultValue;
}

function assignIfPresent<
  T extends object,
  K extends keyof T,
>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
