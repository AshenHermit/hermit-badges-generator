import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  TemplateDefinition,
} from '../templates/template-definition';
import { ResolvedValues } from '../templates/template-params.service';

const FRESH_VALUES = ['1', 'true', 'yes'];

/** Startup-read: FRESH_TEMPLATE wins when set; FRESH_MANIFEST is the alias when it is empty or unset. */
export function isFreshTemplate(): boolean {
  const raw = process.env.FRESH_TEMPLATE || process.env.FRESH_MANIFEST || '';
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
  private readonly fresh = isFreshTemplate();
  private readonly cache = new Map<string, string>();

  prepare(template: TemplateDefinition, values: ResolvedValues): string {
    const tempPath = path.join(
      path.dirname(template.file),
      `template-${randomUUID()}.html`,
    );
    fs.writeFileSync(tempPath, this.renderHtml(template, values), 'utf8');
    return tempPath;
  }

  renderHtml(template: TemplateDefinition, values: ResolvedValues): string {
    const html = this.read(template.file);
    const stringVariables = new Set(
      template.variables
        .filter(
          (variable) => variable.type === 'string' || variable.type === 'select',
        )
        .map((variable) => variable.placeholder),
    );
    const replacements = new Map<string, string>();
    for (const variable of template.variables) {
      const value = values[variable.name];
      if (value === undefined) continue;
      replacements.set(
        variable.placeholder,
        stringVariables.has(variable.placeholder) ? escapeHtml(value) : value,
      );
    }

    return html.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (token, name: string) =>
      replacements.has(name) ? replacements.get(name)! : token,
    );
  }

  withBase(html: string, templateId: string): string {
    const base = `<base href="/api/v1/assets/templates/${templateId}/">`;
    const head = /<head\b[^>]*>/i.exec(html);
    if (!head) return base + html;
    const index = head.index + head[0].length;
    return html.slice(0, index) + base + html.slice(index);
  }

  private read(file: string): string {
    if (this.fresh) return fs.readFileSync(file, 'utf8');
    const cached = this.cache.get(file);
    if (cached !== undefined) return cached;
    const html = fs.readFileSync(file, 'utf8');
    this.cache.set(file, html);
    return html;
  }
}
