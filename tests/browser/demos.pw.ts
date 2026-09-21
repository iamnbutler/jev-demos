import { expect, test as base, type Page } from "@playwright/test";
import type { GenerateRequest, GenerateResponse, JevRequest, JevResponse } from "../../shared/api";

// Every provider response in this suite is controlled test data. No live model calls are allowed.
const test = base.extend<{ mockProviders: void }>({
  mockProviders: [
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
              anthropic: { configured: true, model: "mock-anthropic" },
            },
          });
          return;
        }
        if (new URL(route.request().url()).pathname === "/api/evaluate") {
          const input = route.request().postDataJSON() as JevRequest;
          if (input.tag === "duplicate-constellation") {
            await route.fulfill({ json: mockedDuplicateEvaluation(input) });
            return;
          }
        }
        unexpected.push(route.request().url());
        await route.fulfill({ status: 503, json: { error: "Unmocked API call blocked by test." } });
      });
      await use();
      expect(unexpected, "A browser test tried to use an unmocked API endpoint").toEqual([]);
      expect(pageErrors, "The page raised an uncaught exception").toEqual([]);
    },
    { auto: true },
  ],
});

const demos = [
  { route: "actions", title: "Workflow scanner" },
  { route: "code-search", title: "Semantic Search" },
  { route: "review", title: "Review lenses" },
  { route: "duplicates", title: "Duplicate reports" },
  { route: "discussion", title: "Discussion timeline" },
  { route: "history", title: "Commit history" },
  { route: "context", title: "Context selection" },
  { route: "replay", title: "Run replay" },
] as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

async function holdResponse<Input, Output>(page: Page, endpoint: string) {
  const submitted = deferred<Input>();
  const response = deferred<Output>();
  const completed = deferred<void>();
  await page.route(`**/api/${endpoint}`, async (route) => {
    submitted.resolve(route.request().postDataJSON() as Input);
    const body = await response.promise;
    try {
      await route.fulfill({ json: body });
    } finally {
      completed.resolve();
    }
  });
  return {
    submitted: submitted.promise,
    async release(body: Output) {
      response.resolve(body);
      await completed.promise;
    },
  };
}

function mockedDraft(text: string): GenerateResponse {
  return {
    text,
    provider: "openai",
    model: "mock-writer-for-race-test",
    durationMs: 1,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

function mockedDuplicateEvaluation(request: JevRequest): JevResponse {
  return {
    model: "mock-jev-for-auto-comparison",
    answers: Object.fromEntries(
      Object.entries(request.questions).map(([id, question]) => {
        if (question.type === "noul") return [id, { type: "noul", noul: 0.6 }];
        if (question.type !== "choice") throw new Error("Unexpected duplicate primitive");
        const keys = Object.keys(question.criteria);
        return [
          id,
          {
            type: "choice",
            choice: keys[0],
            confidence: 0.8,
            probabilities: Object.fromEntries(
              keys.map((key, index) => [key, index === 0 ? 0.9 : 0.1 / (keys.length - 1)]),
            ),
          },
        ];
      }),
    ),
    usage: { input_tokens: 1, output_tokens: 1 },
    meta: {
      requestId: "mock-auto-duplicate",
      providerMs: 1,
      totalMs: 1,
      cached: false,
      questionCount: Object.keys(request.questions).length,
      at: "2026-09-20T12:00:00Z",
    },
  };
}

async function openSemanticFixture(page: Page) {
  await page.goto("/code-search");
  await page.getByRole("combobox", { name: "Corpus", exact: true }).selectOption("fixture");
}

function mockedCodeEvaluation(
  request: JevRequest,
  requestId: string,
  probability = 0.93,
): JevResponse {
  for (const question of Object.values(request.questions)) expect(question.type).toBe("noul");
  return {
    model: "mock-jev-for-browser-test",
    answers: Object.fromEntries(
      Object.keys(request.questions).map((key) => [key, { type: "noul", noul: probability }]),
    ),
    usage: { input_tokens: 123, output_tokens: 16 },
    meta: {
      requestId,
      providerMs: 42,
      totalMs: 45,
      cached: false,
      questionCount: Object.keys(request.questions).length,
      at: "2026-09-20T12:00:00.000Z",
    },
  };
}

async function expectDemoReady(page: Page, title: string) {
  await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
  await expect(page.locator(".experiment .panel").first()).toBeVisible();
  await expect(page.getByText("This demo hit an error.", { exact: true })).toHaveCount(0);
}

test("index links open all eight demos", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".hub-row")).toHaveCount(demos.length);
  for (const demo of demos) {
    await page.goto("/");
    const link = page.locator(`.hub-row[href="/${demo.route}"]`);
    await expect(link).toContainText(demo.title);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/${demo.route}$`));
    await expectDemoReady(page, demo.title);
  }
});

test.describe("390px layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const demo of demos) {
    test(`${demo.route} has no page-level horizontal overflow`, async ({ page }) => {
      await page.goto(`/${demo.route}`);
      await expectDemoReady(page, demo.title);
      await expect(page.getByRole("combobox", { name: "Choose demo" })).toHaveValue(demo.route);
      const dimensions = await page.evaluate(async () => {
        await document.fonts.ready;
        return {
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
        };
      });
      expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(
        dimensions.viewport,
      );
      expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport);
    });
  }
});

test.describe("mocked evaluation evidence", () => {
  test("drawer preserves the exact input/questions/answers and closes with Escape", async ({
    page,
  }) => {
    let submitted: JevRequest | undefined;
    let result: JevResponse | undefined;
    await page.route("**/api/evaluate", async (route) => {
      submitted = route.request().postDataJSON() as JevRequest;
      result = mockedCodeEvaluation(submitted, "mock-evidence");
      await route.fulfill({ json: result });
    });
    await openSemanticFixture(page);
    const query = 'Find behavior containing literal <script> text & quoted "words".';
    await page.getByRole("textbox", { name: "Query", exact: true }).fill(query);
    await page.getByRole("button", { name: "Analyze", exact: true }).click();
    await expect(page.locator(".ss-progress")).toHaveAttribute("data-status", "complete");
    const inspect = page.getByRole("button", { name: "Inspect evaluation", exact: true });
    await expect(inspect).toBeVisible();
    expect(submitted).toBeDefined();
    expect(result).toBeDefined();
    expect((submitted!.state as { searchCriterion: string }).searchCriterion).toBe(query);
    await inspect.click();
    const drawer = page.getByRole("dialog", { name: "Evaluation", exact: true });
    await expect(drawer).toBeVisible();
    const contents = drawer.locator(".evidence-json");
    expect(JSON.parse(await contents.innerText())).toEqual(submitted!.state);
    await drawer.getByRole("button", { name: "Questions", exact: true }).click();
    expect(JSON.parse(await contents.innerText())).toEqual(submitted!.questions);
    await drawer.getByRole("button", { name: "Answers & timing", exact: true }).click();
    const shown = JSON.parse(await contents.innerText()) as JevResponse;
    expect(shown).toEqual({
      ...result,
      meta: { ...result!.meta, totalMs: expect.any(Number) },
    });
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(inspect).toBeFocused();
  });
});

test.describe("mocked writer races", () => {
  test("Code preserves a query edited while an older draft is in flight", async ({ page }) => {
    const pending = await holdResponse<GenerateRequest, GenerateResponse>(page, "generate");
    await openSemanticFixture(page);
    await page.getByRole("button", { name: "Draft query", exact: true }).click();
    expect((await pending.submitted).task).toBe("code-query");
    const query = page.getByRole("textbox", { name: "Query", exact: true });
    await query.fill("My newer manually written query");
    await pending.release(mockedDraft("STALE query that must never replace the edit"));
    await expect(page.getByRole("alert")).toContainText("input changed while drafting");
    await expect(query).toHaveValue("My newer manually written query");
    await expect(page.getByRole("button", { name: "Draft query", exact: true })).toBeEnabled();
  });

  test("Duplicates preserves a newer preset selected during generation", async ({ page }) => {
    const pending = await holdResponse<GenerateRequest, GenerateResponse>(page, "generate");
    await page.goto("/duplicates");
    await page.getByText("Generate a report", { exact: true }).click();
    await page.getByRole("button", { name: "Draft", exact: true }).click();
    expect((await pending.submitted).task).toBe("report");
    await page.getByRole("combobox", { name: "Example", exact: true }).selectOption("branch");
    const description = page.getByRole("textbox", { name: "Description", exact: true });
    const newerBody = await description.inputValue();
    const title = page.getByRole("textbox", { name: "Title", exact: true });
    const newerTitle = await title.inputValue();
    await pending.release(
      mockedDraft(
        JSON.stringify({
          title: "STALE generated report",
          body: "An earlier result which must not replace the branch-switch report.",
        }),
      ),
    );
    await expect(page.getByRole("alert")).toContainText("input changed while drafting");
    await expect(description).toHaveValue(newerBody);
    await expect(title).toHaveValue(newerTitle);
    await expect(page.getByRole("combobox", { name: "Example", exact: true })).toHaveValue(
      "branch",
    );
  });

  test("Discussion preserves a newer conversation selected during generation", async ({ page }) => {
    const pending = await holdResponse<GenerateRequest, GenerateResponse>(page, "generate");
    await page.goto("/discussion");
    await page.getByRole("button", { name: "Draft thread", exact: true }).click();
    expect((await pending.submitted).task).toBe("discussion");
    const conversation = page.getByRole("combobox", { name: "Example conversation", exact: true });
    await conversation.selectOption("no-decision");
    const newerTitle = await page.locator(".discussion-topic h2").innerText();
    await pending.release(
      mockedDraft(
        JSON.stringify({
          title: "STALE generated conversation",
          posts: [
            { author: "A", time: "2026-09-20T10:00:00Z", body: "Earlier proposal." },
            { author: "B", time: "2026-09-20T10:01:00Z", body: "Earlier decision." },
          ],
        }),
      ),
    );
    await expect(page.getByRole("alert")).toContainText("input changed while drafting");
    await expect(conversation).toHaveValue("no-decision");
    await expect(page.locator(".discussion-topic h2")).toHaveText(newerTitle);
    await expect(page.locator(".discussion-post")).toHaveCount(7);
  });
});

test("mocked evaluation completing after an edit cannot apply stale answers", async ({ page }) => {
  // Simulate a transport that completes even after abort. This checks the sequence guard itself.
  await page.addInitScript(() => {
    const testWindow = window as unknown as Window & { __jevTestBodyReads: string[] };
    const nativeFetch = testWindow.fetch.bind(testWindow);
    testWindow.__jevTestBodyReads = [];
    testWindow.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/api/evaluate")) return nativeFetch(input, init);
      const response = await nativeFetch(input, { ...init, signal: undefined });
      const read = response.json.bind(response);
      response.json = async () => {
        const body = await read();
        window.setTimeout(() => testWindow.__jevTestBodyReads.push(body.meta.requestId), 0);
        return body;
      };
      return response;
    };
  });
  const pending = await holdResponse<JevRequest, JevResponse>(page, "evaluate");
  await openSemanticFixture(page);
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  const submitted = await pending.submitted;
  const query = page.getByRole("textbox", { name: "Query", exact: true });
  await query.fill("A newer predicate that has not been evaluated");
  await pending.release(mockedCodeEvaluation(submitted, "mock-late-result", 0.99));
  await page.waitForFunction(() =>
    (window as unknown as Window & { __jevTestBodyReads: string[] }).__jevTestBodyReads.includes(
      "mock-late-result",
    ),
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await expect(query).toHaveValue("A newer predicate that has not been evaluated");
  await expect(page.locator(".ss-progress")).toContainText("Not evaluated");
  await expect(page.getByRole("button", { name: "Inspect evaluation", exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator(".ss-result-row .probability-value")).toHaveText(Array(16).fill("—"));
  await expect(page.getByRole("button", { name: "Analyze", exact: true })).toBeEnabled();
});
