# Language Server Plugin for CodeMirror 6

[![npm version](https://badge.fury.io/js/codemirror-languageserver.svg)](https://www.npmjs.com/package/codemirror-languageserver)

This plugin enables code completion, hover tooltips, and linter functionality by connecting a CodeMirror 6 editor with a language server over WebSocket.

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

## Usage

```
npm i codemirror-languageserver
```

```js
import { languageServer } from 'codemirror-languageserver';

var ls = languageServer({
    // WebSocket server uri and other client options.
    serverUri,
    rootUri: 'file:///',

    // Alternatively, to share the same client across multiple instances of this plugin.
    client: new LanguageServerClient({
        transport: new WebSocketTransport(serverUri),
        rootUri: 'file:///',
    }),

    documentUri: `file:///${filename}`,
    languageId: 'cpp', // As defined at https://microsoft.github.io/language-server-protocol/specification#textDocumentItem.
});

var view = new EditorView({
    state: EditorState.create({
        extensions: [
            // ...
            ls,
            // ...
        ],
    }),
});
```

### Custom Transport

Use `languageServerWithTransport` to provide a custom transport (e.g. for non-WebSocket connections):

```js
import { languageServerWithTransport } from 'codemirror-languageserver';

var ls = languageServerWithTransport({
    transport: myCustomTransport, // Must implement the Transport interface
    rootUri: 'file:///',
    documentUri: `file:///${filename}`,
    languageId: 'cpp',
});
```

The `Transport` interface requires `send`, `onMessage`, `onClose`, `onError`, and `close` methods. You can import `Transport` and `WebSocketTransport` from the package.

### Document Highlight

Document highlights are enabled by default. When the cursor is on a symbol, all occurrences are highlighted. Style them with CSS:

```css
.cm-lsp-highlight-text,
.cm-lsp-highlight-read { background-color: rgba(255, 255, 0, 0.2); }
.cm-lsp-highlight-write { background-color: rgba(255, 165, 0, 0.3); }
```

### Formatting

`formatDocument` and `formatSelection` are CodeMirror commands that you can bind to keys:

```js
import { keymap } from '@codemirror/view';
import { formatDocument, formatSelection } from 'codemirror-languageserver';

keymap.of([
    { key: 'Shift-Alt-f', run: formatDocument },
    { key: 'Ctrl-k Ctrl-f', run: formatSelection },
])
```

To configure formatting options (tab size, spaces vs tabs, etc.), use the `formattingOptions` facet:

```js
import { formattingOptions } from 'codemirror-languageserver';

// In extensions:
formattingOptions.of({
    tabSize: 2,
    insertSpaces: true,
    trimTrailingWhitespace: true,
    insertFinalNewline: true,
})
```

By default, `tabSize` is read from the editor state.

### Rename Symbol

`renameSymbol` is a CodeMirror command that opens a rename prompt at the top of the editor:

```js
import { keymap } from '@codemirror/view';
import { renameSymbol } from 'codemirror-languageserver';

keymap.of([
    { key: 'F2', run: renameSymbol },
])
```

Style the rename panel with CSS using the `cm-lsp-rename-panel` and `cm-lsp-rename-input` classes.

### Using with Initialization Options

The plugin includes built-in TypeScript definitions for popular language servers:

-   `PyrightInitializationOptions` - Python (Pyright)
-   `RustAnalyzerInitializationOptions` - Rust (rust-analyzer)
-   `TypeScriptInitializationOptions` - TypeScript/JavaScript
-   `ESLintInitializationOptions` - ESLint
-   `ClangdInitializationOptions` - C/C++ (Clangd)
-   `GoplsInitializationOptions` - Go (Gopls)

## Contributing

Contributions are welcome.

## Real World Uses

-   [Toph](https://toph.co): Competitive programming platform. Toph uses Language Server Plugin for CodeMirror 6 with its integrated code editor.

## License

The library is available under the BSD (3-Clause) License.
