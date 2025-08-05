import { Extension } from '@codemirror/state';
import { autocompletion as cmAutocompletion } from '@codemirror/autocomplete';
import { CompletionTriggerKind } from 'vscode-languageserver-protocol';
import { languageServerPlugin } from './plugin';
import { offsetToPos } from './pos';

export const autocompletion = (): Extension =>
    cmAutocompletion({
        override: [
            async (context) => {
                const { state, pos, explicit, view } = context;

                const plugin = view.plugin(languageServerPlugin);
                if (plugin == null) return null;

                const line = state.doc.lineAt(pos);
                let trigKind: CompletionTriggerKind =
                    CompletionTriggerKind.Invoked;
                let trigChar: string | undefined;
                if (
                    !explicit &&
                    plugin.client.capabilities?.completionProvider?.triggerCharacters?.includes(
                        line.text[pos - line.from - 1],
                    )
                ) {
                    trigKind = CompletionTriggerKind.TriggerCharacter;
                    trigChar = line.text[pos - line.from - 1];
                }
                if (
                    trigKind === CompletionTriggerKind.Invoked &&
                    !context.matchBefore(/\w+$/)
                ) {
                    return null;
                }
                return await plugin.requestCompletion(
                    context,
                    offsetToPos(state.doc, pos),
                    {
                        triggerCharacter: trigChar,
                        triggerKind: trigKind,
                    },
                );
            },
        ],
    });
