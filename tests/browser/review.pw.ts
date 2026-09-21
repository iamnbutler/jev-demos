import { expect, test as base, type Page } from "@playwright/test";
import type { JevRequest, JevResponse } from "../../shared/api";

const test = base.extend<{ providerGuard: void }>({
  providerGuard: [
    async ({ page }, use) => {
      const unexpected: string[] = [];
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/**", async (route) => {
        if (route.request().url().endsWith("/api/health")) {
          await route.fulfill({
            json: {
              jev: { configured: true, model: "mock-jev" },
              openai: { configured: false, model: "mock-writer" },
              anthropic: { configured: false, model: "mock-writer" },
            },
          });
        } else {
          unexpected.push(route.request().url());
          await route.fulfill({ status: 503, json: { error: "Unmocked provider call blocked." } });
        }
      });
      await use();
      expect(unexpected).toEqual([]);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

async function mockReview(page: Page) {
  const requests: JevRequest[] = [];
  let showYes = true;
  const scores: Record<string, number> = {
    hunk_retry_role_permissions: 0.94,
    hunk_retry_role_error_handling: 0.62,
    hunk_retry_role_behavior: 0.1,
    hunk_retry_role_weaker_tests: 0.099,
    hunk_batch_delivery_behavior: 0.88,
    hunk_batch_delivery_error_handling: 0.97,
  };
  const positive = new Set([
    "check_retry_role_expands_permissions",
    "check_batch_delivery_swallows_errors",
    "check_new_batch_test_adds_test_coverage",
  ]);
  await page.route("**/api/evaluate", async (route) => {
    const input = route.request().postDataJSON() as JevRequest;
    expect(input.tag).toBe("review-lenses");
    requests.push(input);
    const response: JevResponse = {
      model: "mock-review-hunk-findings",
      answers: Object.fromEntries(
        Object.entries(input.questions).map(([key, question]) => {
          if (question.type === "noul") return [key, { type: "noul", noul: scores[key] ?? 0.03 }];
          expect(question.type).toBe("choice");
          expect(Object.keys(question.criteria ?? {})).toEqual(["yes", "no"]);
          const yes = showYes && positive.has(key);
          return [
            key,
            {
              type: "choice",
              choice: yes ? "yes" : "no",
              confidence: 0.98,
              probabilities: { yes: yes ? 0.98 : 0.02, no: yes ? 0.02 : 0.98 },
            },
          ];
        }),
      ),
      usage: { input_tokens: 100, output_tokens: 20 },
      meta: {
        requestId: `review-${requests.length}`,
        cached: false,
        providerMs: 12,
        totalMs: 15,
        questionCount: Object.keys(input.questions).length,
        at: "2026-09-20T12:00:00Z",
      },
    };
    await route.fulfill({ json: response });
  });
  await page.goto("/review");
  await page.getByRole("button", { name: "Analyze 12 hunks", exact: true }).click();
  await expect(page.locator('[data-hunk-annotation="retry_role"]')).toBeVisible();
  return {
    requests,
    answerNo: () => {
      showYes = false;
    },
  };
}

test("hunk categories rank by probability and hide scores below 10%, including rounded-up values", async ({
  page,
}) => {
  const { requests } = await mockReview(page);
  const hunk = page.locator('[data-review-hunk="retry_role"]');
  await expect(hunk.locator(".review-inline-scores strong")).toHaveText(["94%", "62%", "10%"]);
  expect(
    await hunk
      .locator("[data-review-lens]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-review-lens"))),
  ).toEqual(["permissions", "error_handling", "behavior"]);
  await expect(hunk.locator('[data-review-lens="weaker_tests"]')).toHaveCount(0);
  await hunk.locator("summary").click();
  await expect(hunk.locator(".review-all-judgments dt")).toHaveText([
    "Access control",
    "Error handling",
    "Behavior",
  ]);
  await expect(page.locator('[data-hunk-annotation="types_format"]')).toHaveCount(0);
  expect(Object.keys(requests[0].questions)).toHaveLength(108);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("Yes checks stay on their matching hunks independently of the category floor and lens selection", async ({
  page,
}) => {
  await mockReview(page);
  await expect(page.locator("[data-review-check]")).toHaveCount(3);
  await expect(page.locator('[data-review-hunk="retry_role"] [data-review-check]')).toHaveText([
    "Yes: Expands permissions",
  ]);
  await expect(page.locator('[data-review-hunk="batch_delivery"] [data-review-check]')).toHaveText([
    "Yes: Swallows errors",
  ]);
  await expect(page.locator('[data-review-hunk="new_batch_test"] [data-review-check]')).toHaveText([
    "Yes: Adds test coverage",
  ]);
  await expect(page.locator('[data-review-hunk="new_batch_test"] [data-review-lens]')).toHaveCount(
    0,
  );
  await expect(page.locator('[data-review-hunk="auth_rename"] [data-review-check]')).toHaveCount(0);
  for (const button of await page.locator(".review-lenses button").all()) await button.click();
  await expect(page.locator("[data-review-lens]")).toHaveCount(0);
  await expect(page.locator("[data-review-check]")).toHaveCount(3);
});

test("a new No answer removes a previously shown Yes check", async ({ page }) => {
  const mocked = await mockReview(page);
  await expect(page.locator("[data-review-check]")).toHaveCount(3);
  mocked.answerNo();
  await page.getByRole("button", { name: "Analyze 12 hunks", exact: true }).click();
  await expect.poll(() => mocked.requests.length).toBe(2);
  await expect(page.locator("[data-review-check]")).toHaveCount(0);
  await expect(page.locator('[data-hunk-annotation="retry_role"] .review-score strong')).toHaveText(
    ["94%", "62%", "10%"],
  );
  await expect(page.locator('[data-hunk-annotation="new_batch_test"]')).toHaveCount(0);
});
