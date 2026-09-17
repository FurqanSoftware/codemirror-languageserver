import typescript from '@rollup/plugin-typescript';

export default {
    input: 'src/index.ts',
    output: {
        dir: 'dist',
        format: 'es',
    },
    plugins: [
        typescript({
            declarationDir: 'dist',
        }),
    ],
    external: [
        '@codemirror/autocomplete',
        '@codemirror/lint',
        '@codemirror/state',
        '@codemirror/view',
        'marked',
        'vscode-languageserver-protocol',
    ],
};
