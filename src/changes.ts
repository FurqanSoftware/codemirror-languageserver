import type { Text, ChangeSet } from '@codemirror/state';
import type * as LSP from 'vscode-languageserver-protocol';
import { offsetToPos, posToOffset } from './pos';

export function changeSetToEvents(
    doc: Text,
    changes: ChangeSet,
): LSP.TextDocumentContentChangeEvent[] {
    const events: LSP.TextDocumentContentChangeEvent[] = [];

    changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
        events.push({
            range: {
                start: offsetToPos(doc, fromA),
                end: offsetToPos(doc, toA),
            },
            text: inserted.toString(),
        });
    });

    events.sort((a, b) => {
        if (!('range' in a)) return 1;
        if (!('range' in b)) return -1;
        return (
            posToOffset(doc, b.range.start) - posToOffset(doc, a.range.start)
        );
    });

    return events;
}
