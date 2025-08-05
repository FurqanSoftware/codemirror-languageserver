export { LanguageServerClient, languageServerPlugin } from './plugin';
export {
    jumpToDefinition,
    jumpToDefinitionPos,
    jumpToDefinitionKeymap,
} from './definition';
export {
    PyrightInitializationOptions,
    RustAnalyzerInitializationOptions,
    TypeScriptInitializationOptions,
    ESLintInitializationOptions,
    ClangdInitializationOptions,
    GoplsInitializationOptions,
} from './initialization';

import { keymap } from '@codemirror/view';
import { WebSocketTransport } from '@open-rpc/client-js';

import { LanguageServerClient, languageServerPlugin } from './plugin';
import type {
    LanguageServerClientOptions,
    LanguageServerBaseOptions,
} from './plugin';
import { jumpToDefinitionKeymap } from './definition';
import { hoverTooltip } from './hover';
import { autocompletion } from './completion';
import { mouseHandler } from './mouse';

interface LanguageServerOptions<InitializationOptions = unknown>
    extends LanguageServerClientOptions<InitializationOptions> {
    client?: LanguageServerClient<InitializationOptions>;
    allowHTMLContent?: boolean;
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
        }),
        hoverTooltip(),
        autocompletion(),
        keymap.of([...jumpToDefinitionKeymap]),
        mouseHandler(),
    ];
}
