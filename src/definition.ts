import { EditorView, Command, KeyBinding } from '@codemirror/view';
import { languageServerPlugin } from './plugin';
import { offsetToPos } from './pos';

function requestDefinition(view: EditorView, pos: number): boolean {
    const plugin = view.plugin(languageServerPlugin);
    if (!plugin) return false;
    plugin.requestDefinition(view, offsetToPos(view.state.doc, pos));
    return true;
}

function requestDeclaration(view: EditorView, pos: number): boolean {
    const plugin = view.plugin(languageServerPlugin);
    if (!plugin) return false;
    plugin.requestDeclaration(view, offsetToPos(view.state.doc, pos));
    return true;
}

function requestTypeDefinition(view: EditorView, pos: number): boolean {
    const plugin = view.plugin(languageServerPlugin);
    if (!plugin) return false;
    plugin.requestTypeDefinition(view, offsetToPos(view.state.doc, pos));
    return true;
}

export const jumpToDefinition: Command = (view: EditorView): boolean =>
    requestDefinition(view, view.state.selection.main.head);

export const jumpToDefinitionPos =
    (pos: number): Command =>
    (view: EditorView): boolean =>
        requestDefinition(view, pos);

export const jumpToDeclaration: Command = (view: EditorView): boolean =>
    requestDeclaration(view, view.state.selection.main.head);

export const jumpToDeclarationPos =
    (pos: number): Command =>
    (view: EditorView): boolean =>
        requestDeclaration(view, pos);

export const jumpToTypeDefinition: Command = (view: EditorView): boolean =>
    requestTypeDefinition(view, view.state.selection.main.head);

export const jumpToTypeDefinitionPos =
    (pos: number): Command =>
    (view: EditorView): boolean =>
        requestTypeDefinition(view, pos);

export const jumpToDefinitionKeymap: readonly KeyBinding[] = [
    { key: 'F12', run: jumpToDefinition, preventDefault: true },
    { key: 'Mod-F12', run: jumpToTypeDefinition, preventDefault: true },
];
