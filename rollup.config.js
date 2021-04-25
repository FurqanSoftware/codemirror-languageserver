import babel from '@rollup/plugin-babel';
import ts from 'rollup-plugin-ts';

export default {
	input: 'src/index.ts',
	output: {
		dir: 'dist',
		format: 'es'
	},
	plugins: [
		ts(),
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
		'vscode-languageserver-protocol'
	]
};
