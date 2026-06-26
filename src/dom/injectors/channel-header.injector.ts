import {
  createViewerCountElement,
  findViewerCountElement,
  formatViewerCountLabel,
  logViewerCountDomUpdate,
  removeViewerCountElements,
  updateViewerCountElement,
} from '../extension-elements';
import {
  hasNativeChannelHeaderViewerCount,
  hasNativeChannelPageViewerCount,
} from '../native-count-detector';
import { getCurrentKickChannelSlug } from '../slug';
import {
  getBestStreamBySlug,
  type KickViewerCountState,
} from '@/src/kick/state';

const TARGET = 'channel-header';

export interface ChannelHeaderInjectorUpdateSummary {
  scanned: number;
  updated: number;
  removed: number;
  skippedNative: number;
  skippedNoData: number;
}

export function updateChannelHeaderViewerCount(
  state: KickViewerCountState,
): ChannelHeaderInjectorUpdateSummary {
  const summary: ChannelHeaderInjectorUpdateSummary = {
    scanned: 0,
    updated: 0,
    removed: 0,
    skippedNative: 0,
    skippedNoData: 0,
  };

  const scope = document.body ?? document.documentElement;
  const existing = findViewerCountElement(scope, TARGET);
  const slug = getCurrentKickChannelSlug();

  if (!slug) {
    summary.removed += removeExisting(existing);
    return summary;
  }

  summary.scanned = 1;

  const usernameElement = document.querySelector<HTMLElement>('#channel-username');
  const stream = getBestStreamBySlug(state, slug);

  if (!usernameElement || !stream || stream.isLive === false) {
    summary.removed += removeExisting(existing);
    summary.skippedNoData += stream ? 0 : 1;
    return summary;
  }

  const livestreamTitle = document.querySelector<HTMLElement>(
    '[data-testid="livestream-title"]',
  );
  const headerRoot = findHeaderRoot(usernameElement, livestreamTitle);

  if (
    hasNativeChannelPageViewerCount() ||
    (headerRoot && hasNativeChannelHeaderViewerCount(headerRoot))
  ) {
    summary.removed += removeExisting(existing);
    summary.skippedNative += 1;
    return summary;
  }

  const anchor = livestreamTitle ?? usernameElement;
  const element = existing ?? createViewerCountElement('span');

  const text = formatViewerCountLabel(stream.viewerCount);

  const changed = updateViewerCountElement(element, {
    target: TARGET,
    slug,
    viewerCount: stream.viewerCount,
    text,
    className: 'kvc-channel-header-count',
  });

  insertAfter(anchor, element);

  if (changed) {
    logViewerCountDomUpdate({
      target: TARGET,
      slug,
      viewerCount: stream.viewerCount,
      text,
      element,
      hostElement: headerRoot ?? anchor,
    });
  }

  summary.removed += removeViewerCountElements(scope, TARGET, element);
  summary.updated = 1;

  return summary;
}

function findHeaderRoot(
  usernameElement: HTMLElement,
  livestreamTitle: HTMLElement | null,
): HTMLElement | null {
  if (livestreamTitle) {
    let current = livestreamTitle.parentElement;
    let fallback: HTMLElement | null = null;
    let depth = 0;

    while (current && current !== document.body && depth < 10) {
      if (current.contains(usernameElement)) {
        fallback ??= current;

        if (looksLikeFullChannelHeader(current)) {
          return current;
        }
      }

      current = current.parentElement;
      depth += 1;
    }

    return fallback ?? livestreamTitle.parentElement;
  }

  return usernameElement.parentElement?.parentElement ?? usernameElement.parentElement;
}

function looksLikeFullChannelHeader(element: HTMLElement): boolean {
  return Boolean(
    element.querySelector(
      [
        '[data-testid="viewer-count"]',
        '[data-testid="follow-button"]',
        '[data-testid="sub-button"]',
        '[data-testid="gift-sub-button"]',
      ].join(', '),
    ),
  );
}

function insertAfter(anchor: HTMLElement, element: HTMLElement): void {
  const parent = anchor.parentElement;

  if (!parent) {
    return;
  }

  if (element.parentElement !== parent || element.previousElementSibling !== anchor) {
    parent.insertBefore(element, anchor.nextSibling);
  }
}

function removeExisting(element: HTMLElement | null): number {
  if (!element) {
    return 0;
  }

  element.remove();
  return 1;
}
