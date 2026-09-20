export type RepositoryFile = {
  path: string;
  label: string;
  kind: "workflow" | "action" | "manifest" | "policy";
  purpose: string;
  content: string;
};

export const REPOSITORY_NAME = "northstar / relaykit";

export const REPOSITORY_FILES: RepositoryFile[] = [
  {
    path: ".github/workflows/ci.yml",
    label: "ci.yml",
    kind: "workflow",
    purpose: "Required pull-request validation: lint, typecheck, and tests.",
    content: `name: Package checks
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
      - name: Check types and lint
        run: bun run check
      - name: Run tests
        run: bun run test
`,
  },
  {
    path: ".github/workflows/docs.yml",
    label: "docs.yml",
    kind: "workflow",
    purpose: "Build documentation on pull requests that touch docs.",
    content: `name: Documentation
on:
  pull_request:
    paths: ['docs/**', 'package.json', 'bun.lock']
permissions:
  contents: read
jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
      - name: Build documentation
        run: bun run docs:build
`,
  },
  {
    path: ".github/workflows/preview.yml",
    label: "preview.yml",
    kind: "workflow",
    purpose: "Compile a distributable package for pull-request review.",
    content: `name: Package preview
on: pull_request
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
      - name: Compile package
        run: bun run build
      - uses: actions/upload-artifact@v4
        with:
          name: package-preview
          path: dist/
`,
  },
  {
    path: ".github/workflows/publish.yml",
    label: "publish.yml",
    kind: "workflow",
    purpose:
      "Publish a built package to npm using the repository’s documented publishing exception.",
    content: `name: Publish package
on:
  push:
    tags: ['v*']
permissions:
  contents: read
  id-token: write
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
      - run: bun run check
      - run: bun run test
      - run: bun run build
      # Publishing exception: see CONTRIBUTING.md.
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish --provenance --access public
`,
  },
  {
    path: ".github/actions/setup-project/action.yml",
    label: "setup-project/action.yml",
    kind: "action",
    purpose: "The shared, version-pinned Bun setup and locked dependency install.",
    content: `name: Set up RelayKit
description: Install the repository's Bun toolchain and locked dependencies.
runs:
  using: composite
  steps:
    - uses: oven-sh/setup-bun@v2
      with:
        bun-version: '1.4.0'
    - name: Install dependencies
      shell: bash
      run: bun install --frozen-lockfile
`,
  },
  {
    path: "package.json",
    label: "package.json",
    kind: "manifest",
    purpose: "The commands workflows are expected to invoke.",
    content: `{
  "name": "@northstar/relaykit",
  "version": "0.8.0",
  "type": "module",
  "packageManager": "bun@1.4.0",
  "scripts": {
    "check": "tsc --noEmit && oxlint --deny-warnings",
    "test": "bun test",
    "build": "bun build src/index.ts --target=node --outdir=dist",
    "docs:build": "vitepress build docs"
  },
  "files": ["dist"],
  "exports": "./dist/index.js"
}
`,
  },
  {
    path: "CONTRIBUTING.md",
    label: "CONTRIBUTING.md",
    kind: "policy",
    purpose: "A source-backed exception: a different runtime can be intentional.",
    content: `# Repository automation conventions

Pull-request checks use ./.github/actions/setup-project. It installs
Bun 1.4.0 and runs bun install --frozen-lockfile against bun.lock.
Package validation includes both bun run check and bun run test.
Documentation and package-preview jobs may run only their own build.

## Publishing exception

The npm publish step uses Node 24 and npm for provenance publishing.
This is an intentional publishing-only exception to the Bun toolchain.
Publishing still uses shared Bun setup for install, check, test, build.
Publishing declares id-token: write for its provenance token.
This exception does not apply to ordinary pull-request checks.

## Scope

Ordinary checks declare contents: read; they do not write to the repo.
Local action versions and package scripts are maintained in one place.
This fixture describes repository intent; it is not a platform audit.
`,
  },
];

export type WorkflowScene = {
  id: string;
  name: string;
  description: string;
  purpose: string;
  yaml: string;
};

export const WORKFLOW_SCENES: WorkflowScene[] = [
  {
    id: "drift",
    name: "A copied CI workflow",
    description:
      "An old template becomes a new package check. Compare its declarations with this repository’s actual conventions.",
    purpose:
      "Validate pull requests with the same package checks as CI: install locked dependencies, run type/lint checks, and run tests. This workflow does not publish or write to the repository.",
    yaml: `name: Package validation
on: pull_request
permissions:
  contents: write
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Install dependencies
        run: npm install
      - name: Run tests
        run: npm run test
`,
  },
  {
    id: "exception",
    name: "An intentional publishing exception",
    description:
      "A different runtime has a documented reason. The same scanner should preserve this exception.",
    purpose:
      "On a version tag, validate and build the package with the shared toolchain, then publish it to npm with provenance using the documented Node publishing exception.",
    yaml: `name: Publish stable package
on:
  push:
    tags: ['v*']
permissions:
  contents: read
  id-token: write
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
      - run: bun run check
      - run: bun run test
      - run: bun run build
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish --provenance --access public
`,
  },
  {
    id: "aligned",
    name: "The aligned check",
    description:
      "Shared setup replaces hand-copied installation. Scan again to see which semantic judgments change.",
    purpose:
      "Validate pull requests with the same package checks as CI: install locked dependencies, run type/lint checks, and run tests. This workflow does not publish or write to the repository.",
    yaml: `name: Package validation
on: pull_request
permissions:
  contents: read
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
      - name: Check types and lint
        run: bun run check
      - name: Run tests
        run: bun run test
`,
  },
  {
    id: "invalid",
    name: "A YAML editing mistake",
    description:
      "Syntax errors belong to the parser. Fix the bracket or load another scene before asking Jev to judge intent.",
    purpose: "Run type/lint checks and tests on pull requests using the shared setup.",
    yaml: `name: Package validation
on:
  pull_request:
    branches: [main
permissions:
  contents: read
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
      - run: bun run check
      - run: bun run test
`,
  },
];

export const CANDIDATE_PATH = ".github/workflows/candidate.yml";
