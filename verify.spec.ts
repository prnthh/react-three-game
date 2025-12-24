
import { test, expect } from '@playwright/test';

test('verify prefab editor undo functionality', async ({ page }) => {
  await page.goto('http://localhost:3001/tools/prefab-editor');

  // Click on the 'child-1' node in the prefab graph
  await page.getByText('child-1').click();

  // Change the color to green
  await page.locator('input[type="color"]').fill('#00ff00');

  // Undo the change
  await page.keyboard.press('Control+Z');

  // Take a screenshot
  await page.screenshot({ path: 'screenshot.png' });
});
