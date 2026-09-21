import { expect, test as base, type Page } from "@playwright/test";
import type {
  Answer,
  GenerateRequest,
  GenerateResponse,
  JevRequest,
  JevResponse,
  Question,
} from "../../shared/api";
import { HISTORY_COMMITS, HISTORY_CONTEXT } from "../../src/demos/code/history-data";
import { draftPresets, reports } from "../../src/demos/duplicates/data";

// These regressions use controlled provider responses only. An unhandled API call fails the test.
const test = base.extend<{ apiGuard: void }>({
  apiGuard: [
    async ({ page }, use) => {
      const unexpected: string[] = [];
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.route("**/api/**", async (route) => {
        if (new URL(route.request().url()).pathname === "/api/health") {
          await route.fulfill({
            json: {
              jev: { configured: true, model: "mock-jev" },
              openai: { configured: true, model: "mock-openai" },
              anthropic: { configured: true, model: "mock-haiku" },
            },
          });
          return;
        }
        unexpected.push(route.request().url());
        await route.fulfill({ status: 503, json: { error: "Unmocked API call blocked by test." } });
      });
      await use();
      expect(unexpected, "A test attempted an unmocked provider call").toEqual([]);
      expect(pageErrors, "The page raised an uncaught exception").toEqual([]);
    },
    { auto: true },
  ],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

async function holdFirstResponse<Input, Output>(
  page: Page,
  endpoint: string,
  subsequent: (input: Input) => Output,
) {
  const submitted = deferred<Input>();
  const response = deferred<Output>();
  const completed = deferred<void>();
  const requests: Input[] = [];
  await page.route(`**/api/${endpoint}`, async (route) => {
    const input = route.request().postDataJSON() as Input;
    requests.push(input);
    if (requests.length > 1) {
      await route.fulfill({ json: subsequent(input) });
      return;
    }
    submitted.resolve(input);
    try {
      await route.fulfill({ json: await response.promise });
    } finally {
      completed.resolve();
    }
  });
  return {
    requests,
    submitted: submitted.promise,
    async release(body: Output) {
      response.resolve(body);
      await completed.promise;
    },
  };
}

async function allowLateResponses(page: Page) {
  // Abort may lose a race with transport completion. Deliver that response anyway to test the guard.
  await page.addInitScript(() => {
    const testWindow = window as unknown as Window & { __iterationBodyReads: string[] };
    const nativeFetch = testWindow.fetch.bind(testWindow);
    testWindow.__iterationBodyReads = [];
    testWindow.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!/\/api\/(evaluate|generate)$/.test(url)) return nativeFetch(input, init);
      const response = await nativeFetch(input, { ...init, signal: undefined });
      const read = response.json.bind(response);
      response.json = async () => {
        const body = await read();
        testWindow.__iterationBodyReads.push(body.meta?.requestId ?? body.model);
        return body;
      };
      return response;
    };
  });
}

async function expectBodyRead(page: Page, marker: string) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as Window & { __iterationBodyReads: string[] }).__iterationBodyReads,
      ),
    )
    .toContain(marker);
}

async function pauseClock(page: Page) {
  await page.clock.install({ time: new Date("2026-09-20T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-20T12:01:00Z"));
}

function evaluation(
  request: JevRequest,
  requestId: string,
  answer: (key: string, question: Question) => Answer,
): JevResponse {
  return {
    model: "mock-jev-browser-regression",
    answers: Object.fromEntries(
      Object.entries(request.questions).map(([key, question]) => [key, answer(key, question)]),
    ),
    usage: { input_tokens: 100, output_tokens: 20 },
    meta: {
      requestId,
      providerMs: 12,
      totalMs: 14,
      cached: false,
      questionCount: Object.keys(request.questions).length,
      at: "2026-09-20T12:00:00.000Z",
    },
  };
}

function duplicateEvaluation(request: JevRequest, requestId: string, winner = "184") {
  return evaluation(request, requestId, (key, question) => {
    const selected = key.endsWith(`_${winner}`);
    if (question.type === "noul") return { type: "noul", noul: selected ? 0.99 : 0.01 };
    expect(question.type).toBe("choice");
    const choice = key.startsWith("relationship_")
      ? selected
        ? "duplicate"
        : "different"
      : selected
        ? "p0"
        : "none";
    return { type: "choice", choice, confidence: 0.99, probabilities: { [choice]: 0.99 } };
  });
}

async function mockDuplicates(page: Page) {
  const requests: JevRequest[] = [];
  await page.route("**/api/evaluate", async (route) => {
    const input = route.request().postDataJSON() as JevRequest;
    requests.push(input);
    await route.fulfill({ json: duplicateEvaluation(input, `mock-comparison-${requests.length}`) });
  });
  return requests;
}

test.describe("Duplicate reports automatic comparison", () => {
  test("the valid initial draft compares automatically without a button press", async ({
    page,
  }) => {
    const requests = await mockDuplicates(page);
    await page.goto("/duplicates");
    await expect(
      page.getByRole("button", { name: "Inspect evaluation", exact: true }),
    ).toBeVisible();
    expect(requests).toHaveLength(1);
    await pauseClock(page);
    expect(requests[0]).toMatchObject({
      tag: "duplicate-constellation",
      cache: false,
      state: { draft: { title: draftPresets[0].title, body: draftPresets[0].body } },
    });
    expect((requests[0].state as { reports: unknown[] }).reports).toHaveLength(reports.length);
    expect(Object.keys(requests[0].questions)).toHaveLength(reports.length * 3);
    await page.clock.runFor(2000);
    expect(requests).toHaveLength(1);
  });

  test("a typing burst restarts the timer and submits only its final draft", async ({ page }) => {
    const requests = await mockDuplicates(page);
    await page.goto("/duplicates");
    await expect(
      page.getByRole("button", { name: "Inspect evaluation", exact: true }),
    ).toBeVisible();
    await pauseClock(page);
    const title = page.getByRole("textbox", { name: "Title", exact: true });
    const description = page.getByRole("textbox", { name: "Description", exact: true });
    await title.fill("A draft title in progress");
    await expect(page.getByRole("status")).toHaveText("Waiting for typing to stop…");
    await page.clock.runFor(250);
    await description.fill("The preview stopped after the first branch switch.");
    await page.clock.runFor(250);
    const finalTitle = "Preview becomes stale after switching branches twice";
    const finalBody =
      "The second branch switch keeps the previous preview. Reloading the pane fixes it.";
    await title.fill(finalTitle);
    await description.fill(finalBody);
    await page.clock.runFor(399);
    expect(requests).toHaveLength(1);
    await page.clock.runFor(1);
    await expect.poll(() => requests.length).toBe(2);
    expect((requests[1].state as { draft: unknown }).draft).toEqual({
      title: finalTitle,
      body: finalBody,
    });
    await expect(
      page.getByRole("button", { name: "Inspect evaluation", exact: true }),
    ).toBeVisible();
    await page.clock.runFor(1200);
    expect(requests).toHaveLength(2);
  });

  for (const invalid of [
    { field: "Title", value: "   ", repaired: "The valid title returns" },
    {
      field: "Description",
      value: " short ",
      repaired: "A sufficiently detailed description returns.",
    },
  ]) {
    test(`insufficient ${invalid.field.toLowerCase()} cancels a pending comparison`, async ({
      page,
    }) => {
      const requests = await mockDuplicates(page);
      await page.goto("/duplicates");
      await expect(
        page.getByRole("button", { name: "Inspect evaluation", exact: true }),
      ).toBeVisible();
      await pauseClock(page);
      await page.getByRole("textbox", { name: "Title", exact: true }).fill("A newer valid draft");
      await page.clock.runFor(200);
      const input = page.getByRole("textbox", { name: invalid.field, exact: true });
      await input.fill(invalid.value);
      await expect(page.getByRole("status")).toHaveText(
        "Add a title and at least 10 description characters.",
      );
      await expect(page.getByRole("button", { name: "Compare now", exact: true })).toBeDisabled();
      await expect(page.locator(".evaluation-bar")).toContainText("Not evaluated");
      await page.clock.runFor(2000);
      expect(requests).toHaveLength(1);
      await expect(page.locator(".duplicate-report-row .probability-value")).toHaveText(
        Array(reports.length).fill("—"),
      );
      await input.fill(invalid.repaired);
      await page.clock.runFor(399);
      expect(requests).toHaveLength(1);
      await page.clock.runFor(1);
      await expect.poll(() => requests.length).toBe(2);
    });
  }

  test("an older held evaluation cannot replace the edited draft or its newer assessment", async ({
    page,
  }) => {
    await allowLateResponses(page);
    const pending = await holdFirstResponse<JevRequest, JevResponse>(page, "evaluate", (input) =>
      duplicateEvaluation(input, "mock-newer-comparison", "221"),
    );
    await page.goto("/duplicates");
    const older = await pending.submitted;
    await pauseClock(page);
    const nextTitle = "New draft: stale preview after a branch switch";
    const nextBody =
      "Only switching branches causes this. Restarting does not reproduce it; refreshing fixes it.";
    await page.getByRole("textbox", { name: "Title", exact: true }).fill(nextTitle);
    await page.getByRole("textbox", { name: "Description", exact: true }).fill(nextBody);
    await expect(page.locator(".evaluation-bar")).toContainText("Not evaluated");
    await page.clock.runFor(400);
    await expect(page.getByRole("heading", { name: "Source #221", exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Inspect evaluation", exact: true }),
    ).toBeVisible();
    await pending.release(duplicateEvaluation(older, "mock-older-comparison", "184"));
    await expectBodyRead(page, "mock-older-comparison");
    await page.clock.runFor(32);
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(nextTitle);
    await expect(page.getByRole("textbox", { name: "Description", exact: true })).toHaveValue(
      nextBody,
    );
    await expect(page.getByRole("heading", { name: "Source #221", exact: true })).toBeVisible();
    expect(pending.requests).toHaveLength(2);
    expect((pending.requests[1].state as { draft: unknown }).draft).toEqual({
      title: nextTitle,
      body: nextBody,
    });
    await page.getByRole("button", { name: "Inspect evaluation", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Evaluation", exact: true });
    await drawer.getByRole("button", { name: "Answers & timing", exact: true }).click();
    const shown = JSON.parse(await drawer.locator(".evidence-json").innerText()) as JevResponse;
    expect(shown.meta.requestId).toBe("mock-newer-comparison");
    expect(shown.answers.same_221).toEqual({ type: "noul", noul: 0.99 });
    expect(shown.answers.same_184).toEqual({ type: "noul", noul: 0.01 });
  });
});

// Deliberately chosen mock categories, independent of the production grouping implementation.
// c23's low-confidence Tests answer must land in Needs review.
const categoryFixtures = [
  { category: "permissions", label: "Access control", ids: ["c05", "c09", "c12", "c21", "c24"] },
  {
    category: "behavior",
    label: "Product behavior",
    ids: ["c01", "c02", "c07", "c11", "c14", "c16", "c18", "c20"],
  },
  { category: "migration", label: "Data migrations", ids: ["c03", "c13", "c22"] },
  { category: "tests", label: "Tests", ids: ["c04", "c10", "c15", "c19"] },
  { category: "maintenance", label: "Maintenance", ids: ["c06", "c08", "c17"] },
  { category: "uncertain", label: "Needs review", ids: ["c23"] },
] as const;
const canceledIds = ["c09", "c12", "c16", "c18", "c21", "c24"];

function expectedGroups(count = 24, omitReverts = true) {
  const included = HISTORY_COMMITS.slice(0, count);
  return categoryFixtures
    .map((group) => ({
      category: group.category,
      label: group.label,
      commits: included.filter(
        (commit) =>
          (group.ids as readonly string[]).includes(commit.id) &&
          (!omitReverts || !canceledIds.includes(commit.id)),
      ),
    }))
    .filter((group) => group.commits.length > 0);
}

function historyEvaluation(request: JevRequest, requestId: string) {
  return evaluation(request, requestId, (key, question) => {
    if (question.type === "noul") return { type: "noul", noul: 0.1 };
    expect(question.type).toBe("choice");
    const id = key.replace("changelog_", "");
    const choice =
      id === "c23"
        ? "tests"
        : categoryFixtures.find((group) => (group.ids as readonly string[]).includes(id))?.category;
    expect(choice, `No mock category for ${key}`).toBeDefined();
    const confidence = id === "c23" ? 0.2 : 0.94;
    return {
      type: "choice",
      choice: choice!,
      confidence,
      probabilities: { [choice!]: confidence },
    };
  });
}

async function mockHistory(page: Page) {
  const requests: JevRequest[] = [];
  await page.route("**/api/evaluate", async (route) => {
    const input = route.request().postDataJSON() as JevRequest;
    requests.push(input);
    await route.fulfill({ json: historyEvaluation(input, `mock-history-${requests.length}`) });
  });
  return requests;
}

function expectWriterHandoff(request: GenerateRequest, count = 24, omitReverts = true) {
  expect(request.provider).toBe("anthropic");
  expect(request.task).toBe("changelog");
  expect(request.context).toEqual({
    project: HISTORY_CONTEXT.project,
    provenance: HISTORY_CONTEXT.provenance,
    revision: count === 24 ? "Preview 0.9" : "Preview 0.8",
    instruction: expect.stringContaining("preserving their categories and exact commit citations"),
    excluded: HISTORY_COMMITS.slice(0, count)
      .filter((commit) => omitReverts && canceledIds.includes(commit.id))
      .map(({ sha, message }) => ({ sha, message })),
    groups: expectedGroups(count, omitReverts).map((group) => ({
      category: group.category,
      commits: group.commits.map(({ sha, message, path, diff, context }) => ({
        sha,
        message,
        path,
        diff,
        ...(context ? { context } : {}),
      })),
    })),
  });
}

function writtenResponse(request: GenerateRequest, marker: string): GenerateResponse {
  const context = request.context as { groups: { category: string; commits: { sha: string }[] }[] };
  return {
    provider: "anthropic",
    model: marker,
    text: JSON.stringify({
      sections: context.groups.map((group) => ({
        category: group.category,
        entries: group.commits.map((commit) => ({
          text: `${marker}: written entry for ${commit.sha}.`,
          commits: [commit.sha],
        })),
      })),
    }),
    durationMs: 15,
    usage: { input_tokens: 300, output_tokens: 150 },
  };
}

async function categorize(page: Page, count = 24) {
  await page.getByRole("button", { name: `Categorize ${count} commits`, exact: true }).click();
  await expect(page.getByRole("button", { name: "Write with Haiku", exact: true })).toBeEnabled();
}

test.describe("History changelog handoff", () => {
  test("Jev organizes the first pass, the writer gets exact grouped patches, and citations open their source", async ({
    page,
  }) => {
    const evaluations = await mockHistory(page);
    const generations: GenerateRequest[] = [];
    let written: GenerateResponse | undefined;
    await page.route("**/api/generate", async (route) => {
      const input = route.request().postDataJSON() as GenerateRequest;
      generations.push(input);
      written = writtenResponse(input, "mock-valid-haiku");
      await route.fulfill({ json: written });
    });
    await page.goto("/history");
    await expect(
      page.getByRole("button", { name: "Write with Haiku", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("checkbox", { name: "Omit explicit revert pairs", exact: true }),
    ).toBeChecked();
    await categorize(page);
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0]).toMatchObject({ tag: "history-changelog", cache: false });
    expect(evaluations[0].state).toEqual({ ...HISTORY_CONTEXT, commits: HISTORY_COMMITS });
    expect(
      Object.entries(evaluations[0].questions).filter(
        ([key, question]) => key.startsWith("changelog_") && question.type === "choice",
      ),
    ).toHaveLength(24);
    expect(generations).toHaveLength(0);
    await expect(
      page.getByText("18 commits organized · 6 cancel out", { exact: true }),
    ).toBeVisible();
    const grouped = page.locator(".history-changelog-columns > .panel").nth(0);
    const writer = page.locator(".history-changelog-columns > .panel").nth(1);
    const groups = expectedGroups();
    await expect(grouped.locator(".history-changelog-group")).toHaveCount(groups.length);
    for (const [index, expected] of groups.entries()) {
      const section = grouped.locator(".history-changelog-group").nth(index);
      await expect(section.getByRole("heading", { level: 3 })).toContainText(expected.label);
      await expect(section.locator("li button span")).toHaveText(
        expected.commits.map((commit) => commit.message),
      );
      await expect(section.locator("li button code")).toHaveText(
        expected.commits.map((commit) => commit.sha),
      );
    }
    await page.getByRole("button", { name: "Write with Haiku", exact: true }).click();
    await expect(writer.locator(".history-changelog-group li > p")).toHaveCount(18);
    expect(generations).toHaveLength(1);
    expectWriterHandoff(generations[0]);
    const expectedEntries = groups.flatMap((group) =>
      group.commits.map((commit) => `mock-valid-haiku: written entry for ${commit.sha}.`),
    );
    await expect(writer.locator(".history-changelog-group li > p")).toHaveText(expectedEntries);
    await page.getByText("Inspect writer handoff", { exact: false }).click();
    const inspected = JSON.parse(await page.locator(".history-changelog-details pre").innerText());
    expect(inspected).toEqual({ request: generations[0], response: written });
    const cited = HISTORY_COMMITS.find((commit) => commit.id === "c05")!;
    await writer.getByRole("button", { name: cited.sha, exact: true }).click();
    const source = page.locator("#history-source");
    await expect(source.getByRole("heading", { name: cited.message, exact: true })).toBeVisible();
    await expect(source.locator(".panel-header p")).toContainText(cited.sha);
    await expect(source.locator(".code-commit-file code")).toHaveText(cited.path);
    expect(await source.locator(".code-line > code").allTextContents()).toEqual(
      cited.diff.split("\n"),
    );
    await expect(page.locator(".code-commit.is-selected code")).toHaveText(cited.sha);
    expect(evaluations).toHaveLength(1);
    expect(generations).toHaveLength(1);
  });

  for (const change of ["revision", "revert-pair switch"] as const) {
    test(`changing the ${change} while writing discards a late response`, async ({ page }) => {
      await allowLateResponses(page);
      const evaluations = await mockHistory(page);
      const staleMarker = `mock-stale-${change}`;
      const freshMarker = `mock-fresh-${change}`;
      const pending = await holdFirstResponse<GenerateRequest, GenerateResponse>(
        page,
        "generate",
        (input) => writtenResponse(input, freshMarker),
      );
      await page.goto("/history");
      await categorize(page);
      await page.getByRole("button", { name: "Write with Haiku", exact: true }).click();
      const older = await pending.submitted;
      expectWriterHandoff(older);
      await expect(page.getByRole("button", { name: "Writing…", exact: true })).toBeDisabled();
      if (change === "revision") {
        await page
          .getByRole("combobox", { name: "Revision", exact: true })
          .selectOption("preview_08");
        await expect(
          page.getByRole("button", { name: "Write with Haiku", exact: true }),
        ).toBeDisabled();
        await categorize(page, 12);
        await expect(
          page.getByText("10 commits organized · 2 cancel out", { exact: true }),
        ).toBeVisible();
      } else {
        await page
          .getByRole("checkbox", { name: "Omit explicit revert pairs", exact: true })
          .uncheck();
        await expect(
          page.getByText("24 commits organized · 0 cancel out", { exact: true }),
        ).toBeVisible();
      }
      await page.getByRole("button", { name: "Write with Haiku", exact: true }).click();
      const writer = page.locator(".history-changelog-columns > .panel").nth(1);
      const count = change === "revision" ? 10 : 24;
      await expect(writer.locator(".history-changelog-group li > p")).toHaveCount(count);
      await expect(writer.locator(".history-changelog-footer")).toContainText(freshMarker);
      expect(pending.requests).toHaveLength(2);
      expectWriterHandoff(
        pending.requests[1],
        change === "revision" ? 12 : 24,
        change === "revision",
      );
      const accepted = await writer.locator(".history-changelog-group li > p").allTextContents();
      await pending.release(writtenResponse(older, staleMarker));
      await expectBodyRead(page, staleMarker);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(writer.locator(".history-changelog-group li > p")).toHaveText(accepted);
      await expect(writer).not.toContainText(staleMarker);
      await expect(
        page.getByRole("button", { name: "Rewrite with Haiku", exact: true }),
      ).toBeEnabled();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await page.getByText("Inspect writer handoff", { exact: false }).click();
      const inspected = JSON.parse(
        await page.locator(".history-changelog-details pre").innerText(),
      );
      expect(inspected.request).toEqual(pending.requests[1]);
      expect(inspected.response.model).toBe(freshMarker);
      expect(evaluations).toHaveLength(change === "revision" ? 2 : 1);
      expect(pending.requests).toHaveLength(2);
    });
  }
});
