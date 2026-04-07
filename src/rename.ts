import { StateEffect, StateField } from '@codemirror/state';
import { EditorView, showPanel, Panel } from '@codemirror/view';
import type * as LSP from 'vscode-languageserver-protocol';

import { languageServerPlugin } from './plugin';
import { offsetToPos, posToOffset } from './pos';

const openRenamePanel = StateEffect.define<string>();
const closeRenamePanel = StateEffect.define<null>();

const renamePanelState = StateField.define<string | null>({
    create() {
        return null;
    },
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(openRenamePanel)) return effect.value;
            if (effect.is(closeRenamePanel)) return null;
        }
        return value;
    },
    provide: (field) =>
        showPanel.from(field, (value) =>
            value != null ? (view) => createRenamePanel(view, value) : null,
        ),
});

function applyWorkspaceEdit(view: EditorView, edit: LSP.WorkspaceEdit) {
    const plugin = view.plugin(languageServerPlugin);
    if (!plugin) return;

    const changes: { from: number; to: number; insert: string }[] = [];

    if (edit.changes) {
        const edits = edit.changes[plugin.documentUri];
        if (edits) {
            for (const e of edits) {
                changes.push({
                    from: posToOffset(view.state.doc, e.range.start),
                    to: posToOffset(view.state.doc, e.range.end),
                    insert: e.newText,
                });
            }
        }
    }

    if (edit.documentChanges) {
        for (const change of edit.documentChanges) {
            if ('textDocument' in change) {
                if (change.textDocument.uri !== plugin.documentUri) continue;
                for (const e of change.edits) {
                    if ('range' in e) {
                        changes.push({
                            from: posToOffset(view.state.doc, e.range.start),
                            to: posToOffset(view.state.doc, e.range.end),
                            insert: e.newText,
                        });
                    }
                }
            }
        }
    }

    if (changes.length > 0) {
        view.dispatch(view.state.update({ changes }));
    }
}

function createRenamePanel(view: EditorView, placeholder: string): Panel {
    const dom = document.createElement('div');
    dom.className = 'cm-lsp-rename-panel';

    const input = document.createElement('input');
    input.className = 'cm-lsp-rename-input';
    input.value = placeholder;
    input.setAttribute('aria-label', 'New name');

    const submit = () => {
        const newName = input.value.trim();
        if (!newName || newName === placeholder) {
            view.dispatch({ effects: closeRenamePanel.of(null) });
            view.focus();
            return;
        }
        performRename(view, newName);
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            view.dispatch({ effects: closeRenamePanel.of(null) });
            view.focus();
        }
    });

    dom.appendChild(input);

    return {
        dom,
        top: true,
        mount() {
            input.select();
        },
    };
}

async function performRename(view: EditorView, newName: string) {
    const plugin = view.plugin(languageServerPlugin);
    if (!plugin) return;

    const pos = view.state.selection.main.head;

    view.dispatch({ effects: closeRenamePanel.of(null) });
    view.focus();

    const result = await plugin.client.textDocumentRename({
        textDocument: { uri: plugin.documentUri },
        position: offsetToPos(view.state.doc, pos),
        newName,
    });

    if (result) {
        applyWorkspaceEdit(view, result);
    }
}

/**
 * Command: open a rename prompt for the symbol at the cursor.
 *
 * Uses `textDocument/prepareRename` to pre-fill the current name if supported
 * by the server. Press Enter to confirm or Escape to cancel.
 */
export function renameSymbol(view: EditorView): boolean {
    const plugin = view.plugin(languageServerPlugin);
    if (!plugin) return false;

    if (
        !plugin.client.ready ||
        !plugin.client.capabilities?.renameProvider
    ) {
        return false;
    }

    const pos = view.state.selection.main.head;
    const capabilities = plugin.client.capabilities;
    const renameProvider = capabilities.renameProvider;
    const supportsPrepare =
        typeof renameProvider === 'object' && renameProvider.prepareProvider;

    if (supportsPrepare) {
        plugin.client
            .textDocumentPrepareRename({
                textDocument: { uri: plugin.documentUri },
                position: offsetToPos(view.state.doc, pos),
            })
            .then((result) => {
                if (!result) return;
                const placeholder =
                    'placeholder' in result
                        ? result.placeholder
                        : view.state.doc.sliceString(
                              posToOffset(view.state.doc, result.start),
                              posToOffset(view.state.doc, result.end),
                          );
                view.dispatch({
                    effects: openRenamePanel.of(placeholder),
                });
            });
    } else {
        const word = view.state.wordAt(pos);
        const placeholder = word
            ? view.state.doc.sliceString(word.from, word.to)
            : '';
        view.dispatch({ effects: openRenamePanel.of(placeholder) });
    }

    return true;
}

export const renameExtension = () => renamePanelState;
