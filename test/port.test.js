import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { EditorState } from '@codemirror/state';
import {
    LanguageServerClient,
    languageServerPlugin,
    languageServerWithTransport,
    SynchronizationMethod,
} from '../dist/index.js';
import {
    documentPrefix,
    documentSuffix,
    fullDocument,
    isEditableRange,
    offsetToPos,
    posToOffset,
} from '../src/pos.ts';

test('hidden context is included and positions map to the editable fragment', () => {
    const state = EditorState.create({
        doc: 'foo\nbar',
        extensions: [
            documentPrefix.of('prefix\n> '),
            documentSuffix.of('\nsuffix'),
        ],
    });

    assert.equal(fullDocument(state).toString(), 'prefix\n> foo\nbar\nsuffix');
    assert.deepEqual(offsetToPos(state, 0), { line: 1, character: 2 });
    assert.deepEqual(offsetToPos(state, 4), { line: 2, character: 0 });
    assert.equal(posToOffset(state, { line: 0, character: 2 }), 0);
    assert.equal(posToOffset(state, { line: 3, character: 1 }), 7);
    assert.equal(
        isEditableRange(state, {
            start: { line: 1, character: 2 },
            end: { line: 2, character: 3 },
        }),
        true,
    );
    assert.equal(
        isEditableRange(state, {
            start: { line: 1, character: 1 },
            end: { line: 1, character: 3 },
        }),
        false,
    );
    assert.equal(
        isEditableRange(state, {
            start: { line: 2, character: 2 },
            end: { line: 3, character: 0 },
        }),
        false,
    );
});

async function harness(synchronizationMethod = SynchronizationMethod.Full) {
    const opened = [];
    const changes = [];
    const client = {
        ready: true,
        initializePromise: Promise.resolve(),
        capabilities: { hoverProvider: true, completionProvider: {} },
        attachPlugin() {},
        detachPlugin() {},
        async textDocumentDidOpen(params) {
            opened.push(params);
        },
        async textDocumentDidChange(params) {
            changes.push(params);
        },
        async textDocumentHover() {
            return { contents: '' };
        },
    };
    const options = {
        client,
        documentUri: 'file:///expression',
        languageId: 'text',
        prefix: 'let x = ',
        suffix: ';',
        synchronizationMethod,
    };
    const view = {
        state: EditorState.create({
            doc: 'foo',
            extensions: languageServerWithTransport(options),
        }),
        dispatch(transaction) {
            this.state = transaction.state;
        },
    };
    const plugin = languageServerPlugin.create(view, options);
    await setImmediate();
    return { client, plugin, view, opened, changes };
}

for (const mode of [
    SynchronizationMethod.Full,
    SynchronizationMethod.Incremental,
]) {
    test(`open and ${mode} changes include hidden context without redundant updates`, async () => {
        const { plugin, view, opened, changes } = await harness(mode);
        assert.equal(opened[0].textDocument.text, 'let x = foo;');
        plugin.requestDiagnostics(view);
        assert.equal(changes.length, 0);

        const transaction = view.state.update({
            changes: { from: 1, to: 2, insert: 'a' },
        });
        view.state = transaction.state;
        plugin.update({
            state: transaction.state,
            startState: transaction.startState,
            changes: transaction.changes,
            docChanged: transaction.docChanged,
        });
        assert.equal(changes.length, 1);
        if (mode === SynchronizationMethod.Full) {
            assert.deepEqual(changes[0].contentChanges, [
                { text: 'let x = fao;' },
            ]);
        } else {
            assert.deepEqual(changes[0].contentChanges, [
                {
                    range: {
                        start: { line: 0, character: 9 },
                        end: { line: 0, character: 10 },
                    },
                    text: 'a',
                },
            ]);
        }
        plugin.requestDiagnostics(view);
        assert.equal(changes.length, 1);
    });
}

test('empty hover does not create a tooltip or send a document change', async () => {
    const { plugin, view, changes } = await harness();
    assert.equal(
        await plugin.requestHoverTooltip(view, { line: 0, character: 8 }),
        null,
    );
    assert.equal(changes.length, 0);
});

test('completion uses the server edit range rather than label matching', async () => {
    const { client, plugin, view } = await harness();
    client.textDocumentCompletion = async () => [
        {
            label: 'suggestion',
            textEdit: {
                range: {
                    start: { line: 0, character: 8 },
                    end: { line: 0, character: 11 },
                },
                newText: 'bar',
            },
        },
        { label: 'other' },
    ];
    const result = await plugin.requestCompletion(
        { state: view.state, pos: 3 },
        { line: 0, character: 11 },
        { triggerKind: 1 },
    );
    assert.deepEqual(
        result.options.map((option) => option.label),
        ['suggestion'],
    );
    result.options[0].apply(view, result.options[0], 3, 3);
    assert.equal(view.state.doc.toString(), 'bar');
});

test('completion refuses edits into hidden context', async () => {
    const { client, plugin, view } = await harness();
    client.textDocumentCompletion = async () => [
        {
            label: 'suggestion',
            textEdit: {
                range: {
                    start: { line: 0, character: 7 },
                    end: { line: 0, character: 11 },
                },
                newText: 'bar',
            },
        },
    ];
    const result = await plugin.requestCompletion(
        { state: view.state, pos: 3 },
        { line: 0, character: 11 },
        { triggerKind: 1 },
    );
    const originalError = console.error;
    const errors = [];
    console.error = (message) => errors.push(message);
    try {
        result.options[0].apply(view, result.options[0], 3, 3);
    } finally {
        console.error = originalError;
    }
    assert.equal(view.state.doc.toString(), 'foo');
    assert.deepEqual(errors, [
        'Cannot apply completion outside the editable document',
    ]);
});

test('client can send a didClose notification', async () => {
    const messages = [];
    let onMessage;
    const transport = {
        onMessage(callback) {
            onMessage = callback;
        },
        onClose() {},
        onError() {},
        close() {},
        send(raw) {
            const message = JSON.parse(raw);
            messages.push(message);
            if (message.method === 'initialize') {
                queueMicrotask(() =>
                    onMessage(
                        JSON.stringify({
                            jsonrpc: '2.0',
                            id: message.id,
                            result: { capabilities: {} },
                        }),
                    ),
                );
            }
        },
    };
    class CustomizedClient extends LanguageServerClient {
        getInitializationOptions() {
            return { ...super.getInitializationOptions(), processId: 42 };
        }
    }
    const client = new CustomizedClient({
        transport,
        rootUri: null,
        workspaceFolders: null,
    });
    await client.initializePromise;
    assert.equal(messages[0].params.processId, 42);
    await client.textDocumentDidClose({
        textDocument: { uri: 'file:///expression' },
    });
    assert.deepEqual(messages.at(-1), {
        jsonrpc: '2.0',
        method: 'textDocument/didClose',
        params: { textDocument: { uri: 'file:///expression' } },
    });
    client.close();
});
