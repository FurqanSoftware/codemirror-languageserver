import { Facet } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type * as LSP from 'vscode-languageserver-protocol';

import { languageServerPlugin } from './plugin';
import { offsetToPos, posToOffset } from './pos';

export const formattingOptions = Facet.define<
    LSP.FormattingOptions,
    LSP.FormattingOptions
>({
    combine(values) {
        return Object.assign(
            { tabSize: 4, insertSpaces: true },
            ...values,
        );
    },
});

function getFormattingOptions(view: EditorView): LSP.FormattingOptions {
    const opts = view.state.facet(formattingOptions);
    return {
        ...opts,
        tabSize: opts.tabSize ?? view.state.tabSize,
    };
}

function applyTextEdits(view: EditorView, edits: LSP.TextEdit[]) {
    const changes = edits.map((edit) => ({
        from: posToOffset(view.state.doc, edit.range.start),
        to: posToOffset(view.state.doc, edit.range.end),
        insert: edit.newText,
    }));
    view.dispatch(view.state.update({ changes }));
}

export function formatDocument(view: EditorView): boolean {
    const plugin = view.plugin(languageServerPlugin);
    if (!plugin) return false;

    if (
        !plugin.client.ready ||
        !plugin.client.capabilities?.documentFormattingProvider
    ) {
        return false;
    }

    plugin.client
        .textDocumentFormatting({
            textDocument: { uri: plugin.documentUri },
            options: getFormattingOptions(view),
        })
        .then((edits) => {
            if (edits && edits.length > 0) {
                applyTextEdits(view, edits);
            }
        });

    return true;
}

export function formatSelection(view: EditorView): boolean {
    const plugin = view.plugin(languageServerPlugin);
    if (!plugin) return false;

    if (
        !plugin.client.ready ||
        !plugin.client.capabilities?.documentRangeFormattingProvider
    ) {
        return false;
    }

    const { from, to } = view.state.selection.main;

    plugin.client
        .textDocumentRangeFormatting({
            textDocument: { uri: plugin.documentUri },
            range: {
                start: offsetToPos(view.state.doc, from),
                end: offsetToPos(view.state.doc, to),
            },
            options: getFormattingOptions(view),
        })
        .then((edits) => {
            if (edits && edits.length > 0) {
                applyTextEdits(view, edits);
            }
        });

    return true;
}
