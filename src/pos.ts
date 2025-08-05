import type { Text } from '@codemirror/state';

export function posToOffset(
    doc: Text,
    pos: { line: number; character: number },
) {
    if (pos.line >= doc.lines) {
        return;
    }
    const offset = doc.line(pos.line + 1).from + pos.character;
    if (offset > doc.length) {
        return;
    }
    return offset;
}

export function offsetToPos(doc: Text, offset: number) {
    const line = doc.lineAt(offset);
    return {
        character: offset - line.from,
        line: line.number - 1,
    };
}
