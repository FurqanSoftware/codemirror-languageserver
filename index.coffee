import { RequestManager, Client, WebSocketTransport } from '@open-rpc/client-js'
import { Facet } from "@codemirror/state"
import { EditorView, ViewPlugin, themeClass } from "@codemirror/view"
import { linter } from '@codemirror/lint'
import { showTooltip, hoverTooltip } from '@codemirror/tooltip'
import { autocompletion } from '@codemirror/autocomplete'
import { Deferred } from 'promise.coffee'

serverUri = Facet.define
	combine: (values) => values.reduce ((_, v) => v), ''

rootUri = Facet.define
	combine: (values) => values.reduce ((_, v) => v), ''

documentUri = Facet.define
	combine: (values) => values.reduce ((_, v) => v), ''

languageId = Facet.define
	combine: (values) => values.reduce ((_, v) => v), ''

class LanguageServerPlugin
	constructor: (@view) ->
		@rootUri = @view.state.facet rootUri
		@documentUri = @view.state.facet documentUri
		@languageId = @view.state.facet languageId
		@documentVersion = 0
		@transport = new WebSocketTransport @view.state.facet serverUri
		@requestManager = new RequestManager [@transport]
		@client = new Client @requestManager
		@client.onNotification => @processNotification arguments...
		@initialize
			documentText: @view.state.doc.toString()

	update: ({view, state, docChanged}) ->
		return null

	destroy: ->
		@client.close()

	initialize: ({documentText}) ->
		@client?.request
			method: 'initialize',
			params:
				capabilities:
					textDocument:
						hover:
							dynamicRegistration: true
							contentFormat: ['plaintext', 'markdown']
						synchronization:
							dynamicRegistration: true
							willSave: false
							didSave: false
							willSaveWaitUntil: false
						completion:
							dynamicRegistration: true
							completionItem:
								snippetSupport: false
								commitCharactersSupport: true
								documentationFormat: ['plaintext', 'markdown']
								deprecatedSupport: false
								preselectSupport: false
							contextSupport: false
						signatureHelp:
							dynamicRegistration: true
							signatureInformation:
								documentationFormat: ['plaintext', 'markdown']
						declaration:
							dynamicRegistration: true
							linkSupport: true
						definition:
							dynamicRegistration: true
							linkSupport: true
						typeDefinition:
							dynamicRegistration: true
							linkSupport: true
						implementation:
							dynamicRegistration: true
							linkSupport: true
					workspace:
						didChangeConfiguration:
							dynamicRegistration: true
				initializationOptions: null
				processId: null
				rootUri: @rootUri
				workspaceFolders: [
					name: 'root'
					uri: @rootUri
				]
		.then ({@capabilities, serverInfo}) =>
			@client?.notify
				method: 'initialized'
				params: {}
			@client?.notify
				method: 'textDocument/didOpen'
				params:
					textDocument:
						uri: @documentUri
						languageId: @languageId
						text: documentText
						version: @documentVersion
			@ready = yes
			if @sendOnReady
				@sendOnReady = no
				@sendChange
					documentText: documentText

	sendChange: ({documentText}) ->
		if not @ready
			@sendOnReady = yes
			return
		try
			@client?.notify
				method: 'textDocument/didChange'
				params:
					textDocument:
						uri: @documentUri,
						version: @documentVersion++,
					contentChanges: [
						text: documentText
					]
		catch e
			console.error e

	requestDiagnostics: (view) ->
		@diagnosticsVersion = @documentVersion
		@sendChange
			documentText: view.state.doc.toString()
		deffered = new Deferred
		@diagnosticsDeferred?.resolve []
		@diagnosticsDeferred = deffered
		return deffered.promise

	requestHoverTooltip: (view, {line, character}) ->
		if not @ready or not @capabilities.hoverProvider
			return null
		@sendChange
			documentText: view.state.doc.toString()
		@client?.request
			method: 'textDocument/hover'
			params:
				textDocument:
					uri: @documentUri
				position:
					line: line
					character: character
		.then (result) =>
			if not result
				@view.dispatch
					reconfigure:
						hoverTooltip: []
				return
			{contents, range} = result
			pos = posToOffset view.state.doc,
				line: line
				character: character
			end = undefined
			if range
				pos = posToOffset(view.state.doc, range.start)
				end = posToOffset(view.state.doc, range.end)
			@view.dispatch
				reconfigure:
					hoverTooltip: showTooltip.of
						pos: pos
						end: end
						create: (view) ->
							el = document.createElement 'div'
							el.textContent = formatContents contents
							return
								dom: el
						style: 'documentation'
						above: yes
			return
		return null

	requestCompletion: (context, {line, character}, {triggerKind, triggerCharacter}) ->
		if not @ready or not @capabilities.completionProvider
			return null
		@sendChange
			documentText: context.state.doc.toString()
		return @client?.request
			method: 'textDocument/completion'
			params:
				textDocument:
					uri: @documentUri
				position:
					line: line
					character: character
				context:
					triggerKind: triggerKind
					triggerCharacter: triggerCharacter
		.then (result) =>
			if not result
				return null
			options = result.items.map ({detail, label, kind, textEdit, documentation, sortText, filterText}) =>
				completion = 
					label: label
					detail: detail
					apply: label
					type: {
						1: 'text'
						2: 'method'
						3: 'function'
						# 4: Constructor
						# 5: Field
						6: 'variable'
						7: 'class'
						8: 'interface'
						# 9: Module
						10: 'property'
						# 11: Unit
						# 12: Value
						13: 'enum'
						14: 'keyword'
						# 15: Snippet
						# 16: Color
						# 17: File
						# 18: Reference
						# 19: Folder
						# 20: EnumMember
						21: 'constant'
						# 22: Struct
						# 23: Event
						# 24: Operator
						# 25: TypeParameter
					}[kind]
					sortText: label
					filterText: label
				if textEdit
					completion.apply = textEdit.newText
				if documentation
					completion.info = formatContents documentation
				if sortText
					completion.sortText = sortText
				if filterText
					completion.filterText = filterText
				return completion
			[span, match] = prefixMatch options
			token = context.matchBefore match
			pos = context.pos
			if token
				pos = token.from
				word = token.text.toLowerCase()
				if /^\w+$/.test word
					options = options.filter ({filterText}) => filterText.toLowerCase().indexOf(word) is 0
					options = options.sort (a, b) =>
						switch true
							when a.apply.indexOf(token.text) is 0 and b.apply.indexOf(token.text) isnt 0
								return -1
							when a.apply.indexOf(token.text) isnt 0 and b.apply.indexOf(token.text) is 0
								return 1
							else
								return 0
			return
				'from': pos
				options: options

	processNotification: ({method}) ->
		try
			switch method
				when 'textDocument/publishDiagnostics'
					@processDiagnostics arguments...
			return
		catch e
			console.error e

	processDiagnostics: ({params}) ->
		if @documentVersion > @diagnosticsVersion + 1
			return
		annotations = params.diagnostics.map ({range, message, severity}) =>
			'from': posToOffset(@view.state.doc, range.start)
			to: posToOffset(@view.state.doc, range.end)
			severity: {
				1: 'error'
				2: 'warning'
				3: 'info'
				4: 'info'
			}[severity]
			message: message
		annotations.sort (a, b) =>
			switch true
				when a.from < b.from
					-1
				when a.from > b.from
					1
				else
					0 
		@diagnosticsDeferred?.resolve annotations

	clearTooltip: ->
		@view.dispatch
				reconfigure:
					hoverTooltip: []

export languageServer = (options) ->
	plugin = null
	[
		serverUri.of(options.serverUri),
		rootUri.of(options.rootUri),
		documentUri.of(options.documentUri),
		languageId.of(options.languageId),
		(ViewPlugin.define (view) =>
			plugin = new LanguageServerPlugin view
			return plugin
		,
			eventHandlers:
				keyup: -> @clearTooltip()
				click: -> @clearTooltip()),
		(linter (view) => plugin?.requestDiagnostics(view)),
		(hoverTooltip (view, pos, side) =>
			return plugin?.requestHoverTooltip view, offsetToPos(view.state.doc, pos)),
		(autocompletion
			override: [
				(context) =>
					if not plugin?
						return null
					{state, pos, explicit} = context
					line = state.doc.lineAt pos
					trigKind = 1 # Invoked
					trigChar = undefined
					if not explicit and plugin.capabilities?.completionProvider?.triggerCharacters?.indexOf(line.text[pos - line.from - 1]) >= 0
						trigKind = 2 # TriggerCharacter
						trigChar = line.text[pos - line.from - 1]
					if trigKind is 1 and not context.matchBefore /\w+$/
						return null
					return plugin.requestCompletion context, offsetToPos(state.doc, pos),
						triggerKind: trigKind
						triggerCharacter: trigChar
			]),
		baseTheme
	]

posToOffset = (doc, pos) ->
	doc.line(pos.line + 1).from + pos.character

offsetToPos = (doc, offset) ->
	line = doc.lineAt(offset)
	return 
		line: line.number - 1
		character: offset - line.from

formatContents = (contents) ->
	if Array.isArray contents
		text = ''
		for c in contents
			text += formatContents(c) + '\n\n'
		return text
	else if typeof contents is 'string'
		return contents
	else
		return contents.value

toSet = (chars) ->
	preamble = ""
	flat = Object.keys(chars).join('')
	words = /\w/.test(flat)
	if words
		preamble += "\\w"
		flat = flat.replace(/\w/g, '')
	return "[#{preamble}#{flat.replace(/[^\w\s]/g, '\\$&')}]"

prefixMatch = (options) ->
	first = {}
	rest = {}
	for {apply} in options
		first[apply[0]] = true
		for i in [1 ... apply.length ]
			rest[apply[i]] = true
	source = toSet(first) + toSet(rest) + "*$"
	return [new RegExp("^" + source), new RegExp(source)]

baseTheme = EditorView.baseTheme
	'$tooltip.documentation':
		display: 'block'
		marginLeft: '0'
		padding: '3px 6px 3px 8px'
		borderLeft: '5px solid #999'
		whiteSpace: 'pre'

	'$tooltip.lint':
		whiteSpace: 'pre'