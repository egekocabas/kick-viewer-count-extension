import { defineContentScript } from 'wxt/utils/define-content-script';
import {
  createDomInjectionController,
  type DomInjectionController,
} from '@/src/dom/dom-injection-controller';
import {
  KICK_ENDPOINT_NORMALIZERS,
  normalizeCapturedKickPayload,
} from '@/src/kick/normalize';
import {
  createKickViewerCountState,
  markEndpointCaptured,
  updateCurrentViewerState,
  updateStreamState,
} from '@/src/kick/state';
import {
  type CaptureMetadata,
  type CapturedKickApiMessage,
  isCapturedKickApiMessage,
} from '@/src/types/kick';
import { logger } from '@/src/utils/devLogger';

declare global {
  interface Window {
    __kickViewerCountContentScriptInitialized?: boolean;
  }
}

export default defineContentScript({
  matches: ['https://kick.com/*'],
  runAt: 'document_start',
  allFrames: false,
  noScriptStartedPostMessage: true,
  async main(ctx) {
    if (window.__kickViewerCountContentScriptInitialized) {
      logger.debug('Content script already initialized; skipping duplicate run.');
      return;
    }

    window.__kickViewerCountContentScriptInitialized = true;

    const state = createKickViewerCountState();
    const domInjection = createDomInjectionController({ state });

    domInjection.start();

    ctx.addEventListener(window, 'message', (event) => {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }

      if (!isCapturedKickApiMessage(event.data)) {
        return;
      }

      handleCapturedKickApiMessage(state, event.data, domInjection);
    });

    logger.info('Content script initialized at document_start.');
  },
});

function handleCapturedKickApiMessage(
  state: ReturnType<typeof createKickViewerCountState>,
  message: CapturedKickApiMessage,
  domInjection: DomInjectionController,
): void {
  const metadata: CaptureMetadata = {
    endpoint: message.endpoint,
    capturedAt: message.timestamp,
    requestUrl: message.url,
    pageUrl: window.location.href,
  };
  const normalizer = KICK_ENDPOINT_NORMALIZERS[message.endpoint];
  const result = normalizeCapturedKickPayload(message.payload, metadata);

  markEndpointCaptured(state, message.endpoint, message.timestamp);

  if (result.kind === 'streams') {
    const summary = updateStreamState(state, result.entries);

    logger.info('Captured Kick stream viewer data.', {
      endpoint: message.endpoint,
      debugName: normalizer.debugName,
      normalizedEntries: result.entries.length,
      totalKnownStreamSlugs: summary.totalStreamSlugs,
      totalKnownStreamLivestreamIds: summary.totalStreamLivestreamIds,
      updatedSlugs: summary.updatedSlugs,
      updatedLivestreamIds: summary.updatedLivestreamIds,
      hasHiddenViewCountEntries: result.entries.some(
        (entry) => entry.showViewCount === false,
      ),
      url: message.url,
      timestamp: message.timestamp,
    });

    domInjection.scheduleUpdate('network-data');
    return;
  }

  const summary = updateCurrentViewerState(state, result.entries);

  logger.info('Captured Kick current-viewer data.', {
    endpoint: message.endpoint,
    debugName: normalizer.debugName,
    normalizedEntries: result.entries.length,
    totalKnownCurrentViewerLivestreamIds:
      summary.totalCurrentViewerLivestreamIds,
    updatedLivestreamIds: summary.updatedLivestreamIds,
    hasHiddenViewCountEntries: result.entries.some(
      (entry) => entry.showViewCount === false,
    ),
    url: message.url,
    timestamp: message.timestamp,
  });

  domInjection.scheduleUpdate('network-data');
}
