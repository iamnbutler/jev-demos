# Validation notes

Observed locally on September 20, 2026 using Jev `jev-1.13.0`. These are development observations over pinned public source and authored fixtures, not an accuracy benchmark. Timings include HTTP and local processing and vary between runs.

## Live streaming search

The final **Catch & continue** run evaluated **2,414 distinct complete functions** from Hono (542), TanStack Query (774), and Vite (1,098):

- **124 actual requests**, at most four concurrent, with **124 visible incremental updates**.
- **303 ms** from the Analyze click to the first HTTP response; **203 ms** from the worker starting to its first accepted result.
- **8.87 seconds** from click to completion; **8.74 seconds** of active worker time.
- All 2,414 functions assessed, with no failed batches, unknown scores, or browser errors in that run.
- Top results included `persisterGc` (94%), `removeQueries` (93%), `detectLanguage` (92%), `restoreQueries` (92%), and `extractHostnamesFromCerts` (87%).

This is real batched streaming: every update follows a returned Jev response. Keyword overlap prioritizes the queue but excludes no candidates. Scores from separate batches are estimates, and false positives remain possible. A fallback-only `readFileIfExists` scored 51% in this run; its source does not establish continued processing of other items. Tightening the question to require every stated condition reduced overmatching without overriding model scores.

The 16-function authored corpus remains available as a control. Earlier calls ranked `syncMembers`/`deliverBatch` at 95%/94% for catch-and-continue, while the misleading “continue” log in `readProjectSettings` scored 5%. A rethrow query changed the ranking.

## Changelog pipeline

The final browser pass made one **120-question Jev request** for the selected 24-commit revision. Jev's provider call took **293 ms**. Code excluded three explicit revert pairs (six commits), leaving 18 commits in five categories.

The second tier used **`claude-haiku-4-5-20251001`**, returning **18 written entries in 8.67 seconds**. Every included SHA was cited in its supplied category. Exact handoff data, patches, categories, and response are inspectable in the UI. Source links opened the correct patch, and returning to Changelog preserved the written result. Both tiers support copying. The 390px layout had no page overflow.

The JSON validator rejects invented, excluded, cross-category, or missing commit citations, and missing/repeated categories. It does not establish that every written sentence is true; the source patches remain the evidence.

## Other live interactions

The Review refinement made **108 live judgments** (48 category scores and 60 yes/no checks) in **460 ms** of provider time. It marked the actual role expansion, swallowed batch failure, two weakened assertions, new test coverage, and changed HTTP response. Rename, formatting, fixture-text, and documentation hunks received no Yes checks. Each hunk's displayed percentages matched the returned scores in descending order, with values below 10% hidden. The 390px layout had no horizontal overflow. Warning styling uses yellow for permission expansion and red for swallowed errors/weakened assertions.

At a **662-token context budget**, the live Context pass retained about 660 tokens and collapsed all **10 budget-excluded turns**. All 33 original messages remained intact in the DOM. Manual expansion, pin/unpin, rail navigation, and returning from assembled context preserved the expected visibility. These interactions used one evaluation (218 ms provider time) with no extra inference for disclosure or budget changes.

| Demo          | Observed behavior                                                                                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workflows     | Inline findings retained exact YAML coordinates after edits; source links opened the relevant peer declaration. Aligned CI reduced mismatch judgments, while publishing remained an explained exception. Invalid YAML blocked inference. A real OpenAI draft was parsed and separately scanned by Jev. |
| Review lenses | Decorated both old and new changed ranges using Diffs; unchanged context lines stayed unmarked. Lens toggles, thresholds, Filter mode, and source expansion worked. Judgments are per hunk, not independently inferred for every marked line.                                                          |
| Duplicates    | The initial draft compared automatically. A typing burst produced one new comparison after a measured 425 ms from the final fill starting; the provider took 207 ms. The exact 399/400 ms debounce boundary is covered by a mocked-clock browser regression.                                           |
| Context       | The complete thread retained all 33 messages across 18 turns, including 15 call/result pairs. Budget and pin changes recomputed selection without more inference. Rail navigation, scroll position, assembled output, overflow reporting, and copying were checked.                                    |
| Discussion    | Source cutoffs excluded later decisions; acknowledgments alone did not create commitments. The original passages and final unresolved concern remained available.                                                                                                                                      |
| Replay        | Productive evidence differed from unchanged retries. The later unsupported success claim scored about 98% conflict in an earlier sample. Its preceding exit-zero output was more ambiguous, about 54%.                                                                                                 |

The eight-demo smoke run preceding the additional Review checks made **8 uncached requests**, validated **313 typed answers**, and passed all request contracts. Provider calls took **171–463 ms**, with local HTTP totals of **178–471 ms**. Semantic Search's smoke case intentionally uses one bounded 24-function public batch; the full corpus run above is a separate browser check.

Both general-purpose writer clients also worked live (`gpt-6-astra` and `claude-sonnet-5`). Workflow and query drafts are evaluated separately. Generated duplicate reports enter the same automatic comparison. The final `bun test:live --writers` run passed both query writers (2.11 s / 1.42 s) and the Jev → Haiku handoff (8.87 s), reusing the categorized history from the first pass and validating 18 cited commits.

## Verification scope

- **71 unit tests** and **32 browser tests** pass. TypeScript, strict lint, formatting, and the production build pass. Committed browser tests mock every provider endpoint and reject unexpected API traffic.
- Unit checks cover source-coordinate mapping, AST extraction and corpus provenance, batch limits, stream concurrency and resume behavior, invalidation, changelog membership and citations, YAML parsing, typed probabilities, source cutoffs, context pairing/budgets, and replay policy.
- Browser regressions cover all routes, 390px layouts, evaluation evidence, delayed writer/evaluation responses, exact duplicate debounce/cancellation, changelog handoffs, streaming out-of-order arrivals, Stop/Resume, and query/source/corpus invalidation.
- Live browser passes covered inline workflow evidence, decorated review ranges, all 2,414 search candidates, automatic duplicate comparison, both changelog tiers, source navigation, and the complete context thread.
- The production index and all eight routes loaded without page errors or failed assets. Diffs rendered actual source rows. The five redesigned layouts were also checked at 390px, 900px, and 1,001px without page overflow. Public corpus and license files were served intact.
- A scan of 425 source, public, and built files found no credential values. Secret-file paths returned 404, `.dev.vars` remained ignored with mode 0600, and the health endpoint exposed only configuration flags and model names.
- The earlier full React Doctor scan reported **zero errors and 29 advisory warnings** (68/100). The fetch-status warning is a false positive: `server/jev.ts` checks `response.ok` before reading JSON. Loading cleanup deliberately checks request versions; the duplicate effect must resubscribe when its debounced inputs change. Other advisories concern component size/complexity, small-array lookups, a four-item state initializer, stateless error-row keys, and sequential offline corpus extraction. No diagnostics were suppressed.
- The Review/Context refinement scan reported **zero errors and two maintainability advisories** (91/100), concerning Context component size and complexity.
- The Diffs dependency emits some large lazy chunks; Vite reports a chunk-size advisory. The production build succeeds. This research app has not been tuned for deployment payload size.

Whole-repository retrieval, labeled quality/calibration studies, downstream context-selection quality, and control of a running agent remain separate experiments. The public corpus supplies complete function excerpts, not all imported implementations or whole-program execution context.
