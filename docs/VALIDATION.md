# Validation notes

Observed locally on September 20, 2026 using Jev `jev-1.13.0`. These are development checks against small authored fixtures, not a benchmark or an accuracy estimate.

The final eight-demo smoke run made **8 uncached requests**, validated **281 typed answers**, and passed all eight routes' request contracts. Observed provider HTTP durations were **193–553 ms**; local HTTP totals were **200–561 ms**. Run `bun test:live` to obtain a new sample.

## Observed behavior

| Demo        | Observation from live calls                                                                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflows   | Copied CI had 97% probability of an unexplained intent/convention mismatch. Aligned CI fell to 7%; publishing was treated as an explained exception at 97%.                                                                   |
| Code search | Catch-and-continue matched `syncMembers` and `deliverBatch` at 95%/94%, while the misleading “continue” log in `readProjectSettings` scored 5%. A rethrow question reversed the useful ranking.                               |
| Review      | Actual permission changes scored 98%; a permission-related rename scored 3%. Removed/weakened assertions scored 95–96%; a newly added test scored 3% on that lens.                                                            |
| Duplicates  | Restart reports favored the restart family; the branch-switch report moved to #221/#229 at 97%/94% same-failure probability. Vague reports retained unclear relationships.                                                    |
| Discussion  | The default thread identified earlier decisions and the later reversal, preserving the final open question. The “no decision” fixture did not turn acknowledgments into product commitments.                                  |
| History     | Migrations and tests were found from diffs despite ambiguous commit messages. Explicit revert relationships remained deterministic and revision-specific.                                                                     |
| Context     | Early design evidence survived selection while repeated output and obsolete errors ranked lower. The default selection retained about 1,431 estimated tokens under a 1,450-token budget.                                      |
| Replay      | Productive evidence differed from unchanged retries. The later unsupported success claim scored about 98% conflict. The preceding exit-zero tool output itself was ambiguous (~54% conflict), despite a strong replan signal. |

Numbers above come from individual runs during development and can vary. A categorical choice's confidence is separate from the same-failure probability; the duplicate demo uses both rather than silently equating them.

## Writer checks

Real OpenAI and Anthropic clients both produced usable content. The configured models were `gpt-6-astra` and `claude-sonnet-5`. A generated workflow was parsed and separately evaluated by Jev; both providers also produced code queries that were separately evaluated. Report JSON was validated before entering the demo. Drafting does not trigger automatic evaluation or execution.

## Verification scope

- **41 unit tests / 143 assertions** and **14 browser tests** pass. TypeScript and strict lint pass. Browser tests ran with every provider endpoint mocked and unexpected API traffic rejected.
- The production build passed. Its index and all eight routes loaded in Chrome without missing assets or page errors; an actual Jev comparison also passed through the production server. A credential-value scan found no matches in 66 source files or 30 built files.
- Unit checks cover request validation, malformed probabilities, exact question membership, source cutoffs, YAML line attribution and aliases, duplicate-key rejection, context pairing and budget overflow, and replay policy behavior.
- Browser checks cover all routes at desktop and 390px widths, source/evidence interactions, loading and invalidation, and delayed-response regressions. The committed browser suite mocks providers; `test:live` makes actual calls.
- Manual live browser passes covered all workflow examples, semantic/code filters, both writers, duplicate variants, discussion cutoffs, context budgets/pins, and all three complete replay traces.
- Provider failures are reported without exposing credentials or raw error bodies. Development and production secret-file paths are denied. The health endpoint returns only configured flags and model names.
- React Doctor reported **zero errors** and 21 advisory warnings (70/100). Its status-check warning is a false positive: `server/jev.ts` checks `response.ok` before consuming JSON. Loading-state cleanup is intentionally guarded against stale requests. Remaining advisories concern component size, small-array lookups, and source-line keys; they are not suppressed.

Inputs are deliberately small. Large repository retrieval, calibration against labeled real data, downstream context-selection quality, and control of a running agent are still separate experiments.
