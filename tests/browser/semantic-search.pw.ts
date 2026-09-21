import { readFile } from "node:fs/promises";
import { expect, test as base, type Page } from "@playwright/test";
import type { JevRequest, JevResponse } from "../../shared/api";
import type { SearchCorpus } from "../../src/demos/code/semantic-corpus";

// Real source subset; every inference in this suite is explicitly mocked. No provider traffic.
const original = JSON.parse(
  await readFile(new URL("../../public/semantic-search/corpus.json", import.meta.url), "utf8"),
) as SearchCorpus;
const functions = original.functions.slice(0, 500);
const testCorpus: SearchCorpus = {
  ...original,
  id: "mock-transport-test-subset",
  provenance: "Real source subset used by a browser regression test. All judgments are mocked.",
  functions,
  repositories: original.repositories
    .map((repo) => ({
      ...repo,
      functions: functions.filter((fn) => fn.repository === repo.repository).length,
    }))
    .filter((repo) => repo.functions > 0),
};

const test = base.extend<{ mockProviders: void }>({
  mockProviders: [
    async ({ page }, use) => {
      const unexpected: string[] = [];
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/semantic-search/corpus.json", (route) =>
        route.fulfill({ json: testCorpus }),
      );
      await page.route("**/api/**", async (route) => {
        if (route.request().url().endsWith("/api/health")) {
          await route.fulfill({
            json: {
              jev: { configured: true, model: "mock-jev" },
              openai: { configured: true, model: "mock-writer" },
              anthropic: { configured: true, model: "mock-writer" },
            },
          });
        } else {
          unexpected.push(route.request().url());
          await route.fulfill({
            status: 503,
            json: { error: "Unmocked API call blocked by test." },
          });
        }
      });
      // Let held responses arrive after AbortController.abort so the epoch guard itself is tested.
      await page.addInitScript(() => {
        const testWindow = window as unknown as Window & { __semanticBodies: string[] };
        testWindow.__semanticBodies = [];
        const nativeFetch = testWindow.fetch.bind(testWindow);
        testWindow.fetch = async (input, init) => {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          if (!url.endsWith("/api/evaluate")) return nativeFetch(input, init);
          const result = await nativeFetch(input, { ...init, signal: undefined });
          const json = result.json.bind(result);
          result.json = async () => {
            const body = await json();
            queueMicrotask(() => testWindow.__semanticBodies.push(body.meta.requestId));
            return body;
          };
          return result;
        };
      });
      await use();
      expect(unexpected, "An unmocked provider endpoint was called").toEqual([]);
      expect(errors, "Uncaught browser errors").toEqual([]);
    },
    { auto: true },
  ],
});

type Held = {
  request: JevRequest;
  id: string;
  released: boolean;
  release: (probability: number) => Promise<void>;
};

function mockedResponse(request: JevRequest, requestId: string, probability: number): JevResponse {
  return {
    model: "mock-jev-stream-regression",
    answers: Object.fromEntries(
      Object.keys(request.questions).map((key) => [key, { type: "noul", noul: probability }]),
    ),
    usage: { input_tokens: 123, output_tokens: 24 },
    meta: {
      requestId,
      providerMs: 12,
      totalMs: 15,
      cached: false,
      questionCount: Object.keys(request.questions).length,
      at: "2026-09-20T12:00:00Z",
    },
  };
}

async function controlledBatches(page: Page) {
  const held: Held[] = [];
  let auto: number | null = null;
  await page.route("**/api/evaluate", async (route) => {
    const request = route.request().postDataJSON() as JevRequest;
    const id = `mock-batch-${held.length + 1}`;
    let resolve!: (probability: number) => void;
    let delivered!: () => void;
    const pending = new Promise<number>((complete) => {
      resolve = complete;
    });
    const completed = new Promise<void>((complete) => {
      delivered = complete;
    });
    const item: Held = {
      request,
      id,
      released: false,
      release: async (probability) => {
        item.released = true;
        resolve(probability);
        await completed;
      },
    };
    held.push(item);
    const probability = auto ?? (await pending);
    item.released = true;
    try {
      await route.fulfill({ json: mockedResponse(request, id, probability) });
    } finally {
      delivered();
    }
  });
  return {
    held,
    autoRespond(probability: number) {
      auto = probability;
    },
    async releaseRemaining(probability: number) {
      const selected = held.filter((item) => !item.released);
      await Promise.all(selected.map((item) => item.release(probability)));
      await waitForBodies(
        page,
        selected.map((item) => item.id),
      );
    },
  };
}

async function waitForBodies(page: Page, ids: string[]) {
  await page.waitForFunction(
    (expected) =>
      expected.every((id) =>
        (window as unknown as Window & { __semanticBodies: string[] }).__semanticBodies.includes(
          id,
        ),
      ),
    ids,
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function openSearch(page: Page) {
  await page.goto("/code-search");
  await expect(page.locator(".ss-assessed")).toHaveText("0 / 500 assessed");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
}

test("out-of-order real batches update ranks immediately and an open evidence drawer stays pinned", async ({
  page,
}) => {
  const transport = await controlledBatches(page);
  await openSearch(page);
  await expect.poll(() => transport.held.length).toBe(4);
  const second = transport.held[1];
  const count = Object.keys(second.request.questions).length;
  await second.release(0.91);
  await expect(page.locator(".ss-assessed")).toHaveText(`${count} / 500 assessed`);
  await expect.poll(() => transport.held.length).toBe(5);
  await expect(page.locator(".ss-result-row").first()).toContainText("91%");
  expect(transport.held[0].released).toBe(false);
  await expect(page.locator(".ss-result-row .ss-new").first()).toBeVisible();

  const inspect = page.getByRole("button", { name: "Inspect evaluation", exact: true });
  await inspect.click();
  const drawer = page.getByRole("dialog", { name: "Evaluation", exact: true });
  await expect(drawer).toBeVisible();
  expect(JSON.parse(await drawer.locator(".evidence-json").innerText())).toEqual(
    second.request.state,
  );
  await transport.held[0].release(0.4);
  await expect(page.locator(".ss-assessed")).toHaveText(
    `${count + Object.keys(transport.held[0].request.questions).length} / 500 assessed`,
  );
  await expect(drawer).toBeVisible();
  expect(JSON.parse(await drawer.locator(".evidence-json").innerText())).toEqual(
    second.request.state,
  );
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(inspect).toBeFocused();
  await expect(page.getByRole("combobox", { name: "Batch", exact: true })).toHaveValue("attempt-2");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await transport.releaseRemaining(0.99);
});

test("stop rejects late responses; resume retains accepted results and finishes remaining batches", async ({
  page,
}) => {
  const transport = await controlledBatches(page);
  await openSearch(page);
  await expect.poll(() => transport.held.length).toBe(4);
  const accepted = transport.held[1];
  const acceptedKeys = Object.keys(accepted.request.questions);
  await accepted.release(0.93);
  await expect.poll(() => transport.held.length).toBe(5);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await transport.releaseRemaining(0.99);
  await expect(page.locator(".ss-progress")).toHaveAttribute("data-status", "paused");
  await expect(page.locator(".ss-assessed")).toHaveText(`${acceptedKeys.length} / 500 assessed`);
  await expect(page.locator(".ss-result-row").first()).toContainText("93%");
  expect(transport.held).toHaveLength(5);
  transport.autoRespond(0.6);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.locator(".ss-progress")).toHaveAttribute("data-status", "complete");
  await expect(page.locator(".ss-assessed")).toHaveText("500 / 500 assessed");
  await expect(page.locator(".ss-result-row").first()).toContainText("93%");
  expect(
    transport.held.filter((item) => acceptedKeys.every((key) => key in item.request.questions)),
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Keyword", exact: true }).click();
  await expect(page.locator(".ss-term-count").first()).toBeVisible();
});

for (const change of ["query", "source", "corpus"] as const) {
  test(`${change} edits invalidate all active batches even when the old transport still completes`, async ({
    page,
  }) => {
    const transport = await controlledBatches(page);
    await openSearch(page);
    await expect.poll(() => transport.held.length).toBe(4);
    if (change === "query") {
      const field = page.getByRole("textbox", { name: "Query", exact: true });
      const originalQuery = await field.inputValue();
      await field.fill("A temporary newer query");
      // Identical input text does not re-authorize a cancelled search version.
      await field.fill(originalQuery);
    } else if (change === "source") {
      await page.getByRole("button", { name: "Edit source", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Replace this function’s source", exact: true })
        .fill("export function manuallyEdited() {\n  return 'new source';\n}");
    } else {
      await page.getByRole("combobox", { name: "Corpus", exact: true }).selectOption("fixture");
    }
    await transport.releaseRemaining(0.99);
    await expect(page.locator(".ss-progress")).toHaveAttribute("data-status", "idle");
    await expect(page.locator(".ss-assessed")).toHaveText(
      `0 / ${change === "corpus" ? 16 : 500} assessed`,
    );
    await expect(page.getByRole("button", { name: "Inspect evaluation", exact: true })).toHaveCount(
      0,
    );
    await expect(page.locator(".ss-result-row .probability-value")).toHaveText(
      Array(change === "corpus" ? 16 : 60).fill("—"),
    );
    await expect(page.getByRole("button", { name: "Analyze", exact: true })).toBeEnabled();
  });
}
