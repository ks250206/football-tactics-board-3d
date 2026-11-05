import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
// Compare the live export with debounced storage; a prior 'saved' badge can still
// be visible in the render immediately after a click.
const saved = async (page: Page) => {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSONを書き出す" }).click();
  const download = await pending,
    project = JSON.parse(await readFile((await download.path())!, "utf8"));
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("touchline.project.v1")!)))
    .toEqual(project);
  return project;
};
test("applies formation sliders, mirrors away and imports a saved man-marking plan", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready", "true");
  await page.getByLabel("フォーメーション", { exact: true }).selectOption("3-2-5");
  await page.getByRole("button", { name: "アタッキング", exact: true }).click();
  await page.getByLabel("横の広さ", { exact: true }).fill("60");
  await page.getByLabel("左右の偏り", { exact: true }).fill("100");
  const before = await saved(page);
  expect(before.frames[0].players["home-2"].x).toBeGreaterThan(0);
  expect(before.frames[0].players["home-2"].z).toBeCloseTo(-28);
  await page.getByLabel("配置の対象チーム", { exact: true }).selectOption("away");
  await page.getByRole("button", { name: "配置を適用", exact: true }).click();
  const away = await saved(page);
  expect(away.frames[0].players["away-2"].x).toBeCloseTo(-before.frames[0].players["home-2"].x);
  expect(away.frames[0].players["away-2"].z).toBeCloseTo(-before.frames[0].players["home-2"].z);
  const keeper = page.getByTestId("player-away-1"),
    keeperPosition = await keeper.getAttribute("transform");
  await page.getByLabel("フィールドチルト（陣地の高さ）", { exact: true }).fill("-15");
  await expect(keeper).toHaveAttribute("transform", keeperPosition!);
  const shifted = await saved(page);
  expect(shifted.frames[0].players["away-1"]).toEqual(away.frames[0].players["away-1"]);
  expect(shifted.frames[0].players["away-2"].x).not.toBe(away.frames[0].players["away-2"].x);
  await page.getByLabel("守備プリセット", { exact: true }).selectOption("man");
  const plan = await saved(page);
  expect(new Set(Object.values(plan.defence.marks)).size).toBe(10);
  await page.reload();
  await expect(page.getByLabel("配置の対象チーム")).toHaveValue("home");
  await page.getByLabel("配置の対象チーム").selectOption("away");
  await expect(page.getByLabel("守備プリセット")).toHaveValue("man");
  await page.getByTestId("import-file").setInputFiles({
    name: "broken-plan.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ ...plan, defence: { ...plan.defence, reference: { x: null, z: 0 } } }),
    ),
  });
  await expect(page.getByRole("status")).toContainText("TOUCHLINE形式");
  expect((await saved(page)).defence).toEqual(plan.defence);
});
test("tracks a ball holder in zone defence and loads editable phase choreography", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("配置の対象チーム").selectOption("away");
  await page.getByLabel("守備プリセット").selectOption("zone");
  const defender = page.getByTestId("player-away-2"),
    before = await defender.getAttribute("transform");
  const holder = page.getByTestId("player-home-3");
  await holder.scrollIntoViewIfNeeded();
  const box = await holder.boundingBox();
  if (!box) throw new Error("Missing holder");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await expect(defender).not.toHaveAttribute("transform", before!);
  expect((await saved(page)).defence.mode).toBe("zone");
  await page.getByLabel("局面プリセット").selectOption("low-block");
  await page.getByRole("button", { name: "局面シーケンスを読み込む" }).click();
  const project = await saved(page);
  expect(project.name).toContain("ローブロック");
  expect(project.frames).toHaveLength(5);
  expect(project.defence.team).toBe("away");
  await page.getByTestId("play-button").click();
  await expect.poll(() => page.getByTestId("timecode").innerText()).not.toContain("0.00");
  await page.getByTestId("play-button").click();
});
test("renders compact keyboard focus, five lanes, Bielsa trapezoids and optional xG", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready", "true");
  const token = page.getByTestId("player-home-7");
  await token.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("selection-ring")).toHaveAttribute("r", "2.5");
  expect(await token.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
  await page.getByRole("button", { name: "5レーン", exact: true }).click();
  await page.getByRole("button", { name: "ビエルサゾーン", exact: true }).click();
  await page.getByRole("button", { name: "参考xG", exact: true }).click();
  await expect(page.getByTestId("lane-zone")).toHaveCount(5);
  await expect(page.getByTestId("bielsa-zone")).toHaveCount(2);
  await expect(page.getByTestId("xg-readout")).toContainText("未学習・未校正");
  await expect(page.getByTestId("bielsa-zone").nth(1)).toHaveAttribute(
    "points",
    "36,-20.16 52.5,-3.66 52.5,3.66 36,20.16",
  );
  await page.getByRole("button", { name: "自由", exact: true }).click();
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/tactical-overlays-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
    false,
  );
  await page.screenshot({ path: "artifacts/tactical-overlays-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("controls the player with simultaneous WASD and free mouse look, sensitivity and Escape (native lock or bounded fallback)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready", "true");
  const before = await saved(page);
  await page.getByRole("button", { name: "FPS操作", exact: true }).click();
  await page.getByLabel("マウス感度", { exact: true }).fill("0.4");
  await page.getByTestId("scene-canvas").click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => !!document.pointerLockElement)) ||
        (await page
          .locator(".look-hint")
          .innerText()
          .then((t) => t.includes("画面内"))),
    )
    .toBe(true);
  const selected = page.getByTestId("player-home-6"),
    start = await selected.getAttribute("transform");
  await page.keyboard.down("w");
  await expect(selected).not.toHaveAttribute("transform", start!);
  const headingBefore = await page.getByTestId("body-slider").inputValue();
  const pitchBefore = await page.getByLabel("視線の上下", { exact: true }).inputValue();
  const box = await page.getByTestId("scene-canvas").boundingBox();
  if (!box) throw new Error("Missing canvas");
  // Move the mouse without a button while W remains held, including the non-locking fallback.
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 20, { steps: 4 });
  await expect(page.getByTestId("body-slider")).not.toHaveValue(headingBefore);
  await expect(page.getByLabel("視線の上下", { exact: true })).not.toHaveValue(pitchBefore);
  const turned = await page.getByTestId("body-slider").inputValue(),
    positionAfterTurn = await selected.getAttribute("transform");
  await expect(selected).not.toHaveAttribute("transform", positionAfterTurn!);
  await expect(page.getByTestId("body-slider")).toHaveValue(turned);
  await page.keyboard.up("w");
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => !!document.pointerLockElement)).toBe(false);
  await expect(page.getByLabel("3D操作画面", { exact: true })).toHaveAttribute(
    "data-fps-active",
    "false",
  );
  const after = await saved(page);
  const a = before.frames[0].players["home-6"],
    b = after.frames[0].players["home-6"];
  expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.1);
  expect(b.head).toBe(0);
  const stopped = page.getByTestId("player-home-6");
  const transform = await stopped.getAttribute("transform");
  await page.keyboard.press("w");
  await page.waitForTimeout(150);
  await expect(stopped).toHaveAttribute("transform", transform!);
  await page.getByRole("button", { name: "ボールを見る", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "ボールを自動で見る", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});
test("protects invalid saved data until an explicit backup and resume", async ({ page }) => {
  const invalid = '{"version":1,"defence":{"mode":"unknown"}}';
  await page.addInitScript((value) => {
    if (!localStorage.getItem("touchline.project.v1"))
      localStorage.setItem("touchline.project.v1", value);
  }, invalid);
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("自動保存を停止");
  await page.getByLabel("フォーメーション").selectOption("4-4-2");
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => localStorage.getItem("touchline.project.v1"))).toBe(invalid);
  await page.getByRole("button", { name: "元データを退避して保存を再開", exact: true }).click();
  const recovered = await saved(page);
  expect(recovered.roster).toHaveLength(22);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith("touchline.project.v1.recovery."))
        .map((k) => localStorage.getItem(k)),
    ),
  ).toEqual([invalid]);
});
