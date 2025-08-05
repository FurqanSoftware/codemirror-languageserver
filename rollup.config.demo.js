import babel from '@rollup/plugin-babel';
import typescript from '@rollup/plugin-typescript';
import serve from 'rollup-plugin-serve';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import nodePolyfills from 'rollup-plugin-node-polyfills';

export default {
    input: 'demo/demo.js',
    output: {
        dir: 'demo/dist',
        format: 'es',
        intro: 'const global = window;',
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
            preferBuiltins: true,
        }),
        commonjs(),
        nodePolyfills(),
        serve('./demo'),
    ],
};
