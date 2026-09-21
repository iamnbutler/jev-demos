import { expect, test as base, type Page } from "@playwright/test";
import type { JevRequest, JevResponse } from "../../shared/api";
import { CONTEXT_TURNS } from "../../src/demos/agents/context-data";

// All provider traffic is mocked. Disclosure and budget interactions must not trigger inference.
const test = base.extend<{ evaluations: JevRequest[] }>({
  evaluations: async ({ page }, use) => {
    const evaluations: JevRequest[] = [];
    const unexpected: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/health") {
        await route.fulfill({
          json: {
            jev: { configured: true, model: "mock-jev" },
            openai: { configured: true, model: "mock-openai" },
            anthropic: { configured: true, model: "mock-anthropic" },
          },
        });
        return;
      }
      if (path === "/api/evaluate") {
        const request = route.request().postDataJSON() as JevRequest;
        evaluations.push(request);
        expect(request.tag).toBe("context-workbench");
        const result: JevResponse = {
          model: "mock-context-collapse",
          answers: Object.fromEntries(
            Object.entries(request.questions).map(([key, question]) => {
              expect(question.type).toBe("noul");
              // One low-signal turn stays open; the eligible delivery pair falls outside this budget.
              const probability = key.endsWith("_old-module-error")
                ? 0.03
                : key.endsWith("_delivery-source")
                  ? key.startsWith("relevant_")
                    ? 0.4
                    : 0.1
                  : 0.9;
              return [key, { type: "noul", noul: probability }];
            }),
          ),
          usage: { input_tokens: 100, output_tokens: 36 },
          meta: {
            requestId: "mock-collapse-result",
            providerMs: 10,
            totalMs: 12,
            cached: false,
            questionCount: Object.keys(request.questions).length,
            at: "2026-09-20T12:00:00.000Z",
          },
        };
        await route.fulfill({ json: result });
        return;
      }
      unexpected.push(path);
      await route.fulfill({ status: 503, json: { error: "Unmocked API call blocked by test." } });
    });
    await use(evaluations);
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  },
});

async function setBudget(page: Page, value: number) {
  await page
    .getByRole("slider", { name: /^Estimated context token budget/ })
    .evaluate((input, budget) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, String(budget));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
}

async function expectOriginalSource(page: Page) {
  expect(await page.locator(".agents-chat-message pre").allTextContents()).toEqual(
    CONTEXT_TURNS.flatMap((turn) => turn.messages.map((message) => message.body)),
  );
  await expect(page.locator("[data-context-turn]")).toHaveCount(CONTEXT_TURNS.length);
}

for (const screen of [
  { name: "desktop", viewport: { width: 1440, height: 1050 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
]) {
  test.describe(`Context budget collapse · ${screen.name}`, () => {
    test.use({ viewport: screen.viewport, reducedMotion: "reduce" });

    test("budget archives collapse, remain inspectable, and reopen when retained", async ({
      page,
      evaluations,
    }) => {
      await page.goto("/context");
      const transcript = page.getByRole("region", {
        name: "Complete source transcript",
        exact: true,
      });
      const target = CONTEXT_TURNS.find((turn) => turn.id === "delivery-source")!;
      const card = page.locator(`[data-context-turn="${target.id}"]`);
      const disclosure = card.locator(".agents-thread-toggle");
      const sourceBodies = card.locator(".agents-chat-message pre");
      const marker = page.getByRole("button", { name: /^Go to turn 4:/ });
      await expect(transcript).toBeVisible();
      await expect(page.locator('[data-context-turn][data-expanded="true"]')).toHaveCount(
        CONTEXT_TURNS.length,
      );
      await expectOriginalSource(page);
      await setBudget(page, 662);
      await page.getByRole("button", { name: "Evaluate", exact: true }).click();
      await expect(card).toHaveAttribute("data-retention", "budget");
      await expect(disclosure).toHaveAttribute("aria-expanded", "false");
      await expect(sourceBodies).toHaveCount(2);
      await expect(sourceBodies.nth(0)).toBeHidden();
      await expect(sourceBodies.nth(1)).toBeHidden();
      await expect(
        page.locator('[data-retention="budget"] .agents-thread-turn-content:visible'),
      ).toHaveCount(0);
      await expect(page.locator('[data-retained="true"][data-expanded="false"]')).toHaveCount(0);
      await expect(page.locator('[data-context-turn="old-module-error"]')).toHaveAttribute(
        "data-retention",
        "low-signal",
      );
      await expect(
        page.locator('[data-context-turn="old-module-error"] .agents-thread-toggle'),
      ).toHaveAttribute("aria-expanded", "true");

      // The rail still targets a collapsed header without silently expanding it.
      await marker.click();
      await expect(marker).toHaveAttribute("aria-current", "location");
      await expect(card).toBeFocused();
      await expect(
        card.getByRole("button", { name: `Pin ${target.title}`, exact: true }),
      ).toBeVisible();
      await expect(disclosure).toHaveAttribute("aria-expanded", "false");
      const headerInView = await card.locator("header").evaluate((header) => {
        const bounds = header.getBoundingClientRect();
        const viewport = header.closest(".agents-thread-scroll")!.getBoundingClientRect();
        return bounds.top >= viewport.top && bounds.bottom <= viewport.bottom;
      });
      expect(headerInView).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `.cache/context-collapse-${screen.name}.png`,
        fullPage: true,
        animations: "disabled",
      });

      const collapsedHeight = (await card.boundingBox())!.height;
      await disclosure.focus();
      await disclosure.press("Enter");
      await expect(disclosure).toHaveAttribute("aria-expanded", "true");
      await expect(sourceBodies.nth(0)).toBeVisible();
      await expect(sourceBodies.nth(1)).toBeVisible();
      expect((await card.boundingBox())!.height).toBeGreaterThan(collapsedHeight + 100);
      expect(await sourceBodies.allTextContents()).toEqual(
        target.messages.map((message) => message.body),
      );
      await setBudget(page, 663);
      await expect(card).toHaveAttribute("data-retention", "budget");
      await expect(disclosure).toHaveAttribute("aria-expanded", "true");

      const scrollBeforePreview = await transcript.evaluate((element) => element.scrollTop);
      const retainedIds = await page
        .locator('[data-context-turn][data-retained="true"]')
        .evaluateAll((turns) => turns.map((turn) => (turn as HTMLElement).dataset.contextTurn));
      await page.getByRole("button", { name: "Assembled context", exact: true }).click();
      const assembled = await page.locator(".agents-context-output pre").innerText();
      for (const turn of CONTEXT_TURNS) {
        for (const message of turn.messages)
          expect(assembled.includes(message.body)).toBe(retainedIds.includes(turn.id));
      }
      await page.getByRole("button", { name: "Full thread", exact: true }).click();
      await expect(disclosure).toHaveAttribute("aria-expanded", "true");
      expect(
        Math.abs((await transcript.evaluate((element) => element.scrollTop)) - scrollBeforePreview),
      ).toBeLessThan(3);

      await disclosure.click();
      await expect(disclosure).toHaveAttribute("aria-expanded", "false");
      await card.getByRole("button", { name: `Pin ${target.title}`, exact: true }).click();
      await expect(card).toHaveAttribute("data-retention", "pinned");
      await expect(disclosure).toHaveAttribute("aria-expanded", "true");
      await card.getByRole("button", { name: `Unpin ${target.title}`, exact: true }).click();
      await expect(card).toHaveAttribute("data-retention", "budget");
      await expect(disclosure).toHaveAttribute("aria-expanded", "false");

      const slider = page.getByRole("slider", { name: /^Estimated context token budget/ });
      await slider.focus();
      await slider.press("End");
      await expect(card).toHaveAttribute("data-retention", "selected");
      await expect(disclosure).toHaveAttribute("aria-expanded", "true");
      // Even a prior manual collapse is discarded after a retention transition.
      await disclosure.click();
      await expect(disclosure).toHaveAttribute("aria-expanded", "false");
      await setBudget(page, 663);
      await expect(card).toHaveAttribute("data-retention", "budget");
      await slider.focus();
      await slider.press("End");
      await expect(disclosure).toHaveAttribute("aria-expanded", "true");
      await setBudget(page, 663);
      await expect(disclosure).toHaveAttribute("aria-expanded", "false");

      await marker.click();
      await expect(marker).toHaveAttribute("aria-current", "location");
      await transcript.evaluate((element) => element.scrollTo({ top: 0 }));
      await expect(page.getByRole("button", { name: /^Go to turn 1:/ })).toHaveAttribute(
        "aria-current",
        "location",
      );
      await page.getByRole("button", { name: "Prepare a handoff", exact: true }).click();
      await expect(card).toHaveAttribute("data-retention", "unassessed");
      await expect(disclosure).toHaveAttribute("aria-expanded", "true");
      await expectOriginalSource(page);
      expect(evaluations).toHaveLength(1);

      const dimensions = await page.evaluate(() => ({
        viewport: innerWidth,
        width: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        bodyHeight: document.body.getBoundingClientRect().height,
        clippedControls: [
          ...document.querySelectorAll(".agents-thread-turn-actions > *, .agents-thread-toggle"),
        ].filter((element) => {
          const rect = element.getBoundingClientRect();
          const card = element.closest(".agents-thread-turn")!.getBoundingClientRect();
          return rect.left < card.left || rect.right > card.right + 1;
        }).length,
      }));
      expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
      expect(dimensions.documentHeight).toBeLessThanOrEqual(Math.ceil(dimensions.bodyHeight) + 1);
      expect(dimensions.clippedControls).toBe(0);
    });
  });
}
