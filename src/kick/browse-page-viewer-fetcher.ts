import type { DomUpdateReason } from '@/src/dom/dom-injection-controller';
import {
  findLivestreamCardTarget,
  LIVESTREAM_CARD_SELECTOR,
} from '@/src/dom/livestream-card-target';
import { hasNativeLivestreamCardViewerCount } from '@/src/dom/native-count-detector';
import { normalizeChannelDetails, normalizeCurrentViewers } from '@/src/kick/normalize';
import {
  getBestStreamBySlug,
  updateCurrentViewerState,
  updateStreamState,
  type KickViewerCountState,
} from '@/src/kick/state';
import type { NormalizedCurrentViewerEntry, NormalizedKickStream } from '@/src/types/kick';
import { logger } from '@/src/utils/devLogger';

const CHANNEL_FETCH_CONCURRENCY = 5;
const CURRENT_VIEWERS_BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 2 * 60 * 1000;
const MUTATION_DEBOUNCE_MS = 500;
const RETRY_COOLDOWN_MS = 60 * 1000;

type ScheduleDomUpdate = (reason: DomUpdateReason) => void;

interface RuntimeDeps {
  state: KickViewerCountState;
  scheduleUpdate: ScheduleDomUpdate;
}

export interface BrowsePageViewerFetcher {
  init(state: KickViewerCountState, scheduleUpdate: ScheduleDomUpdate): void;
  onUrlChange(): void;
  onMutation(): void;
}

export function createBrowsePageViewerFetcher(): BrowsePageViewerFetcher {
  let runtimeDeps: RuntimeDeps | undefined;
  let isActive = false;
  let activeSessionId = 0;
  let sessionAbortController: AbortController | undefined;
  let pollingTimer: number | undefined;
  let mutationDebounceTimer: number | undefined;
  const routeSessionSlugs = new Set<string>();
  const inFlightSlugs = new Set<string>();
  const retryAfterBySlug = new Map<string, number>();
  const trackedLivestreamIds = new Set<number>();

  function init(
    state: KickViewerCountState,
    scheduleUpdate: ScheduleDomUpdate,
  ): void {
    runtimeDeps = { state, scheduleUpdate };
    handleUrlChange();
  }

  function onUrlChange(): void {
    if (!runtimeDeps) {
      return;
    }

    handleUrlChange();
  }

  function onMutation(): void {
    if (!isActive || !runtimeDeps) {
      return;
    }

    if (mutationDebounceTimer !== undefined) {
      window.clearTimeout(mutationDebounceTimer);
    }

    const sessionId = activeSessionId;

    mutationDebounceTimer = window.setTimeout(() => {
      mutationDebounceTimer = undefined;
      void discoverAndFetchMissingCards(sessionId, 'mutation');
    }, MUTATION_DEBOUNCE_MS);
  }

  function handleUrlChange(): void {
    stopSession();

    if (isBrowseOrCategoryRoute(window.location.pathname)) {
      startSession();
    }
  }

  function startSession(): void {
    activeSessionId += 1;
    isActive = true;
    sessionAbortController = new AbortController();
    routeSessionSlugs.clear();
    inFlightSlugs.clear();
    retryAfterBySlug.clear();
    trackedLivestreamIds.clear();

    const sessionId = activeSessionId;
    void discoverAndFetchMissingCards(sessionId, 'url-change');

    logger.info('Browse/category viewer fetch session started.', {
      pathname: window.location.pathname,
    });
  }

  function stopSession(): void {
    activeSessionId += 1;
    isActive = false;
    sessionAbortController?.abort();
    sessionAbortController = undefined;

    if (pollingTimer !== undefined) {
      window.clearTimeout(pollingTimer);
      pollingTimer = undefined;
    }

    if (mutationDebounceTimer !== undefined) {
      window.clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = undefined;
    }

    routeSessionSlugs.clear();
    inFlightSlugs.clear();
    retryAfterBySlug.clear();
    trackedLivestreamIds.clear();
  }

  async function discoverAndFetchMissingCards(
    sessionId: number,
    reason: DomUpdateReason,
  ): Promise<void> {
    const deps = runtimeDeps;

    if (!deps || !isCurrentSession(sessionId)) {
      return;
    }

    const now = Date.now();
    const missingSlugs = new Set<string>();
    let addedExistingPollId = false;

    for (const card of document.querySelectorAll<HTMLElement>(
      LIVESTREAM_CARD_SELECTOR,
    )) {
      const target = findLivestreamCardTarget(card);

      if (!target || hasNativeLivestreamCardViewerCount(card, target.anchor)) {
        continue;
      }

      routeSessionSlugs.add(target.slug);

      const existingStream = getBestStreamBySlug(deps.state, target.slug, now);

      if (existingStream) {
        addedExistingPollId = trackLivestreamId(existingStream) || addedExistingPollId;

        if (parseNumericLivestreamId(existingStream.livestreamId) !== undefined) {
          continue;
        }
      }

      if (shouldFetchSlug(target.slug, now)) {
        missingSlugs.add(target.slug);
      }
    }

    if (addedExistingPollId) {
      ensurePollingScheduled(sessionId);
    }

    await fetchMissingSlugs([...missingSlugs], sessionId, reason);
  }

  async function fetchMissingSlugs(
    slugs: string[],
    sessionId: number,
    reason: DomUpdateReason,
  ): Promise<void> {
    const deps = runtimeDeps;

    if (!deps || !isCurrentSession(sessionId) || slugs.length === 0) {
      return;
    }

    const now = Date.now();
    const slugsToFetch = slugs.filter((slug) => {
      if (!shouldFetchSlug(slug, now)) {
        return false;
      }

      inFlightSlugs.add(slug);
      return true;
    });

    if (slugsToFetch.length === 0) {
      return;
    }

    logger.info('Fetching missing browse/category viewer counts.', {
      reason,
      count: slugsToFetch.length,
      routeSessionSlugs: routeSessionSlugs.size,
    });

    const entries: NormalizedKickStream[] = [];

    for (const chunk of chunkArray(slugsToFetch, CHANNEL_FETCH_CONCURRENCY)) {
      if (!isCurrentSession(sessionId)) {
        return;
      }

      const chunkEntries = await Promise.all(
        chunk.map((slug) => fetchChannelDetails(slug, sessionId)),
      );

      for (const entry of chunkEntries) {
        if (entry) {
          entries.push(entry);
        }
      }
    }

    if (!isCurrentSession(sessionId) || entries.length === 0) {
      return;
    }

    const summary = updateStreamState(deps.state, entries);
    let addedPollIds = 0;

    for (const entry of entries) {
      if (trackLivestreamId(entry)) {
        addedPollIds += 1;
      }
    }

    deps.scheduleUpdate('network-data');
    ensurePollingScheduled(sessionId);

    logger.info('Browse/category viewer counts updated from channel details.', {
      normalizedEntries: entries.length,
      addedPollIds,
      totalTrackedPollIds: trackedLivestreamIds.size,
      totalKnownStreamSlugs: summary.totalStreamSlugs,
      totalKnownStreamLivestreamIds: summary.totalStreamLivestreamIds,
    });
  }

  async function fetchChannelDetails(
    slug: string,
    sessionId: number,
  ): Promise<NormalizedKickStream | undefined> {
    const abortSignal = sessionAbortController?.signal;
    const requestUrl = new URL(
      `/api/v2/channels/${encodeURIComponent(slug)}`,
      window.location.origin,
    );

    try {
      const response = await fetch(requestUrl, {
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'x-app-platform': 'web',
        },
        signal: abortSignal,
      });

      if (!response.ok) {
        throw new Error(formatHttpError(response));
      }

      const payload: unknown = await response.json();
      const entries = normalizeChannelDetails(payload, {
        endpoint: 'CHANNEL_DETAILS',
        capturedAt: Date.now(),
        requestUrl: response.url || requestUrl.href,
        pageUrl: window.location.href,
      });
      const entry = entries[0];

      if (!entry) {
        setRetryCooldown(slug);
        return undefined;
      }

      retryAfterBySlug.delete(slug);
      return entry;
    } catch (error) {
      if (!isAbortError(error)) {
        setRetryCooldown(slug);
        logger.warn(
          `Failed to fetch channel details for browse/category card "${slug}": ${formatError(error)}`,
        );
      }

      return undefined;
    } finally {
      if (isCurrentSession(sessionId)) {
        inFlightSlugs.delete(slug);
      }
    }
  }

  function ensurePollingScheduled(sessionId: number): void {
    if (
      !isCurrentSession(sessionId) ||
      pollingTimer !== undefined ||
      trackedLivestreamIds.size === 0
    ) {
      return;
    }

    pollingTimer = window.setTimeout(() => {
      pollingTimer = undefined;
      void pollCurrentViewers(sessionId);
    }, POLL_INTERVAL_MS);
  }

  async function pollCurrentViewers(sessionId: number): Promise<void> {
    const deps = runtimeDeps;

    if (!deps || !isCurrentSession(sessionId)) {
      return;
    }

    const livestreamIds = [...trackedLivestreamIds];

    if (livestreamIds.length === 0) {
      return;
    }

    const entries: NormalizedCurrentViewerEntry[] = [];

    for (const batch of chunkArray(livestreamIds, CURRENT_VIEWERS_BATCH_SIZE)) {
      if (!isCurrentSession(sessionId)) {
        return;
      }

      const requestUrl = createCurrentViewersUrl(batch);

      try {
        const response = await fetch(requestUrl, {
          credentials: 'include',
          headers: {
            accept: 'application/json',
            'x-app-platform': 'web',
          },
          signal: sessionAbortController?.signal,
        });

        if (!response.ok) {
          throw new Error(formatHttpError(response));
        }

        const payload: unknown = await response.json();
        entries.push(
          ...normalizeCurrentViewers(payload, {
            endpoint: 'CURRENT_VIEWERS',
            capturedAt: Date.now(),
            requestUrl: response.url || requestUrl.href,
            pageUrl: window.location.href,
          }),
        );
      } catch (error) {
        if (!isAbortError(error)) {
          logger.warn(
            `Failed to poll browse/category current viewers for livestream IDs ${batch.join(',')}: ${formatError(error)}`,
          );
        }
      }
    }

    if (!isCurrentSession(sessionId)) {
      return;
    }

    if (entries.length > 0) {
      const summary = updateCurrentViewerState(deps.state, entries);

      deps.scheduleUpdate('network-data');

      logger.info('Browse/category current viewers updated from poll.', {
        normalizedEntries: entries.length,
        totalKnownCurrentViewerLivestreamIds:
          summary.totalCurrentViewerLivestreamIds,
        updatedLivestreamIds: summary.updatedLivestreamIds,
      });
    }

    ensurePollingScheduled(sessionId);
  }

  function shouldFetchSlug(slug: string, now = Date.now()): boolean {
    if (inFlightSlugs.has(slug)) {
      return false;
    }

    const retryAfter = retryAfterBySlug.get(slug);

    return retryAfter === undefined || retryAfter <= now;
  }

  function trackLivestreamId(stream: NormalizedKickStream): boolean {
    const livestreamId = parseNumericLivestreamId(stream.livestreamId);

    if (livestreamId === undefined || trackedLivestreamIds.has(livestreamId)) {
      return false;
    }

    trackedLivestreamIds.add(livestreamId);
    return true;
  }

  function setRetryCooldown(slug: string): void {
    retryAfterBySlug.set(slug, Date.now() + RETRY_COOLDOWN_MS);
  }

  function isCurrentSession(sessionId: number): boolean {
    return isActive && sessionId === activeSessionId;
  }

  return {
    init,
    onUrlChange,
    onMutation,
  };
}

function isBrowseOrCategoryRoute(pathname: string): boolean {
  const firstSegment = pathname.split('/').filter(Boolean)[0];

  return firstSegment === 'browse' || firstSegment === 'category';
}

function createCurrentViewersUrl(livestreamIds: number[]): URL {
  const url = new URL('/current-viewers', window.location.origin);

  for (const livestreamId of livestreamIds) {
    url.searchParams.append('ids[]', String(livestreamId));
  }

  return url;
}

function parseNumericLivestreamId(value: string | undefined): number | undefined {
  if (!value || !/^(0|[1-9]\d*)$/.test(value)) {
    return undefined;
  }

  const numericValue = Number(value);

  return Number.isSafeInteger(numericValue) ? numericValue : undefined;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function formatHttpError(response: Response): string {
  const statusText = response.statusText ? ` ${response.statusText}` : '';

  return `HTTP ${response.status}${statusText}`;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
