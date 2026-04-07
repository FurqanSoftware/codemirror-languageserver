import { Extension, StateField } from '@codemirror/state';
import {
    Decoration,
    DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
} from '@codemirror/view';
import { DocumentHighlightKind } from 'vscode-languageserver-protocol';

import { languageServerPlugin } from './plugin';
import { offsetToPos, posToOffset } from './pos';

const highlightField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(decorations, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setHighlightsEffect)) {
                return effect.value;
            }
        }
        if (tr.docChanged) {
            return Decoration.none;
        }
        return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
});

import { StateEffect } from '@codemirror/state';

const setHighlightsEffect = StateEffect.define<DecorationSet>();

const textDecoration = Decoration.mark({
    class: 'cm-lsp-highlight-text',
});
const readDecoration = Decoration.mark({
    class: 'cm-lsp-highlight-read',
});
const writeDecoration = Decoration.mark({
    class: 'cm-lsp-highlight-write',
});

function decorationForKind(kind?: DocumentHighlightKind) {
    switch (kind) {
        case DocumentHighlightKind.Read:
            return readDecoration;
        case DocumentHighlightKind.Write:
            return writeDecoration;
        default:
            return textDecoration;
    }
}

const highlightPlugin = ViewPlugin.fromClass(
    class {
        private pending: number = -1;

        update(update: ViewUpdate) {
            if (!update.selectionSet && !update.docChanged) {
                return;
            }

            if (update.docChanged) {
                return;
            }

            clearTimeout(this.pending);
            this.pending = setTimeout(
                () => this.requestHighlights(update.view),
                100,
            ) as any;
        }

        async requestHighlights(view: EditorView) {
            const plugin = view.plugin(languageServerPlugin);
            if (!plugin) return;

            const { state } = view;
            const pos = state.selection.main.head;

            if (
                !plugin.client.ready ||
                !plugin.client.capabilities?.documentHighlightProvider
            ) {
                view.dispatch({ effects: setHighlightsEffect.of(Decoration.none) });
                return;
            }

            const result =
                await plugin.client.textDocumentDocumentHighlight({
                    textDocument: { uri: plugin.documentUri },
                    position: offsetToPos(state.doc, pos),
                });

            if (view.state.selection.main.head !== pos) {
                return;
            }

            if (!result || result.length === 0) {
                view.dispatch({ effects: setHighlightsEffect.of(Decoration.none) });
                return;
            }

            const decorations = result
                .map((highlight) => {
                    const from = posToOffset(
                        view.state.doc,
                        highlight.range.start,
                    );
                    const to = posToOffset(
                        view.state.doc,
                        highlight.range.end,
                    );
                    if (from == null || to == null) return null;
                    return decorationForKind(highlight.kind).range(from, to);
                })
                .filter((d) => d != null)
                .sort((a, b) => a.from - b.from);

            view.dispatch({
                effects: setHighlightsEffect.of(Decoration.set(decorations)),
            });
        }

        destroy() {
            clearTimeout(this.pending);
        }
    },
);

export const documentHighlight = (): Extension => [
    highlightField,
    highlightPlugin,
];
