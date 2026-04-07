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

/** Command: jump to the definition of the symbol at the cursor. */
export const jumpToDefinition: Command = (view: EditorView): boolean =>
    requestDefinition(view, view.state.selection.main.head);

/** Returns a command that jumps to the definition of the symbol at `pos`. */
export const jumpToDefinitionPos =
    (pos: number): Command =>
    (view: EditorView): boolean =>
        requestDefinition(view, pos);

/** Command: jump to the declaration of the symbol at the cursor. */
export const jumpToDeclaration: Command = (view: EditorView): boolean =>
    requestDeclaration(view, view.state.selection.main.head);

/** Returns a command that jumps to the declaration of the symbol at `pos`. */
export const jumpToDeclarationPos =
    (pos: number): Command =>
    (view: EditorView): boolean =>
        requestDeclaration(view, pos);

/** Command: jump to the type definition of the symbol at the cursor. */
export const jumpToTypeDefinition: Command = (view: EditorView): boolean =>
    requestTypeDefinition(view, view.state.selection.main.head);

/** Returns a command that jumps to the type definition of the symbol at `pos`. */
export const jumpToTypeDefinitionPos =
    (pos: number): Command =>
    (view: EditorView): boolean =>
        requestTypeDefinition(view, pos);

/**
 * Default keymap for go-to-definition commands.
 *
 * - `F12` — jump to definition
 * - `Mod-F12` — jump to type definition
 */
export const jumpToDefinitionKeymap: readonly KeyBinding[] = [
    { key: 'F12', run: jumpToDefinition, preventDefault: true },
    { key: 'Mod-F12', run: jumpToTypeDefinition, preventDefault: true },
];
