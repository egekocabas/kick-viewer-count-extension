import {defineContentScript} from 'wxt/utils/define-content-script';
import {
    classifyKickEndpointUrl,
    type KickEndpointDefinition,
} from '@/src/kick/endpoints';
import {
    KICK_API_RESPONSE_MESSAGE_TYPE,
    KICK_MESSAGE_SOURCE,
    type CapturedKickApiMessage,
} from '@/src/types/kick';
import {logger} from '@/src/utils/devLogger';

declare global {
    interface Window {
        __kickViewerCountPageHookInstalled?: boolean;
    }
}

export default defineContentScript({
    matches: ['https://kick.com/*'],
    runAt: 'document_start',
    allFrames: false,
    world: 'MAIN',
    noScriptStartedPostMessage: true,
    main() {
        if (window.__kickViewerCountPageHookInstalled) {
            logger.debug('Page hook already installed; skipping duplicate run.');
            return;
        }

        window.__kickViewerCountPageHookInstalled = true;

        patchResponseJson();

        logger.debug('Page hook installed.');
    },
});

function patchResponseJson(): void {
    const originalJson = Response.prototype.json;
    const originalFunctionToString = Function.prototype.toString;
    const nativeFunctionSources = new WeakMap<object, string>();

    installFunctionToStringPatch({
        nativeFunctionSources,
        originalFunctionToString,
    });

    Response.prototype.json = createNativeLikeProxy(
        originalJson,
        {
            apply(target, thisArg: Response, args: Parameters<Response['json']>) {
                const payloadPromise = Reflect.apply(
                    target,
                    thisArg,
                    args,
                ) as ReturnType<Response['json']>;

                observeJsonPayload(thisArg, payloadPromise);

                return payloadPromise;
            },
        },
        {
            nativeFunctionSources,
            originalFunctionToString,
        },
    );
}

type AnyCallable = (...args: never[]) => unknown;

interface NativeLikeProxyOptions {
    nativeFunctionSources: WeakMap<object, string>;
    originalFunctionToString: typeof Function.prototype.toString;
}

function createNativeLikeProxy<T extends AnyCallable>(
    target: T,
    handler: ProxyHandler<T>,
    options: NativeLikeProxyOptions,
): T {
    const proxy = new Proxy(target, handler);

    try {
        options.nativeFunctionSources.set(
            proxy,
            options.originalFunctionToString.call(target),
        );
    } catch {
        // Native source preservation is best-effort compatibility hardening.
    }

    return proxy;
}

function installFunctionToStringPatch(options: NativeLikeProxyOptions): void {
    const toStringProxy = new Proxy(options.originalFunctionToString, {
        apply(target, thisArg, args) {
            const nativeSource =
                typeof thisArg === 'function'
                    ? options.nativeFunctionSources.get(thisArg)
                    : undefined;

            if (nativeSource !== undefined) {
                return nativeSource;
            }

            return Reflect.apply(target, thisArg, args);
        },
    });

    try {
        options.nativeFunctionSources.set(
            toStringProxy,
            options.originalFunctionToString.call(options.originalFunctionToString),
        );
    } catch {
        // Leave Function.prototype.toString callable even if source capture fails.
    }

    Function.prototype.toString = toStringProxy;
}

function observeJsonPayload(
    response: Response,
    payloadPromise: ReturnType<Response['json']>,
): void {
    const endpoint = classifyKickEndpointUrl(response.url, window.location.href);

    if (!endpoint) {
        return;
    }

    payloadPromise
        .then((payload: unknown) => {
            emitCapturedPayload(endpoint, response.url || window.location.href, payload);
        })
        .catch((error: unknown) => {
            logger.debug('Failed to observe captured JSON response.', error);
        });
}

function emitCapturedPayload(
    endpoint: KickEndpointDefinition,
    url: string,
    payload: unknown,
): void {
    try {
        const message: CapturedKickApiMessage = {
            source: KICK_MESSAGE_SOURCE,
            type: KICK_API_RESPONSE_MESSAGE_TYPE,
            endpoint: endpoint.type,
            url,
            timestamp: Date.now(),
            payload,
        };

        window.postMessage(message, window.location.origin);
        logger.debug('Captured Kick endpoint response.', {
            endpoint: endpoint.type,
            debugName: endpoint.debugName,
            url,
        });
    } catch (error) {
        logger.debug('Failed to emit captured Kick endpoint response.', error);
    }
}
