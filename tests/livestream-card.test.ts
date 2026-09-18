import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VIEWER_COUNT_SELECTOR } from '@/src/dom/extension-elements';
import { updateLivestreamCardViewerCounts } from '@/src/dom/injectors/livestream-card.injector';
import { findLivestreamCardTarget } from '@/src/dom/livestream-card-target';
import { hasNativeLivestreamCardViewerCount } from '@/src/dom/native-count-detector';
import { createBrowsePageViewerFetcher } from '@/src/kick/browse-page-viewer-fetcher';
import { createKickViewerCountState, updateStreamState } from '@/src/kick/state';

vi.mock('@/src/utils/devLogger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Reduced from the home, browse and following HTML samples. The native badge
// sits inside the thumbnail, with either a numeric title/count or just LIVE.
function renderCard(badge: string, slug = 'example'): HTMLElement {
  const card = document.createElement('div');
  card.dataset.testid = 'livestream-results-card';
  card.innerHTML = `
    <a data-testid="media-card-thumbnail" href="/${slug}">
      <div class="relative h-full w-full"><img alt="Stream thumbnail"></div>
      <div class="pointer-events-none absolute z-controls flex items-center justify-center gap-1 rounded bg-surface-bg-default/80 state-layer px-1.5 py-1 text-xs font-semibold uppercase top-1.5 left-1.5">
        ${badge}
      </div>
    </a>
    <div><a href="/${slug}" title="2026">2026</a></div>
  `;
  document.body.append(card);
  return card;
}

function numericBadge(title = '2022', text = '2K'): string {
  return `<div class="h-2 w-2 rounded-full bg-kick-voltGreen-150"></div><span title="${title}">${text}</span>`;
}

const liveBadge = '<span class="text-brand-bg-default">LIVE</span>';

function hasNativeCount(card: HTMLElement): boolean {
  return hasNativeLivestreamCardViewerCount(card, findLivestreamCardTarget(card)?.anchor);
}

function stateWithStream() {
  const state = createKickViewerCountState();
  updateStreamState(state, [{
    sourceEndpoint: 'CHANNEL_DETAILS',
    channelSlug: 'example',
    livestreamId: '123',
    viewerCount: 2022,
    showViewCount: false,
    isLive: true,
    capturedAt: Date.now(),
    requestUrl: 'https://kick.com/api/v2/channels/example',
    pageUrl: window.location.href,
  }]);
  return state;
}

beforeEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('native livestream card counts', () => {
  it.each([
    ['home', '/', '189', '189'],
    ['browse', '/browse', '2022', '2K'],
    ['following', '/following', '1033', '1K'],
  ])('recognizes the number-only %s badge', (_page, path, title, text) => {
    window.history.replaceState(null, '', path);
    const card = renderCard(numericBadge(title, text));
    expect(hasNativeCount(card)).toBe(true);
    expect(hasNativeLivestreamCardViewerCount(card)).toBe(true);
    expect(updateLivestreamCardViewerCounts(stateWithStream()).skippedNative).toBe(1);
    expect(card.querySelector(VIEWER_COUNT_SELECTOR)).toBeNull();
  });

  it.each([
    ['0', '0'], ['999', '999'], ['12616', '12.6K'],
    ['1,234', '1,234'], ['1234567', '1.2M'],
  ])('recognizes numeric title %s and displayed count %s', (title, text) => {
    expect(hasNativeCount(renderCard(numericBadge(title, text)))).toBe(true);
  });

  it.each([
    '<span>1,234 viewers</span>',
    '<span>2.5K watching</span>',
    '<span title="1234"></span><span>viewers</span>',
  ])('retains support for older badges: %s', (badge) => {
    expect(hasNativeCount(renderCard(badge))).toBe(true);
  });

  it.each([
    liveBadge,
    '<span title="1234"></span>',
    '<span title="2026">LIVE</span>',
    '<span title="1234">02:34:56</span>',
    '<span title="18+">18+</span>',
  ])('does not mistake non-count content for a viewer count: %s', (badge) => {
    const card = renderCard(badge);
    expect(hasNativeCount(card)).toBe(false);
    expect(hasNativeLivestreamCardViewerCount(card)).toBe(false);
  });

  it.each(['display: none', 'visibility: hidden', 'opacity: 0'])('ignores a hidden badge (%s)', (style) => {
    expect(hasNativeCount(renderCard(`<div style="${style}">${numericBadge()}</div>`))).toBe(false);
    expect(hasNativeCount(renderCard(`<span title="2022" style="${style}">2K</span>`))).toBe(false);
  });

  it('ignores extension-owned numeric text, even with a numeric title', () => {
    const card = renderCard(liveBadge);
    updateLivestreamCardViewerCounts(stateWithStream());
    const injected = card.querySelector<HTMLElement>(VIEWER_COUNT_SELECTOR)!;
    injected.title = '2022';
    injected.querySelector('span')!.title = '2022';
    expect(hasNativeCount(card)).toBe(false);
  });
});

describe('livestream card injection', () => {
  it('keeps one extension count on LIVE-only cards across repeated updates', () => {
    const card = renderCard(liveBadge);
    const state = stateWithStream();
    updateLivestreamCardViewerCounts(state);
    updateLivestreamCardViewerCounts(state);
    expect(card.querySelectorAll(VIEWER_COUNT_SELECTOR)).toHaveLength(1);
    expect(card.querySelector<HTMLElement>(VIEWER_COUNT_SELECTOR)?.dataset.kvcCount).toBe('2022');
  });

  it('removes an existing extension count when Kick renders a native count', () => {
    const card = renderCard(liveBadge);
    const state = stateWithStream();
    updateLivestreamCardViewerCounts(state);
    card.querySelector('.z-controls')!.innerHTML = numericBadge();
    expect(updateLivestreamCardViewerCounts(state)).toMatchObject({ skippedNative: 1, removed: 1 });
    expect(card.querySelector(VIEWER_COUNT_SELECTOR)).toBeNull();
    card.querySelector('.z-controls')!.innerHTML = liveBadge;
    updateLivestreamCardViewerCounts(state);
    expect(card.querySelectorAll(VIEWER_COUNT_SELECTOR)).toHaveLength(1);
  });

  it('does not add a spinner to a native-count card while its request is in flight', () => {
    const card = renderCard(numericBadge());
    updateLivestreamCardViewerCounts(createKickViewerCountState(), () => true);
    expect(card.querySelector(VIEWER_COUNT_SELECTOR)).toBeNull();
  });

  it('removes a spinner as soon as a native count appears, before data arrives', () => {
    const card = renderCard(liveBadge);
    const state = createKickViewerCountState();
    updateLivestreamCardViewerCounts(state, () => true);
    expect(card.querySelector('[data-kvc-loading="true"]')).not.toBeNull();
    card.querySelector('.z-controls')!.innerHTML = numericBadge();
    expect(updateLivestreamCardViewerCounts(state, () => true)).toMatchObject({ skippedNative: 1, removed: 1 });
    expect(card.querySelector(VIEWER_COUNT_SELECTOR)).toBeNull();
  });

  it('continues to skip past-video cards on channel pages', () => {
    window.history.replaceState(null, '', '/example/videos');
    const card = renderCard(liveBadge);
    expect(updateLivestreamCardViewerCounts(stateWithStream()).scanned).toBe(0);
    expect(card.querySelector(VIEWER_COUNT_SELECTOR)).toBeNull();
  });
});

describe('browse/category discovery', () => {
  it.each(['/browse', '/category/just-chatting'])('fetches only LIVE-only cards on %s', async (path) => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', path);
    renderCard(numericBadge(), 'native-count');
    renderCard(liveBadge, 'hidden-count');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const fetcher = createBrowsePageViewerFetcher();
    fetcher.init(createKickViewerCountState(), vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://kick.com/api/v2/channels/hidden-count');
    window.history.replaceState(null, '', '/');
    fetcher.onUrlChange();
  });
});
