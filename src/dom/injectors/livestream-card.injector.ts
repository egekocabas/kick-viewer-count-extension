import {
  createViewerCountElement,
  findViewerCountElement,
  formatViewerCountLabel,
  logViewerCountDomUpdate,
  removeViewerCountElements,
  updateViewerCountElement,
} from '../extension-elements';
import { hasNativeLivestreamCardViewerCount } from '../native-count-detector';
import { getKickChannelSlugFromHref } from '../slug';
import {
  getBestStreamBySlug,
  type KickViewerCountState,
} from '@/src/kick/state';

const TARGET = 'livestream-card';
const CARD_SELECTOR = '[data-testid="livestream-results-card"]';

export interface InjectorUpdateSummary {
  scanned: number;
  updated: number;
  removed: number;
  skippedNative: number;
  skippedNoData: number;
}

export function updateLivestreamCardViewerCounts(
  state: KickViewerCountState,
): InjectorUpdateSummary {
  const summary: InjectorUpdateSummary = {
    scanned: 0,
    updated: 0,
    removed: 0,
    skippedNative: 0,
    skippedNoData: 0,
  };

  for (const card of document.querySelectorAll<HTMLElement>(CARD_SELECTOR)) {
    summary.scanned += 1;

    const cardTarget = findCardTarget(card);

    if (!cardTarget) {
      summary.removed += removeViewerCountElements(card, TARGET);
      continue;
    }

    const stream = getBestStreamBySlug(state, cardTarget.slug);

    if (!stream) {
      summary.removed += removeViewerCountElements(card, TARGET);
      summary.skippedNoData += 1;
      continue;
    }

    if (hasNativeLivestreamCardViewerCount(card, cardTarget.anchor)) {
      summary.removed += removeViewerCountElements(card, TARGET);
      summary.skippedNative += 1;
      continue;
    }

    ensurePositionedContainer(cardTarget.anchor);

    const element =
      findViewerCountElement(cardTarget.anchor, TARGET) ??
      createViewerCountElement('span');

    const text = formatViewerCountLabel(stream.viewerCount);

    const changed = updateViewerCountElement(element, {
      target: TARGET,
      slug: cardTarget.slug,
      viewerCount: stream.viewerCount,
      text,
      className: 'kvc-card-count',
    });

    if (element.parentElement !== cardTarget.anchor) {
      cardTarget.anchor.append(element);
    }

    if (changed) {
      logViewerCountDomUpdate({
        target: TARGET,
        slug: cardTarget.slug,
        viewerCount: stream.viewerCount,
        text,
        element,
        hostElement: card,
      });
    }

    summary.removed += removeViewerCountElements(card, TARGET, element);
    summary.updated += 1;
  }

  return summary;
}

function findCardTarget(
  card: HTMLElement,
): { slug: string; anchor: HTMLAnchorElement } | null {
  let fallback: { slug: string; anchor: HTMLAnchorElement } | null = null;

  for (const anchor of card.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const slug = getKickChannelSlugFromHref(anchor.getAttribute('href'));

    if (!slug) {
      continue;
    }

    const target = { slug, anchor };

    if (anchor.querySelector('img, picture, video')) {
      return target;
    }

    fallback ??= target;
  }

  return fallback;
}

function ensurePositionedContainer(element: HTMLElement): void {
  if (window.getComputedStyle(element).position !== 'static') {
    return;
  }

  element.style.position = 'relative';
}
