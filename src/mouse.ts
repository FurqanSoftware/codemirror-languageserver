import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { jumpToDefinitionPos, jumpToTypeDefinitionPos } from './definition';

export const mouseHandler = (): Extension =>
    EditorView.domEventHandlers({
        mousedown: (event, view) => {
            if (!event.ctrlKey && !event.metaKey) return;
            const pos = view.posAtCoords({
                x: event.clientX,
                y: event.clientY,
            });
            const ok = (
                event.shiftKey
                    ? jumpToTypeDefinitionPos(pos)
                    : jumpToDefinitionPos(pos)
            )(view);
            if (ok) event.preventDefault();
        },
    });
