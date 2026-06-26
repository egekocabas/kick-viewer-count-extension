import { getKickChannelSlugFromHref } from './slug';

export const LIVESTREAM_CARD_SELECTOR = '[data-testid="livestream-results-card"]';

export interface LivestreamCardTarget {
  slug: string;
  anchor: HTMLAnchorElement;
}

export function findLivestreamCardTarget(
  card: HTMLElement,
): LivestreamCardTarget | null {
  let fallback: LivestreamCardTarget | null = null;

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
