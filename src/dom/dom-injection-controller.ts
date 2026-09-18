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
  isSlugInFlight?: (slug: string) => boolean;
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
      // Keep the first deadline: player/header activity must not postpone
      // applying already-cached counts indefinitely.
      return;
    }

    updateTimer = window.setTimeout(runUpdate, debounceMs);
  }

  function runUpdate(): void {
    updateTimer = undefined;
    ensureDomInjectionStyles();

    const cardSummary = updateLivestreamCardViewerCounts(options.state, options.isSlugInFlight);
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
      characterData: true,
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

  // Page-world history calls may bypass the isolated content script's wrappers.
  // Observe the URL commit instead of waiting for navigatesuccess, which can be
  // delayed by the router's asynchronous work. DOM mutations handle mounting.
  const nav = (window as Window & { navigation?: EventTarget }).navigation;
  if (nav) {
    let previousUrl = window.location.href;
    nav.addEventListener('currententrychange', () => {
      dispatchUrlChangeIfNeeded(previousUrl);
      previousUrl = window.location.href;
    });
  }
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
  // React can remove our badge while reusing the surrounding channel header.
  // Reconcile detached badges; moving a badge during our own update keeps it
  // connected and does not require another pass.
  if (Array.from(mutation.removedNodes).some((node) =>
    node instanceof HTMLElement &&
    node.matches(VIEWER_COUNT_SELECTOR) &&
    !node.isConnected,
  )) {
    return false;
  }

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
    Boolean(node.closest(VIEWER_COUNT_SELECTOR))
  );
}
