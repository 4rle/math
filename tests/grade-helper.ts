import { expect, type Page } from "@playwright/test";
/** Exercise the slider's accessible keyboard path rather than bypassing storage/UI. */
export async function recordGrade(
  page: Page,
  grade: string,
  waitForSave = true,
) {
  const slider = page.getByRole("slider", { name: "理解度", exact: true });
  await slider.focus();
  await page.keyboard.press("Home");
  for (let n = 0; n < ["E", "D", "C", "B", "A"].indexOf(grade); n++)
    await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  if (waitForSave) await expect(page.locator(".grade-dialog")).toHaveCount(0);
}
