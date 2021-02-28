import babel from '@rollup/plugin-babel';

export default {
	input: 'src/index.js',
	output: {
		dir: 'dist',
		format: 'es'
	},
	plugins: [
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
		'@open-rpc/client-js'
	]
};
