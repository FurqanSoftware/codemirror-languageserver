# Language Server Plugin for CodeMirror 6

[![npm version](https://badge.fury.io/js/codemirror-languageserver.svg)](https://www.npmjs.com/package/codemirror-languageserver)

This plugin connects a [CodeMirror 6](https://codemirror.net/) editor with a [Language Server](https://microsoft.github.io/language-server-protocol/) over WebSocket, providing IDE-like features in the browser.

[How It Works](https://hjr265.me/blog/codemirror-lsp/)

## Features

https://user-images.githubusercontent.com/348107/120141150-c6bb9180-c1fd-11eb-8ada-9b7b7a1e4ade.mp4

- ⌨️ Code Completion (w/ Resolve Support)
- 📚 Hover Documentation
- 🩺 Diagnostics
- 🔍 Go to Definition, Declaration, and Type Definition
- 🔦 Document Highlight
- 🎨 Document Formatting and Range Formatting
- ✏️ Rename Symbol

## Installation

```
npm i codemirror-languageserver
```

**Peer dependencies:** This package requires `@codemirror/autocomplete`, `@codemirror/lint`, `@codemirror/state`, and `@codemirror/view` as peer dependencies. If you're using CodeMirror 6, you likely already have these installed.

## Quick Start

```js
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { languageServer } from 'codemirror-languageserver';

const ls = languageServer({
    serverUri: 'ws://localhost:8080',
    rootUri: 'file:///',
    documentUri: `file:///${filename}`,
    languageId: 'cpp', // As defined at https://microsoft.github.io/language-server-protocol/specification#textDocumentItem.
});

const view = new EditorView({
    state: EditorState.create({
        extensions: [
            // ... other extensions
            ls,
        ],
    }),
});
```

This sets up all built-in features: completion, hover, diagnostics, go-to-definition, document highlight, and rename support.

## Options

| Option | Type | Description |
|---|---|---|
| `serverUri` | `ws://...` or `wss://...` | WebSocket server URI |
| `rootUri` | `string` | Root URI of the workspace |
| `workspaceFolders` | `WorkspaceFolder[]` | LSP workspace folders |
| `documentUri` | `string` | URI of the document being edited |
| `languageId` | `string` | Language identifier ([spec](https://microsoft.github.io/language-server-protocol/specification#textDocumentItem)) |
| `initializationOptions` | `object` | Server-specific initialization options |
| `locale` | `string` | Locale for the LSP session (e.g. `'en'`) |
| `allowHTMLContent` | `boolean` | Trust raw HTML in hover/completion content (default: `false`) |
| `synchronizationMethod` | `SynchronizationMethod` | `'full'` or `'incremental'` document sync (default: `'full'`) |
| `client` | `LanguageServerClient` | Share a client across multiple editor instances |
| `onCapabilities` | `(capabilities) => void` | Called when server capabilities are available |

## Shared Client

To share the same language server connection across multiple editor instances:

```js
import { LanguageServerClient, languageServerWithTransport, WebSocketTransport } from 'codemirror-languageserver';

const client = new LanguageServerClient({
    transport: new WebSocketTransport('ws://localhost:8080'),
    rootUri: 'file:///',
});

// Use the same client for multiple editors
const ls1 = languageServerWithTransport({
    client,
    documentUri: 'file:///main.cpp',
    languageId: 'cpp',
});

const ls2 = languageServerWithTransport({
    client,
    documentUri: 'file:///utils.cpp',
    languageId: 'cpp',
});
```

## Custom Transport

Use `languageServerWithTransport` for non-WebSocket connections:

```js
import { languageServerWithTransport } from 'codemirror-languageserver';

const ls = languageServerWithTransport({
    transport: myCustomTransport,
    rootUri: 'file:///',
    documentUri: `file:///${filename}`,
    languageId: 'cpp',
});
```

The `Transport` interface:

```ts
interface Transport {
    send(message: string): void;
    onMessage(callback: (message: string) => void): void;
    onClose(callback: () => void): void;
    onError(callback: (error: Error) => void): void;
    close(): void;
}
```

You can import `Transport` and `WebSocketTransport` from the package.

## Document Highlight

Enabled by default. When the cursor is on a symbol, all occurrences in the document are highlighted. Style with CSS:

```css
.cm-lsp-highlight-text,
.cm-lsp-highlight-read { background-color: rgba(255, 255, 0, 0.2); }
.cm-lsp-highlight-write { background-color: rgba(255, 165, 0, 0.3); }
```

The three classes correspond to [DocumentHighlightKind](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#documentHighlightKind): general text occurrences, read accesses, and write accesses.

## Formatting

`formatDocument` and `formatSelection` are CodeMirror [commands](https://codemirror.net/docs/ref/#view.Command) — bind them to keys:

```js
import { keymap } from '@codemirror/view';
import { formatDocument, formatSelection } from 'codemirror-languageserver';

const formattingKeymap = keymap.of([
    { key: 'Shift-Alt-f', run: formatDocument },
    { key: 'Ctrl-k Ctrl-f', run: formatSelection },
]);
```

### Formatting Options

Configure formatting with the `formattingOptions` facet. By default, `tabSize` is read from the editor state.

```js
import { formattingOptions } from 'codemirror-languageserver';

// In extensions:
formattingOptions.of({
    tabSize: 2,
    insertSpaces: true,
    trimTrailingWhitespace: true,
    insertFinalNewline: true,
    trimFinalNewlines: true,
})
```

## Rename Symbol

`renameSymbol` is a CodeMirror command that opens a rename prompt at the top of the editor. If the server supports `prepareRename`, the current symbol name is used as the placeholder.

```js
import { keymap } from '@codemirror/view';
import { renameSymbol } from 'codemirror-languageserver';

const renameKeymap = keymap.of([
    { key: 'F2', run: renameSymbol },
]);
```

Style the panel with CSS:

```css
.cm-lsp-rename-panel {
    padding: 4px 8px;
    border-bottom: 1px solid #ddd;
}
.cm-lsp-rename-input {
    font-family: inherit;
    font-size: inherit;
}
```

## Server Capabilities

Use the `onCapabilities` callback to react when the server finishes initializing — e.g. to show or hide toolbar buttons:

```js
languageServer({
    serverUri: 'ws://localhost:8080',
    rootUri: 'file:///',
    documentUri: `file:///${filename}`,
    languageId: 'cpp',
    onCapabilities(capabilities) {
        // capabilities.documentFormattingProvider
        // capabilities.renameProvider
        // capabilities.completionProvider
        // etc.
        toolbar.update({ capabilities });
    },
})
```

## Initialization Options

The package includes TypeScript definitions for popular language servers:

- `PyrightInitializationOptions` — Python (Pyright)
- `RustAnalyzerInitializationOptions` — Rust (rust-analyzer)
- `TypeScriptInitializationOptions` — TypeScript/JavaScript
- `ESLintInitializationOptions` — ESLint
- `ClangdInitializationOptions` — C/C++ (Clangd)
- `GoplsInitializationOptions` — Go (Gopls)

```ts
import { languageServer } from 'codemirror-languageserver';
import type { ClangdInitializationOptions } from 'codemirror-languageserver';

const ls = languageServer<ClangdInitializationOptions>({
    serverUri: 'ws://localhost:8080',
    rootUri: 'file:///',
    documentUri: 'file:///main.cpp',
    languageId: 'cpp',
    initializationOptions: {
        // Type-checked options specific to Clangd
    },
});
```

## Contributing

Contributions are welcome.

## Real World Uses

- [Toph](https://toph.co): Competitive programming platform. Toph uses Language Server Plugin for CodeMirror 6 with its integrated code editor.

## License

The library is available under the BSD (3-Clause) License.
