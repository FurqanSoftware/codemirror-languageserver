import { EditorView, Command, KeyBinding } from '@codemirror/view';
import { languageServerPlugin } from './plugin';
import { offsetToPos } from './pos';

function jumpTo(view: EditorView, pos: number): boolean {
    const plugin = view.plugin(languageServerPlugin);
    if (!plugin) return false;
    plugin.requestDefinition(view, offsetToPos(view.state.doc, pos));
    return true;
}

export const jumpToDefinition: Command = (view: EditorView): boolean =>
    jumpTo(view, view.state.selection.main.head);

export const jumpToDefinitionPos =
    (pos: number): Command =>
    (view: EditorView): boolean =>
        jumpTo(view, pos);

export const jumpToDefinitionKeymap: readonly KeyBinding[] = [
    { key: 'F12', run: jumpToDefinition, preventDefault: true },
];
