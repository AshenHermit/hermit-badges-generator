import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import * as fs from 'node:fs';
import { chromium } from 'playwright-core';
import { Renderer, RenderInput } from './renderer';
import { TemplateService } from './template.service';

export const BROWSER_TOKEN = 'PLAYWRIGHT_BROWSER';

export interface PageLike {
  goto(url: string): Promise<unknown>;
  evaluate(fn: () => unknown): Promise<unknown>;
  locator(selector: string): {
    screenshot(options: {
      path: undefined;
      type: 'png';
      omitBackground: boolean;
    }): Promise<Buffer>;
  };
  close(): Promise<void>;
}

export interface BrowserLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

@Injectable()
export class BrowserRenderer implements Renderer, OnModuleDestroy {
  private browser?: BrowserLike;
  private launchPromise?: Promise<BrowserLike>;

  constructor(
    private readonly templates: TemplateService,
    @Optional() @Inject(BROWSER_TOKEN) browser?: BrowserLike,
  ) {
    this.browser = browser;
  }

  async render(input: RenderInput): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    let tempPath: string | undefined;
    try {
      tempPath = this.templates.prepare(input.left, input.right);
      await page.goto(`file://${tempPath}`);
      await page.evaluate(() => document.fonts.ready);
      const fontLoaded = await page.evaluate(() =>
        document.fonts.check('50px "Lipstick Rage"'),
      );
      if (fontLoaded !== true) {
        throw new Error('Lipstick Rage font failed to load from the badge template');
      }
      return await page.locator('.github-badge').screenshot({
        path: undefined,
        type: 'png',
        omitBackground: true,
      });
    } finally {
      await page.close().catch(() => undefined);
      if (tempPath !== undefined) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // Best effort: a failed render must not be masked by temp-file cleanup.
        }
      }
    }
  }

  private async getBrowser(): Promise<BrowserLike> {
    if (this.browser) {
      return this.browser;
    }
    if (!this.launchPromise) {
      this.launchPromise = chromium
        .launch({
          executablePath: chromium.executablePath(),
          args: ['--allow-file-access-from-files'],
          headless: true,
        })
        .then((launched) => {
          this.browser = launched as unknown as BrowserLike;
          return this.browser;
        })
        .catch((error: unknown) => {
          this.launchPromise = undefined;
          throw error;
        });
    }
    return this.launchPromise;
  }

  async onModuleDestroy(): Promise<void> {
    const browser = this.browser;
    this.browser = undefined;
    this.launchPromise = undefined;
    if (browser) {
      await browser.close();
    }
  }
}
