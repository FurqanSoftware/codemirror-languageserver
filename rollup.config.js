import babel from '@rollup/plugin-babel';
import typescript from '@rollup/plugin-typescript';

export default {
	input: 'src/index.ts',
	output: {
		dir: 'dist',
		format: 'es'
	},
	plugins: [
		typescript({
		  declarationDir: 'dist',
		}),
		babel({
			babelHelpers: 'bundled'
		})
	],
	external: [
		'@codemirror/autocomplete',
		'@codemirror/lint',
		'@codemirror/state',
		'@codemirror/tooltip',
		'@codemirror/view',
		'@open-rpc/client-js',
		'marked/lib/marked.esm.js',
		'vscode-languageserver-protocol'
	]
};
