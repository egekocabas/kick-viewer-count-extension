import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDomInjectionController } from '@/src/dom/dom-injection-controller';
import { getViewerCountSelector } from '@/src/dom/extension-elements';
import { updateChannelHeaderViewerCount } from '@/src/dom/injectors/channel-header.injector';
import { updateSidebarChannelViewerCounts } from '@/src/dom/injectors/sidebar-channel.injector';
import { createKickViewerCountState, MAX_STREAM_AGE_MS, updateStreamState } from '@/src/kick/state';

vi.mock('@/src/utils/devLogger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const headerSelector = getViewerCountSelector('channel-header');
const sidebarSelector = getViewerCountSelector('sidebar-channel');
const originalPushState = window.history.pushState;
const originalReplaceState = window.history.replaceState;
const NativeMutationObserver = window.MutationObserver;
let observers: MutationObserver[];
let windowListeners: Array<[string, EventListenerOrEventListenerObject]>;

function createState() {
  const state = createKickViewerCountState();
  updateStreamState(state, ['first-channel', '3mr'].map((slug, index) => ({
    sourceEndpoint: 'SIDEBAR_LIVESTREAMS' as const,
    channelSlug: slug,
    viewerCount: index === 0 ? 500 : 12616,
    showViewCount: false,
    isLive: true,
    capturedAt: Date.now(),
    requestUrl: 'https://web.kick.com/api/v1/recommendations/livestreams/sidebar',
    pageUrl: window.location.href,
  })));
  return state;
}

function headerMarkup(slug: string): string {
  return `<section id="channel-header">
    <h1 id="channel-username">${slug}</h1>
    <div data-testid="livestream-title">Stream title</div>
    <div><div><button data-testid="sub-button">Subscribe</button></div><div id="share-row">Share</div></div>
  </section>`;
}

function renderPage(slug = 'first-channel') {
  document.body.innerHTML = `<div id="app">
    <aside><a href="/3mr" data-testid="sidebar-following-channel-3mr"><span>3mr</span><div><span>LIVE</span></div></a></aside>
    <main>${headerMarkup(slug)}</main>
    <div id="activity"></div><div id="channel-chatroom"></div>
  </div>`;
}

function getHeaderCount(): HTMLElement | null {
  return document.querySelector<HTMLElement>(headerSelector);
}

// Simulate a router running in the page's MAIN world, outside the content
// script's patched history methods. No new API response is delivered.
function changePageUrl(slug: string) {
  originalReplaceState.call(window.history, null, '', `/${slug}`);
}

beforeEach(() => {
  vi.useFakeTimers();
  observers = [];
  windowListeners = [];
  delete window.__kickViewerCountUrlObserverInstalled;
  changePageUrl('first-channel');
  renderPage();
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
  const addEventListener = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    windowListeners.push([type, listener]);
    addEventListener(type, listener, options);
  });
  vi.stubGlobal('MutationObserver', class extends NativeMutationObserver {
    constructor(callback: MutationCallback) {
      super(callback);
      observers.push(this);
    }
  });
});

afterEach(() => {
  for (const observer of observers) observer.disconnect();
  for (const [type, listener] of windowListeners) window.removeEventListener(type, listener);
  window.history.pushState = originalPushState;
  window.history.replaceState = originalReplaceState;
  delete window.__kickViewerCountUrlObserverInstalled;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('channel header sidebar cache', () => {
  it('uses the existing sidebar data immediately after switching channels', () => {
    const state = createState();
    updateSidebarChannelViewerCounts(state);
    changePageUrl('3mr');
    document.querySelector('main')!.innerHTML = headerMarkup('3mr');
    updateChannelHeaderViewerCount(state);
    expect(getHeaderCount()?.dataset.kvcCount).toBe('12616');
  });

  it('reuses the count still displayed in the sidebar after the cache expires', () => {
    const state = createState();
    updateSidebarChannelViewerCounts(state);
    vi.advanceTimersByTime(MAX_STREAM_AGE_MS + 1);
    updateSidebarChannelViewerCounts(state);
    expect(document.querySelector<HTMLElement>(sidebarSelector)?.dataset.kvcCount).toBe('12616');
    changePageUrl('3mr');
    document.querySelector('main')!.innerHTML = headerMarkup('3mr');
    expect(updateChannelHeaderViewerCount(state).updated).toBe(1);
    expect(getHeaderCount()?.dataset.kvcCount).toBe('12616');
    expect(state.streamsBySlug.get('3mr')!.capturedAt).toBeLessThan(Date.now() - MAX_STREAM_AGE_MS);

    updateStreamState(state, [{ ...state.streamsBySlug.get('3mr')!, viewerCount: 13000, capturedAt: Date.now() }]);
    updateChannelHeaderViewerCount(state);
    expect(getHeaderCount()?.dataset.kvcCount).toBe('13000');
    expect(document.querySelectorAll(headerSelector)).toHaveLength(1);
  });

  it('does not reuse another channel\'s badge or a count from a removed sidebar row', () => {
    const state = createState();
    updateSidebarChannelViewerCounts(state);
    vi.advanceTimersByTime(MAX_STREAM_AGE_MS + 1);
    updateChannelHeaderViewerCount(state);
    expect(getHeaderCount()).toBeNull();
    changePageUrl('3mr');
    document.querySelector('aside')!.replaceChildren();
    updateChannelHeaderViewerCount(state);
    expect(getHeaderCount()).toBeNull();
  });

  it('keeps native counts and offline channel state authoritative', () => {
    const state = createState();
    changePageUrl('3mr');
    updateSidebarChannelViewerCounts(state);
    vi.advanceTimersByTime(MAX_STREAM_AGE_MS + 1);
    const native = document.createElement('span');
    native.dataset.testid = 'viewer-count';
    native.textContent = '12616';
    document.querySelector('#share-row')!.append(native);
    updateChannelHeaderViewerCount(state);
    expect(getHeaderCount()).toBeNull();
    native.remove();
    updateStreamState(state, [{ ...state.streamsBySlug.get('3mr')!, isLive: false, capturedAt: Date.now() }]);
    updateChannelHeaderViewerCount(state);
    expect(getHeaderCount()).toBeNull();
  });

  it.each(['', '-1', 'NaN', '1.5', '12.6K'])('rejects invalid retained sidebar data: %s', (count) => {
    const state = createState();
    updateSidebarChannelViewerCounts(state);
    document.querySelector<HTMLElement>(sidebarSelector)!.dataset.kvcCount = count;
    vi.advanceTimersByTime(MAX_STREAM_AGE_MS + 1);
    changePageUrl('3mr');
    updateChannelHeaderViewerCount(state);
    expect(getHeaderCount()).toBeNull();
  });

  it('accepts a retained count of zero', () => {
    const state = createState();
    updateStreamState(state, [{ ...state.streamsBySlug.get('3mr')!, viewerCount: 0 }]);
    updateSidebarChannelViewerCounts(state);
    vi.advanceTimersByTime(MAX_STREAM_AGE_MS + 1);
    changePageUrl('3mr');
    updateChannelHeaderViewerCount(state);
    expect(getHeaderCount()?.dataset.kvcCount).toBe('0');
  });
});

describe('channel navigation DOM updates', () => {
  it('handles replacing a channel inside a container that already contains badges', async () => {
    const controller = createDomInjectionController({ state: createState() });
    controller.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(getHeaderCount()?.dataset.kvcSlug).toBe('first-channel');

    changePageUrl('3mr');
    document.querySelector('main')!.innerHTML = headerMarkup('3mr');
    await vi.advanceTimersByTimeAsync(200);
    expect(getHeaderCount()?.dataset.kvcSlug).toBe('3mr');
    expect(getHeaderCount()?.dataset.kvcCount).toBe('12616');
  });

  it('detects reused header text nodes without waiting for a network response', async () => {
    createDomInjectionController({ state: createState() }).start();
    await vi.advanceTimersByTimeAsync(200);
    changePageUrl('3mr');
    document.querySelector('#channel-username')!.firstChild!.nodeValue = '3mr';
    await vi.advanceTimersByTimeAsync(200);
    expect(getHeaderCount()?.dataset.kvcSlug).toBe('3mr');
  });

  it('observes page containers that contain a retained sidebar badge', async () => {
    createDomInjectionController({ state: createState() }).start();
    await vi.advanceTimersByTimeAsync(200);
    changePageUrl('3mr');
    const main = document.createElement('main');
    main.innerHTML = headerMarkup('3mr');
    document.querySelector('main')!.replaceWith(main);
    await vi.advanceTimersByTimeAsync(200);
    expect(getHeaderCount()?.dataset.kvcSlug).toBe('3mr');
  });

  it('restores a badge removed by the page while the header is reused', async () => {
    createDomInjectionController({ state: createState() }).start();
    await vi.advanceTimersByTimeAsync(200);
    changePageUrl('3mr');
    getHeaderCount()!.remove();
    await vi.advanceTimersByTimeAsync(400);
    expect(getHeaderCount()?.dataset.kvcSlug).toBe('3mr');
    expect(document.querySelectorAll(headerSelector)).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not postpone an update indefinitely while other page content changes', async () => {
    const controller = createDomInjectionController({ state: createState() });
    controller.start();
    await vi.advanceTimersByTimeAsync(200);
    changePageUrl('3mr');
    controller.scheduleUpdate('url-change');
    for (let i = 0; i < 4; i += 1) {
      await vi.advanceTimersByTimeAsync(50);
      document.querySelector('#activity')!.append(document.createElement('span'));
    }
    expect(getHeaderCount()?.dataset.kvcSlug).toBe('3mr');
  });

  it('updates when the navigation entry commits, before navigatesuccess', async () => {
    const navigation = new EventTarget();
    vi.stubGlobal('navigation', navigation);
    createDomInjectionController({ state: createState() }).start();
    await vi.advanceTimersByTimeAsync(200);
    changePageUrl('3mr');
    navigation.dispatchEvent(new Event('currententrychange'));
    await vi.advanceTimersByTimeAsync(200);
    expect(getHeaderCount()?.dataset.kvcSlug).toBe('3mr');
  });

  it('ignores chat and extension-owned updates without creating an update loop', async () => {
    const onMutation = vi.fn();
    createDomInjectionController({ state: createState(), onMutation }).start();
    await vi.advanceTimersByTimeAsync(400);
    onMutation.mockClear();
    document.querySelector('#channel-chatroom')!.append(document.createElement('p'));
    document.querySelector('#channel-chatroom')!.firstChild!.textContent = 'Chat message';
    getHeaderCount()!.querySelector('span')!.firstChild!.nodeValue = '501';
    await vi.advanceTimersByTimeAsync(400);
    expect(onMutation).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
