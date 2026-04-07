export {
    LanguageServerClient,
    languageServerPlugin,
    SynchronizationMethod,
} from './plugin';
export { WebSocketTransport } from './jsonrpc';
export type { Transport } from './jsonrpc';
export {
    jumpToDefinition,
    jumpToDefinitionPos,
    jumpToDefinitionKeymap,
} from './definition';
export {
    formatDocument,
    formatSelection,
    formattingOptions,
} from './formatting';
export { renameSymbol } from './rename';
export {
    PyrightInitializationOptions,
    RustAnalyzerInitializationOptions,
    TypeScriptInitializationOptions,
    ESLintInitializationOptions,
    ClangdInitializationOptions,
    GoplsInitializationOptions,
} from './initialization';

import { keymap } from '@codemirror/view';
import { WebSocketTransport } from './jsonrpc';

import {
    LanguageServerClient,
    languageServerPlugin,
    SynchronizationMethod,
} from './plugin';
import type {
    LanguageServerClientOptions,
    LanguageServerBaseOptions,
} from './plugin';
import { jumpToDefinitionKeymap } from './definition';
import { hoverTooltip } from './hover';
import { autocompletion } from './completion';
import { documentHighlight } from './highlight';
import { mouseHandler } from './mouse';
import { renameExtension } from './rename';

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
