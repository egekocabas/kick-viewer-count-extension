import {
  createViewerCountElement,
  findViewerCountElement,
  formatViewerCountLabel,
  logViewerCountDomUpdate,
  removeViewerCountElements,
  updateViewerCountElement,
} from '../extension-elements';
import {
  getVisibleText,
  hasNativeSidebarViewerCount,
  isCompactViewerCountText,
  isLiveText,
} from '../native-count-detector';
import { getKickChannelSlugFromHref } from '../slug';
import {
  getBestStreamBySlug,
  type KickViewerCountState,
} from '@/src/kick/state';

const TARGET = 'sidebar-channel';
const SIDEBAR_ROW_SELECTOR = [
  'a[data-testid^="sidebar-following-channel-"]',
  'a[data-testid^="sidebar-recommended-channel-"]',
].join(', ');

export interface SidebarInjectorUpdateSummary {
  scanned: number;
  updated: number;
  removed: number;
  skippedNative: number;
  skippedNoData: number;
}

export function updateSidebarChannelViewerCounts(
  state: KickViewerCountState,
): SidebarInjectorUpdateSummary {
  const summary: SidebarInjectorUpdateSummary = {
    scanned: 0,
    updated: 0,
    removed: 0,
    skippedNative: 0,
    skippedNoData: 0,
  };

  for (const row of document.querySelectorAll<HTMLAnchorElement>(
    SIDEBAR_ROW_SELECTOR,
  )) {
    summary.scanned += 1;

    const slug = getKickChannelSlugFromHref(row.getAttribute('href'));

    if (!slug) {
      summary.removed += removeViewerCountElements(row, TARGET);
      continue;
    }

    const stream = getBestStreamBySlug(state, slug);

    if (!stream) {
      summary.removed += removeViewerCountElements(row, TARGET);
      summary.skippedNoData += 1;
      continue;
    }

    const statusContainer = findSidebarStatusContainer(row);

    if (statusContainer && hasNativeSidebarViewerCount(statusContainer)) {
      summary.removed += removeViewerCountElements(row, TARGET);
      summary.skippedNative += 1;
      continue;
    }

    const insertionTarget = statusContainer ?? row;
    const element =
      findViewerCountElement(row, TARGET) ?? createViewerCountElement('span');

    if (element.parentElement !== insertionTarget) {
      insertionTarget.append(element);
    }

    const text = formatViewerCountLabel(stream.viewerCount);

    updateViewerCountElement(element, {
      target: TARGET,
      slug,
      viewerCount: stream.viewerCount,
      text,
      className: 'kvc-sidebar-count',
    });
    logViewerCountDomUpdate({
      target: TARGET,
      slug,
      viewerCount: stream.viewerCount,
      text,
      element,
      hostElement: row,
    });

    summary.removed += removeViewerCountElements(row, TARGET, element);
    summary.updated += 1;
  }

  return summary;
}

function findSidebarStatusContainer(row: HTMLElement): HTMLElement | null {
  const existing = findViewerCountElement(row, TARGET);

  if (existing?.parentElement instanceof HTMLElement) {
    return existing.parentElement;
  }

  let bestElement: HTMLElement | null = null;
  let bestScore = 0;
  const rowRect = row.getBoundingClientRect();

  for (const element of row.querySelectorAll<HTMLElement>('span, div, p')) {
    const text = getVisibleText(element);

    if (!text || text.length > 32) {
      continue;
    }

    const score = scoreSidebarStatusCandidate(element, text, rowRect);

    if (score > bestScore) {
      bestScore = score;
      bestElement = element;
    }
  }

  if (!bestElement) {
    return null;
  }

  return bestElement.parentElement instanceof HTMLElement
    ? bestElement.parentElement
    : bestElement;
}

function scoreSidebarStatusCandidate(
  element: HTMLElement,
  text: string,
  rowRect: DOMRect,
): number {
  let score = 0;

  if (isLiveText(text)) {
    score += 6;
  }

  if (isCompactViewerCountText(text)) {
    score += 6;
  }

  const elementRect = element.getBoundingClientRect();

  if (
    rowRect.width > 0 &&
    elementRect.width > 0 &&
    elementRect.left >= rowRect.left + rowRect.width * 0.55
  ) {
    score += 3;
  }

  if (score > 0 && element.childElementCount === 0) {
    score += 2;
  } else if (score > 0 && element.childElementCount <= 2) {
    score += 1;
  }

  return score;
}
