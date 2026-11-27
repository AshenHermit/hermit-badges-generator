import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isFreshTemplate } from '../rendering/template.service';
import {
  RESERVED_PARAMS,
  TEMPLATE_ID_PATTERN,
  SelectOption,
  TemplateDefinition,
  TemplateVariable,
  TemplateVariableType,
  normalizeColor,
} from './template-definition';

export const TEMPLATES_DIR = path.resolve(process.cwd(), 'assets/templates');

const TYPES: TemplateVariableType[] = ['string', 'color', 'integer', 'select'];
const VARIABLE_NAME_PATTERN = /^[a-z][A-Za-z0-9]*$/;
const PLACEHOLDER_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function fail(reason: string): Error {
  return new Error(`Invalid template manifest: ${reason}`);
}

export function parseVariable(value: unknown): TemplateVariable {
  if (typeof value !== 'object' || value === null) {
    throw fail('variable must be an object');
  }
  const raw = value as Record<string, unknown>;
  const { name, placeholder, type, required, default: defaultValue } = raw;

  if (typeof name !== 'string' || !VARIABLE_NAME_PATTERN.test(name)) {
    throw fail('variable name must match /^[a-z][A-Za-z0-9]*$/');
  }
  if ((RESERVED_PARAMS as readonly string[]).includes(name)) {
    throw fail(`variable "${name}" is a reserved query parameter`);
  }
  if (typeof placeholder !== 'string' || !PLACEHOLDER_PATTERN.test(placeholder)) {
    throw fail(`variable "${name}" has an invalid placeholder`);
  }
  if (typeof type !== 'string' || !TYPES.includes(type as TemplateVariableType)) {
    throw fail(`variable "${name}" has an unknown type`);
  }
  if (typeof required !== 'boolean') {
    throw fail(`variable "${name}" must declare required`);
  }
  if (defaultValue !== undefined && typeof defaultValue !== 'string' && typeof defaultValue !== 'number') {
    throw fail(`variable "${name}" has a non-primitive default`);
  }
  if (required && defaultValue !== undefined) {
    throw fail(`required variable "${name}" must not have a default`);
  }
  if (!required && defaultValue === undefined) {
    throw fail(`optional variable "${name}" must have a default`);
  }

  const variable: TemplateVariable = {
    name,
    placeholder,
    type: type as TemplateVariableType,
    required,
  };
  if (defaultValue !== undefined) variable.default = defaultValue;
  if (typeof raw.description === 'string') variable.description = raw.description;

  if (variable.type === 'string') {
    if (raw.maxLength !== undefined) {
      if (typeof raw.maxLength !== 'number' || raw.maxLength < 1) {
        throw fail(`variable "${name}" has an invalid maxLength`);
      }
      variable.maxLength = raw.maxLength;
    }
    if (raw.pattern !== undefined) {
      if (typeof raw.pattern !== 'string') {
        throw fail(`variable "${name}" has an invalid pattern`);
      }
      variable.pattern = raw.pattern;
    }
  }
  if (variable.type === 'integer') {
    for (const key of ['min', 'max'] as const) {
      if (raw[key] !== undefined) {
        if (typeof raw[key] !== 'number' || !Number.isInteger(raw[key])) {
          throw fail(`variable "${name}" has an invalid ${key}`);
        }
        variable[key] = raw[key] as number;
      }
    }
    if (variable.min !== undefined && variable.max !== undefined && variable.min > variable.max) {
      throw fail(`variable "${name}" has min greater than max`);
    }
  }
  if (variable.type === 'color' && variable.default !== undefined) {
    normalizeColor(String(variable.default), variable.name);
  }
  if (variable.type === 'select') {
    if (!Array.isArray(raw.options) || raw.options.length === 0) {
      throw fail(`variable "${name}" requires a non-empty options array`);
    }
    const values = new Set<string>();
    const options: SelectOption[] = [];
    for (const optionRaw of raw.options) {
      if (typeof optionRaw !== 'object' || optionRaw === null) {
        throw fail(`variable "${name}" has an invalid option`);
      }
      const option = optionRaw as Record<string, unknown>;
      if (typeof option.value !== 'string' || option.value.length === 0) {
        throw fail(`variable "${name}" has an option with an invalid value`);
      }
      if (typeof option.label !== 'string' || option.label.length === 0) {
        throw fail(`variable "${name}" has an option with an invalid label`);
      }
      if (values.has(option.value)) {
        throw fail(`variable "${name}" has duplicate option value "${option.value}"`);
      }
      values.add(option.value);
      options.push({ value: option.value, label: option.label });
    }
    variable.options = options;
    if (
      defaultValue !== undefined &&
      (typeof defaultValue !== 'string' || !values.has(defaultValue))
    ) {
      throw fail(`variable "${name}" default must be one of the option values`);
    }
  } else if (raw.options !== undefined) {
    throw fail(`variable "${name}" has options but is not a select`);
  }
  return variable;
}

function parseManifest(id: string, dir: string, raw: unknown): TemplateDefinition {
  if (typeof raw !== 'object' || raw === null) {
    throw fail('root must be an object');
  }
  const manifest = raw as Record<string, unknown>;
  if (manifest.id !== id) {
    throw fail(`id must match the directory name "${id}"`);
  }
  if (typeof manifest.template !== 'string' || !/^[\w.-]+\.html$/.test(manifest.template)) {
    throw fail('template must be an .html file name');
  }
  if (!Array.isArray(manifest.variables) || manifest.variables.length === 0) {
    throw fail('variables must be a non-empty array');
  }

  const variables = manifest.variables.map(parseVariable);
  const names = new Set<string>();
  const placeholders = new Set<string>();
  for (const variable of variables) {
    if (names.has(variable.name)) throw fail(`duplicate variable "${variable.name}"`);
    if (placeholders.has(variable.placeholder)) {
      throw fail(`duplicate placeholder "${variable.placeholder}"`);
    }
    names.add(variable.name);
    placeholders.add(variable.placeholder);
  }

  const file = path.resolve(dir, manifest.template);
  if (!fs.existsSync(file)) {
    throw fail(`template file "${manifest.template}" does not exist`);
  }
  return { id, file, variables };
}

@Injectable()
export class TemplateManifestService {
  private readonly fresh = isFreshTemplate();
  private readonly cache = new Map<string, TemplateDefinition>();

  get(id: string): TemplateDefinition {
    if (typeof id !== 'string' || !TEMPLATE_ID_PATTERN.test(id)) {
      throw new BadRequestException('template: invalid id');
    }
    if (!this.fresh) {
      const cached = this.cache.get(id);
      if (cached) return cached;
    }
    const dir = path.resolve(TEMPLATES_DIR, id);
    const manifestPath = path.resolve(dir, 'manifest.json');
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
    } catch {
      throw new BadRequestException(`template: unknown template "${id}"`);
    }
    const definition = parseManifest(id, dir, raw);
    if (!this.fresh) this.cache.set(id, definition);
    return definition;
  }

  list(): string[] {
    let entries: string[];
    try {
      entries = fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && fs.existsSync(path.resolve(TEMPLATES_DIR, entry.name, 'manifest.json')))
        .map((entry) => entry.name)
        .filter((name) => TEMPLATE_ID_PATTERN.test(name));
    } catch {
      return [];
    }
    return entries.sort();
  }
}
