import { formatViewerCount } from './format-viewer-count';
import { logger } from '@/src/utils/devLogger';

export type ViewerCountTarget =
  | 'livestream-card'
  | 'sidebar-channel'
  | 'channel-header';

export const VIEWER_COUNT_SELECTOR = '[data-kvc-viewer-count="true"]';
export const DOM_STYLE_ELEMENT_ID = 'kick-viewer-count-dom-styles';

interface ViewerCountElementOptions {
  target: ViewerCountTarget;
  slug: string;
  viewerCount: number;
  text: string;
  className: string;
}

interface ViewerCountDomUpdateLogDetails {
  target: ViewerCountTarget;
  slug: string;
  viewerCount: number;
  text: string;
  element: HTMLElement;
  hostElement: HTMLElement;
}

export function ensureDomInjectionStyles(): void {
  if (document.getElementById(DOM_STYLE_ELEMENT_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = DOM_STYLE_ELEMENT_ID;
  style.textContent = `
    ${VIEWER_COUNT_SELECTOR} {
      box-sizing: border-box;
      white-space: nowrap;
      font-family: inherit;
      line-height: 1;
    }

    .kvc-card-count {
      position: absolute;
      left: 8px;
      bottom: 8px;
      z-index: 5;
      display: inline-flex;
      align-items: center;
      min-height: 20px;
      border-radius: 4px;
      padding: 3px 6px;
      background: rgba(10, 10, 12, 0.78);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.32);
    }

    .kvc-sidebar-count {
      display: inline-flex;
      align-items: center;
      margin-left: 6px;
      color: #d7ffcf;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .kvc-channel-header-count {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      margin-top: 6px;
      border-radius: 4px;
      padding: 4px 7px;
      background: rgba(31, 41, 35, 0.72);
      color: #ecffe8;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0;
    }
  `;

  (document.head ?? document.documentElement).append(style);
}

export function createViewerCountElement(tagName = 'span'): HTMLElement {
  return document.createElement(tagName);
}

export function findViewerCountElement(
  scope: ParentNode,
  target: ViewerCountTarget,
): HTMLElement | null {
  return scope.querySelector<HTMLElement>(getViewerCountSelector(target));
}

export function getViewerCountSelector(target: ViewerCountTarget): string {
  return `${VIEWER_COUNT_SELECTOR}[data-kvc-target="${target}"]`;
}

export function removeViewerCountElements(
  scope: ParentNode,
  target: ViewerCountTarget,
  except?: HTMLElement,
): number {
  let removed = 0;

  for (const element of scope.querySelectorAll<HTMLElement>(
    getViewerCountSelector(target),
  )) {
    if (element === except) {
      continue;
    }

    element.remove();
    removed += 1;
  }

  return removed;
}

export function updateViewerCountElement(
  element: HTMLElement,
  options: ViewerCountElementOptions,
): void {
  const ariaViewerCount = options.viewerCount.toLocaleString();

  element.className = `kvc-viewer-count ${options.className}`;
  element.dataset.kvcViewerCount = 'true';
  element.dataset.kvcTarget = options.target;
  element.dataset.kvcSlug = options.slug;
  element.title = 'Added by Kick Viewer Count';
  element.setAttribute(
    'aria-label',
    `${ariaViewerCount} viewers, added by Kick Viewer Count`,
  );
  element.textContent = options.text;
}

export function formatViewerCountLabel(viewerCount: number): string {
  return formatViewerCount(viewerCount);
}

export function logViewerCountDomUpdate(
  details: ViewerCountDomUpdateLogDetails,
): void {
  logger.debug('Viewer count DOM node updated.', details);
}
