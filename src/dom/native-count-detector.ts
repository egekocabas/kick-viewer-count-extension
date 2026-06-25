import { VIEWER_COUNT_SELECTOR } from './extension-elements';

const VIEWER_WORD_PATTERN =
  /\b(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*[km]?\s*(?:watching|viewers?)\b/i;
const COMPACT_VIEWER_COUNT_PATTERN =
  /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*[km]?$/i;

export function hasNativeLivestreamCardViewerCount(
  card: HTMLElement,
  thumbnailLink?: HTMLElement | null,
): boolean {
  const searchRoot = thumbnailLink ?? card;
  const visibleText = getVisibleText(searchRoot);

  return (
    VIEWER_WORD_PATTERN.test(visibleText) ||
    hasNumericTitleNearViewerWord(searchRoot)
  );
}

export function hasNativeSidebarViewerCount(statusRoot: HTMLElement): boolean {
  if (VIEWER_WORD_PATTERN.test(getVisibleText(statusRoot))) {
    return true;
  }

  return Array.from(statusRoot.querySelectorAll<HTMLElement>('span, div, p')).some(
    (element) => isCompactViewerCountText(getVisibleText(element)),
  );
}

export function hasNativeChannelHeaderViewerCount(
  headerRoot: HTMLElement,
): boolean {
  if (VIEWER_WORD_PATTERN.test(getVisibleText(headerRoot))) {
    return true;
  }

  return Array.from(
    headerRoot.querySelectorAll<HTMLElement>('[aria-label], [title]'),
  ).some((element) => {
    if (
      element.matches(VIEWER_COUNT_SELECTOR) ||
      element.closest(VIEWER_COUNT_SELECTOR)
    ) {
      return false;
    }

    const ariaLabel = element.getAttribute('aria-label') ?? '';
    const title = element.getAttribute('title') ?? '';

    return VIEWER_WORD_PATTERN.test(`${ariaLabel} ${title}`);
  });
}

export function getVisibleText(root: Node): string {
  const parts: string[] = [];

  collectVisibleText(root, parts);

  return normalizeWhitespace(parts.join(' '));
}

export function isCompactViewerCountText(text: string): boolean {
  return COMPACT_VIEWER_COUNT_PATTERN.test(normalizeWhitespace(text));
}

export function isLiveText(text: string): boolean {
  return normalizeWhitespace(text).toLowerCase() === 'live';
}

function hasNumericTitleNearViewerWord(root: HTMLElement): boolean {
  return Array.from(root.querySelectorAll<HTMLElement>('[title]')).some(
    (element) => {
      const title = element.getAttribute('title') ?? '';

      if (!isCompactViewerCountText(title)) {
        return false;
      }

      const nearbyText = getVisibleText(element.parentElement ?? element);

      return /\b(?:watching|viewers?)\b/i.test(nearbyText);
    },
  );
}

function collectVisibleText(node: Node, parts: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim();

    if (text) {
      parts.push(text);
    }

    return;
  }

  if (!(node instanceof HTMLElement)) {
    for (const child of Array.from(node.childNodes)) {
      collectVisibleText(child, parts);
    }

    return;
  }

  if (shouldIgnoreElement(node)) {
    return;
  }

  for (const child of Array.from(node.childNodes)) {
    collectVisibleText(child, parts);
  }
}

function shouldIgnoreElement(element: HTMLElement): boolean {
  if (
    element.matches(VIEWER_COUNT_SELECTOR) ||
    element.closest(VIEWER_COUNT_SELECTOR) ||
    element.tagName === 'SCRIPT' ||
    element.tagName === 'STYLE'
  ) {
    return true;
  }

  const style = window.getComputedStyle(element);

  return (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0'
  );
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
