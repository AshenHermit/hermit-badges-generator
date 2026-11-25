import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const TEMPLATE_PATH = path.resolve(
  process.cwd(),
  'assets/templates/hermit-frame/template.html',
);
const TEMPLATE_DIR = path.dirname(TEMPLATE_PATH);

const FRESH_VALUES = ['1', 'true', 'yes'];

/** Startup-read: FRESH_TEMPLATE wins, FRESH_MANIFEST remains an alias. */
export function isFreshTemplate(): boolean {
  const raw = process.env.FRESH_TEMPLATE ?? process.env.FRESH_MANIFEST ?? '';
  return FRESH_VALUES.includes(raw.trim().toLowerCase());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class TemplateService {
  private readonly fresh: boolean;
  private readonly cachedTemplate?: string;

  constructor() {
    this.fresh = isFreshTemplate();
    if (!this.fresh) {
      this.cachedTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    }
  }

  prepare(left: string, right: string): string {
    const template =
      this.fresh || this.cachedTemplate === undefined
        ? fs.readFileSync(TEMPLATE_PATH, 'utf8')
        : this.cachedTemplate;
    const html = template
      .replace('{{LEFT}}', escapeHtml(left))
      .replace('{{RIGHT}}', escapeHtml(right));
    const tempPath = path.join(TEMPLATE_DIR, `template-${randomUUID()}.html`);
    fs.writeFileSync(tempPath, html, 'utf8');
    return tempPath;
  }
}
