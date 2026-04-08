function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var lspWorker$1 = {};

/**
 * Minimal LSP server for JavaScript, running in a Web Worker.
 *
 * Supports: completion, hover, diagnostics, document highlight, formatting.
 */

var hasRequiredLspWorker;

function requireLspWorker () {
	if (hasRequiredLspWorker) return lspWorker$1;
	hasRequiredLspWorker = 1;
	const documents = new Map();

	// --- Known globals and their members/docs ---

	const globalDocs = {
	    console: {
	        doc: 'The console object provides access to the browser debugging console.',
	        members: {
	            log: {
	                detail: 'console.log(...data: any[]): void',
	                doc: 'Outputs a message to the console.',
	            },
	            error: {
	                detail: 'console.error(...data: any[]): void',
	                doc: 'Outputs an error message to the console.',
	            },
	            warn: {
	                detail: 'console.warn(...data: any[]): void',
	                doc: 'Outputs a warning message to the console.',
	            },
	            info: {
	                detail: 'console.info(...data: any[]): void',
	                doc: 'Outputs an informational message to the console.',
	            },
	            debug: {
	                detail: 'console.debug(...data: any[]): void',
	                doc: 'Outputs a debug message to the console.',
	            },
	            table: {
	                detail: 'console.table(data: any, columns?: string[]): void',
	                doc: 'Displays tabular data as a table.',
	            },
	            clear: {
	                detail: 'console.clear(): void',
	                doc: 'Clears the console.',
	            },
	            time: {
	                detail: 'console.time(label?: string): void',
	                doc: 'Starts a timer you can use to track how long an operation takes.',
	            },
	            timeEnd: {
	                detail: 'console.timeEnd(label?: string): void',
	                doc: 'Stops a timer and logs the elapsed time.',
	            },
	        },
	    },
	    Math: {
	        doc: 'The Math object provides mathematical constants and functions.',
	        members: {
	            floor: {
	                detail: 'Math.floor(x: number): number',
	                doc: 'Returns the largest integer less than or equal to x.',
	            },
	            ceil: {
	                detail: 'Math.ceil(x: number): number',
	                doc: 'Returns the smallest integer greater than or equal to x.',
	            },
	            round: {
	                detail: 'Math.round(x: number): number',
	                doc: 'Returns the value of x rounded to the nearest integer.',
	            },
	            random: {
	                detail: 'Math.random(): number',
	                doc: 'Returns a pseudo-random number between 0 and 1.',
	            },
	            max: {
	                detail: 'Math.max(...values: number[]): number',
	                doc: 'Returns the largest of zero or more numbers.',
	            },
	            min: {
	                detail: 'Math.min(...values: number[]): number',
	                doc: 'Returns the smallest of zero or more numbers.',
	            },
	            abs: {
	                detail: 'Math.abs(x: number): number',
	                doc: 'Returns the absolute value of x.',
	            },
	            sqrt: {
	                detail: 'Math.sqrt(x: number): number',
	                doc: 'Returns the square root of x.',
	            },
	            pow: {
	                detail: 'Math.pow(base: number, exponent: number): number',
	                doc: 'Returns base raised to the power of exponent.',
	            },
	            PI: {
	                detail: 'Math.PI: number',
	                doc: 'The ratio of the circumference of a circle to its diameter (~3.14159).',
	            },
	        },
	    },
	    document: {
	        doc: 'The Document interface represents the web page loaded in the browser.',
	        members: {
	            getElementById: {
	                detail:
	                    'document.getElementById(id: string): HTMLElement | null',
	                doc: 'Returns the element with the specified ID.',
	            },
	            querySelector: {
	                detail:
	                    'document.querySelector(selectors: string): Element | null',
	                doc: 'Returns the first element matching the specified CSS selector.',
	            },
	            querySelectorAll: {
	                detail:
	                    'document.querySelectorAll(selectors: string): NodeList',
	                doc: 'Returns all elements matching the specified CSS selector.',
	            },
	            createElement: {
	                detail:
	                    'document.createElement(tagName: string): HTMLElement',
	                doc: 'Creates an HTML element specified by tagName.',
	            },
	            addEventListener: {
	                detail:
	                    'document.addEventListener(type: string, listener: Function): void',
	                doc: 'Registers an event handler on the document.',
	            },
	            body: {
	                detail: 'document.body: HTMLBodyElement',
	                doc: 'Returns the <body> element of the document.',
	            },
	            title: {
	                detail: 'document.title: string',
	                doc: 'Gets or sets the title of the document.',
	            },
	        },
	    },
	    JSON: {
	        doc: 'The JSON object contains methods for parsing and stringifying JSON.',
	        members: {
	            stringify: {
	                detail:
	                    'JSON.stringify(value: any, replacer?: Function, space?: number): string',
	                doc: 'Converts a JavaScript value to a JSON string.',
	            },
	            parse: {
	                detail: 'JSON.parse(text: string, reviver?: Function): any',
	                doc: 'Parses a JSON string and returns the resulting value.',
	            },
	        },
	    },
	    Array: {
	        doc: 'The Array object is used to store multiple values in a single variable.',
	        members: {
	            isArray: {
	                detail: 'Array.isArray(value: any): boolean',
	                doc: 'Determines whether the passed value is an Array.',
	            },
	            from: {
	                detail: 'Array.from(iterable: Iterable): Array',
	                doc: 'Creates a new Array instance from an iterable object.',
	            },
	            of: {
	                detail: 'Array.of(...items: any[]): Array',
	                doc: 'Creates a new Array instance with the given arguments as elements.',
	            },
	        },
	    },
	    Object: {
	        doc: 'The Object class represents one of JavaScript\'s data types.',
	        members: {
	            keys: {
	                detail: 'Object.keys(obj: object): string[]',
	                doc: 'Returns an array of a given object\'s own enumerable property names.',
	            },
	            values: {
	                detail: 'Object.values(obj: object): any[]',
	                doc: 'Returns an array of a given object\'s own enumerable property values.',
	            },
	            entries: {
	                detail: 'Object.entries(obj: object): [string, any][]',
	                doc: 'Returns an array of a given object\'s own enumerable string-keyed property [key, value] pairs.',
	            },
	            assign: {
	                detail:
	                    'Object.assign(target: object, ...sources: object[]): object',
	                doc: 'Copies all enumerable own properties from one or more source objects to a target object.',
	            },
	            freeze: {
	                detail: 'Object.freeze(obj: object): object',
	                doc: 'Freezes an object, preventing new properties from being added.',
	            },
	        },
	    },
	    Promise: {
	        doc: 'The Promise object represents the eventual completion or failure of an asynchronous operation.',
	        members: {
	            all: {
	                detail: 'Promise.all(promises: Promise[]): Promise',
	                doc: 'Returns a promise that resolves when all of the promises resolve.',
	            },
	            race: {
	                detail: 'Promise.race(promises: Promise[]): Promise',
	                doc: 'Returns a promise that resolves or rejects as soon as one of the promises resolves or rejects.',
	            },
	            resolve: {
	                detail: 'Promise.resolve(value: any): Promise',
	                doc: 'Returns a Promise that is resolved with the given value.',
	            },
	            reject: {
	                detail: 'Promise.reject(reason: any): Promise',
	                doc: 'Returns a Promise that is rejected with the given reason.',
	            },
	        },
	    },
	};

	const globalCompletions = [
	    {
	        label: 'setTimeout',
	        kind: 3,
	        detail: 'setTimeout(callback: Function, ms: number): number',
	        documentation: 'Calls a function after a specified number of milliseconds.',
	    },
	    {
	        label: 'setInterval',
	        kind: 3,
	        detail: 'setInterval(callback: Function, ms: number): number',
	        documentation: 'Calls a function repeatedly at specified intervals.',
	    },
	    {
	        label: 'clearTimeout',
	        kind: 3,
	        detail: 'clearTimeout(id: number): void',
	        documentation: 'Cancels a timeout previously set with setTimeout.',
	    },
	    {
	        label: 'clearInterval',
	        kind: 3,
	        detail: 'clearInterval(id: number): void',
	        documentation: 'Cancels an interval previously set with setInterval.',
	    },
	    {
	        label: 'parseInt',
	        kind: 3,
	        detail: 'parseInt(string: string, radix?: number): number',
	        documentation: 'Parses a string argument and returns an integer.',
	    },
	    {
	        label: 'parseFloat',
	        kind: 3,
	        detail: 'parseFloat(string: string): number',
	        documentation: 'Parses a string argument and returns a floating point number.',
	    },
	    {
	        label: 'isNaN',
	        kind: 3,
	        detail: 'isNaN(value: any): boolean',
	        documentation: 'Determines whether a value is NaN.',
	    },
	    {
	        label: 'fetch',
	        kind: 3,
	        detail: 'fetch(input: string, init?: RequestInit): Promise<Response>',
	        documentation: 'Starts the process of fetching a resource from the network.',
	    },
	    ...Object.keys(globalDocs).map((name) => ({
	        label: name,
	        kind: 6,
	        detail: name,
	        documentation: globalDocs[name].doc,
	    })),
	];

	// --- Helpers ---

	function send(msg) {
	    self.postMessage(JSON.stringify(msg));
	}

	function sendResponse(id, result) {
	    send({ jsonrpc: '2.0', id, result });
	}

	function sendNotification(method, params) {
	    send({ jsonrpc: '2.0', method, params });
	}

	function getWordAt(text, line, character) {
	    const lines = text.split('\n');
	    if (line >= lines.length) return null;
	    const lineText = lines[line];
	    let start = character;
	    let end = character;
	    while (start > 0 && /\w/.test(lineText[start - 1])) start--;
	    while (end < lineText.length && /\w/.test(lineText[end])) end++;
	    if (start === end) return null;
	    return {
	        word: lineText.slice(start, end),
	        range: {
	            start: { line, character: start },
	            end: { line, character: end },
	        },
	    };
	}

	function getObjectAccess(text, line, character) {
	    const lines = text.split('\n');
	    if (line >= lines.length) return null;
	    const lineText = lines[line];

	    let end = character;
	    while (end < lineText.length && /\w/.test(lineText[end])) end++;

	    let memberStart = character;
	    while (memberStart > 0 && /\w/.test(lineText[memberStart - 1]))
	        memberStart--;

	    if (memberStart === 0 || lineText[memberStart - 1] !== '.') return null;

	    let objEnd = memberStart - 1;
	    let objStart = objEnd;
	    while (objStart > 0 && /\w/.test(lineText[objStart - 1])) objStart--;

	    const obj = lineText.slice(objStart, objEnd);
	    const member = lineText.slice(memberStart, end);
	    return { obj, member };
	}

	// --- Diagnostics ---

	function publishDiagnostics(uri, text) {
	    const diagnostics = [];
	    const lines = text.split('\n');

	    for (let i = 0; i < lines.length; i++) {
	        const line = lines[i];

	        // Flag `var` usage
	        const varMatch = line.match(/\bvar\s/);
	        if (varMatch) {
	            const col = varMatch.index;
	            diagnostics.push({
	                range: {
	                    start: { line: i, character: col },
	                    end: { line: i, character: col + 3 },
	                },
	                severity: 2,
	                source: 'demo-lsp',
	                message:
	                    "'var' is discouraged. Use 'let' or 'const' instead.",
	            });
	        }

	        // Flag unclosed strings
	        const singleQuotes = (line.match(/'/g) || []).length;
	        const doubleQuotes = (line.match(/"/g) || []).length;
	        const backticks = (line.match(/`/g) || []).length;
	        if (singleQuotes % 2 !== 0) {
	            diagnostics.push({
	                range: {
	                    start: { line: i, character: 0 },
	                    end: { line: i, character: line.length },
	                },
	                severity: 1,
	                source: 'demo-lsp',
	                message: 'Unclosed string literal (single quote).',
	            });
	        }
	        if (doubleQuotes % 2 !== 0) {
	            diagnostics.push({
	                range: {
	                    start: { line: i, character: 0 },
	                    end: { line: i, character: line.length },
	                },
	                severity: 1,
	                source: 'demo-lsp',
	                message: 'Unclosed string literal (double quote).',
	            });
	        }
	        if (backticks % 2 !== 0) {
	            diagnostics.push({
	                range: {
	                    start: { line: i, character: 0 },
	                    end: { line: i, character: line.length },
	                },
	                severity: 1,
	                source: 'demo-lsp',
	                message: 'Unclosed template literal.',
	            });
	        }
	    }

	    sendNotification('textDocument/publishDiagnostics', { uri, diagnostics });
	}

	// --- Request handlers ---

	function handleInitialize(id) {
	    sendResponse(id, {
	        capabilities: {
	            textDocumentSync: 1,
	            completionProvider: {
	                triggerCharacters: ['.'],
	                resolveProvider: false,
	            },
	            hoverProvider: true,
	            documentHighlightProvider: true,
	            documentFormattingProvider: true,
	        },
	    });
	}

	function handleCompletion(id, params) {
	    const { textDocument, position } = params;
	    const doc = documents.get(textDocument.uri);
	    if (!doc) {
	        sendResponse(id, []);
	        return;
	    }

	    const lines = doc.split('\n');
	    const lineText = lines[position.line] || '';
	    const textBefore = lineText.slice(0, position.character);

	    // Check for object member access (e.g. "console.")
	    const dotMatch = textBefore.match(/(\w+)\.\w*$/);
	    if (dotMatch) {
	        const objName = dotMatch[1];
	        const info = globalDocs[objName];
	        if (info && info.members) {
	            const items = Object.entries(info.members).map(
	                ([name, member]) => ({
	                    label: name,
	                    kind: name[0] === name[0].toUpperCase() ? 6 : 3,
	                    detail: member.detail,
	                    documentation: { kind: 'markdown', value: member.doc },
	                }),
	            );
	            sendResponse(id, items);
	            return;
	        }
	    }

	    // Global completions
	    sendResponse(id, globalCompletions);
	}

	function handleHover(id, params) {
	    const { textDocument, position } = params;
	    const doc = documents.get(textDocument.uri);
	    if (!doc) {
	        sendResponse(id, null);
	        return;
	    }

	    // Check for object.member hover
	    const access = getObjectAccess(doc, position.line, position.character);
	    if (access) {
	        const info = globalDocs[access.obj];
	        if (info && info.members && info.members[access.member]) {
	            const member = info.members[access.member];
	            sendResponse(id, {
	                contents: {
	                    kind: 'markdown',
	                    value: `**${member.detail}**\n\n${member.doc}`,
	                },
	            });
	            return;
	        }
	    }

	    // Check for global hover
	    const wordInfo = getWordAt(doc, position.line, position.character);
	    if (wordInfo) {
	        const info = globalDocs[wordInfo.word];
	        if (info) {
	            sendResponse(id, {
	                contents: {
	                    kind: 'markdown',
	                    value: `**${wordInfo.word}**\n\n${info.doc}`,
	                },
	                range: wordInfo.range,
	            });
	            return;
	        }
	    }

	    sendResponse(id, null);
	}

	function handleDocumentHighlight(id, params) {
	    const { textDocument, position } = params;
	    const doc = documents.get(textDocument.uri);
	    if (!doc) {
	        sendResponse(id, []);
	        return;
	    }

	    const wordInfo = getWordAt(doc, position.line, position.character);
	    if (!wordInfo) {
	        sendResponse(id, []);
	        return;
	    }

	    const highlights = [];
	    const lines = doc.split('\n');
	    const re = new RegExp(`\\b${wordInfo.word}\\b`, 'g');

	    for (let i = 0; i < lines.length; i++) {
	        let match;
	        while ((match = re.exec(lines[i])) !== null) {
	            highlights.push({
	                range: {
	                    start: { line: i, character: match.index },
	                    end: {
	                        line: i,
	                        character: match.index + wordInfo.word.length,
	                    },
	                },
	                kind: 1,
	            });
	        }
	    }

	    sendResponse(id, highlights);
	}

	function handleFormatting(id, params) {
	    const { textDocument } = params;
	    const doc = documents.get(textDocument.uri);
	    if (!doc) {
	        sendResponse(id, []);
	        return;
	    }

	    const lines = doc.split('\n');
	    const formatted = [];
	    let indent = 0;

	    for (const line of lines) {
	        const trimmed = line.trim();
	        if (!trimmed) {
	            formatted.push('');
	            continue;
	        }

	        if (/^[}\])]/.test(trimmed)) indent = Math.max(0, indent - 1);

	        // Continuation lines (e.g. .then(), .catch()) get extra indent
	        const isContinuation = /^[.]/.test(trimmed);
	        const extraIndent = isContinuation ? 1 : 0;

	        formatted.push('    '.repeat(indent + extraIndent) + trimmed);

	        const opens = (trimmed.match(/[{[(]/g) || []).length;
	        const closes = (trimmed.match(/[}\])]/g) || []).length;
	        indent = Math.max(0, indent + opens - closes);
	    }

	    const newText = formatted.join('\n');
	    sendResponse(id, [
	        {
	            range: {
	                start: { line: 0, character: 0 },
	                end: {
	                    line: lines.length - 1,
	                    character: lines[lines.length - 1].length,
	                },
	            },
	            newText,
	        },
	    ]);
	}

	// --- Message dispatch ---

	self.onmessage = function (event) {
	    const raw = typeof event.data === 'string' ? event.data : '';
	    let msg;
	    try {
	        msg = JSON.parse(raw);
	    } catch {
	        return;
	    }

	    const { id, method, params } = msg;

	    switch (method) {
	        case 'initialize':
	            handleInitialize(id);
	            break;

	        case 'initialized':
	            break;

	        case 'textDocument/didOpen': {
	            const { textDocument } = params;
	            documents.set(textDocument.uri, textDocument.text);
	            publishDiagnostics(textDocument.uri, textDocument.text);
	            break;
	        }

	        case 'textDocument/didChange': {
	            const { textDocument, contentChanges } = params;
	            if (contentChanges.length > 0) {
	                const text =
	                    contentChanges[contentChanges.length - 1].text;
	                documents.set(textDocument.uri, text);
	                publishDiagnostics(textDocument.uri, text);
	            }
	            break;
	        }

	        case 'textDocument/completion':
	            handleCompletion(id, params);
	            break;

	        case 'textDocument/hover':
	            handleHover(id, params);
	            break;

	        case 'textDocument/documentHighlight':
	            handleDocumentHighlight(id, params);
	            break;

	        case 'textDocument/formatting':
	            handleFormatting(id, params);
	            break;

	        default:
	            if (id != null) {
	                sendResponse(id, null);
	            }
	            break;
	    }
	};
	return lspWorker$1;
}

var lspWorkerExports = requireLspWorker();
var lspWorker = /*@__PURE__*/getDefaultExportFromCjs(lspWorkerExports);

export { lspWorker as default };
