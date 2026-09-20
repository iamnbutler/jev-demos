# Jev demos

Eight standalone demos at **http://localhost:4317**. Each uses live Jev judgments against inspectable, fictional inputs. OpenAI and Claude can draft new inputs in five demos.

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

| Demo                | Open                                              | Try                                                                                                                       |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Workflow scanner    | [/actions](http://localhost:4317/actions)         | Scan the copied workflow, compare an aligned one, then inspect the publishing exception. Draft a replacement and scan it. |
| Code search         | [/code-search](http://localhost:4317/code-search) | Compare “Catch & continue” with “Log & rethrow.” Inspect the source and the keyword baseline.                             |
| Review lenses       | [/review](http://localhost:4317/review)           | Find permission changes and weakened tests. Change the threshold and unfold excluded hunks.                               |
| Duplicate reports   | [/duplicates](http://localhost:4317/duplicates)   | Compare restart and branch-switch reports, then the deliberately underspecified report.                                   |
| Discussion timeline | [/discussion](http://localhost:4317/discussion)   | Analyze the decision reversal. Move the cutoff earlier and analyze again.                                                 |
| Commit history      | [/history](http://localhost:4317/history)         | Filter by actual migrations, tests, and permissions; inspect reverted patches.                                            |
| Context selection   | [/context](http://localhost:4317/context)         | Evaluate the objective, lower the budget, and pin archived evidence back into context.                                    |
| Run replay          | [/replay](http://localhost:4317/replay)           | Compare productive progress, a repeated setup failure, and an unsupported success claim.                                  |

[Demo guide](docs/DEMO-GUIDE.md) contains suggested sequences and interpretation notes. [Validation notes](docs/VALIDATION.md) record observations from real calls.

## How it works

React renders the demos; Vite handles development; a Bun server calls the providers. Each demo builds a shared state plus narrow typed questions. Jev returns probabilities or choices. Parsing, sorting, budgets, source links, and the replay policy are ordinary code. **Inspect evaluation** exposes the exact request and response.

Explicit analysis runs request fresh results. Editing an input clears its judgments; an old response cannot overwrite a newer input. Every view keeps the original source available. Optional writers create editable content; run the demo's analysis action to assess it with Jev.

Defaults are `jev-1.13.0`, `gpt-6-astra`, and `claude-sonnet-5`. Override them with `JEV_MODEL`, `OPENAI_MODEL`, or `ANTHROPIC_MODEL` in `.dev.vars` or the process environment. Only configuration status and model names reach the health endpoint.

This is a local research app. Inputs submitted for evaluation or drafting are sent to the selected provider. The fixtures are fictional; no GitHub account is connected. Generated workflows and commands are displayed as text. State resets when navigating between demos or reloading.

## Check

```sh
bun fix             # Format and lint autofixes
bun check           # TypeScript, strict lint, formatting
bun test            # Deterministic parsing, evidence, context, replay, API tests
bun test:browser    # Browser regressions; provider responses are mocked
bun test:live       # Eight actual Jev requests against the running server
bun test:live --writers # Also exercise configured OpenAI and Claude clients
bun run build
```

Browser tests use installed Google Chrome on macOS, `CHROME_PATH` if specified, or Playwright's Chromium. If needed, install Chromium with `bunx playwright install chromium`. Live checks need a running app and a Jev key. Set `DEMO_URL` to test another local server.

## Files and references

- `src/demos/`: fixtures, pure request builders, deterministic logic, and each demo's UI.
- `src/lib/jev.ts` and `src/components/ui.tsx`: client request handling, input invalidation, shared controls, and evaluation details.
- `server/`: provider clients, request/response validation, local API, and static production serving.
- [Design](docs/DESIGN.md): plain navigation, concise labels, readable type, white/ink/blue palette.
- [TypeSafe API](https://docs.typesafe.ai/api), [OpenAI text generation](https://developers.openai.com/api/docs/guides/text), [Anthropic Messages](https://platform.claude.com/docs/en/api/typescript/messages/create).
- [RYBitten](https://rybitten.space/) supplied the clear-blue color reference; the UI uses system sans and JetBrains Mono.
