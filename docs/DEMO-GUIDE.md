# Demo guide

Start at [localhost:4317](http://localhost:4317). A useful first sequence is Workflows → Code → Duplicates → Replay. All inputs are authored examples; the analysis buttons call Jev live. Timings and exact inputs remain available below the controls.

## Workflow scanner

1. Scan the default copied CI workflow. Inspect dependency versions, runtime/install differences, permissions, and matching repository files.
2. Choose the aligned example and scan again. Compare the exact declarations and Jev's judgments about intent.
3. Choose the publishing example. A differing Node/toolchain choice can be justified by the publishing task; uniformity alone is insufficient.
4. Open the composer, select OpenAI or Claude, and draft a workflow. Review the editable YAML, then scan it independently.

The parser finds declarations and discrepancies. Jev assesses purpose, relevant peer workflows, and whether differences have an explanation. This demonstrates convention checking inside a repository, including reuse of an existing composite action. It does not resolve current versions from the Actions Marketplace or execute the YAML.

## Code search

1. Analyze **Catch & continue**. Inspect `syncMembers` and `deliverBatch`.
2. Compare the keyword results. `readProjectSettings` logs “continue” but immediately throws; source behavior should decide its relevance.
3. Switch to **Log & rethrow** and analyze again. The ranking should change.
4. Edit a function or draft a new query and reanalyze.

Every function receives a separate narrow judgment. The question, function contract, and actual body are inspectable. The small snapshot keeps results auditable; repository indexing and scalable candidate retrieval would be subsequent work.

## Review lenses

1. Analyze the diff and select the permission lens.
2. Compare the real role/authorization changes with a rename that mentions permissions.
3. Select weakened tests and inspect assertions that were replaced or removed.
4. Raise the threshold, then unfold a hidden hunk to check what the filter excluded.

The demo classifies shown hunks across four lenses. Thresholding and folding are local and reversible. Missing surrounding code can affect the classification, so the source and excluded hunks stay accessible.

## Duplicate reports

1. Compare **After a restart**. Select a connected report and inspect the original evidence passage.
2. Choose the branch-switch example. The same broad symptom should lead to a different set of related reports.
3. Try the vague example. Notice the explicit unclear category rather than treating every similar symptom as a duplicate.
4. Generate a differently worded report, compare it, and hide or restore one suggested edge.

The model compares all 12 sources. Node distance encodes same-failure probability; angles are fixed for readability. Edges connect each candidate to the draft, not candidate-to-candidate. A separate categorical confidence gate can leave a high-scoring candidate unclear. Hiding an edge is a local presentation action.

## Discussion timeline

1. Analyze the default preview-recovery discussion and open the latest decision's original passage.
2. Read through post 8 and analyze again. The later reversal should be absent because those posts are absent from the request.
3. Try the thread with enthusiasm but no decision. Agreement alone should not establish a commitment.
4. View **Still open**, edit a post, or generate/load another thread.

Jev labels each visible post and separately checks explicit commitment and whether a concern was addressed later. The UI selects original passages; it does not generate an authoritative summary. An unresolved question can remain after a decision.

## Commit history

1. Analyze the commit snapshot and filter by migration, permissions, and test changes.
2. Compare the facet results with a message-only search.
3. Inspect a reverted patch, toggle reverted changes, and switch revision snapshots.

The judgments use commit diffs. Exact commit/revert relationships and the current revision are computed from the fixture data. The example illustrates semantic history filters; it is not a fetched or continuously synchronized repository.

## Context selection

1. Evaluate the default objective and compare retained versus archived turns.
2. Find the early cancellation design evidence; compare it with stale failures and repeated command output.
3. Lower the budget. Pin an archived exchange back in, then inspect or copy the assembled context.
4. Choose a different objective and evaluate again.

Jev assesses relevance and useful evidence. Code selects complete call/result pairs under a budget, always preserving protected instructions and the current goal. Token counts are explicitly estimates based on Unicode characters ÷ 4. If protected or pinned material exceeds the budget, the UI reports the overflow. This measures selection behavior, not downstream coding success.

## Run replay

1. Select the productive run and **Scan run**. Step through a failure that produces useful evidence and a later recovery.
2. Scan the repeated-error run. Distinguish a tool failure that advances the investigation from another unchanged attempt.
3. Select **Exit zero, broken check**. Inspect the recorded tool output, then the agent's success claim.
4. Scrub backward and inspect an evaluation. It includes only the trace through that event.

Jev assesses new evidence, repetition, contradiction, and whether to replan. A small explicit policy summarizes multiple signals; the recorded exit code is shown separately. These are replayed fixtures, not a live agent being interrupted. The exit-zero example deliberately preserves ambiguity: the tool output itself can be borderline while the later unsupported success claim is much clearer.

## Reading the results

Probabilities are model judgments, not measured accuracy. These small examples are useful for demonstrating the interaction and finding failure cases. Edit the examples, inspect low-confidence answers, and compare sources before treating the behavior as dependable on a larger repository.

Provider timing measures the server's HTTP call, including a retry when necessary. Total timing also includes the local request path. Values are observed per run; they are not model-only inference benchmarks.
