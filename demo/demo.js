import {
    EditorView,
    highlightSpecialChars,
    drawSelection,
    highlightActiveLine,
    keymap,
    lineNumbers,
    panels,
    rectangularSelection,
} from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import {
    indentOnInput,
    indentUnit,
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
import { cpp } from '@codemirror/lang-cpp';
import {
    languageServer,
    jumpToDefinitionKeymap,
    jumpToDefinitionPos,
} from '../src';

const tabSizeCompartment = new Compartment();

const view = new EditorView({
    doc: '#include <iostream>\n\nusing namespace std;\n\nint main() {\n\treturn 0;\n}\n',
    parent: document.getElementById('editor'),
    extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        indentUnit.of('\t'),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
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
        ]),
        tabSizeCompartment.of(EditorState.tabSize.of(4)),
        cpp(),
        languageServer({
            serverUri: 'ws://localhost:3000/?stack=clangd11',
            allowHTMLContent: true,
            rootUri: 'file:///demo',
            workspaceFolders: [
                {
                    name: 'root',
                    uri: 'file:///demo',
                },
            ],
            documentUri: `file:///demo/main.cpp`,
            languageId: 'cpp',
        }),
        EditorView.domEventHandlers({
            click: (event, view) => {
                if (!event.ctrlKey && !event.metaKey) return;
                const pos = view.posAtCoords({
                    x: event.clientX,
                    y: event.clientY,
                });
                const ok = jumpToDefinitionPos(pos)(view);
                if (ok) event.preventDefault();
            },
        }),
    ],
});
