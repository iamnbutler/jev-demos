# Shared build contract

This is a standalone sibling project. Provider credentials remain in server code. Keep shared API/UI changes compatible with all eight demos.

## Modules

- Actions: `src/demos/actions/ActionsDemo.tsx` (default export), feature data, analysis, tests, CSS in that folder.
- Code: `src/demos/code/CodeSearchDemo.tsx`, `ReviewDemo.tsx`, `HistoryDemo.tsx` (default exports), feature data/logic/CSS.
- Agents: `src/demos/agents/ContextDemo.tsx`, `ReplayDemo.tsx` (default exports), feature data/logic/CSS.
- Duplicate and discussion demos live in their respective folders. The app shell, server, and shared controls live outside the feature folders.

App renders a consistent page heading; each feature renders its controls and canvas, no duplicate page title.

## Jev

`import { useEvaluation, getNoul, getChoice, getScore, evaluate } from '../../lib/jev'`.

`const ev = useEvaluation()` has `{ data: JevResponse | null, loading: boolean, error: string | null, request: JevRequest | null, run(request): Promise<JevResponse | null>, reset(): void }`.

`ev.run({ state: any JSON-serializable value, questions: Record<string, Question>, tag: 'demo-name', cache: false })` sends to the local server. Jev primitives are defined in `shared/api.ts`; import types with `../../../shared/api`. Answers use `.type`, `.noul` OR `.choice/.confidence/.probabilities` OR `.score/.confidence`. `getNoul(data,key)` returns number or undefined; never turn missing answers into zeros. `getChoice`/`getScore` return the typed answer or undefined. One call may have many narrow questions. Export pure request-builder functions for live smoke tests. Do not access secrets or call remote providers directly from the browser.

Data is authored synthetic demo material, not genuine customer/repository evidence. Label provenance in the canvas. No hardcoded model answers presented as live. Use a Run/Analyze/Scan button for first inference (automatic loading is optional). Clear/mark stale results immediately when input changes. Preserve source passages, measured provider timing, typed judgments, uncertainty. No inference-based arithmetic or token counting.

## Shared UI

`import { Panel, PanelHeader, Button, Badge, Probability, EmptyState, EvaluationBar, EvidenceDrawer, Segmented, GenerationControl, CodeBlock } from '../../components/ui'`.

- `<Panel className?>children</Panel>`
- `<PanelHeader title="..." description? aside={ReactNode} />`
- `<Button variant="primary" | "secondary" | "ghost" | "danger" size="sm" | "md" loading? {...buttonProps}>...</Button>`
- `<Badge tone="neutral" | "green" | "amber" | "red" | "blue" | "purple">text</Badge>`
- `<Probability value={number | undefined} label? compact? />` (0..1, labeled probability)
- `<EmptyState icon={ReactNode} title="..." description="..." />`
- `<EvaluationBar evaluation={ev} label? />` (error, pending, timings; includes evidence drawer automatically)
- `<EvidenceDrawer request={ev.request} data={ev.data} />` (exact state/questions/response)
- `<Segmented value="..." onChange={(value)=>...} options={[{value:'...',label:'...'}]} ariaLabel="..." />`
- `<GenerationControl task="workflow" | "report" | "discussion" | "code-query" | "context-task" context={...} prompt="..." inputKey={...} onGenerated={(text,response)=>...} label="Draft" />` Optional provider picker and draft button. Include every destination input in `context` or `inputKey` so a delayed response cannot overwrite a newer edit. Generated content and Jev judgments have separate provenance.
- `<CodeBlock code={string} language? startLine? highlightLines={number[]} />` plain escaped code with line numbers, optional highlighted absolute line numbers.

Common classes: `.stack` (vertical gap12), `.row` (flex align center gap8), `.row.wrap`, `.spread`, `.muted`, `.small`, `.mono`, `.demo-toolbar`, `.field`, `.field-label`, `.input`, `.textarea`, `.select`, `.two-column` (1fr 1fr), `.three-column`, `.list-row`, `.surface-note`, `.divider`, `.sr-only`.

Follow [DESIGN.md](DESIGN.md): terse controls, readable type, a white/ink/blue palette, and a plain linked index. Feature CSS must be prefixed and live in the feature folder. Support narrow screens, keyboard interaction, labels, and status that does not depend on color alone.

## Verification

Run typecheck/lint/format/build plus browser and live-provider checks. Add focused tests for consequential deterministic algorithms: parsing, selecting context, exact links, and invalidation. Pure feature tests may live beside modules using `.test.ts`. Playwright tests use `.pw.ts` so Bun's unit-test discovery does not execute them. See the README for commands.
