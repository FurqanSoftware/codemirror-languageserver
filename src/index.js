import { autocompletion } from '@codemirror/autocomplete';
import { linter } from '@codemirror/lint';
import { Facet } from "@codemirror/state";
import { showTooltip, hoverTooltip } from '@codemirror/tooltip';
import { EditorView, ViewPlugin } from "@codemirror/view";
import { RequestManager, Client, WebSocketTransport } from '@open-rpc/client-js';

const serverUri = Facet.define({
	combine: (values) => values.reduce((_, v) => v, '')
});

const rootUri = Facet.define({
	combine: (values) => values.reduce((_, v) => v, '')
});

const documentUri = Facet.define({
	combine: (values) => values.reduce((_, v) => v, '')
});

const languageId = Facet.define({
	combine: (values) => values.reduce((_, v) => v, '')
});

class LanguageServerPlugin {
	constructor(view) {
		this.view = view;
		this.rootUri = this.view.state.facet(rootUri);
		this.documentUri = this.view.state.facet(documentUri);
		this.languageId = this.view.state.facet(languageId);
		this.documentVersion = 0;
		this.promises = [];
		this.transport = new WebSocketTransport(this.view.state.facet(serverUri));
		this.requestManager = new RequestManager([this.transport]);
		this.client = new Client(this.requestManager);
		this.client.onNotification((data) => { this.processNotification(data); });
		this.initialize({
			documentText: this.view.state.doc.toString()
		});
	}

	// update({view, state, docChanged}) {
	// 	return null;
	// }

	destroy() {
		return this.client.close();
	}

	initialize({documentText}) {
		this.client.request({
			method: 'initialize',
			params: {
				capabilities: {
					textDocument: {
						hover: {
							dynamicRegistration: true,
							contentFormat: ['plaintext', 'markdown']
						},
						synchronization: {
							dynamicRegistration: true,
							willSave: false,
							didSave: false,
							willSaveWaitUntil: false
						},
						completion: {
							dynamicRegistration: true,
							completionItem: {
								snippetSupport: false,
								commitCharactersSupport: true,
								documentationFormat: ['plaintext', 'markdown'],
								deprecatedSupport: false,
								preselectSupport: false
							},
							contextSupport: false
						},
						signatureHelp: {
							dynamicRegistration: true,
							signatureInformation: {
								documentationFormat: ['plaintext', 'markdown']
							}
						},
						declaration: {
							dynamicRegistration: true,
							linkSupport: true
						},
						definition: {
							dynamicRegistration: true,
							linkSupport: true
						},
						typeDefinition: {
							dynamicRegistration: true,
							linkSupport: true
						},
						implementation: {
							dynamicRegistration: true,
							linkSupport: true
						}
					},
					workspace: {
						didChangeConfiguration: {
							dynamicRegistration: true
						}
					}
				},
				initializationOptions: null,
				processId: null,
				rootUri: this.rootUri,
				workspaceFolders: [
					{
						name: 'root',
						uri: this.rootUri
					}
				]
			}
		}).then(({capabilities, serverInfo}) => {
			this.capabilities = capabilities;
			this.client.notify({
				method: 'initialized',
				params: {}
			});
			this.client.notify({
				method: 'textDocument/didOpen',
				params: {
					textDocument: {
						uri: this.documentUri,
						languageId: this.languageId,
						text: documentText,
						version: this.documentVersion
					}
				}
			});
			this.ready = true;
		});
	}

	sendChange({documentText}) {
		if (!this.ready) {
			return;
		}
		try {
			this.client.notify({
				method: 'textDocument/didChange',
				params: {
					textDocument: {
						uri: this.documentUri,
						version: this.documentVersion++
					},
					contentChanges: [
						{
							text: documentText
						}
					]
				}
			});
		} catch (e) {
			console.error(e);
		}
	}

	requestDiagnostics(view) {
		this.sendChange({
			documentText: view.state.doc.toString()
		});
		return new Promise((fulfill, reject) => {
			this.promises.push({
				type: 'diagnostics',
				fulfill: function() {
					return fulfill(...arguments);
				},
				reject: function() {
					return reject(...arguments);
				}
			});
		});
	}

	requestHoverTooltip(view, {line, character}) {
		if (!this.ready || !this.capabilities.hoverProvider) {
			return null;
		}
		this.sendChange({
			documentText: view.state.doc.toString()
		});
		this.client.request({
			method: 'textDocument/hover',
			params: {
				textDocument: {
					uri: this.documentUri
				},
				position: {
					line: line,
					character: character
				}
			}
		}).then((result) => {
			if (!result) {
				this.view.dispatch({
					reconfigure: {
						hoverTooltip: []
					}
				});
				return;
			}
			let {contents, range} = result;
			let pos = posToOffset(view.state.doc, {
				line: line,
				character: character
			});
			let end;
			if (range) {
				pos = posToOffset(view.state.doc, range.start);
				end = posToOffset(view.state.doc, range.end);
			}
			this.view.dispatch({
				reconfigure: {
					hoverTooltip: showTooltip.of({
						pos: pos,
						end: end,
						create: function(view) {
							let dom = document.createElement('div');
							dom.textContent = formatContents(contents);
							return {
								dom
							};
						},
						style: 'documentation',
						above: true
					})
				}
			});
		});
		return null;
	}

	requestCompletion(context, {line, character}, {triggerKind, triggerCharacter}) {
		if (!this.ready || !this.capabilities.completionProvider) {
			return null;
		}
		this.sendChange({
			documentText: context.state.doc.toString()
		});
		return this.client.request({
			method: 'textDocument/completion',
			params: {
				textDocument: {
					uri: this.documentUri
				},
				position: {
					line: line,
					character: character
				},
				context: {
					triggerKind: triggerKind,
					triggerCharacter: triggerCharacter
				}
			}
		}).then((result) => {
			if (!result) {
				return null;
			}
			let options = result.items.map(({detail, label, kind, textEdit, documentation, sortText, filterText}) => {
				var completion;
				completion = {
					label: label,
					detail: detail,
					apply: label,
					type: {
						1: 'text',
						2: 'method',
						3: 'function',
						// 4: Constructor
						// 5: Field
						6: 'variable',
						7: 'class',
						8: 'interface',
						// 9: Module
						10: 'property',
						// 11: Unit
						// 12: Value
						13: 'enum',
						14: 'keyword',
						// 15: Snippet
						// 16: Color
						// 17: File
						// 18: Reference
						// 19: Folder
						// 20: EnumMember
						21: 'constant'
					}[kind],
					sortText: label,
					filterText: label
				};
				if (textEdit) {
					completion.apply = textEdit.newText;
				}
				if (documentation) {
					completion.info = formatContents(documentation);
				}
				if (sortText) {
					completion.sortText = sortText;
				}
				if (filterText) {
					completion.filterText = filterText;
				}
				return completion;
			});
			let [span, match] = prefixMatch(options);
			let token = context.matchBefore(match);
			let pos = context.pos;
			if (token) {
				pos = token.from;
				let word = token.text.toLowerCase();
				if (/^\w+$/.test(word)) {
					options = options.filter(({filterText}) => {
						return filterText.toLowerCase().indexOf(word) === 0;
					});
					options = options.sort((a, b) => {
						switch (true) {
							case a.apply.indexOf(token.text) === 0 && b.apply.indexOf(token.text) !== 0:
								return -1;
							case a.apply.indexOf(token.text) !== 0 && b.apply.indexOf(token.text) === 0:
								return 1;
							default:
								return 0;
						}
					});
				}
			}
			return {
				from: pos,
				options: options
			};
		});
	}

	processNotification({method}) {
		var e;
		try {
			switch (method) {
				case 'textDocument/publishDiagnostics':
					this.processDiagnostics(...arguments);
			}
		} catch (error) {
			e = error;
			return console.error(e);
		}
	}

	processDiagnostics({params}) {
		let annotations = params.diagnostics.map(({range, message, severity}) => {
			return {
				from: posToOffset(this.view.state.doc, range.start),
				to: posToOffset(this.view.state.doc, range.end),
				severity: {
					1: 'error',
					2: 'warning',
					3: 'info',
					4: 'info'
				}[severity],
				message: message
			};
		});
		annotations.sort((a, b) => {
			switch (true) {
				case a.from < b.from:
					return -1;
				case a.from > b.from:
					return 1;
				default:
					return 0;
			}
		});
		this.promises = this.promises.filter((p) => {
			if (p.type === 'diagnostics') {
				p.fulfill(annotations);
				return false;
			} else {
				return true;
			}
		});
	}

	clearTooltip() {
		return this.view.dispatch({
			reconfigure: {
				hoverTooltip: []
			}
		});
	}

};

export function languageServer(options) {
	var plugin;
	return [
		serverUri.of(options.serverUri),
		rootUri.of(options.rootUri),
		documentUri.of(options.documentUri),
		languageId.of(options.languageId),
		ViewPlugin.define((view) => {
			plugin = new LanguageServerPlugin(view);
			return plugin;
		},
		{
			eventHandlers: {
				keyup: function() {
					return this.clearTooltip();
				},
				click: function() {
					return this.clearTooltip();
				}
			}
		}),
		linter((view) => {
			return plugin != null ? plugin.requestDiagnostics(view) : null;
		}),
		hoverTooltip((view, pos, side) => {
			return plugin != null ? plugin.requestHoverTooltip(view, offsetToPos(view.state.doc, pos)) : null;
		}),
		autocompletion({
			override: [
				(context) => {
					if (plugin == null) {
						return null;
					}
					let {state, pos, explicit} = context;
					let line = state.doc.lineAt(pos);
					let trigKind = 1; // Invoked
					let trigChar = void 0;
					if (!explicit &&
							plugin.capabilities &&
							plugin.capabilities.completionProvider &&
							plugin.capabilities.completionProvider.triggerCharacters &&
							plugin.capabilities.completionProvider.triggerCharacters.indexOf(line.text[pos - line.from - 1]) >= 0) {
						trigKind = 2; // TriggerCharacter
						trigChar = line.text[pos - line.from - 1];
					}
					if (trigKind === 1 && !context.matchBefore(/\w+$/)) {
						return null;
					}
					return plugin.requestCompletion(context, offsetToPos(state.doc, pos), {
						triggerKind: trigKind,
						triggerCharacter: trigChar
					});
				}
			]
		}),
		baseTheme
	];
};

function posToOffset(doc, pos) {
	return doc.line(pos.line + 1).from + pos.character;
};

function offsetToPos(doc, offset) {
	var line;
	line = doc.lineAt(offset);
	return {
		line: line.number - 1,
		character: offset - line.from
	};
};

function formatContents(contents) {
	var c, j, len, text;
	if (Array.isArray(contents)) {
		text = '';
		for (j = 0, len = contents.length; j < len; j++) {
			c = contents[j];
			text += formatContents(c) + '\n\n';
		}
		return text;
	} else if (typeof contents === 'string') {
		return contents;
	} else {
		return contents.value;
	}
};

function toSet(chars) {
	var flat, preamble, words;
	preamble = "";
	flat = Object.keys(chars).join('');
	words = /\w/.test(flat);
	if (words) {
		preamble += "\\w";
		flat = flat.replace(/\w/g, '');
	}
	return `[${preamble}${flat.replace(/[^\w\s]/g, '\\$&')}]`;
};

function prefixMatch(options) {
	var apply, first, i, j, k, len, ref, rest, source;
	first = {};
	rest = {};
	for (j = 0, len = options.length; j < len; j++) {
		({apply} = options[j]);
		first[apply[0]] = true;
		for (i = k = 1, ref = apply.length; (1 <= ref ? k < ref : k > ref); i = 1 <= ref ? ++k : --k) {
			rest[apply[i]] = true;
		}
	}
	source = toSet(first) + toSet(rest) + "*$";
	return [new RegExp("^" + source), new RegExp(source)];
};

const baseTheme = EditorView.baseTheme({
	'$tooltip.documentation': {
		display: 'block',
		marginLeft: '0',
		padding: '3px 6px 3px 8px',
		borderLeft: '5px solid #999',
		whiteSpace: 'pre'
	},
	'$tooltip.lint': {
		whiteSpace: 'pre'
	}
});
