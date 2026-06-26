import {
  DOM_STYLE_ELEMENT_ID,
  VIEWER_COUNT_SELECTOR,
  ensureDomInjectionStyles,
} from './extension-elements';
import { updateChannelHeaderViewerCount } from './injectors/channel-header.injector';
import { updateLivestreamCardViewerCounts } from './injectors/livestream-card.injector';
import { updateSidebarChannelViewerCounts } from './injectors/sidebar-channel.injector';
import {
  getKnownStreamCount,
  type KickViewerCountState,
} from '@/src/kick/state';
import { logger } from '@/src/utils/devLogger';

const DEFAULT_DEBOUNCE_MS = 180;
const URL_CHANGE_EVENT = 'kick-viewer-count:url-change';

export type DomUpdateReason = 'init' | 'network-data' | 'mutation' | 'url-change';

export interface DomInjectionController {
  start(): void;
  scheduleUpdate(reason: DomUpdateReason): void;
}

interface DomInjectionControllerOptions {
  state: KickViewerCountState;
  debounceMs?: number;
  onMutation?: () => void;
  onUrlChange?: () => void;
}

declare global {
  interface Window {
    __kickViewerCountUrlObserverInstalled?: boolean;
  }
}

export function createDomInjectionController(
  options: DomInjectionControllerOptions,
): DomInjectionController {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  let started = false;
  let observer: MutationObserver | undefined;
  let updateTimer: number | undefined;
  let pendingReason: DomUpdateReason = 'init';

  function start(): void {
    if (started) {
      return;
    }

    started = true;
    ensureDomInjectionStyles();
    installMutationObserverWhenReady();
    installSpaNavigationObserver();
    window.addEventListener(URL_CHANGE_EVENT, handleUrlChange);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', handleDomReady, { once: true });
    } else {
      handleDomReady();
    }

    scheduleUpdate('init');

    logger.info('DOM injection initialized.');
  }

  function scheduleUpdate(reason: DomUpdateReason): void {
    pendingReason = reason;

    if (updateTimer !== undefined) {
      window.clearTimeout(updateTimer);
    }

    updateTimer = window.setTimeout(runUpdate, debounceMs);
  }

  function runUpdate(): void {
    updateTimer = undefined;
    ensureDomInjectionStyles();

    const cardSummary = updateLivestreamCardViewerCounts(options.state);
    const sidebarSummary = updateSidebarChannelViewerCounts(options.state);
    const channelHeaderSummary = updateChannelHeaderViewerCount(options.state);

    logger.debug('DOM injection update complete.', {
      reason: pendingReason,
      knownStreamCount: getKnownStreamCount(options.state),
      cards: cardSummary,
      sidebar: sidebarSummary,
      channelHeader: channelHeaderSummary,
    });
  }

  function handleDomReady(): void {
    installMutationObserverWhenReady();
    scheduleUpdate('mutation');
  }

  function handleUrlChange(): void {
    scheduleUpdate('url-change');
    options.onUrlChange?.();
  }

  function installMutationObserverWhenReady(): void {
    if (observer || !document.body) {
      return;
    }

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (!isExtensionOwnedMutation(mutation) && !isExcludedSubtreeMutation(mutation)) {
          scheduleUpdate('mutation');
          options.onMutation?.();
          return;
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  return {
    start,
    scheduleUpdate,
  };
}

function installSpaNavigationObserver(): void {
  if (window.__kickViewerCountUrlObserverInstalled) {
    return;
  }

  window.__kickViewerCountUrlObserverInstalled = true;

  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;

  window.history.pushState = function (
    this: History,
    ...args: Parameters<History['pushState']>
  ): void {
    const previousUrl = window.location.href;
    Reflect.apply(originalPushState, this, args);
    dispatchUrlChangeIfNeeded(previousUrl);
  };

  window.history.replaceState = function (
    this: History,
    ...args: Parameters<History['replaceState']>
  ): void {
    const previousUrl = window.location.href;
    Reflect.apply(originalReplaceState, this, args);
    dispatchUrlChangeIfNeeded(previousUrl);
  };

  window.addEventListener('popstate', () => {
    window.setTimeout(() => {
      window.dispatchEvent(new Event(URL_CHANGE_EVENT));
    }, 0);
  });
}

function dispatchUrlChangeIfNeeded(previousUrl: string): void {
  if (window.location.href !== previousUrl) {
    window.dispatchEvent(new Event(URL_CHANGE_EVENT));
  }
}

const CHAT_SUBTREE_SELECTOR = '#chatroom-messages, #channel-chatroom';

function isExcludedSubtreeMutation(mutation: MutationRecord): boolean {
  const el =
    mutation.target instanceof Element
      ? mutation.target
      : (mutation.target as Text).parentElement;

  return el ? el.closest(CHAT_SUBTREE_SELECTOR) !== null : false;
}

function isExtensionOwnedMutation(mutation: MutationRecord): boolean {
  if (isExtensionOwnedNode(mutation.target)) {
    return true;
  }

  const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];

  return changedNodes.length > 0 && changedNodes.every(isExtensionOwnedNode);
}

function isExtensionOwnedNode(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return Boolean(
      node.parentElement?.closest(
        `${VIEWER_COUNT_SELECTOR}, #${DOM_STYLE_ELEMENT_ID}`,
      ),
    );
  }

  if (!(node instanceof HTMLElement)) {
    return false;
  }

  return (
    node.id === DOM_STYLE_ELEMENT_ID ||
    node.matches(VIEWER_COUNT_SELECTOR) ||
    Boolean(node.closest(VIEWER_COUNT_SELECTOR)) ||
    Boolean(node.querySelector(VIEWER_COUNT_SELECTOR))
  );
}
