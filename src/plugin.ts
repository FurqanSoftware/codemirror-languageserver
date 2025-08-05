import { insertCompletionText } from '@codemirror/autocomplete';
import { setDiagnostics } from '@codemirror/lint';
import { Facet } from '@codemirror/state';
import { EditorView, Tooltip, ViewPlugin } from '@codemirror/view';
import {
    Client,
    RequestManager,
    WebSocketTransport,
} from '@open-rpc/client-js';
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
import { Transport } from '@open-rpc/client-js/build/transports/Transport';
import { marked } from 'marked';
import type { PublishDiagnosticsParams } from 'vscode-languageserver-protocol';
import type * as LSP from 'vscode-languageserver-protocol';

import { posToOffset, offsetToPos } from './pos';

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

export class LanguageServerClient<InitializationOptions = unknown> {
    public ready: boolean;
    public capabilities: LSP.ServerCapabilities<any>;

    public initializePromise: Promise<void>;
    private rootUri: string | null;
    private workspaceFolders: LSP.WorkspaceFolder[] | null;
    private autoClose?: boolean;

    private transport: Transport;
    private requestManager: RequestManager;
    private client: Client;

    private plugins: LanguageServerPlugin[];
    private options: LanguageServerClientOptions<InitializationOptions>;

    constructor(options: LanguageServerClientOptions<InitializationOptions>) {
        this.options = options;
        this.rootUri = options.rootUri;
        this.workspaceFolders = options.workspaceFolders;
        this.autoClose = options.autoClose;
        this.plugins = [];
        this.transport = options.transport;

        this.requestManager = new RequestManager([this.transport]);
        this.client = new Client(this.requestManager);

        this.client.onNotification((data) => {
            this.processNotification(data as any);
        });

        const webSocketTransport = this.transport as WebSocketTransport;
        if (webSocketTransport && webSocketTransport.connection) {
            // XXX(hjr265): Need a better way to do this. Relevant issue:
            // https://github.com/FurqanSoftware/codemirror-languageserver/issues/9
            webSocketTransport.connection.addEventListener(
                'message',
                (message) => {
                    const data = JSON.parse(message.data);
                    if (data.method && data.id) {
                        webSocketTransport.connection.send(
                            JSON.stringify({
                                jsonrpc: '2.0',
                                id: data.id,
                                result: null,
                            }),
                        );
                    }
                },
            );
        }

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
                },
                workspace: {
                    didChangeConfiguration: {
                        dynamicRegistration: true,
                    },
                },
            },
            initializationOptions: this.options.initializationOptions ?? null,
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
    ): Promise<LSPNotifyMap[K]> {
        return this.client.notify({ method, params });
    }

    protected processNotification(notification: Notification) {
        for (const plugin of this.plugins) {
            plugin.processNotification(notification);
        }
    }
}

export class LanguageServerPlugin implements PluginValue {
    public client: LanguageServerClient;

    private documentUri: string;
    private languageId: string;
    private documentVersion: number;
    private allowHTMLContent: boolean;

    private changesTimeout: number;

    constructor(
        private view: EditorView,
        {
            client,
            documentUri,
            languageId,
            allowHTMLContent,
        }: {
            client: LanguageServerClient;
            documentUri: string;
            languageId: string;
            allowHTMLContent: boolean;
        },
    ) {
        this.client = client;
        this.documentUri = documentUri;
        this.languageId = languageId;
        this.allowHTMLContent = allowHTMLContent;
        this.documentVersion = 0;
        this.changesTimeout = 0;

        this.client.attachPlugin(this);

        this.initialize({
            documentText: this.view.state.doc.toString(),
        });
    }

    public update({ docChanged }: ViewUpdate) {
        if (!docChanged) {
            return;
        }
        if (this.changesTimeout) {
            clearTimeout(this.changesTimeout);
        }
        this.changesTimeout = self.setTimeout(() => {
            this.sendChange({
                documentText: this.view.state.doc.toString(),
            });
        }, changesDelay);
    }

    public destroy() {
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

    public async sendChange({ documentText }: { documentText: string }) {
        if (!this.client.ready) {
            return;
        }
        try {
            await this.client.textDocumentDidChange({
                textDocument: {
                    uri: this.documentUri,
                    version: this.documentVersion++,
                },
                contentChanges: [{ text: documentText }],
            });
        } catch (e) {
            console.error(e);
        }
    }

    public requestDiagnostics(view: EditorView) {
        this.sendChange({ documentText: view.state.doc.toString() });
    }

    public async requestHoverTooltip(
        view: EditorView,
        { line, character }: { line: number; character: number },
    ): Promise<Tooltip | null> {
        if (!this.client.ready || !this.client.capabilities!.hoverProvider) {
            return null;
        }

        this.sendChange({ documentText: view.state.doc.toString() });
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
        if (this.allowHTMLContent) {
            dom.innerHTML = await formatContents(contents);
        } else {
            dom.textContent = await formatContents(contents);
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
        this.sendChange({
            documentText: context.state.doc.toString(),
        });

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
        const options = items.map(
            ({
                detail,
                label,
                kind,
                textEdit,
                documentation,
                additionalTextEdits,
            }) => {
                const completion: Completion = {
                    label,
                    detail,
                    apply(
                        view: EditorView,
                        completion: Completion,
                        from: number,
                        to: number,
                    ) {
                        if (isLSPTextEdit(textEdit)) {
                            view.dispatch(
                                insertCompletionText(
                                    view.state,
                                    textEdit.newText,
                                    posToOffset(
                                        view.state.doc,
                                        textEdit.range.start,
                                    ),
                                    posToOffset(
                                        view.state.doc,
                                        textEdit.range.end,
                                    ),
                                ),
                            );
                        } else {
                            view.dispatch(
                                insertCompletionText(
                                    view.state,
                                    label,
                                    from,
                                    to,
                                ),
                            );
                        }
                        if (!additionalTextEdits) {
                            return;
                        }
                        additionalTextEdits
                            .sort(
                                (
                                    { range: { end: a } },
                                    { range: { end: b } },
                                ) => {
                                    if (
                                        posToOffset(view.state.doc, a) <
                                        posToOffset(view.state.doc, b)
                                    ) {
                                        return 1;
                                    } else if (
                                        posToOffset(view.state.doc, a) >
                                        posToOffset(view.state.doc, b)
                                    ) {
                                        return -1;
                                    }
                                    return 0;
                                },
                            )
                            .forEach((textEdit) => {
                                view.dispatch(
                                    view.state.update({
                                        changes: {
                                            from: posToOffset(
                                                view.state.doc,
                                                textEdit.range.start,
                                            ),
                                            to: posToOffset(
                                                view.state.doc,
                                                textEdit.range.end,
                                            ),
                                            insert: textEdit.newText,
                                        },
                                    }),
                                );
                            });
                    },
                    type: kind && CompletionItemKindMap[kind].toLowerCase(),
                };
                if (documentation) {
                    completion.info = async () => {
                        const dom = document.createElement('div');
                        dom.classList.add('documentation');
                        if (this.allowHTMLContent) {
                            dom.innerHTML = await formatContents(documentation);
                        } else {
                            dom.textContent =
                                await formatContents(documentation);
                        }
                        return dom;
                    };
                }
                return completion;
            },
        );

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

export interface LanguageServerBaseOptions {
    rootUri: string | null;
    workspaceFolders: LSP.WorkspaceFolder[] | null;
    documentUri: string;
    languageId: string;
}

export interface LanguageServerClientOptions<InitializationOptions = unknown>
    extends LanguageServerBaseOptions {
    transport: Transport;
    autoClose?: boolean;
    initializationOptions?: InitializationOptions;
}

async function formatContents(
    contents: LSP.MarkupContent | LSP.MarkedString | LSP.MarkedString[],
): Promise<string> {
    if (isLSPMarkupContent(contents)) {
        let value = contents.value;
        if (contents.kind === 'markdown') {
            value = await marked.parse(value);
        }
        return value;
    } else if (Array.isArray(contents)) {
        return contents.map((c) => formatContents(c) + '\n\n').join('');
    } else if (typeof contents === 'string') {
        return contents;
    }
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
