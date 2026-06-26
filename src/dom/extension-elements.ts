import { formatViewerCount } from './format-viewer-count';
import { logger } from '@/src/utils/devLogger';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createKvcIconSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 128 128');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'flex-shrink:0;margin-right:3px';

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M20 64 C38 31 90 31 108 64 C90 97 38 97 20 64 Z');
  path.setAttribute('fill', '#53FC18');

  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '64');
  circle.setAttribute('cy', '64');
  circle.setAttribute('r', '13');
  circle.setAttribute('fill', '#0E0F12');

  svg.appendChild(path);
  svg.appendChild(circle);
  return svg;
}

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
      background: rgba(0, 48, 18, 0.84);
      color: #d7ffcf;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.32);
    }

    .kvc-sidebar-count {
      display: inline-flex;
      align-items: center;
      color: #d7ffcf;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .kvc-channel-header-count {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      border-radius: 4px;
      padding: 4px 7px;
      background: rgba(0, 48, 18, 0.72);
      color: #d7ffcf;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0;
    }

    @keyframes kvc-spin {
      to { transform: rotate(360deg); }
    }

    .kvc-spinner-ring {
      display: block;
      width: 10px;
      height: 10px;
      border: 2px solid rgba(83, 252, 24, 0.25);
      border-top-color: #53FC18;
      border-radius: 50%;
      animation: kvc-spin 0.75s linear infinite;
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

export function ensureSpinnerElement(
  anchor: HTMLElement,
  target: ViewerCountTarget,
): HTMLElement {
  const existing = findViewerCountElement(anchor, target);

  if (existing?.dataset.kvcLoading === 'true') {
    return existing;
  }

  if (existing) {
    return existing;
  }

  const element = createViewerCountElement('span');
  element.dataset.kvcViewerCount = 'true';
  element.dataset.kvcTarget = target;
  element.dataset.kvcLoading = 'true';
  element.className = 'kvc-viewer-count kvc-card-count kvc-card-spinner';
  element.title = 'Added by Kick Viewer Count';
  element.setAttribute('aria-label', 'Loading viewer count, added by Kick Viewer Count');
  const ring = document.createElement('span');
  ring.className = 'kvc-spinner-ring';
  ring.setAttribute('aria-hidden', 'true');
  element.appendChild(ring);
  return element;
}

export function updateViewerCountElement(
  element: HTMLElement,
  options: ViewerCountElementOptions,
): boolean {
  if (
    element.dataset.kvcLoading !== 'true' &&
    element.dataset.kvcTarget === options.target &&
    element.dataset.kvcSlug === options.slug &&
    element.dataset.kvcCount === String(options.viewerCount)
  ) {
    return false;
  }

  delete element.dataset.kvcLoading;

  const ariaViewerCount = options.viewerCount.toLocaleString();

  element.className = `kvc-viewer-count ${options.className}`;
  element.dataset.kvcViewerCount = 'true';
  element.dataset.kvcTarget = options.target;
  element.dataset.kvcSlug = options.slug;
  element.dataset.kvcCount = String(options.viewerCount);
  element.title = 'Added by Kick Viewer Count';
  element.setAttribute(
    'aria-label',
    `${ariaViewerCount} viewers, added by Kick Viewer Count`,
  );
  element.replaceChildren();
  if (options.target !== 'sidebar-channel') {
    element.appendChild(createKvcIconSvg());
  }
  const textSpan = document.createElement('span');
  textSpan.textContent = options.text;
  element.appendChild(textSpan);

  return true;
}

export function formatViewerCountLabel(viewerCount: number): string {
  return formatViewerCount(viewerCount);
}

export function logViewerCountDomUpdate(
  details: ViewerCountDomUpdateLogDetails,
): void {
  logger.debug('Viewer count DOM node updated.', details);
}
