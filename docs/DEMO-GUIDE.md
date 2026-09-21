# Demo guide

Start at [localhost:4317](http://localhost:4317). A useful first sequence is Workflows → Semantic Search → Review lenses → History. Semantic Search uses pinned public source; the other demos use authored examples. Jev runs live, with measured timings and inspectable inputs and answers.

## Workflow scanner

1. Scan the default copied CI workflow. Findings appear beside the relevant YAML lines, with separate labels for exact parser comparisons and Jev judgments.
2. Expand a finding and open its repository source on the right. Compare dependency refs, runtimes, install commands, permissions, and script coverage.
3. Switch to **Edit YAML**, change a declaration, and scan again. Source coordinates are recomputed from the edited document; old judgments clear immediately.
4. Try the aligned and publishing examples. A different toolchain can be justified by the publishing task; uniformity alone is insufficient.
5. Select **Compose**, draft a workflow with OpenAI or Claude, then scan the editable YAML independently.

The parser finds declarations and discrepancies. Jev assesses purpose, relevant peer workflows, and whether differences have an explanation. The inline renderer uses [Diffs](https://diffs.com/docs) source coordinates; expanded evidence and the full evaluation remain accessible. Invalid YAML blocks analysis. The demo does not resolve current Marketplace versions or execute workflows.

## Semantic Search

1. Keep **All public repositories · 2,414 functions** selected and analyze **Catch & continue**. Watch assessed counts, new arrivals, and rankings change as actual responses arrive.
2. **Stop** partway through, inspect a source, then **Resume**. Completed batches stay available; only unfinished work is submitted again.
3. Select a result to hold its source steady, or enable **Follow top result**. Open the pinned upstream source, license, or exact batch evaluation.
4. Try retry/backoff, resource disposal, or path traversal queries. Narrow to Hono, TanStack Query, or Vite with the corpus selector, or compare keyword ranking.
5. Choose the 16-function authored corpus for a smaller controlled comparison. Its misleading “continue” log in `readProjectSettings` actually rethrows; the behavior should determine relevance.
6. Edit a function or draft a new query and reanalyze. All scores for the previous inputs clear immediately.

The public corpus contains 542 Hono, 774 TanStack Query, and 1,098 Vite functions at pinned commits. Excerpts preserve complete function bodies, source paths, line numbers, and applicable notices. Every selected function is queued; keyword overlap only determines processing order. Four bounded requests run concurrently, and ranks merge when each real batch returns. The default query uses 124 batches, with no staged playback or invented intermediate scores.

Each function gets a separate judgment. Probabilities from separate batches are estimates, not a calibrated search benchmark. Imported implementations and broader program state are absent; a fallback can resemble catch-and-continue without meeting every condition. Use the source to inspect such false positives. See [corpus method and licenses](../public/semantic-search/NOTICE.md).

## Review lenses

1. Analyze the diff in the default **Decorate** mode. Colored range marks and inline judgments appear on the actual changed lines.
   Category scores appear highest first within each hunk; values below 10% are hidden.
2. Toggle the **Access control** lens and compare real role/authorization changes with a permission-related rename.
3. Enable **Weaker tests** and inspect removed or replaced assertions. Adjust **Mark at** to see which ranges retain their marks.
4. Inspect the separate Yes checks. **Expands permissions** has a yellow warning icon; **Swallows errors** and **Weakens assertions** have red warnings. **Changes API response** and **Adds test coverage** use check marks. Only affirmative answers appear on their matching hunks, independently of category scores and lens selection.
5. Switch to **Filter** to fold unrelated hunks, then unfold one to inspect what was excluded. Expand **Context and scores** for the source contract and ranked categories. **Inspect evaluation** retains every answer, including hidden scores and No checks.

Jev classifies each hunk across four lenses. Code maps that judgment onto its exact old/new changed ranges; it is not a separate model diagnosis of each line. Context lines are not decorated. Lens toggles, thresholds, and folding are local and reversible, with all source hunks still accessible.

## Duplicate reports

1. Open **After a restart**. Comparison starts automatically after a 400 ms pause. Select a connected report and inspect its original evidence passage.
2. Choose the branch-switch example. The same broad symptom should lead to a different set of related reports.
3. Try the vague example. Notice the explicit unclear category rather than treating every similar symptom as a duplicate.
4. Type or generate a differently worded report and let it compare automatically. **Compare now** runs immediately. Hide or restore one suggested edge.

The model compares all 12 sources. Typing clears old results immediately and restarts the 400 ms debounce; late responses cannot replace newer inputs. A blank title or a description shorter than 10 characters cancels comparison. Node distance encodes same-failure probability; angles are fixed for readability. Edges connect each candidate to the draft, not candidate-to-candidate. A separate categorical confidence gate can leave a high-scoring candidate unclear. Hiding an edge is a local presentation action.

## Discussion timeline

1. Analyze the default preview-recovery discussion and open the latest decision's original passage.
2. Read through post 8 and analyze again. The later reversal should be absent because those posts are absent from the request.
3. Try the thread with enthusiasm but no decision. Agreement alone should not establish a commitment.
4. View **Still open**, edit a post, or generate/load another thread.

Jev labels each visible post and separately checks explicit commitment and whether a concern was addressed later. The UI selects original passages; it does not generate an authoritative summary. An unresolved question can remain after a decision.

## Commit history

1. Select a revision and **Categorize** its commits. **Jev only** groups the original messages by what the patches do; it does not rewrite them.
2. Choose **Write with Haiku**. Compare the resulting prose with the original groups. The writer receives Jev's categories, commit messages, exact patches, and allowed SHAs.
3. Follow a cited SHA to **Explore commits**, inspect its patch, then return to **Changelog**. The written result stays available.
4. Toggle **Omit explicit revert pairs**. Both an explicitly reversed patch and its undo commit are excluded by default; including them clears the old written result before another draft.
5. Switch revision snapshots and categorize again. Only commits present at that revision are sent. Low-confidence categories appear in **Needs review**.
6. In **Explore commits**, compare migration, permissions, and test facets with message-only search. Copy either changelog tier or inspect the complete writer handoff.

The first tier uses Jev alone; the second uses `claude-haiku-4-5-20251001` by default, configurable through `CHANGELOG_MODEL`. Generated JSON must preserve the supplied categories, cover every included commit, and cite only permitted SHAs in their own category. These checks validate references and coverage, not the truth of every sentence. Exact revision/revert relationships come from the fixture data. No live repository is fetched.

## Context selection

1. Evaluate the objective in the stacked controls on the left. The right-hand **Full thread** preserves every source message, including complete tool calls and results.
2. Use the vertical turn rail to jump through the conversation. Its legend identifies protected/pinned, retained, and recoverable turns; the current position follows scrolling.
3. Find the early cancellation design evidence and compare it with stale failures and repeated command output. Lower the budget: turns excluded by the budget collapse to their headers. Expand a title to inspect the complete turn; the source stays intact.
4. Pin a recoverable turn back in, or raise the budget to restore it. Restored turns open automatically. Manual expansion stays in effect until the turn's retention reason changes. Budget and pin changes recompute selection locally without another model request.
5. Switch to **Assembled context** to inspect exactly what would be sent, or copy it. Return to **Full thread** to retain the original conversational context.
6. Change the objective and evaluate again.

Jev assesses relevance and useful evidence. Code selects complete call/result pairs under a budget, always preserving protected instructions and the current goal. Token counts are explicitly estimates based on Unicode characters ÷ 4. If protected or pinned material exceeds the budget, the UI reports the overflow. This measures selection behavior, not downstream coding success.

## Run replay

1. Select the productive run and **Scan run**. Step through a failure that produces useful evidence and a later recovery.
2. Scan the repeated-error run. Distinguish a tool failure that advances the investigation from another unchanged attempt.
3. Select **Exit zero, broken check**. Inspect the recorded tool output, then the agent's success claim.
4. Scrub backward and inspect an evaluation. It includes only the trace through that event.

Jev assesses new evidence, repetition, contradiction, and whether to replan. A small explicit policy summarizes multiple signals; the recorded exit code is shown separately. These are replayed fixtures, not a live agent being interrupted. The exit-zero example preserves ambiguity: the tool output itself can be borderline while the later unsupported success claim is much clearer.

## Reading the results

Probabilities are model judgments, not measured accuracy. The authored examples and public function corpus demonstrate interactions and expose failure cases. Edit examples, inspect low-confidence answers, and compare sources before treating behavior as dependable on another repository.

Provider timing measures the server's HTTP call, including a retry when necessary. Total timing includes the local request path. Semantic Search additionally measures first result and active wall time across concurrent batches. Values are observed per run, not model-only inference benchmarks.
