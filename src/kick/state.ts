import type {
  KickEndpointType,
  NormalizedCurrentViewerEntry,
  NormalizedKickStream,
} from '../types/kick';

export interface KickViewerCountState {
  streamsBySlug: Map<string, NormalizedKickStream>;
  streamsByLivestreamId: Map<string, NormalizedKickStream>;
  currentViewersByLivestreamId: Map<number, NormalizedCurrentViewerEntry>;
  lastCaptureByEndpoint: Map<KickEndpointType, number>;
}

export interface StreamStateUpdateSummary {
  updatedSlugs: number;
  updatedLivestreamIds: number;
  totalStreamSlugs: number;
  totalStreamLivestreamIds: number;
}

export interface CurrentViewerStateUpdateSummary {
  updatedLivestreamIds: number;
  totalCurrentViewerLivestreamIds: number;
}

// Kick page data is captured opportunistically as the SPA loads or refreshes
// sections. Five minutes avoids showing very old counts without requiring any
// extension-owned polling.
export const MAX_STREAM_AGE_MS = 5 * 60 * 1000;

export function createKickViewerCountState(): KickViewerCountState {
  return {
    streamsBySlug: new Map(),
    streamsByLivestreamId: new Map(),
    currentViewersByLivestreamId: new Map(),
    lastCaptureByEndpoint: new Map(),
  };
}

export function markEndpointCaptured(
  state: KickViewerCountState,
  endpoint: KickEndpointType,
  capturedAt: number,
): void {
  state.lastCaptureByEndpoint.set(endpoint, capturedAt);
}

export function updateStreamState(
  state: KickViewerCountState,
  entries: NormalizedKickStream[],
): StreamStateUpdateSummary {
  let updatedSlugs = 0;
  let updatedLivestreamIds = 0;

  for (const entry of entries) {
    const normalizedSlug = entry.channelSlug.trim().toLowerCase();
    const normalizedEntry: NormalizedKickStream = {
      ...entry,
      channelSlug: normalizedSlug,
    };
    const existingBySlug = state.streamsBySlug.get(normalizedSlug);

    if (!existingBySlug || shouldReplace(existingBySlug, normalizedEntry)) {
      state.streamsBySlug.set(normalizedSlug, normalizedEntry);
      updatedSlugs += 1;
    }

    if (normalizedEntry.livestreamId) {
      const existingByLivestreamId = state.streamsByLivestreamId.get(
        normalizedEntry.livestreamId,
      );

      if (
        !existingByLivestreamId ||
        shouldReplace(existingByLivestreamId, normalizedEntry)
      ) {
        state.streamsByLivestreamId.set(
          normalizedEntry.livestreamId,
          normalizedEntry,
        );
        updatedLivestreamIds += 1;
      }
    }
  }

  return {
    updatedSlugs,
    updatedLivestreamIds,
    totalStreamSlugs: state.streamsBySlug.size,
    totalStreamLivestreamIds: state.streamsByLivestreamId.size,
  };
}

export function updateCurrentViewerState(
  state: KickViewerCountState,
  entries: NormalizedCurrentViewerEntry[],
): CurrentViewerStateUpdateSummary {
  let updatedLivestreamIds = 0;

  for (const entry of entries) {
    const existing = state.currentViewersByLivestreamId.get(entry.livestreamId);

    if (!existing || entry.capturedAt >= existing.capturedAt) {
      state.currentViewersByLivestreamId.set(entry.livestreamId, entry);
      updatedLivestreamIds += 1;
    }
  }

  return {
    updatedLivestreamIds,
    totalCurrentViewerLivestreamIds: state.currentViewersByLivestreamId.size,
  };
}

function shouldReplace(
  existing: NormalizedKickStream,
  incoming: NormalizedKickStream,
): boolean {
  return incoming.capturedAt >= existing.capturedAt;
}

export function getBestStreamBySlug(
  state: KickViewerCountState,
  slug: string,
  now = Date.now(),
): NormalizedKickStream | null {
  const normalizedSlug = normalizeStateSlug(slug);

  if (!normalizedSlug) {
    return null;
  }

  const stream = state.streamsBySlug.get(normalizedSlug);

  if (!stream) {
    return null;
  }

  const currentViewerEntry = getFreshCurrentViewerEntryForStream(
    state,
    stream,
    now,
  );

  if (
    currentViewerEntry &&
    (!isStreamFresh(stream, now) ||
      currentViewerEntry.capturedAt >= stream.capturedAt)
  ) {
    return {
      ...stream,
      viewerCount: currentViewerEntry.viewerCount,
      showViewCount: currentViewerEntry.showViewCount,
      capturedAt: currentViewerEntry.capturedAt,
      requestUrl: currentViewerEntry.requestUrl,
      pageUrl: currentViewerEntry.pageUrl,
    };
  }

  if (!isStreamFresh(stream, now)) {
    return null;
  }

  return stream;
}

export function getKnownStreamCount(state: KickViewerCountState): number {
  return state.streamsBySlug.size;
}

export function isStreamFresh(
  stream: NormalizedKickStream,
  now = Date.now(),
  maxAgeMs = MAX_STREAM_AGE_MS,
): boolean {
  return now - stream.capturedAt <= maxAgeMs;
}

function getFreshCurrentViewerEntryForStream(
  state: KickViewerCountState,
  stream: NormalizedKickStream,
  now: number,
): NormalizedCurrentViewerEntry | undefined {
  const livestreamId = parseSafeNumericLivestreamId(stream.livestreamId);

  if (livestreamId === undefined) {
    return undefined;
  }

  const currentViewerEntry = state.currentViewersByLivestreamId.get(livestreamId);

  if (!currentViewerEntry || !isCurrentViewerEntryFresh(currentViewerEntry, now)) {
    return undefined;
  }

  return currentViewerEntry;
}

function isCurrentViewerEntryFresh(
  entry: NormalizedCurrentViewerEntry,
  now: number,
): boolean {
  return now - entry.capturedAt <= MAX_STREAM_AGE_MS;
}

function parseSafeNumericLivestreamId(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  if (!/^(0|[1-9]\d*)$/.test(trimmed)) {
    return undefined;
  }

  const numericValue = Number(trimmed);

  return Number.isSafeInteger(numericValue) ? numericValue : undefined;
}

function normalizeStateSlug(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();

  return normalized.length > 0 ? normalized : undefined;
}
