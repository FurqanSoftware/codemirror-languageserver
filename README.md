# Language Server Plugin for CodeMirror 6

[![npm version](https://badge.fury.io/js/codemirror-languageserver.svg)](https://www.npmjs.com/package/codemirror-languageserver)

This plugin enables code completion, hover tooltips, and linter functionality by connecting a CodeMirror 6 editor with a language server over WebSocket or any compatible transport.

[How It Works](https://hjr265.me/blog/codemirror-lsp/)

## Usage

```
npm i codemirror-languageserver
```

### WebSockets transport
``` js
import { languageServer } from 'codemirror-languageserver';

const lsPlugin = languageServer({
	serverUri, // WebSocket server uri.
	rootUri: 'file:///',
	documentUri: `file:///${filename}`,
	languageId: 'cpp' // As defined at https://microsoft.github.io/language-server-protocol/specification#textDocumentItem.
});

const view = new EditorView({
	state: EditorState.create({
		extensions: [
			// ...
			lsPlugin,
			// ...
		]
	})
});
```

### Re using the same client
``` js
import { languageServer } from 'codemirror-languageserver';

const client = new LanguageServerClient({
	transport: new WebSocketTransport(serverUri),
	rootUri: 'file:///'
})

const firstView = new EditorView({
	state: EditorState.create({
		extensions: [
			// ...
			languageServerWithClient({
				client,
				documentUri: `file:///${secondFileName}`,
				languageId: 'cpp'
			}),
			// ...
		]
	})
});

const secondView = new EditorView({
	state: EditorState.create({
		extensions: [
			// ...
			languageServerWithClient({
				client,
				documentUri: `file:///${firstFileName}`,
				languageId: 'cpp'
			}),
			// ...
		]
	})
});
```

### Custom transport
``` js
import { languageServer } from 'codemirror-languageserver';

const client = new LanguageServerClient({
	transport: new AwesomeCustomTransport(),
	rootUri: 'file:///'
})

const lsPlugin = languageServerWithClient({
	client,
	documentUri: `file:///${filename}`,
	languageId: 'cpp'
})

const view = new EditorView({
	state: EditorState.create({
		extensions: [
			// ...
			lsPlugin,
			// ...
		]
	})
});

```

## Contributing

Contributions are welcome.

## Real World Uses

https://user-images.githubusercontent.com/348107/120141150-c6bb9180-c1fd-11eb-8ada-9b7b7a1e4ade.mp4

| | |
| --- | --- |
| [Toph](https://toph.co) | Competitive programming platform |

## License

The library is available under the BSD (3-Clause) License.
