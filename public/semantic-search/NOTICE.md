# Semantic Search source corpus

Unmodified, complete function excerpts from three public MIT repositories at pinned commits. Source text is real; Jev judgments are produced live and are not supplied with this corpus.

Named TypeScript/TSX function declarations, assigned arrow/function expressions, and class/object methods extracted with the TypeScript AST. Production source only; tests, declarations, fixtures, vendored code, and generated files are excluded. Exact complete source lines, 3+ lines and 80–8,000 characters. Outer functions take precedence over nested functions to avoid overlapping excerpts; identical source bodies are deduplicated. This is a bounded source sample, not whole-project analysis.

Rebuild with `bun src/demos/code/build-semantic-corpus.ts`. Archives are cached under `.cache/semantic-corpus`; no upstream code is executed. The source excerpts retain their original lines. Copyright and license comments from source files are retained in each excerpt's notice field and in [source-notices.txt](licenses/source-notices.txt), including Vite's upstream MIT/ISC attributions. The referenced [node-graceful-fs ISC license](licenses/node-graceful-fs-ISC.txt) is preserved in full.

- **Hono**: 542 functions / 128 files. [Pinned source](https://github.com/honojs/hono/tree/52febbcc30bc509d5e4987577e63906fe08fc471), revision `52febbcc30bc509d5e4987577e63906fe08fc471`. [Upstream MIT license](https://github.com/honojs/hono/blob/52febbcc30bc509d5e4987577e63906fe08fc471/LICENSE); complete notice: [hono-MIT.txt](licenses/hono-MIT.txt).
- **TanStack Query**: 774 functions / 199 files. [Pinned source](https://github.com/TanStack/query/tree/47f27a48243792946bd74a51191021ec328de682), revision `47f27a48243792946bd74a51191021ec328de682`. [Upstream MIT license](https://github.com/TanStack/query/blob/47f27a48243792946bd74a51191021ec328de682/LICENSE); complete notice: [query-MIT.txt](licenses/query-MIT.txt).
- **Vite**: 1098 functions / 113 files. [Pinned source](https://github.com/vitejs/vite/tree/e9078f865cdff6bed77cd729214a7e2868f126b5), revision `e9078f865cdff6bed77cd729214a7e2868f126b5`. [Upstream MIT license](https://github.com/vitejs/vite/blob/e9078f865cdff6bed77cd729214a7e2868f126b5/LICENSE); complete notice: [vite-MIT.txt](licenses/vite-MIT.txt).

The corpus contains 2414 distinct excerpts; no synthetic padding or stored model scores. Imported dependencies and adjacent definitions are not resolved. Judgments are limited to the shown implementation and its imports, not a whole-program proof.
