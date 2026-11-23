import type { EditorState, ChangeSet } from '@codemirror/state';
import type * as LSP from 'vscode-languageserver-protocol';
import { offsetToPos, posToOffset } from './pos.js';

export function changeSetToEvents(
    state: EditorState,
    changes: ChangeSet,
): LSP.TextDocumentContentChangeEvent[] {
    const events: LSP.TextDocumentContentChangeEvent[] = [];

    changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
        events.push({
            range: {
                start: offsetToPos(state, fromA),
                end: offsetToPos(state, toA),
            },
            text: inserted.toString(),
        });
    });

    events.sort((a, b) => {
        if (!('range' in a)) return 1;
        if (!('range' in b)) return -1;
        return (
            posToOffset(state, b.range.start) -
            posToOffset(state, a.range.start)
        );
    });

    return events;
}
