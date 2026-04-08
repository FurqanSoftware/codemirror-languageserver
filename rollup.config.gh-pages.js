import babel from '@rollup/plugin-babel';
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default [
    {
        input: 'docs/gh-pages.js',
        output: {
            file: 'docs/dist/gh-pages.js',
            format: 'es',
        },
        plugins: [
            typescript({
                declaration: false,
            }),
            babel({
                babelHelpers: 'bundled',
            }),
            nodeResolve({
                browser: true,
            }),
            commonjs(),
        ],
    },
    {
        input: 'docs/lsp-worker.js',
        output: {
            file: 'docs/dist/lsp-worker.js',
            format: 'es',
        },
        plugins: [nodeResolve(), commonjs()],
    },
];
