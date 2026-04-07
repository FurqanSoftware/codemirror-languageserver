import { insertCompletionText } from '@codemirror/autocomplete';
import { setDiagnostics } from '@codemirror/lint';
import { Facet } from '@codemirror/state';
import { EditorView, Tooltip, ViewPlugin } from '@codemirror/view';
import { JSONRPCClient, WebSocketTransport } from './jsonrpc';
import type { Transport } from './jsonrpc';
import {
    CompletionItemKind,
    CompletionTriggerKind,
    DiagnosticSeverity,
} from 'vscode-languageserver-protocol';

import type {
    Completion,
    CompletionContext,
    CompletionResult,
} from '@codemirror/autocomplete';
import type { Text } from '@codemirror/state';
import type { PluginValue, ViewUpdate } from '@codemirror/view';
import { marked } from 'marked';
import type { PublishDiagnosticsParams } from 'vscode-languageserver-protocol';
import type * as LSP from 'vscode-languageserver-protocol';

import { posToOffset, offsetToPos } from './pos';
import { changeSetToEvents } from './changes';

const timeout = 10000;
const changesDelay = 500;

const CompletionItemKindMap = Object.fromEntries(
    Object.entries(CompletionItemKind).map(([key, value]) => [value, key]),
) as Record<CompletionItemKind, string>;

const useLast = (values: readonly any[]) => values.reduce((_, v) => v, '');

const client = Facet.define<LanguageServerClient, LanguageServerClient>({
    combine: useLast,
});
const documentUri = Facet.define<string, string>({ combine: useLast });
const languageId = Facet.define<string, string>({ combine: useLast });

// https://microsoft.github.io/language-server-protocol/specifications/specification-current/

// Client to server then server to client
interface LSPRequestMap {
    initialize: [LSP.InitializeParams, LSP.InitializeResult];
    'textDocument/hover': [LSP.HoverParams, LSP.Hover];
    'textDocument/completion': [
        LSP.CompletionParams,
        LSP.CompletionItem[] | LSP.CompletionList | null,
    ];
    'textDocument/definition': [
        LSP.DefinitionParams,
        LSP.Location | LSP.Location[] | LSP.LocationLink[] | null,
    ];
    'textDocument/declaration': [
        LSP.DeclarationParams,
        LSP.Location | LSP.Location[] | LSP.LocationLink[] | null,
    ];
    'textDocument/typeDefinition': [
        LSP.TypeDefinitionParams,
        LSP.Location | LSP.Location[] | LSP.LocationLink[] | null,
    ];
    'textDocument/documentHighlight': [
        LSP.DocumentHighlightParams,
        LSP.DocumentHighlight[] | null,
    ];
    'textDocument/formatting': [
        LSP.DocumentFormattingParams,
        LSP.TextEdit[] | null,
    ];
    'textDocument/rangeFormatting': [
        LSP.DocumentRangeFormattingParams,
        LSP.TextEdit[] | null,
    ];
    'textDocument/prepareRename': [
        LSP.PrepareRenameParams,
        LSP.Range | { range: LSP.Range; placeholder: string } | null,
    ];
    'textDocument/rename': [LSP.RenameParams, LSP.WorkspaceEdit | null];
    'completionItem/resolve': [LSP.CompletionItem, LSP.CompletionItem];
}

// Client to server
interface LSPNotifyMap {
    initialized: LSP.InitializedParams;
    'textDocument/didChange': LSP.DidChangeTextDocumentParams;
    'textDocument/didOpen': LSP.DidOpenTextDocumentParams;
}

// Server to client
interface LSPEventMap {
    'textDocument/publishDiagnostics': LSP.PublishDiagnosticsParams;
}

type Notification = {
    [key in keyof LSPEventMap]: {
        jsonrpc: '2.0';
        id?: null | undefined;
        method: key;
        params: LSPEventMap[key];
    };
}[keyof LSPEventMap];

interface LanguageServerClientLocationMethods {
    textDocumentDefinition(
        params: LSP.DefinitionParams,
    ): LSP.Location | LSP.Location[] | LSP.LocationLink[] | null;
    textDocumentDeclaration(
        params: LSP.DeclarationParams,
    ): LSP.Location | LSP.Location[] | LSP.LocationLink[] | null;
    textDocumentTypeDefinition(
        params: LSP.TypeDefinitionParams,
    ): LSP.Location | LSP.Location[] | LSP.LocationLink[] | null;
}

/**
 * Manages the JSON-RPC connection to a language server.
 *
 * Handles initialization, request/response routing, and notification dispatch.
 * Can be shared across multiple editor instances via the `client` option.
 */
export class LanguageServerClient<InitializationOptions = unknown> {
    /** Whether the server has finished initializing. */
    public ready: boolean;
    /** The server's capabilities, available after initialization. */
    public capabilities: LSP.ServerCapabilities<any>;

    public initializePromise: Promise<void>;
    private rootUri: string | null;
    private workspaceFolders: LSP.WorkspaceFolder[] | null;
    private autoClose?: boolean;

    private transport: Transport;
    private client: JSONRPCClient;

    private plugins: LanguageServerPlugin[];
    private options: LanguageServerClientOptions<InitializationOptions>;

    constructor(options: LanguageServerClientOptions<InitializationOptions>) {
        this.options = options;
        this.rootUri = options.rootUri;
        this.workspaceFolders = options.workspaceFolders;
        this.autoClose = options.autoClose;
        this.plugins = [];
        this.transport = options.transport;

        this.client = new JSONRPCClient(this.transport);

        this.client.onNotification((data) => {
            if (data.method && data.id) {
                // Server-to-client request: respond with null result.
                // https://github.com/FurqanSoftware/codemirror-languageserver/issues/9
                this.transport.send(
                    JSON.stringify({
                        jsonrpc: '2.0',
                        id: data.id,
                        result: null,
                    }),
                );
            }
            this.processNotification(data as any);
        });

        this.initializePromise = this.initialize();
    }

    protected getInitializeParams(): LSP.InitializeParams {
        return {
            capabilities: {
                textDocument: {
                    hover: {
                        dynamicRegistration: true,
                        contentFormat: ['markdown', 'plaintext'],
                    },
                    moniker: {},
                    synchronization: {
                        dynamicRegistration: true,
                        willSave: false,
                        didSave: false,
                        willSaveWaitUntil: false,
                    },
                    completion: {
                        dynamicRegistration: true,
                        completionItem: {
                            snippetSupport: false,
                            commitCharactersSupport: true,
                            documentationFormat: ['markdown', 'plaintext'],
                            deprecatedSupport: false,
                            preselectSupport: false,
                            resolveSupport: {
                                properties: ['detail', 'documentation'],
                            },
                        },
                        contextSupport: true,
                    },
                    signatureHelp: {
                        dynamicRegistration: true,
                        signatureInformation: {
                            documentationFormat: ['markdown', 'plaintext'],
                        },
                    },
                    declaration: {
                        dynamicRegistration: true,
                        linkSupport: true,
                    },
                    definition: {
                        dynamicRegistration: true,
                        linkSupport: true,
                    },
                    typeDefinition: {
                        dynamicRegistration: true,
                        linkSupport: true,
                    },
                    implementation: {
                        dynamicRegistration: true,
                        linkSupport: true,
                    },
                    documentHighlight: {
                        dynamicRegistration: true,
                    },
                    formatting: {
                        dynamicRegistration: true,
                    },
                    rangeFormatting: {
                        dynamicRegistration: true,
                    },
                    rename: {
                        dynamicRegistration: true,
                        prepareSupport: true,
                    },
                },
                workspace: {
                    didChangeConfiguration: {
                        dynamicRegistration: true,
                    },
                },
            },
            initializationOptions: this.options.initializationOptions ?? null,
            locale: this.options.locale,
            processId: null,
            rootUri: this.rootUri,
            workspaceFolders: this.workspaceFolders,
        };
    }

    public async initialize() {
        const { capabilities } = await this.request(
            'initialize',
            this.getInitializeParams(),
            timeout * 3,
        );
        this.capabilities = capabilities;
        this.notify('initialized', {});
        this.ready = true;
        this.options.onCapabilities?.(capabilities);
    }

    public close() {
        this.client.close();
    }

    public textDocumentDidOpen(params: LSP.DidOpenTextDocumentParams) {
        return this.notify('textDocument/didOpen', params);
    }

    public textDocumentDidChange(params: LSP.DidChangeTextDocumentParams) {
        return this.notify('textDocument/didChange', params);
    }

    public async textDocumentHover(params: LSP.HoverParams) {
        return await this.request('textDocument/hover', params, timeout);
    }

    public async textDocumentCompletion(params: LSP.CompletionParams) {
        return await this.request('textDocument/completion', params, timeout);
    }

    public async textDocumentDefinition(params: LSP.DefinitionParams) {
        return await this.request('textDocument/definition', params, timeout);
    }

    public async textDocumentDeclaration(params: LSP.DeclarationParams) {
        return await this.request('textDocument/declaration', params, timeout);
    }

    public async textDocumentTypeDefinition(params: LSP.TypeDefinitionParams) {
        return await this.request(
            'textDocument/typeDefinition',
            params,
            timeout,
        );
    }

    public async textDocumentDocumentHighlight(
        params: LSP.DocumentHighlightParams,
    ) {
        return await this.request(
            'textDocument/documentHighlight',
            params,
            timeout,
        );
    }

    public async textDocumentFormatting(params: LSP.DocumentFormattingParams) {
        return await this.request(
            'textDocument/formatting',
            params,
            timeout,
        );
    }

    public async textDocumentRangeFormatting(
        params: LSP.DocumentRangeFormattingParams,
    ) {
        return await this.request(
            'textDocument/rangeFormatting',
            params,
            timeout,
        );
    }

    public async textDocumentPrepareRename(params: LSP.PrepareRenameParams) {
        return await this.request(
            'textDocument/prepareRename',
            params,
            timeout,
        );
    }

    public async textDocumentRename(params: LSP.RenameParams) {
        return await this.request('textDocument/rename', params, timeout);
    }

    public async completionItemResolve(
        params: LSP.CompletionItem,
    ): Promise<LSP.CompletionItem> {
        return await this.request('completionItem/resolve', params, timeout);
    }

    public attachPlugin(plugin: LanguageServerPlugin) {
        this.plugins.push(plugin);
    }

    public detachPlugin(plugin: LanguageServerPlugin) {
        const i = this.plugins.indexOf(plugin);
        if (i === -1) {
            return;
        }
        this.plugins.splice(i, 1);
        if (this.autoClose) {
            this.close();
        }
    }

    protected request<K extends keyof LSPRequestMap>(
        method: K,
        params: LSPRequestMap[K][0],
        timeout: number,
    ): Promise<LSPRequestMap[K][1]> {
        return this.client.request({ method, params }, timeout);
    }

    protected notify<K extends keyof LSPNotifyMap>(
        method: K,
        params: LSPNotifyMap[K],
    ): Promise<void> {
        return this.client.notify({ method, params });
    }

    protected processNotification(notification: Notification) {
        for (const plugin of this.plugins) {
            plugin.processNotification(notification);
        }
    }
}

/** Controls how document changes are sent to the language server. */
export enum SynchronizationMethod {
    /** Send the full document text on every change. */
    Full = 'full',
    /** Send only the changed ranges. More efficient for large documents. */
    Incremental = 'incremental',
}

export class LanguageServerPlugin implements PluginValue {
    public client: LanguageServerClient;

    public documentUri: string;
    private languageId: string;
    private documentVersion: number;
    private allowHTMLContent: boolean;
    private synchronizationMethod: SynchronizationMethod;
    private changesTimeout: ReturnType<typeof setTimeout> | null = null;
    private pendingChanges: LSP.TextDocumentContentChangeEvent[] | null = null;

    constructor(
        private view: EditorView,
        {
            client,
            documentUri,
            languageId,
            allowHTMLContent,
            synchronizationMethod,
        }: {
            client: LanguageServerClient;
            documentUri: string;
            languageId: string;
            allowHTMLContent: boolean;
            synchronizationMethod: SynchronizationMethod;
        },
    ) {
        this.client = client;
        this.documentUri = documentUri;
        this.languageId = languageId;
        this.allowHTMLContent = allowHTMLContent;
        this.synchronizationMethod =
            synchronizationMethod ?? SynchronizationMethod.Full;
        this.documentVersion = 0;

        this.client.attachPlugin(this);

        this.initialize({
            documentText: this.view.state.doc.toString(),
        });
    }

    public update({ state, changes, startState, docChanged }: ViewUpdate) {
        if (!docChanged) {
            return;
        }

        if (this.changesTimeout) {
            clearTimeout(this.changesTimeout);
        }

        switch (this.synchronizationMethod) {
            case SynchronizationMethod.Full:
                this.pendingChanges = [
                    {
                        text: this.view.state.doc.toString(),
                    },
                ];
                break;

            case SynchronizationMethod.Incremental:
                if (!this.pendingChanges) {
                    this.pendingChanges = [];
                }
                this.pendingChanges.push(
                    ...changeSetToEvents(startState.doc, changes),
                );
                break;
        }

        this.changesTimeout = setTimeout(() => {
            this.changesTimeout = null;
            if (this.pendingChanges) {
                this.sendChanges(this.pendingChanges);
                this.pendingChanges = null;
            }
        }, changesDelay);
    }

    public destroy() {
        if (this.changesTimeout) {
            clearTimeout(this.changesTimeout);
            if (this.pendingChanges) {
                this.sendChanges(this.pendingChanges);
                this.pendingChanges = null;
            }
        }
        this.client.detachPlugin(this);
    }

    public async initialize({ documentText }: { documentText: string }) {
        if (this.client.initializePromise) {
            await this.client.initializePromise;
        }
        this.client.textDocumentDidOpen({
            textDocument: {
                uri: this.documentUri,
                languageId: this.languageId,
                text: documentText,
                version: this.documentVersion,
            },
        });
    }

    public async sendChanges(
        contentChanges: LSP.TextDocumentContentChangeEvent[],
    ) {
        if (!this.client.ready) {
            return;
        }
        try {
            await this.client.textDocumentDidChange({
                textDocument: {
                    uri: this.documentUri,
                    version: this.documentVersion++,
                },
                contentChanges,
            });
        } catch (e) {
            console.error(e);
        }
    }

    public requestDiagnostics(view: EditorView) {
        this.sendChanges([{ text: view.state.doc.toString() }]);
    }

    public async requestHoverTooltip(
        view: EditorView,
        { line, character }: { line: number; character: number },
    ): Promise<Tooltip | null> {
        if (!this.client.ready || !this.client.capabilities!.hoverProvider) {
            return null;
        }

        const result = await this.client.textDocumentHover({
            textDocument: { uri: this.documentUri },
            position: { line, character },
        });
        if (!result) {
            return null;
        }
        const { contents, range } = result;
        let pos = posToOffset(view.state.doc, { line, character })!;
        let end: number;
        if (range) {
            pos = posToOffset(view.state.doc, range.start)!;
            end = posToOffset(view.state.doc, range.end);
        }
        if (pos === null) {
            return null;
        }
        const dom = document.createElement('div');
        dom.classList.add('documentation');
        const formatted = await formatContents(contents);
        if (formatted.isHTML || this.allowHTMLContent) {
            dom.innerHTML = formatted.value;
        } else {
            dom.textContent = formatted.value;
        }
        return {
            pos,
            end,
            create: (view) => ({ dom }),
            above: true,
        };
    }

    public async requestCompletion(
        context: CompletionContext,
        { line, character }: { line: number; character: number },
        {
            triggerKind,
            triggerCharacter,
        }: {
            triggerKind: CompletionTriggerKind;
            triggerCharacter: string | undefined;
        },
    ): Promise<CompletionResult | null> {
        if (
            !this.client.ready ||
            !this.client.capabilities!.completionProvider
        ) {
            return null;
        }

        const result = await this.client.textDocumentCompletion({
            textDocument: { uri: this.documentUri },
            position: { line, character },
            context: {
                triggerKind,
                triggerCharacter,
            },
        });

        if (!result) {
            return null;
        }

        let items = 'items' in result ? result.items : result;

        const [span, match] = prefixMatch(items);
        const token = context.matchBefore(match);
        let { pos } = context;

        if (token) {
            pos = token.from;
            const word = token.text.toLowerCase();
            if (/^\w+$/.test(word)) {
                items = items
                    .filter(({ label, filterText }) => {
                        const text = filterText ?? label;
                        return text.toLowerCase().startsWith(word);
                    })
                    .sort((a, b) => {
                        const aText = a.sortText ?? a.label;
                        const bText = b.sortText ?? b.label;
                        switch (true) {
                            case aText.startsWith(token.text) &&
                                !bText.startsWith(token.text):
                                return -1;
                            case !aText.startsWith(token.text) &&
                                bText.startsWith(token.text):
                                return 1;
                        }
                        return 0;
                    });
            }
        }
        const options = items.map((item) => {
            const {
                detail,
                label,
                kind,
                textEdit,
                documentation,
                additionalTextEdits,
            } = item;
            const completion: Completion = {
                label,
                detail,
                apply(
                    view: EditorView,
                    completion: Completion,
                    from: number,
                    to: number,
                ) {
                    const changes = [];

                    if (isLSPTextEdit(textEdit)) {
                        changes.push({
                            from: posToOffset(
                                view.state.doc,
                                textEdit.range.start,
                            ),
                            to: Math.max(
                                posToOffset(
                                    view.state.doc,
                                    textEdit.range.end,
                                ),
                                to,
                            ),
                            insert: textEdit.newText,
                        });
                    } else {
                        changes.push({
                            from,
                            to,
                            insert: label,
                        });
                    }

                    if (additionalTextEdits) {
                        for (const edit of additionalTextEdits) {
                            changes.push({
                                from: posToOffset(
                                    view.state.doc,
                                    edit.range.start,
                                ),
                                to: posToOffset(view.state.doc, edit.range.end),
                                insert: edit.newText,
                            });
                        }
                    }

                    view.dispatch(view.state.update({ changes }));
                },
                type: kind && CompletionItemKindMap[kind].toLowerCase(),
            };
            completion.info = async () => {
                if (
                    !item.documentation &&
                    this.client.capabilities!.completionProvider
                        ?.resolveProvider
                ) {
                    const resolvedItem =
                        await this.client.completionItemResolve(item);
                    item.documentation = resolvedItem.documentation;
                }
                const { documentation } = item;
                if (!documentation) return null;
                const dom = document.createElement('div');
                dom.classList.add('documentation');
                const formatted = await formatContents(documentation);
                if (formatted.isHTML || this.allowHTMLContent) {
                    dom.innerHTML = formatted.value;
                } else {
                    dom.textContent = formatted.value;
                }
                return dom;
            };
            return completion;
        });

        return {
            from: pos,
            options,
            filter: false,
        };
    }

    public async requestLocation(
        view: EditorView,
        { line, character }: { line: number; character: number },
        capability: keyof LSP.ServerCapabilities<any>,
        method: keyof LanguageServerClientLocationMethods,
    ) {
        if (!this.client.ready || !this.client.capabilities![capability]) {
            return null;
        }

        const result = await this.client[method]({
            textDocument: { uri: this.documentUri },
            position: { line, character },
        });

        if (!result) return;

        const location = Array.isArray(result) ? result[0] : result;
        const uri =
            (location as LSP.Location).uri ||
            (location as LSP.LocationLink).targetUri;
        const range =
            (location as LSP.Location).range ||
            (location as LSP.LocationLink).targetRange;

        if (uri === this.documentUri) {
            view.dispatch(
                view.state.update({
                    selection: {
                        anchor: posToOffset(view.state.doc, range.start),
                        head: posToOffset(view.state.doc, range.end),
                    },
                    scrollIntoView: true,
                }),
            );
        }

        return {
            uri,
            range,
        };
    }

    public async requestDefinition(
        view: EditorView,
        { line, character }: { line: number; character: number },
    ) {
        return this.requestLocation(
            view,
            { line, character },
            'definitionProvider',
            'textDocumentDefinition',
        );
    }

    public async requestDeclaration(
        view: EditorView,
        { line, character }: { line: number; character: number },
    ) {
        return this.requestLocation(
            view,
            { line, character },
            'declarationProvider',
            'textDocumentDeclaration',
        );
    }

    public async requestTypeDefinition(
        view: EditorView,
        { line, character }: { line: number; character: number },
    ) {
        return this.requestLocation(
            view,
            { line, character },
            'typeDefinitionProvider',
            'textDocumentTypeDefinition',
        );
    }

    public processNotification(notification: Notification) {
        try {
            switch (notification.method) {
                case 'textDocument/publishDiagnostics':
                    this.processDiagnostics(notification.params);
            }
        } catch (error) {
            console.log(error);
        }
    }

    public processDiagnostics(params: PublishDiagnosticsParams) {
        if (params.uri !== this.documentUri) {
            return;
        }

        const diagnostics = params.diagnostics
            .map(({ range, message, severity }) => ({
                from: posToOffset(this.view.state.doc, range.start)!,
                to: posToOffset(this.view.state.doc, range.end)!,
                severity: (
                    {
                        [DiagnosticSeverity.Error]: 'error',
                        [DiagnosticSeverity.Warning]: 'warning',
                        [DiagnosticSeverity.Information]: 'info',
                        [DiagnosticSeverity.Hint]: 'info',
                    } as const
                )[severity!],
                message,
            }))
            .filter(
                ({ from, to }) =>
                    from !== null &&
                    to !== null &&
                    from !== undefined &&
                    to !== undefined,
            )
            .sort((a, b) => {
                switch (true) {
                    case a.from < b.from:
                        return -1;
                    case a.from > b.from:
                        return 1;
                }
                return 0;
            });

        this.view.dispatch(setDiagnostics(this.view.state, diagnostics));
    }
}

export const languageServerPlugin = ViewPlugin.fromClass(LanguageServerPlugin);

/** Base options shared by all language server configurations. */
export interface LanguageServerBaseOptions {
    /** Root URI of the workspace (e.g. `'file:///'`). */
    rootUri: string | null;
    /** LSP workspace folders, if applicable. */
    workspaceFolders: LSP.WorkspaceFolder[] | null;
    /** URI of the document being edited (e.g. `'file:///main.cpp'`). */
    documentUri: string;
    /** Language identifier as defined by the LSP specification. */
    languageId: string;
}

/** Options for creating a {@link LanguageServerClient}. */
export interface LanguageServerClientOptions<InitializationOptions = unknown>
    extends LanguageServerBaseOptions {
    /** The transport used to communicate with the language server. */
    transport: Transport;
    /** Close the transport when the last plugin detaches. */
    autoClose?: boolean;
    /** Server-specific initialization options. */
    initializationOptions?: InitializationOptions;
    /** Locale for the LSP session (e.g. `'en'`). Sent in the `initialize` request. */
    locale?: string;
    /** Called once after initialization with the server's capabilities. */
    onCapabilities?: (capabilities: LSP.ServerCapabilities) => void;
}

async function formatContents(
    contents: LSP.MarkupContent | LSP.MarkedString | LSP.MarkedString[],
): Promise<{ value: string; isHTML: boolean }> {
    if (isLSPMarkupContent(contents)) {
        if (contents.kind === 'markdown') {
            return {
                value: await marked.parse(contents.value),
                isHTML: true,
            };
        }
        return { value: contents.value, isHTML: false };
    } else if (Array.isArray(contents)) {
        const parts = await Promise.all(contents.map((c) => formatContents(c)));
        const isHTML = parts.some((p) => p.isHTML);
        const value = parts
            .map((p) => (isHTML && !p.isHTML ? escapeHTML(p.value) : p.value))
            .join(isHTML ? '<br><br>' : '\n\n');
        return { value, isHTML };
    } else if (typeof contents === 'string') {
        return { value: contents, isHTML: false };
    }
}

function escapeHTML(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function toSet(chars: Set<string>) {
    let preamble = '';
    let flat = Array.from(chars).join('');
    const words = /\w/.test(flat);
    if (words) {
        preamble += '\\w';
        flat = flat.replace(/\w/g, '');
    }
    return `[${preamble}${flat.replace(/[^\w\s]/g, '\\$&')}]`;
}

function prefixMatch(items: LSP.CompletionItem[]) {
    const first = new Set<string>();
    const rest = new Set<string>();

    for (const item of items) {
        const text = item.textEdit?.newText || item.label;
        const initial = text[0];
        first.add(initial);
        for (let i = 1; i < text.length; i++) {
            rest.add(text[i]);
        }
    }

    const source = toSet(first) + toSet(rest) + '*$';
    return [new RegExp('^' + source), new RegExp(source)];
}

function isLSPTextEdit(
    textEdit?: LSP.TextEdit | LSP.InsertReplaceEdit,
): textEdit is LSP.TextEdit {
    return (textEdit as LSP.TextEdit)?.range !== undefined;
}

function isLSPMarkupContent(
    contents: LSP.MarkupContent | LSP.MarkedString | LSP.MarkedString[],
): contents is LSP.MarkupContent {
    return (contents as LSP.MarkupContent).kind !== undefined;
}
