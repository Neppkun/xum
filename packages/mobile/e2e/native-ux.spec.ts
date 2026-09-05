import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { connect } from "../src/api";

async function withinViewport(page: Page, locator: Locator) {
  const viewport = page.viewportSize()!;
  // Native sheets animate into place; assert settled geometry, not the first animation frame.
  await expect
    .poll(async () => {
      const bounds = await locator.boundingBox();
      return bounds != null && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height;
    })
    .toBe(true);
}

test("native stack preserves drafts and sheets keep their actions reachable", async ({
  page,
}, info) => {
  const endpoint = process.env.XUM_MOBILE_TEST_ENDPOINT!;
  const token = process.env.XUM_MOBILE_TEST_TOKEN!;
  const title = `Mobile UX check ${info.project.name} ${Date.now()}`;
  try {
    await page.goto("/");
    await page.getByRole("textbox", { name: "Server URL" }).fill(endpoint);
    await page.getByRole("textbox", { name: "Server URL" }).press("Enter");
    await expect(page.getByRole("textbox", { name: "Bearer token", exact: true })).toBeFocused();
    await page.getByRole("textbox", { name: "Bearer token", exact: true }).fill(token);
    await page.getByRole("button", { name: /^Connect(?: without encryption)?$/ }).click();
    await expect(page.getByRole("textbox", { name: "Search workspaces" })).toBeVisible();

    await page.getByRole("button", { name: "New workspace", exact: true }).first().click();
    const create = page.getByRole("button", { name: "Create scratch chat", exact: true });
    await withinViewport(page, create);
    await page.getByRole("textbox", { name: "Title (optional)", exact: true }).fill(title);
    await create.click();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
    const message = page.getByRole("textbox", { name: "Message", exact: true });
    await message.fill("A line of a longer draft\n".repeat(10));
    await expect.poll(async () => (await message.boundingBox())!.height).toBeGreaterThan(80);
    await message.fill("");
    await expect.poll(async () => (await message.boundingBox())!.height).toBeLessThanOrEqual(50);
    const draft = "Keep this unsent draft while navigating.";
    await message.fill(draft);
    const send = page.getByRole("button", { name: "Send message", exact: true });
    await expect(send).toBeEnabled();
    await withinViewport(page, send);
    await page.getByRole("button", { name: "Back to workspaces", exact: true }).click();
    await page.getByRole("textbox", { name: "Search workspaces", exact: true }).fill(title);
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(draft);

    await page.getByRole("button", { name: "Choose model, agent, and thinking" }).click();
    const apply = page.getByRole("button", { name: "Use settings", exact: true });
    await withinViewport(page, apply);
    await page.getByRole("button", { name: "Choose model", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Search models" })).toBeVisible();
    await page.getByRole("textbox", { name: "Search models" }).fill("no-match-model-query");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await withinViewport(page, apply);
    await page.getByRole("button", { name: "Plan", exact: true }).click();
    await apply.click();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(draft);
    await expect(
      page.getByRole("button", { name: "Choose model, agent, and thinking" })
    ).toContainText("Plan");
    await page.getByRole("button", { name: "Back to workspaces", exact: true }).click();
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Choose model, agent, and thinking" })
    ).toContainText("Plan");

    await message.fill("");
    const viewport = page.viewportSize()!;
    await page.setViewportSize({
      width: viewport.width === 1200 ? 375 : 1200,
      height: viewport.height,
    });
    await expect.poll(async () => (await message.boundingBox())!.height).toBeLessThanOrEqual(50);
    await page.setViewportSize(viewport);
    await expect.poll(async () => (await message.boundingBox())!.height).toBeLessThanOrEqual(50);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    expect(
      await page.evaluate(
        (secret) =>
          [...Object.values(localStorage), ...Object.values(sessionStorage)].some((value) =>
            value.includes(secret)
          ),
        token
      )
    ).toBe(false);
  } finally {
    // Cleanup only the uniquely named scratch chat created by this test, even on failure.
    const connection = await connect(endpoint, token);
    try {
      const workspace = (await connection.client.workspace.list()).find(
        (item) => item.title === title && item.kind === "scratch"
      );
      if (workspace) await connection.client.workspace.remove({ workspaceId: workspace.id });
    } finally {
      connection.close();
    }
  }
});
