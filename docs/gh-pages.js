import {
    EditorView,
    highlightSpecialChars,
    drawSelection,
    highlightActiveLine,
    keymap,
    lineNumbers,
    panels,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import {
    indentOnInput,
    bracketMatching,
    foldGutter,
    foldKeymap,
    defaultHighlightStyle,
    syntaxHighlighting,
} from '@codemirror/language';
import {
    defaultKeymap,
    indentWithTab,
    history,
    historyKeymap,
} from '@codemirror/commands';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import {
    completionKeymap,
    closeBrackets,
    closeBracketsKeymap,
} from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { javascript } from '@codemirror/lang-javascript';
import {
    languageServerWithTransport,
    formatDocument,
    renameSymbol,
} from '../src';
import { WorkerTransport } from './worker-transport';

const worker = new Worker('./dist/lsp-worker.js', { type: 'module' });
const transport = new WorkerTransport(worker);

const doc = `// Welcome to the CodeMirror Language Server demo!
// This editor is connected to a minimal LSP server
// running in a Web Worker. No backend needed.
//
// Try these features:
//   - Type "console." to see completions
//   - Hover over "Math", "document", "JSON", etc.
//   - Place your cursor on a word to see highlights
//   - Press Shift-Alt-F to format the document
//   - Notice the "var" warning below

var message = "Hello, world!";
console.log(message);

function greet(name) {
    const greeting = "Hello, " + name + "!";
    console.log(greeting);
    return greeting;
}

const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
    console.log(doubled);

const result = Math.floor(Math.random() * 100);
document.title = "Result: " + result;

fetch("https://example.com/api")
    .then(response => response.json())
  .then(data => console.log(data));
`;

const view = new EditorView({
    doc,
    parent: document.getElementById('editor'),
    extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        panels(),
        keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            indentWithTab,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            ...lintKeymap,
            { key: 'Shift-Alt-f', run: formatDocument },
            { key: 'F2', run: renameSymbol },
        ]),
        EditorState.tabSize.of(4),
        javascript(),
        languageServerWithTransport({
            transport,
            rootUri: 'file:///',
            workspaceFolders: null,
            documentUri: 'file:///demo.js',
            languageId: 'javascript',
            allowHTMLContent: true,
        }),
    ],
});
