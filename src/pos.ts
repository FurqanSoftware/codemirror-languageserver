import { EditorState, Facet, Text } from '@codemirror/state';

export const documentPrefix = Facet.define<string, string>({
    combine: (values) => values[0] ?? '',
});
export const documentSuffix = Facet.define<string, string>({
    combine: (values) => values[0] ?? '',
});

export function fullDocument(state: EditorState): Text {
    return Text.of(state.facet(documentPrefix).split('\n'))
        .append(state.doc)
        .append(Text.of(state.facet(documentSuffix).split('\n')));
}

export function isEditableRange(
    state: EditorState,
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    },
): boolean {
    const doc = fullDocument(state);
    const toAbsoluteOffset = (pos: { line: number; character: number }) => {
        if (pos.line < 0 || pos.line >= doc.lines || pos.character < 0) return;
        const line = doc.line(pos.line + 1);
        if (pos.character > line.length) return;
        return line.from + pos.character;
    };
    const start = toAbsoluteOffset(range.start);
    const end = toAbsoluteOffset(range.end);
    const prefixLength = state.facet(documentPrefix).length;
    return (
        start !== undefined &&
        end !== undefined &&
        start >= prefixLength &&
        start <= end &&
        end <= prefixLength + state.doc.length
    );
}

export function posToOffset(
    document: Text | EditorState,
    pos: { line: number; character: number },
) {
    const state = document instanceof EditorState ? document : null;
    const prefix = state?.facet(documentPrefix) ?? '';
    const doc = state ? fullDocument(state) : (document as Text);
    if (pos.line >= doc.lines) {
        return;
    }
    const offset = doc.line(pos.line + 1).from + pos.character;
    if (offset > doc.length) {
        return;
    }
    return state
        ? Math.max(0, Math.min(state.doc.length, offset - prefix.length))
        : offset;
}

export function offsetToPos(document: Text | EditorState, offset: number) {
    const state = document instanceof EditorState ? document : null;
    const doc = state ? fullDocument(state) : (document as Text);
    const fullOffset = offset + (state?.facet(documentPrefix).length ?? 0);
    const line = doc.lineAt(fullOffset);
    return {
        character: fullOffset - line.from,
        line: line.number - 1,
    };
}
