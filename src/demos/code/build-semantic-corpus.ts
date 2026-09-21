/** Run: bun src/demos/code/build-semantic-corpus.ts
 * Downloads pinned public archives to .cache; it never executes upstream code.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import {
  CORPUS_REPOSITORIES,
  type CorpusRepository,
  type SearchCorpus,
  type SearchFunction,
} from "./semantic-corpus";

const project = path.resolve(import.meta.dir, "../../..");
const output = path.join(project, "public/semantic-search");
const MAX_EXCERPT = 8_000;
const extraction =
  "Named TypeScript/TSX function declarations, assigned arrow/function expressions, and class/object methods extracted with the TypeScript AST. Production source only; tests, declarations, fixtures, vendored code, and generated files are excluded. Exact complete source lines, 3+ lines and 80–8,000 characters. Outer functions take precedence over nested functions to avoid overlapping excerpts; identical source bodies are deduplicated. This is a bounded source sample, not whole-project analysis.";

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (
        !/^(?:node_modules|vendor|vendored|dist|generated|__tests__|__fixtures__|fixtures|tests?|examples?|playground)$/.test(
          entry.name,
        )
      )
        files.push(...(await listFiles(full)));
    } else if (/\.tsx?$/.test(entry.name) && !/\.(?:test|spec|bench|d)\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function namedFunction(node: ts.Node, source: ts.SourceFile) {
  if (ts.isFunctionDeclaration(node) && node.name && node.body)
    return { node, name: node.name.text, kind: "function" };
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    let expression = node.initializer;
    while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
    if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
      const statement = node.parent.parent;
      return {
        node:
          ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1
            ? statement
            : node,
        name: node.name.text,
        kind: ts.isArrowFunction(expression) ? "arrow function" : "function expression",
      };
    }
  }
  if (
    (ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) &&
    node.body &&
    !ts.isComputedPropertyName(node.name)
  ) {
    const owner = ts.isClassLike(node.parent) ? node.parent.name?.text : undefined;
    const prefix = ts.isGetAccessorDeclaration(node)
      ? "get "
      : ts.isSetAccessorDeclaration(node)
        ? "set "
        : "";
    return {
      node,
      name: `${owner ? `${owner}.` : ""}${prefix}${node.name.getText(source)}`,
      kind: "method",
    };
  }
  if (ts.isPropertyDeclaration(node) && node.initializer && !ts.isComputedPropertyName(node.name)) {
    const initializer = node.initializer;
    if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
      const owner = ts.isClassLike(node.parent) ? node.parent.name?.text : undefined;
      return {
        node,
        name: `${owner ? `${owner}.` : ""}${node.name.getText(source)}`,
        kind: "class function",
      };
    }
  }
  return null;
}

export function extractFunctions(
  text: string,
  relativePath: string,
  repository: (typeof CORPUS_REPOSITORIES)[number],
): SearchFunction[] {
  const source = ts.createSourceFile(
    relativePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = source.statements
    .filter(ts.isImportDeclaration)
    .map((node) => node.getText(source));
  const noticeRanges = new Map<number, ts.CommentRange>();
  function collectNotices(node: ts.Node) {
    for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [])
      noticeRanges.set(range.pos, range);
    ts.forEachChild(node, collectNotices);
  }
  collectNotices(source);
  const notices = [...noticeRanges.values()]
    .sort((a, b) => a.pos - b.pos)
    .map((range) => text.slice(range.pos, range.end))
    .filter((comment) =>
      /copyright|@license|permission is hereby|ISC License|github\.com\/isaacs\/node-graceful-fs/i.test(
        comment,
      ),
    )
    .join("\n");
  const lines = text.split("\n");
  const functions: SearchFunction[] = [];
  function visit(node: ts.Node) {
    const match = namedFunction(node, source);
    if (match) {
      const startLine = source.getLineAndCharacterOfPosition(match.node.getStart(source)).line + 1;
      const endLine = source.getLineAndCharacterOfPosition(match.node.getEnd() - 1).line + 1;
      const code = lines.slice(startLine - 1, endLine).join("\n");
      if (code.length >= 80 && code.length <= MAX_EXCERPT && endLine - startLine >= 2) {
        const id = `${repository.id}_${createHash("sha256").update(`${relativePath}:${startLine}:${match.name}`).digest("hex").slice(0, 14)}`;
        functions.push({
          id,
          name: match.name,
          kind: match.kind,
          repository: repository.repository,
          revision: repository.revision,
          path: relativePath,
          startLine,
          endLine,
          sourceUrl: `https://github.com/${repository.repository}/blob/${repository.revision}/${relativePath}#L${startLine}-L${endLine}`,
          licenseUrl: `https://github.com/${repository.repository}/blob/${repository.revision}/LICENSE`,
          code,
          imports,
          ...(notices ? { notice: notices } : {}),
        });
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return functions;
}

async function downloadRepository(repository: (typeof CORPUS_REPOSITORIES)[number]) {
  const cache = path.join(
    project,
    ".cache/semantic-corpus",
    `${repository.id}-${repository.revision}`,
  );
  if (!(await Bun.file(path.join(cache, "LICENSE")).exists())) {
    await mkdir(cache, { recursive: true });
    const archive = `${cache}.tar.gz`;
    const response = await fetch(
      `https://codeload.github.com/${repository.repository}/tar.gz/${repository.revision}`,
      { signal: AbortSignal.timeout(120_000) },
    );
    if (!response.ok)
      throw new Error(`Could not download ${repository.repository}: ${response.status}`);
    await Bun.write(archive, response);
    const result = Bun.spawn(["tar", "-xzf", archive, "-C", cache, "--strip-components=1"], {
      stdout: "ignore",
      stderr: "pipe",
    });
    if ((await result.exited) !== 0) throw new Error(await new Response(result.stderr).text());
  }
  return cache;
}

async function buildCorpus() {
  await mkdir(path.join(output, "licenses"), { recursive: true });
  const iscNotice = Bun.file(path.join(output, "licenses", "node-graceful-fs-ISC.txt"));
  if (!(await iscNotice.exists())) {
    const response = await fetch(
      "https://raw.githubusercontent.com/isaacs/node-graceful-fs/234379906b7d2f4c9cfeb412d2516f42b0fb4953/LICENSE",
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!response.ok) throw new Error("Could not preserve Vite's referenced ISC notice.");
    const license = await response.text();
    if (!license.startsWith("The ISC License"))
      throw new Error("Review the referenced ISC notice.");
    await Bun.write(iscNotice, license);
  }
  const functions: SearchFunction[] = [];
  const repositories: CorpusRepository[] = [];
  const bodies = new Set<string>();
  for (const repository of CORPUS_REPOSITORIES) {
    const cache = await downloadRepository(repository);
    const license = await readFile(path.join(cache, "LICENSE"), "utf8");
    if (!license.startsWith("MIT License"))
      throw new Error(`Review license for ${repository.repository} before including it.`);
    const localLicense = `/semantic-search/licenses/${repository.id}-MIT.txt`;
    await writeFile(path.join(output, "licenses", `${repository.id}-MIT.txt`), license);
    const files = (
      await Promise.all(repository.roots.map((root) => listFiles(path.join(cache, root))))
    )
      .flat()
      .sort();
    const included: SearchFunction[] = [];
    for (const file of files) {
      const relativePath = path.relative(cache, file).split(path.sep).join("/");
      if (repository.id === "query" && !/^packages\/[^/]+\/src\//.test(relativePath)) continue;
      const source = await readFile(file, "utf8");
      if (/[@#]generated|DO NOT EDIT|automatically generated/i.test(source.slice(0, 1_000)))
        continue;
      for (const fn of extractFunctions(source, relativePath, repository)) {
        const body = fn.code.replace(/\s+/g, " ").trim();
        if (bodies.has(body)) continue;
        bodies.add(body);
        included.push(fn);
      }
    }
    functions.push(...included);
    repositories.push({
      id: repository.id,
      name: repository.name,
      repository: repository.repository,
      revision: repository.revision,
      sourceUrl: `https://github.com/${repository.repository}/tree/${repository.revision}`,
      license: "MIT",
      licenseUrl: `https://github.com/${repository.repository}/blob/${repository.revision}/LICENSE`,
      localLicense,
      functions: included.length,
      files: new Set(included.map((fn) => fn.path)).size,
    });
    console.log(
      `${repository.name}: ${included.length} functions from ${repositories.at(-1)?.files} files`,
    );
  }
  if (functions.length < 500)
    throw new Error(`Only ${functions.length} distinct functions; need at least 500.`);
  const corpus: SearchCorpus = {
    schema: 1,
    id: `public-${createHash("sha256")
      .update(functions.map((fn) => `${fn.id}:${fn.revision}`).join("\n"))
      .digest("hex")
      .slice(0, 12)}`,
    provenance:
      "Unmodified, complete function excerpts from three public MIT repositories at pinned commits. Source text is real; Jev judgments are produced live and are not supplied with this corpus.",
    extraction,
    repositories,
    functions,
  };
  await writeFile(path.join(output, "corpus.json"), JSON.stringify(corpus));
  const sourceNotices = new Map<string, string>();
  for (const fn of functions) {
    if (fn.notice)
      sourceNotices.set(
        `${fn.repository} / ${fn.path}`,
        `${fn.repository} / ${fn.path}\nhttps://github.com/${fn.repository}/blob/${fn.revision}/${fn.path}\n\n${fn.notice}`,
      );
  }
  await writeFile(
    path.join(output, "licenses", "source-notices.txt"),
    [...sourceNotices.values()].join("\n\n----------------------------------------\n\n"),
  );
  const notice = `# Semantic Search source corpus\n\n${corpus.provenance}\n\n${extraction}\n\nRebuild with \`bun src/demos/code/build-semantic-corpus.ts\`. Archives are cached under \`.cache/semantic-corpus\`; no upstream code is executed. The source excerpts retain their original lines. Copyright and license comments from source files are retained in each excerpt's notice field and in [source-notices.txt](licenses/source-notices.txt), including Vite's upstream MIT/ISC attributions. The referenced [node-graceful-fs ISC license](licenses/node-graceful-fs-ISC.txt) is preserved in full.\n\n${repositories.map((repo) => `- **${repo.name}**: ${repo.functions} functions / ${repo.files} files. [Pinned source](${repo.sourceUrl}), revision \`${repo.revision}\`. [Upstream MIT license](${repo.licenseUrl}); complete notice: [${repo.id}-MIT.txt](licenses/${repo.id}-MIT.txt).`).join("\n")}\n\nThe corpus contains ${functions.length} distinct excerpts; no synthetic padding or stored model scores. Imported dependencies and adjacent definitions are not resolved. Judgments are limited to the shown implementation and its imports, not a whole-program proof.\n`;
  await writeFile(path.join(output, "NOTICE.md"), notice);
  console.log(`Wrote ${functions.length} functions to public/semantic-search/corpus.json`);
}

if (import.meta.main) await buildCorpus();
