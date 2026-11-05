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
  await page.getByLabel("カスタム配置", { exact: true }).fill("3-3-1-3");
  await page.getByLabel("配置の対象チーム", { exact: true }).selectOption("away");
  await expect(page.getByLabel("フォーメーション", { exact: true })).toHaveValue("4-3-3");
  await expect(page.getByLabel("横の広さ", { exact: true })).toHaveValue("52");
  await expect(page.getByLabel("左右の偏り", { exact: true })).toHaveValue("0");
  await expect(page.getByLabel("カスタム配置", { exact: true })).toHaveValue("");
  expect(await page.locator('[aria-label="配置するサード"] button').allTextContents()).toEqual([
    "アタッキング",
    "ミドル",
    "ディフェンシブ",
  ]);
  await expect(page.getByLabel("フィールドチルト（陣地の高さ）", { exact: true })).toHaveAttribute(
    "dir",
    "rtl",
  );
  expect(await saved(page)).toEqual(before);
  await page.getByLabel("フォーメーション", { exact: true }).selectOption("3-2-5");
  await page.getByRole("button", { name: "アタッキング", exact: true }).click();
  await page.getByLabel("横の広さ", { exact: true }).fill("60");
  await page.getByLabel("左右の偏り", { exact: true }).fill("100");
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
  expect(shifted.frames[0].players["away-2"].x).toBeGreaterThan(away.frames[0].players["away-2"].x);
  await page.getByLabel("配置の対象チーム").selectOption("home");
  await expect(page.getByLabel("フォーメーション", { exact: true })).toHaveValue("3-2-5");
  await expect(page.getByLabel("横の広さ", { exact: true })).toHaveValue("60");
  await expect(page.getByLabel("左右の偏り", { exact: true })).toHaveValue("100");
  await expect(page.getByLabel("カスタム配置", { exact: true })).toHaveValue("3-3-1-3");
  await expect(page.getByLabel("フィールドチルト（陣地の高さ）", { exact: true })).toHaveValue("0");
  await expect(page.getByLabel("フィールドチルト（陣地の高さ）", { exact: true })).toHaveAttribute(
    "dir",
    "ltr",
  );
  await expect(page.getByRole("button", { name: "アタッキング", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel("配置の対象チーム").selectOption("away");
  await expect(page.getByLabel("フィールドチルト（陣地の高さ）", { exact: true })).toHaveValue(
    "-15",
  );
  await expect(page.getByLabel("フォーメーション", { exact: true })).toHaveValue("3-2-5");
  await expect(page.getByLabel("横の広さ", { exact: true })).toHaveValue("60");
  await expect(page.getByLabel("左右の偏り", { exact: true })).toHaveValue("100");
  await expect(page.getByLabel("カスタム配置", { exact: true })).toHaveValue("");
  expect(await saved(page)).toEqual(shifted);
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
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
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
  // Observe the browser's input separately from the app's response. CDP absolute
  // moves can deliver zero relative deltas while Chromium's native lock is active.
  const nativeLock = await page.evaluate(() => !!document.pointerLockElement);
  await page.evaluate(() => {
    const input = { x: 0, y: 0, events: 0 };
    (window as any).__fpsMouseInput = input;
    document.addEventListener("mousemove", (event) => {
      input.x += Math.abs(event.movementX);
      input.y += Math.abs(event.movementY);
      input.events++;
    });
  });
  // No button is held; W remains down throughout the look and movement checks.
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 20, { steps: 4 });
  const input = await page.evaluate(() => (window as any).__fpsMouseInput);
  test.info().annotations.push({ type: "mouse-input", description: JSON.stringify({ nativeLock, ...input }) });
  if (nativeLock && (!input.x || !input.y)) {
    // The lock is real. Supply the standard relative event at the DOM boundary
    // only when browser automation supplied none; never mock requestPointerLock.
    await page.getByLabel("3D操作画面", { exact: true }).dispatchEvent("mousemove", {
      movementX: 50, movementY: 20,
    });
    test.info().annotations.push({ type: "native-relative-input", description: "DOM MouseEvent; CDP produced zero relative deltas under native pointer lock" });
  }
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
  await page.getByRole("button", { name: "体も顔もボールへ", exact: true }).click();
  await expect(page.getByTestId("head-slider")).toHaveValue("0");
  const faced = await saved(page),
    f = faced.frames[0],
    p = f.players["home-6"];
  const holder = f.ball.owner ? f.players[f.ball.owner] : null;
  const bx = holder ? holder.x + Math.cos((holder.body * Math.PI) / 180) * 0.48 : f.ball.x,
    bz = holder ? holder.z + Math.sin((holder.body * Math.PI) / 180) * 0.48 : f.ball.z;
  const bearing = (Math.atan2(bz - p.z, bx - p.x) * 180) / Math.PI;
  expect(Math.abs(((p.body - bearing + 540) % 360) - 180)).toBeLessThan(0.001);
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

test("locks the camera while editing others and authors selected/all-player gaze commands", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "ボールを自動で見る", exact: true }).click();
  const original = await saved(page);
  await page.getByRole("button", { name: "視点を固定", exact: true }).click();
  const token = page.getByTestId("player-away-2");
  await token.scrollIntoViewIfNeeded();
  const box = await token.boundingBox();
  if (!box) throw new Error("Missing player");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 12, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByLabel("編集する選手", { exact: true })).toHaveValue("away-2");
  await expect(page.getByTestId("stage")).toHaveAttribute("data-camera-player", "home-6");
  const moved = await saved(page);
  expect(moved.frames[0].players["home-6"]).toEqual(original.frames[0].players["home-6"]);
  expect(moved.frames[0].players["away-2"].x).not.toBe(original.frames[0].players["away-2"].x);
  const verify = (project: any, target: "ball" | "goal", body: boolean, all: boolean) => {
    const f = project.frames[0],
      owner = f.ball.owner ? f.players[f.ball.owner] : null;
    const ball = owner
      ? {
          x: owner.x + Math.cos((owner.body * Math.PI) / 180) * 0.48,
          z: owner.z + Math.sin((owner.body * Math.PI) / 180) * 0.48,
        }
      : f.ball;
    const roster = all ? project.roster : project.roster.filter((p: any) => p.id === "away-2");
    for (const player of roster) {
      const p = f.players[player.id],
        q = target === "ball" ? ball : { x: player.team === "home" ? 52.5 : -52.5, z: 0 };
      const yaw = (Math.atan2(q.z - p.z, q.x - p.x) * 180) / Math.PI;
      expect(Math.abs(((p.body + p.head - yaw + 540) % 360) - 180)).toBeLessThan(0.001);
      if (body) expect(p.head).toBe(0);
    }
  };
  await page.getByRole("button", { name: "相手ゴールを見る", exact: true }).click();
  verify(await saved(page), "goal", false, false);
  await page.getByRole("button", { name: "体も顔も相手ゴールを見る", exact: true }).click();
  verify(await saved(page), "goal", true, false);
  await page.getByText("全員の向き（22人）", { exact: true }).click();
  for (const [label, target, body] of [
    ["全員ボールを見る", "ball", false],
    ["全員体も顔もボールを見る", "ball", true],
    ["全員相手ゴールを見る", "goal", false],
    ["全員体も顔も相手ゴールを見る", "goal", true],
  ] as const) {
    await page.getByRole("button", { name: label, exact: true }).click();
    verify(await saved(page), target, body, true);
  }
  await expect(page.getByTestId("stage")).toHaveAttribute("data-camera-player", "home-6");
  await page.getByRole("button", { name: "この選手を視点にする", exact: true }).click();
  await expect(page.getByTestId("stage")).toHaveAttribute("data-camera-player", "away-2");
  await page.getByRole("button", { name: "視点を固定", exact: true }).click();
  await page.getByTestId("player-home-9").click();
  await expect(page.getByTestId("stage")).toHaveAttribute("data-camera-player", "home-9");
});

test("keeps the pitch continuous while orbiting and zooming at wide angles", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "自由", exact: true }).click();
  const canvas = page.getByTestId("scene-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Missing canvas");
  await mkdir("artifacts", { recursive: true });
  for (const [i, dx, dy] of [
    [0, 180, 20],
    [1, -280, 35],
    [2, 120, -80],
  ]) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
    await page.mouse.up();
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(500);
    await canvas.screenshot({ path: `artifacts/orbit-depth-${i}.png` });
  }
  expect(errors.filter((e) => !e.includes("favicon.ico"))).toEqual([]);
});
