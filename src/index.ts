import { autocompletion } from '@codemirror/autocomplete';
import { setDiagnostics } from '@codemirror/lint';
import { Facet } from '@codemirror/state';
import { hoverTooltip } from '@codemirror/tooltip';
import { EditorView, ViewPlugin } from '@codemirror/view';
import {
    RequestManager,
    Client,
    WebSocketTransport,
} from '@open-rpc/client-js';
import {
    DiagnosticSeverity,
    CompletionItemKind,
    CompletionTriggerKind,
} from 'vscode-languageserver-protocol';

import type {
    Completion,
    CompletionContext,
    CompletionResult,
} from '@codemirror/autocomplete';
import type { PublishDiagnosticsParams } from 'vscode-languageserver-protocol';
import type { ViewUpdate, PluginValue } from '@codemirror/view';
import type { Text } from '@codemirror/state';
import type * as LSP from 'vscode-languageserver-protocol';
import type { Tooltip } from '@codemirror/tooltip';

const timeout = 10000;
const changesDelay = 500;

const CompletionItemKindMap = Object.fromEntries(
    Object.entries(CompletionItemKind).map(([key, value]) => [value, key])
) as Record<CompletionItemKind, string>;

const useLast = (values: readonly string[]) => values.reduce((_, v) => v, '');

const serverUri = Facet.define<string, string>({ combine: useLast });
const rootUri = Facet.define<string, string>({ combine: useLast });
const documentUri = Facet.define<string, string>({ combine: useLast });
const languageId = Facet.define<string, string>({ combine: useLast });

// https://microsoft.github.io/language-server-protocol/specifications/specification-current/

// Client to server then server to client
interface LSPRequestMap {
    initialize: [LSP.InitializeParams, LSP.InitializeResult];
    'textDocument/hover': [LSP.HoverParams, LSP.Hover];
    'textDocument/completion': [
        LSP.CompletionParams,
        LSP.CompletionItem[] | LSP.CompletionList | null
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

class LanguageServerPlugin implements PluginValue {
    private rootUri: string;
    private documentUri: string;
    private languageId: string;
    private documentVersion: number;
    private transport: WebSocketTransport;
    private requestManager: RequestManager;
    private client: Client;
    private changesTimeout: number;
    private ready?: boolean;
    public capabilities?: LSP.ServerCapabilities<any>;

    constructor(private view: EditorView) {
        this.rootUri = this.view.state.facet(rootUri);
        this.documentUri = this.view.state.facet(documentUri);
        this.languageId = this.view.state.facet(languageId);
        this.documentVersion = 0;
        this.changesTimeout = 0;
        this.transport = new WebSocketTransport(
            this.view.state.facet(serverUri)
        );
        this.requestManager = new RequestManager([this.transport]);
        this.client = new Client(this.requestManager);
        this.client.onNotification((data) => {
            this.processNotification(data as any);
        });
        this.initialize({
            documentText: this.view.state.doc.toString(),
        });
    }

    update({ docChanged }: ViewUpdate) {
        if (!docChanged) return;
        if (this.changesTimeout) clearTimeout(this.changesTimeout);
        this.changesTimeout = self.setTimeout(() => {
            this.sendChange({
                documentText: this.view.state.doc.toString(),
            });
        }, changesDelay);
    }

    destroy() {
        this.client.close();
    }

    private request<K extends keyof LSPRequestMap>(
        timeout: number,
        method: K,
        params: LSPRequestMap[K][0]
    ): Promise<LSPRequestMap[K][1]> {
        return this.client.request({ method, params }, timeout);
    }

    private notify<K extends keyof LSPNotifyMap>(
        method: K,
        params: LSPNotifyMap[K]
    ): Promise<LSPNotifyMap[K]> {
        return this.client.notify({ method, params });
    }

    async initialize({ documentText }: { documentText: string }) {
        const { capabilities } = await this.request(timeout * 3, 'initialize', {
            capabilities: {
                textDocument: {
                    hover: {
                        dynamicRegistration: true,
                        contentFormat: ['plaintext', 'markdown'],
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
                            documentationFormat: ['plaintext', 'markdown'],
                            deprecatedSupport: false,
                            preselectSupport: false,
                        },
                        contextSupport: false,
                    },
                    signatureHelp: {
                        dynamicRegistration: true,
                        signatureInformation: {
                            documentationFormat: ['plaintext', 'markdown'],
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
            initializationOptions: null,
            processId: null,
            rootUri: this.rootUri,
            workspaceFolders: [
                {
                    name: 'root',
                    uri: this.rootUri,
                },
            ],
        });
        this.capabilities = capabilities;
        this.notify('initialized', {});
        this.notify('textDocument/didOpen', {
            textDocument: {
                uri: this.documentUri,
                languageId: this.languageId,
                text: documentText,
                version: this.documentVersion,
            },
        });
        this.ready = true;
    }

    async sendChange({ documentText }: { documentText: string }) {
        if (!this.ready) return;
        try {
            await this.notify('textDocument/didChange', {
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

    requestDiagnostics(view: EditorView) {
        this.sendChange({ documentText: view.state.doc.toString() });
    }

    async requestHoverTooltip(
        view: EditorView,
        { line, character }: { line: number; character: number }
    ): Promise<Tooltip | null> {
        if (!this.ready || !this.capabilities!.hoverProvider) return null;

        this.sendChange({ documentText: view.state.doc.toString() });
        const result = await this.request(timeout, 'textDocument/hover', {
            textDocument: { uri: this.documentUri },
            position: { line, character },
        });
        if (!result) return null;
        const { contents, range } = result;
        let pos = posToOffset(view.state.doc, { line, character })!;
        let end: number;
        if (range) {
            pos = posToOffset(view.state.doc, range.start)!;
            end = posToOffset(view.state.doc, range.end);
        }
        if (pos === null) return null;
        const dom = document.createElement('div');
        dom.classList.add('documentation');
        dom.textContent = formatContents(contents);
        return { pos, end, create: (view) => ({ dom }), above: true };
    }

    async requestCompletion(
        context: CompletionContext,
        { line, character }: { line: number; character: number },
        {
            triggerKind,
            triggerCharacter,
        }: {
            triggerKind: CompletionTriggerKind;
            triggerCharacter: string | undefined;
        }
    ): Promise<CompletionResult | null> {
        if (!this.ready || !this.capabilities!.completionProvider) return null;
        this.sendChange({
            documentText: context.state.doc.toString(),
        });

        const result = await this.request(timeout, 'textDocument/completion', {
            textDocument: { uri: this.documentUri },
            position: { line, character },
            context: {
                triggerKind,
                triggerCharacter,
            },
        });

        if (!result) return null;

        const items = 'items' in result ? result.items : result;

        let options = items.map(
            ({
                detail,
                label,
                kind,
                textEdit,
                documentation,
                sortText,
                filterText,
            }) => {
                const completion: Completion & {
                    filterText: string;
                    sortText?: string;
                    apply: string;
                } = {
                    label,
                    detail,
                    apply: textEdit?.newText ?? label,
                    type: kind && CompletionItemKindMap[kind].toLowerCase(),
                    sortText: sortText ?? label,
                    filterText: filterText ?? label,
                };
                if (documentation) {
                    completion.info = formatContents(documentation);
                }
                return completion;
            }
        );

        const [span, match] = prefixMatch(options);
        const token = context.matchBefore(match);
        let { pos } = context;

        if (token) {
            pos = token.from;
            const word = token.text.toLowerCase();
            if (/^\w+$/.test(word)) {
                options = options
                    .filter(({ filterText }) =>
                        filterText.toLowerCase().startsWith(word)
                    )
                    .sort(({ apply: a }, { apply: b }) => {
                        switch (true) {
                            case a.startsWith(token.text) &&
                                !b.startsWith(token.text):
                                return -1;
                            case !a.startsWith(token.text) &&
                                b.startsWith(token.text):
                                return 1;
                        }
                        return 0;
                    });
            }
        }
        return {
            from: pos,
            options,
        };
    }

    processNotification(notification: Notification) {
        try {
            switch (notification.method) {
                case 'textDocument/publishDiagnostics':
                    this.processDiagnostics(notification.params);
            }
        } catch (error) {
            console.error(error);
        }
    }

    processDiagnostics(params: PublishDiagnosticsParams) {
        const diagnostics = params.diagnostics
            .map(({ range, message, severity }) => ({
                from: posToOffset(this.view.state.doc, range.start)!,
                to: posToOffset(this.view.state.doc, range.end)!,
                severity: ({
                    [DiagnosticSeverity.Error]: 'error',
                    [DiagnosticSeverity.Warning]: 'warning',
                    [DiagnosticSeverity.Information]: 'info',
                    [DiagnosticSeverity.Hint]: 'info',
                } as const)[severity!],
                message,
            }))
            .filter(({ from, to }) => from !== null && to !== null)
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

interface LanguageServerOptions {
    serverUri: `ws://${string}` | `wss://${string}`;
    rootUri: string;
    documentUri: string;
    languageId: string;
}

export function languageServer(options: LanguageServerOptions) {
    let plugin: LanguageServerPlugin | null = null;

    return [
        serverUri.of(options.serverUri),
        rootUri.of(options.rootUri),
        documentUri.of(options.documentUri),
        languageId.of(options.languageId),
        ViewPlugin.define((view) => (plugin = new LanguageServerPlugin(view))),
        hoverTooltip(
            (view, pos) =>
                plugin?.requestHoverTooltip(
                    view,
                    offsetToPos(view.state.doc, pos)
                ) ?? null
        ),
        autocompletion({
            override: [
                async (context) => {
                    if (plugin == null) return null;

                    const { state, pos, explicit } = context;
                    const line = state.doc.lineAt(pos);
                    let trigKind: CompletionTriggerKind =
                        CompletionTriggerKind.Invoked;
                    let trigChar: string | undefined;
                    if (
                        !explicit &&
                        plugin.capabilities?.completionProvider?.triggerCharacters?.includes(
                            line.text[pos - line.from - 1]
                        )
                    ) {
                        trigKind = CompletionTriggerKind.TriggerCharacter;
                        trigChar = line.text[pos - line.from - 1];
                    }
                    if (
                        trigKind === CompletionTriggerKind.Invoked &&
                        !context.matchBefore(/\w+$/)
                    ) {
                        return null;
                    }
                    return await plugin.requestCompletion(
                        context,
                        offsetToPos(state.doc, pos),
                        {
                            triggerKind: trigKind,
                            triggerCharacter: trigChar,
                        }
                    );
                },
            ],
        }),
        baseTheme,
    ];
}

function posToOffset(doc: Text, pos: { line: number; character: number }) {
    if (pos.line >= doc.lines) return;
    return doc.line(pos.line + 1).from + pos.character;
}

function offsetToPos(doc: Text, offset: number) {
    const line = doc.lineAt(offset);
    return {
        line: line.number - 1,
        character: offset - line.from,
    };
}

function formatContents(
    contents: LSP.MarkupContent | LSP.MarkedString | LSP.MarkedString[]
): string {
    if (Array.isArray(contents)) {
        return contents.map((c) => formatContents(c) + '\n\n').join('');
    } else if (typeof contents === 'string') {
        return contents;
    } else {
        return contents.value;
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

function prefixMatch(options: Completion[]) {
    const first = new Set<string>();
    const rest = new Set<string>();

    for (const { apply } of options) {
        const [initial, ...restStr] = apply as string;
        first.add(initial);
        for (const char of restStr) {
            rest.add(char);
        }
    }

    const source = toSet(first) + toSet(rest) + '*$';
    return [new RegExp('^' + source), new RegExp(source)];
}

const baseTheme = EditorView.baseTheme({
    '.cm-tooltip.documentation': {
        display: 'block',
        marginLeft: '0',
        padding: '3px 6px 3px 8px',
        borderLeft: '5px solid #999',
        whiteSpace: 'pre',
    },
    '.cm-tooltip.lint': {
        whiteSpace: 'pre',
    },
});
