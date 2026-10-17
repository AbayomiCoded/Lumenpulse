import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, devices } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mockAll } from './mocks';

const MEASUREMENTS_FILE = path.join(__dirname, '..', 'mobile-startup-measurements.json');

test.use({
  ...devices['Pixel 5'],
});

async function applyLowEndProfile(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.5 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
  });
}

async function navigationReadyMs(page: Page): Promise<number> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav && nav.domContentLoadedEventEnd > 0) {
      return Math.round(nav.domContentLoadedEventEnd - nav.startTime);
    }
    return Math.round(performance.now());
  });
}

async function timeToInteractiveMs(page: Page): Promise<number> {
  await expect(page.getByTestId('app-interactive')).toBeVisible({ timeout: 20_000 });
  return page.evaluate(() => {
    const boot = (globalThis as { __LUMENPULSE_STARTUP__?: { timeToInteractiveMs: number | null } })
      .__LUMENPULSE_STARTUP__;
    if (boot?.timeToInteractiveMs != null) {
      return Math.round(boot.timeToInteractiveMs);
    }
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav ? Math.round(nav.loadEventEnd - nav.startTime) : Math.round(performance.now());
  });
}

test.describe('Startup budget (low-end profile)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAll(page);
    await applyLowEndProfile(page);
  });

  test('records cold, warm, and time-to-interactive baselines', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const coldStartMs = await navigationReadyMs(page);
    const timeToInteractiveMsValue = await timeToInteractiveMs(page);

    await page.reload({ waitUntil: 'domcontentloaded' });
    const warmStartMs = await navigationReadyMs(page);
    await expect(page.getByTestId('app-interactive')).toBeVisible({ timeout: 20_000 });

    const payload = {
      profile: 'low-end-web',
      recordedAt: new Date().toISOString(),
      metrics: {
        coldStartMs,
        warmStartMs,
        timeToInteractiveMs: timeToInteractiveMsValue,
      },
    };

    writeFileSync(MEASUREMENTS_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    expect(coldStartMs).toBeGreaterThan(0);
    expect(warmStartMs).toBeGreaterThan(0);
    expect(timeToInteractiveMsValue).toBeGreaterThan(0);
  });
});
