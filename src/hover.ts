import type { Tooltip } from '@codemirror/view';
import { hoverTooltip as cmHoverTooltip } from '@codemirror/view';
import { languageServerPlugin } from './plugin';
import { offsetToPos } from './pos';
import { Extension } from '@codemirror/state';

export const hoverTooltip = (): Extension =>
    cmHoverTooltip((view, pos): Promise<Tooltip | null> => {
        const plugin = view.plugin(languageServerPlugin);
        return (
            plugin?.requestHoverTooltip(
                view,
                offsetToPos(view.state.doc, pos),
            ) ?? null
        );
    });
