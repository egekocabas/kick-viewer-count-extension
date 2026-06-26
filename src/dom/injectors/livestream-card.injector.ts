import {
  createViewerCountElement,
  ensureSpinnerElement,
  findViewerCountElement,
  formatViewerCountLabel,
  logViewerCountDomUpdate,
  removeViewerCountElements,
  updateViewerCountElement,
} from '../extension-elements';
import {
  findLivestreamCardTarget,
  LIVESTREAM_CARD_SELECTOR,
} from '../livestream-card-target';
import { hasNativeLivestreamCardViewerCount } from '../native-count-detector';
import {
  getBestStreamBySlug,
  type KickViewerCountState,
} from '@/src/kick/state';

const TARGET = 'livestream-card';

export interface InjectorUpdateSummary {
  scanned: number;
  updated: number;
  removed: number;
  skippedNative: number;
  skippedNoData: number;
}

export function updateLivestreamCardViewerCounts(
  state: KickViewerCountState,
  isSlugInFlight?: (slug: string) => boolean,
): InjectorUpdateSummary {
  const summary: InjectorUpdateSummary = {
    scanned: 0,
    updated: 0,
    removed: 0,
    skippedNative: 0,
    skippedNoData: 0,
  };

  for (const card of document.querySelectorAll<HTMLElement>(
    LIVESTREAM_CARD_SELECTOR,
  )) {
    summary.scanned += 1;

    const cardTarget = findLivestreamCardTarget(card);

    if (!cardTarget) {
      summary.removed += removeViewerCountElements(card, TARGET);
      continue;
    }

    const stream = getBestStreamBySlug(state, cardTarget.slug);

    if (!stream) {
      if (isSlugInFlight?.(cardTarget.slug)) {
        ensurePositionedContainer(cardTarget.anchor);
        const spinnerEl = ensureSpinnerElement(cardTarget.anchor, TARGET);
        if (spinnerEl.parentElement !== cardTarget.anchor) {
          cardTarget.anchor.append(spinnerEl);
        }
      } else {
        summary.removed += removeViewerCountElements(card, TARGET);
        summary.skippedNoData += 1;
      }
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

function ensurePositionedContainer(element: HTMLElement): void {
  if (window.getComputedStyle(element).position !== 'static') {
    return;
  }

  element.style.position = 'relative';
}
