# Language Server Plugin for CodeMirror 6

[![npm version](https://badge.fury.io/js/codemirror-languageserver.svg)](https://www.npmjs.com/package/codemirror-languageserver)

This plugin enables code completion, hover tooltips, and linter functionality by connecting a CodeMirror 6 editor with a language server over WebSocket.

[How It Works](https://hjr265.me/blog/codemirror-lsp/)

## Usage

```
npm i codemirror-languageserver
```

```js
import { languageServer } from 'codemirror-languageserver';

const transport = new WebSocketTransport(serverUri);

var ls = languageServer({
    // WebSocket server uri and other client options.
    serverUri,
    rootUri: 'file:///',

    // Alternatively, to share the same client across multiple instances of this plugin.
    client: new LanguageServerClient({
        serverUri,
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

https://user-images.githubusercontent.com/348107/120141150-c6bb9180-c1fd-11eb-8ada-9b7b7a1e4ade.mp4

-   [Toph](https://toph.co): Competitive programming platform. Toph uses Language Server Plugin for CodeMirror 6 with its integrated code editor.

## License

The library is available under the BSD (3-Clause) License.
