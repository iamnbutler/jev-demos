# Jev demos

Eight standalone demos at **http://localhost:4317**. Live Jev judgments over inspectable public source and authored examples. OpenAI and Claude can draft new inputs; Haiku turns Jev's commit categories into a written changelog.

## Run

```sh
bun install
cp -n .env.example .dev.vars # Keeps an existing .dev.vars.
# Add JEV_TOKEN. OPENAI_API_KEY and ANTHROPIC_API_KEY are optional.
bun dev
```

The existing local `.dev.vars` is already configured. Development serves the app on **4317** and its API on **4318**, both bound to localhost. Keys are read by the server; restart `bun dev` after changing them. Stop with Ctrl+C.

For a production build, stop the development server, then run `bun run build && bun start`. This serves the built app and API on 4317. `API_PORT` can override that port.

## Demos

| Demo                | Open                                              | Try                                                                                                         |
| ------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Workflow scanner    | [/actions](http://localhost:4317/actions)         | Inspect inline YAML findings and their repository sources. Edit or compose a workflow and scan it.          |
| Semantic Search     | [/code-search](http://localhost:4317/code-search) | Watch 2,414 public functions rank as batches arrive. Stop/resume, compare keywords, and inspect each batch. |
| Review lenses       | [/review](http://localhost:4317/review)           | Decorate exact changed ranges by lens; switch to Filter to fold other hunks.                                |
| Duplicate reports   | [/duplicates](http://localhost:4317/duplicates)   | Type a report and watch relationships update after a 400 ms pause.                                          |
| Discussion timeline | [/discussion](http://localhost:4317/discussion)   | Analyze the decision reversal. Move the cutoff earlier and analyze again.                                   |
| Commit history      | [/history](http://localhost:4317/history)         | Compare Jev-only categorization with a Haiku-written changelog. Follow citations to source commits.         |
| Context selection   | [/context](http://localhost:4317/context)         | Adjust the left-side objective/budget while the complete thread and vertical retention rail remain visible. |
| Run replay          | [/replay](http://localhost:4317/replay)           | Compare productive progress, a repeated setup failure, and an unsupported success claim.                    |

[Demo guide](docs/DEMO-GUIDE.md) contains suggested sequences and interpretation notes. [Validation notes](docs/VALIDATION.md) record observations from real calls.

## How it works

React renders the demos; Vite handles development; a Bun server calls the providers. Each demo builds a shared state plus narrow typed questions. Jev returns probabilities or choices. Parsing, sorting, budgets, source links, and the replay policy are ordinary code. **Inspect evaluation** exposes the exact request and response.

Analysis requests fresh results. Editing an input clears its judgments; an old response cannot overwrite a newer input. Duplicate reports compare automatically after 400 ms. Semantic Search runs four bounded requests concurrently and merges results as real batches return; unknown scores stay unknown, and Stop/Resume preserves completed work. Every batch retains its exact evidence.

Optional writers create new inputs. Workflows, queries, and objectives are evaluated separately; generated duplicate reports enter the same automatic comparison. In History, Jev first chooses categories from the selected revision's diffs. Haiku receives those groups and source patches; the result is validated for category membership, complete coverage, and exact commit citations.

Defaults are `jev-1.13.0`, `gpt-6-astra`, and `claude-sonnet-5`; changelog writing uses `claude-haiku-4-5-20251001`. Override with `JEV_MODEL`, `OPENAI_MODEL`, `ANTHROPIC_MODEL`, or `CHANGELOG_MODEL` in `.dev.vars` or the process environment. Only configuration status and model names reach the health endpoint.

This is a local research app. Submitted inputs are sent to the selected provider. Semantic Search uses complete function excerpts from pinned public Hono, TanStack Query, and Vite commits; [corpus methods and licenses](public/semantic-search/NOTICE.md) are included. Other fixtures are fictional. No GitHub account is connected. Generated workflows and commands remain text. State resets when navigating between demos or reloading.

## Check

```sh
bun fix             # Format and lint autofixes
bun check           # TypeScript, strict lint, formatting
bun test            # Deterministic parsing, evidence, context, replay, API tests
bun test:browser    # Browser regressions; provider responses are mocked
bun test:live       # Eight actual Jev requests against the running server
bun test:live --writers # Also exercise OpenAI, Claude, and the Jev → Haiku handoff
bun run build
```

Browser tests use installed Google Chrome on macOS, `CHROME_PATH` if specified, or Playwright's Chromium. If needed, install Chromium with `bunx playwright install chromium`. Live checks need a running app and a Jev key. Set `DEMO_URL` to test another local server.

## Files and references

- `src/demos/`: fixtures, pure request builders, deterministic logic, and each demo's UI.
- `src/lib/jev.ts` and `src/components/ui.tsx`: client request handling, input invalidation, shared controls, and evaluation details.
- `server/`: provider clients, request/response validation, local API, and static production serving.
- `public/semantic-search/`: reproducible public corpus, pinned source links, and MIT/ISC notices. Rebuild with `bun src/demos/code/build-semantic-corpus.ts`; upstream code is not executed.
- [Diffs](https://diffs.com/docs): workflow annotations and decorated review ranges use `@pierre/diffs`.
- [Design](docs/DESIGN.md): plain navigation, concise labels, readable type, white/ink/blue palette.
- [TypeSafe API](https://docs.typesafe.ai/api), [OpenAI text generation](https://developers.openai.com/api/docs/guides/text), [Anthropic Messages](https://platform.claude.com/docs/en/api/typescript/messages/create).
- [RYBitten](https://rybitten.space/) supplied the clear-blue color reference; the UI uses system sans and JetBrains Mono.
