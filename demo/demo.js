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
import { languageServer } from '../src';

const tabSizeCompartment = new Compartment();

const doc = `#include <iostream>

using namespace std;

class Animal {
	public:
		void say(string call) {
			cout << call << endl;
		}
};

class Cat : Animal {
	public:
		void meow() {
			this->say("meow");
		}
};

int main() {
	Cat cat;
	cat.meow();
	return 0;
}
`

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
    ],
});
