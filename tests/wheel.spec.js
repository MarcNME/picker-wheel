const { test, expect } = require('@playwright/test');

async function importItems(page, items) {
  await page.locator('#importFileInput').setInputFiles({
    name: 'items.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(items))
  });
}

test('locks editing during a spin and lands on the announced winner', async ({ page }) => {
  await page.goto('/');
  await page.clock.install();
  const names = await page.locator('.item-row label').allTextContents();
  await page.locator('#spinBtn').click();
  for (const control of await page.locator('.panel input, .panel button').all()) {
    await expect(control).toBeDisabled();
  }
  await page.clock.fastForward(4500);
  const rotation = await page.locator('#wheel').evaluate(canvas =>
    Number(canvas.style.transform.match(/rotate\(([^)]+)deg\)/)[1]));
  const pointerAngle = ((-rotation % 360) + 360) % 360;
  const winnerIndex = Math.floor(pointerAngle / (360 / names.length));
  await expect(page.locator('#winName')).toHaveText(names[winnerIndex]);
  await page.locator('#winCloseBtn').click();
  await expect(page.locator('#spinBtn')).toBeEnabled();
  for (const control of await page.locator('.panel input, .panel button').all()) {
    await expect(control).toBeEnabled();
  }
});

test('winner dialog supports keyboard dismissal and restores focus', async ({ page }) => {
  await page.goto('/');
  await page.clock.install();
  await expect(page.getByRole('button', { name: 'Nice!' })).toHaveCount(0);
  await page.locator('#spinBtn').focus();
  await page.keyboard.press('Space');
  await page.clock.fastForward(4500);
  await expect(page.getByRole('dialog', { name: 'Winner' })).toBeVisible();
  await expect(page.locator('#winCloseBtn')).toBeFocused();
  await page.locator('#newItemInput').evaluate(input => input.focus());
  await expect(page.locator('#winCloseBtn')).toBeFocused();
  for (let step = 0; step < 4; step++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('.app, .site-footer'))).toBe(false);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#spinBtn')).toBeFocused();
  await expect(page.locator('.confetti-piece')).toHaveCount(0);
});

test('reduced motion skips spinning animation and confetti', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('#spinBtn').click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 1000 });
  await expect(page.locator('.confetti-piece')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText(await page.locator('#winName').textContent());
});

test('imports normalize names, persist, and round-trip through export', async ({ page }) => {
  await page.goto('/');
  const items = [{ name: '  Tea  ', enabled: true }, { name: 'Coffee', enabled: false }];
  await importItems(page, items);
  await expect(page.getByRole('status')).toHaveText('Items imported.');
  await expect(page.locator('.item-row label')).toHaveText(['Tea', 'Coffee']);
  await page.reload();
  await expect(page.locator('.item-row label')).toHaveText(['Tea', 'Coffee']);
  await expect(page.getByRole('checkbox', { name: 'Coffee' })).not.toBeChecked();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportBtn').click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported).toEqual([{ name: 'Tea', enabled: true }, { name: 'Coffee', enabled: false }]);
  await importItems(page, exported);
  await expect(page.locator('.item-row label')).toHaveText(['Tea', 'Coffee']);
});

test('invalid imports preserve the existing list', async ({ page }) => {
  await page.goto('/');
  const original = await page.locator('.item-row label').allTextContents();
  const cases = [
    { value: {}, message: 'Expected a JSON array' },
    { value: [{ name: ' ', enabled: true }], message: '1-40 characters' },
    { value: [{ name: 'x'.repeat(41), enabled: true }], message: '1-40 characters' },
    { value: [{ name: 'Tea', enabled: 'false' }], message: 'boolean enabled' },
    { value: [{ name: 'Tea' }], message: 'boolean enabled' },
    { value: Array.from({ length: 101 }, () => ({ name: 'Tea', enabled: true })), message: 'at most 100' }
  ];
  for (const entry of cases) {
    await importItems(page, entry.value);
    await expect(page.getByRole('status')).toContainText(entry.message);
    await expect(page.locator('.item-row label')).toHaveText(original);
    await expect(page.locator('#spinBtn')).toBeEnabled();
  }
  await page.locator('#importFileInput').setInputFiles({
    name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{')
  });
  await expect(page.getByRole('status')).toContainText('invalid JSON');
  await page.locator('#importFileInput').setInputFiles({
    name: 'large.json', mimeType: 'application/json', buffer: Buffer.alloc(65537, ' ')
  });
  await expect(page.getByRole('status')).toContainText('maximum size is 64 KiB');
  await expect(page.locator('.item-row label')).toHaveText(original);
});

test('pending imports lock spinning until the new list is ready', async ({ page }) => {
  await page.addInitScript(() => {
    const readAsText = FileReader.prototype.readAsText;
    FileReader.prototype.readAsText = function (file) {
      setTimeout(() => readAsText.call(this, file), 1000);
    };
  });
  await page.goto('/');
  await page.clock.install();
  await importItems(page, [{ name: 'Tea', enabled: true }]);
  await expect(page.locator('#spinBtn')).toBeDisabled();
  await expect(page.locator('#addBtn')).toBeDisabled();
  await page.clock.fastForward(1100);
  await expect(page.getByRole('status')).toHaveText('Items imported.');
  await expect(page.locator('#spinBtn')).toBeEnabled();
  await expect(page.locator('.item-row label')).toHaveText(['Tea']);
});

test('invalid stored data falls back to defaults', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pickerWheelItems', JSON.stringify([{ name: ' ', enabled: true }]));
  });
  await page.goto('/');
  await expect(page.locator('.item-row')).toHaveCount(8);
  await expect(page.locator('.item-row label').first()).toHaveText('Pizza');
});

test('long labels fit their segments and canvas follows display density', async ({ page }) => {
  await page.addInitScript(() => {
    window.drawnLabels = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, horizontal, vertical) {
      window.drawnLabels.push({ text, width: this.measureText(text).width, end: horizontal, font: this.font });
      return fillText.call(this, text, horizontal, vertical);
    };
  });
  await page.goto('/');
  const name = 'W'.repeat(40);
  await page.evaluate(() => { window.drawnLabels = []; });
  await importItems(page, Array.from({ length: 30 }, (_, index) => ({ name: index === 0 ? name : `Item ${index}`, enabled: true })));
  await expect(page.getByRole('status')).toHaveText('Items imported.');
  await expect(page.locator('.item-row label').first()).toHaveText(name);
  const labels = await page.evaluate(() => window.drawnLabels);
  expect(labels.some(label => label.text.endsWith('…'))).toBe(true);
  for (const label of labels) {
    const fontSize = Number(label.font.match(/(\d+)px/)[1]);
    const innerEdge = Math.max(72, fontSize * 0.7 / Math.tan(Math.PI / 30));
    expect(label.width).toBeLessThanOrEqual(label.end - innerEdge);
  }
  for (const viewport of [{ width: 320, height: 640 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.locator('#wheel').evaluate(canvas =>
      canvas.width === Math.round(canvas.clientWidth * devicePixelRatio))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test('empty and disabled lists cannot spin, and disabled entries never win', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const items of [[], [{ name: 'Disabled', enabled: false }]]) {
    await importItems(page, items);
    await expect(page.getByRole('status')).toHaveText('Items imported.');
    await page.locator('#spinBtn').click();
    await expect(page.getByRole('status')).toHaveText('Enable at least one item to spin.');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await importItems(page, [
    { name: 'Disabled', enabled: false },
    { name: 'Tea', enabled: true },
    { name: 'Coffee', enabled: true }
  ]);
  await expect(page.getByRole('status')).toHaveText('Items imported.');
  for (let spinNumber = 0; spinNumber < 3; spinNumber++) {
    await page.locator('#spinBtn').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const rotation = await page.locator('#wheel').evaluate(canvas =>
      Number(canvas.style.transform.match(/rotate\(([^)]+)deg\)/)[1]));
    const winnerIndex = Math.floor((((-rotation % 360) + 360) % 360) / 180);
    await expect(page.locator('#winName')).toHaveText(['Tea', 'Coffee'][winnerIndex]);
    await page.locator('#winCloseBtn').click();
  }
});

test('item count limit also applies to manual additions', async ({ page }) => {
  await page.goto('/');
  await importItems(page, Array.from({ length: 100 }, (_, index) => ({ name: `Item ${index}`, enabled: true })));
  await expect(page.locator('.item-row')).toHaveCount(100);
  await page.getByRole('textbox', { name: 'New item' }).fill('Extra');
  await page.locator('#addBtn').click();
  await expect(page.getByRole('status')).toContainText('at most 100');
  await expect(page.locator('.item-row')).toHaveCount(100);
});

test('renders a nonblank wheel and a contained winner', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('#wheel').evaluate(canvas => { canvas.style.transform = 'rotate(45deg)'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.locator('#wheel').evaluate(canvas => { canvas.style.transform = ''; });
  const colors = await page.locator('#wheel').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let offset = 0; offset < pixels.length; offset += 400) {
      if (pixels[offset + 3] === 255) colors.add(`${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`);
    }
    return colors.size;
  });
  expect(colors).toBeGreaterThan(8);
  await page.screenshot({ path: testInfo.outputPath('wheel.png'), fullPage: true });
  await importItems(page, [{ name: 'W'.repeat(40), enabled: true }]);
  await expect(page.getByRole('status')).toHaveText('Items imported.');
  await page.locator('#spinBtn').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.locator('.win-card').evaluate(card => {
    const bounds = card.getBoundingClientRect();
    const name = card.querySelector('#winName').getBoundingClientRect();
    const button = card.querySelector('button').getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight
      && name.right <= bounds.right && name.bottom <= button.top && card.scrollWidth <= card.clientWidth;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('winner.png') });
  expect(pageErrors).toEqual([]);
});