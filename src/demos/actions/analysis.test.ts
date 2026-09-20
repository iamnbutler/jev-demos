import { describe, expect, test } from "bun:test";
import {
  buildActionsRequest,
  compareWorkflow,
  effectiveFacts,
  parseWorkflow,
  scriptCoverage,
} from "./analysis";
import { REPOSITORY_FILES, WORKFLOW_SCENES } from "./data";

describe("workflow source inventory", () => {
  test("preserves GitHub on keys, exact refs, and source lines", () => {
    const parsed = parseWorkflow(WORKFLOW_SCENES[0].yaml);
    expect(parsed.errors).toEqual([]);
    expect(parsed.triggers).toEqual(["pull_request"]);
    const checkout = parsed.facts.find((fact) => fact.key === "actions/checkout");
    expect(checkout?.value).toBe("v3");
    expect(WORKFLOW_SCENES[0].yaml.split("\n")[(checkout?.line ?? 0) - 1]).toContain(
      "actions/checkout@v3",
    );
    const runtime = parsed.facts.find((fact) => fact.kind === "runtime");
    expect(runtime?.value).toBe("22");
    expect(WORKFLOW_SCENES[0].yaml.split("\n")[(runtime?.line ?? 0) - 1]).toContain(
      "node-version: '22'",
    );
  });

  test("resolves supplied composite actions with source location and calling-job identity", () => {
    const parsed = parseWorkflow(WORKFLOW_SCENES[2].yaml);
    const facts = effectiveFacts(parsed);
    const bun = facts.find((fact) => fact.kind === "runtime" && fact.key === "Bun");
    expect(bun?.value).toBe("1.4.0");
    expect(bun?.job).toBe("validate");
    expect(bun?.file).toBe(".github/actions/setup-project/action.yml");
    expect(bun?.inheritedAt?.file).toBe(".github/workflows/candidate.yml");
    expect(compareWorkflow(parsed)).toEqual([]);
  });

  test("reports invalid YAML before building a model request", () => {
    const parsed = parseWorkflow(WORKFLOW_SCENES[3].yaml);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.errors[0].line).toBeGreaterThan(1);
    expect(compareWorkflow(parsed)).toEqual([]);
    expect(() => buildActionsRequest(WORKFLOW_SCENES[3].yaml)).toThrow("Resolve the YAML");
  });

  test("rejects duplicate keys instead of silently losing a permission declaration", () => {
    const parsed = parseWorkflow(
      "on: push\npermissions:\n  contents: read\n  contents: write\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps: []\n",
    );
    expect(parsed.errors.some((error) => error.message.includes("unique"))).toBe(true);
  });

  test("keeps runtime expressions unresolved", () => {
    const yaml = WORKFLOW_SCENES[0].yaml.replace("'22'", "'${{ matrix.node }}'");
    const parsed = parseWorkflow(yaml);
    const observed = compareWorkflow(parsed).find((observation) =>
      observation.id.startsWith("runtime:"),
    );
    expect(observed?.unresolved).toBe(true);
    expect(observed?.detail).toContain("does not resolve matrix");
    expect(parsed.facts.find((fact) => fact.kind === "runtime")?.value).toBe("${{ matrix.node }}");
  });

  test("recognizes block commands with actual line references", () => {
    const yaml =
      "on: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          npm install\n          npm run test\n";
    const parsed = parseWorkflow(yaml);
    expect(parsed.facts.find((fact) => fact.kind === "install")?.line).toBe(7);
    expect(parsed.facts.find((fact) => fact.kind === "script")?.line).toBe(8);
  });

  test("cites YAML alias use sites when child declarations are expanded", () => {
    const yaml =
      "on: push\nx-install: &install\n  run: npm install\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - *install\n";
    const parsed = parseWorkflow(yaml);
    expect(parsed.errors).toEqual([]);
    expect(parsed.facts.find((fact) => fact.kind === "install")?.line).toBe(8);
  });

  test("inventories remote reusable-workflow references as refs", () => {
    const yaml =
      "on: push\njobs:\n  shared:\n    uses: northstar/shared/.github/workflows/check.yml@v2\n";
    const parsed = parseWorkflow(yaml);
    expect(parsed.facts[0]).toMatchObject({
      kind: "action",
      key: "northstar/shared/.github/workflows/check.yml",
      value: "v2",
      line: 4,
    });
  });

  test("does not let a Bun setup in another job satisfy a script requirement", () => {
    const yaml =
      "on: push\njobs:\n  setup:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/setup-project\n  isolated:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run test\n";
    const observations = compareWorkflow(parseWorkflow(yaml));
    expect(observations.some((observation) => observation.id === "bun-script:isolated:test")).toBe(
      true,
    );
  });

  test("compares script coverage without treating unrelated workflows as requirements", () => {
    const ci = REPOSITORY_FILES.find((file) => file.path.endsWith("/ci.yml"))!;
    const candidate = parseWorkflow(WORKFLOW_SCENES[0].yaml);
    const coverage = scriptCoverage(candidate, parseWorkflow(ci.content, ci.path));
    expect(coverage.map(({ key, included }) => ({ key, included }))).toEqual([
      { key: "check", included: false },
      { key: "test", included: true },
    ]);
    expect(
      compareWorkflow(candidate).some((observation) => observation.id.includes("missing-script")),
    ).toBe(false);
  });

  test("retains the publishing exception for semantic evaluation rather than calling Node drift by itself a defect", () => {
    const candidate = parseWorkflow(WORKFLOW_SCENES[1].yaml);
    expect(
      candidate.facts.some(
        (fact) => fact.kind === "runtime" && fact.key === "Node" && fact.value === "24",
      ),
    ).toBe(true);
    expect(compareWorkflow(candidate)).toEqual([]);
    const request = buildActionsRequest(WORKFLOW_SCENES[1].yaml, WORKFLOW_SCENES[1].purpose);
    expect(request.questions.documented_exception.type).toBe("noul");
    expect(request.questions.expanded_permissions_justified.type).toBe("noul");
  });
});
