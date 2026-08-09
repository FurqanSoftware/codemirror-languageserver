export {
    LanguageServerClient,
    languageServerPlugin,
    SynchronizationMethod,
} from './plugin.js';
export { WebSocketTransport } from './jsonrpc.js';
export type { Transport } from './jsonrpc.js';
export {
    jumpToDefinition,
    jumpToDefinitionPos,
    jumpToDefinitionKeymap,
} from './definition.js';
export {
    formatDocument,
    formatSelection,
    formattingOptions,
} from './formatting.js';
export { renameSymbol } from './rename.js';
export {
    PyrightInitializationOptions,
    RustAnalyzerInitializationOptions,
    TypeScriptInitializationOptions,
    ESLintInitializationOptions,
    ClangdInitializationOptions,
    GoplsInitializationOptions,
} from './initialization.js';

import { keymap } from '@codemirror/view';
import { WebSocketTransport } from './jsonrpc.js';

import {
    LanguageServerClient,
    languageServerPlugin,
    SynchronizationMethod,
} from './plugin.js';
import type {
    LanguageServerClientOptions,
    LanguageServerBaseOptions,
} from './plugin.js';
import { jumpToDefinitionKeymap } from './definition.js';
import { hoverTooltip } from './hover.js';
import { autocompletion } from './completion.js';
import { documentHighlight } from './highlight.js';
import { mouseHandler } from './mouse.js';
import { renameExtension } from './rename.js';

interface LanguageServerOptions<InitializationOptions = unknown>
    extends LanguageServerClientOptions<InitializationOptions> {
    client?: LanguageServerClient<InitializationOptions>;
    allowHTMLContent?: boolean;
    synchronizationMethod?: SynchronizationMethod;
}

interface LanguageServerWebsocketOptions<InitializationOptions = unknown>
    extends LanguageServerBaseOptions {
    serverUri: `ws://${string}` | `wss://${string}`;
    initializationOptions?: InitializationOptions;
}

/**
 * Creates a set of CodeMirror extensions that connect to a language server over WebSocket.
 *
 * Includes completion, hover, diagnostics, go-to-definition, document highlight,
 * and rename support. This is the main entry point for most use cases.
 */
export function languageServer<InitializationOptions = unknown>(
    options: LanguageServerWebsocketOptions<InitializationOptions>,
) {
    const serverUri = options.serverUri;
    const { serverUri: _, ...optionsWithoutServerUri } = options;
    return languageServerWithTransport<InitializationOptions>({
        ...optionsWithoutServerUri,
        transport: new WebSocketTransport(serverUri),
    });
}

/**
 * Like {@link languageServer}, but accepts a custom {@link Transport} instead of a WebSocket URI.
 *
 * Use this when communicating with the language server over a non-WebSocket channel.
 */
export function languageServerWithTransport<InitializationOptions = unknown>(
    options: LanguageServerOptions<InitializationOptions>,
) {
    return [
        languageServerPlugin.of({
            client:
                options.client ||
                new LanguageServerClient<InitializationOptions>({
                    ...options,
                    autoClose: true,
                }),
            documentUri: options.documentUri,
            languageId: options.languageId,
            allowHTMLContent: options.allowHTMLContent,
            synchronizationMethod: options.synchronizationMethod,
        }),
        hoverTooltip(),
        autocompletion(),
        documentHighlight(),
        renameExtension(),
        keymap.of([...jumpToDefinitionKeymap]),
        mouseHandler(),
    ];
}
