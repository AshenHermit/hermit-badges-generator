import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { TemplateDefinition } from '../templates/template-definition';
import { TemplateManifestService } from '../templates/template-manifest.service';
import { TemplateParamsService } from '../templates/template-params.service';
import { BrowserLike, BrowserRenderer, PageLike } from './browser-renderer';
import { TemplateService } from './template.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const TEMP_HTML = 'C:\\badges\\template-fake.html';
const SCREENSHOT_OPTIONS = { path: undefined, type: 'png' as const, omitBackground: true };
const definition: TemplateDefinition = new TemplateManifestService().get('hermit-frame');
const values = new TemplateParamsService().resolve(definition, {
  left: 'Hello',
  right: 'World',
});

function fakePage(): {
  page: PageLike;
  goto: jest.Mock;
  evaluate: jest.Mock;
  locator: jest.Mock;
  screenshot: jest.Mock;
  close: jest.Mock;
} {
  const goto = jest.fn().mockResolvedValue(undefined);
  const evaluate = jest.fn().mockImplementation(async (fn: unknown) =>
    String(fn).includes('fonts.check') ? true : undefined,
  );
  const screenshot = jest.fn().mockResolvedValue(PNG);
  const locator = jest.fn().mockReturnValue({ screenshot });
  const close = jest.fn().mockResolvedValue(undefined);
  return {
    page: { goto, evaluate, locator, close } as unknown as PageLike,
    goto,
    evaluate,
    locator,
    screenshot,
    close,
  };
}

describe('BrowserRenderer with an injected browser', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('launches Chromium from file://, screenshots .github-badge and returns its PNG', async () => {
    const { page, goto, evaluate, locator, screenshot, close } = fakePage();
    const fakeBrowser = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserLike;
    const launch = jest.spyOn(chromium, 'launch').mockResolvedValue(fakeBrowser as never);
    const templates = {
      prepare: jest.fn().mockReturnValue(TEMP_HTML),
    } as unknown as TemplateService;
    const renderer = new BrowserRenderer(templates);

    const result = await renderer.render({ template: definition, values });

    expect(launch).toHaveBeenCalledWith({
      executablePath: chromium.executablePath(),
      args: ['--allow-file-access-from-files'],
      headless: true,
    });
    expect(templates.prepare).toHaveBeenCalledWith(definition, values);
    expect(goto).toHaveBeenCalledWith(pathToFileURL(TEMP_HTML).href);
    expect(evaluate).toHaveBeenCalledWith(expect.any(Function));
    expect(locator).toHaveBeenCalledWith('.github-badge');
    expect(screenshot).toHaveBeenCalledWith(SCREENSHOT_OPTIONS);
    expect(close).toHaveBeenCalledTimes(1);
    expect(result).toBe(PNG);
  });

  it('uses the injected browser without launching another one', async () => {
    const { page } = fakePage();
    const injected = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserLike;
    const launch = jest.spyOn(chromium, 'launch');
    const templates = { prepare: jest.fn().mockReturnValue(TEMP_HTML) } as unknown as TemplateService;

    await new BrowserRenderer(templates, injected).render({ template: definition, values });

    expect(launch).not.toHaveBeenCalled();
    expect(injected.newPage).toHaveBeenCalledTimes(1);
  });
});

describe('BrowserRenderer with real Chromium', () => {
  it('loads the committed template with the Lipstick Rage font and returns a PNG', async () => {
    const browser = await chromium.launch({
      executablePath: chromium.executablePath(),
      args: ['--allow-file-access-from-files'],
      headless: true,
    });
    const page = await browser.newPage();
    const fontChecks: boolean[] = [];
    const originalEvaluate = page.evaluate.bind(page) as (fn: unknown) => Promise<unknown>;
    jest
      .spyOn(page, 'evaluate')
      .mockImplementation(((fn: unknown) => {
        const result = originalEvaluate(fn);
        if (String(fn).includes('fonts.check')) {
          return result.then((value) => {
            fontChecks.push(value as boolean);
            return value;
          });
        }
        return result;
      }) as never);

    const recordingBrowser = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockImplementation(() => browser.close()),
    } as unknown as BrowserLike;

    try {
      const templates = new TemplateService();
      const renderer = new BrowserRenderer(templates, recordingBrowser);
      const png = await renderer.render({ template: definition, values });

      expect(fontChecks).toEqual([true]);
      expect(png.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      expect(png.readUInt32BE(16)).toBeGreaterThan(0);
    } finally {
      await recordingBrowser.close();
      jest.restoreAllMocks();
    }
  }, 30000);
});
