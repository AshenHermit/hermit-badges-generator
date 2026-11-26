import { BadRequestException } from '@nestjs/common';

export type TemplateVariableType = 'string' | 'color' | 'integer';

export interface TemplateVariable {
  name: string;
  placeholder: string;
  type: TemplateVariableType;
  required: boolean;
  default?: string | number;
  description?: string;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
}

export interface TemplateDefinition {
  id: string;
  /** Absolute path to the HTML template file. */
  file: string;
  variables: TemplateVariable[];
}

export const TEMPLATE_ID_PATTERN = /^[a-z0-9-]+$/;
export const RESERVED_PARAMS = ['template', 'format', 'height'] as const;

const RGB_PATTERN =
  /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;

/** Accepts #RGB, #RRGGBB and rgb(r, g, b); returns a canonical rgb(r, g, b) string. */
export function normalizeColor(raw: string, field: string): string {
  let r: number;
  let g: number;
  let b: number;

  if (raw.startsWith('#')) {
    const hex = raw.slice(1);
    if (/^[\da-fA-F]{3}$/.test(hex)) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (/^[\da-fA-F]{6}$/.test(hex)) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      throw invalid(field, 'expected #RGB, #RRGGBB or rgb(r, g, b)');
    }
  } else {
    const match = RGB_PATTERN.exec(raw);
    if (!match) {
      throw invalid(field, 'expected #RGB, #RRGGBB or rgb(r, g, b)');
    }
    [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }

  if ([r, g, b].some((channel) => channel > 255)) {
    throw invalid(field, 'color channels must be 0-255');
  }
  return `rgb(${r}, ${g}, ${b})`;
}

export function normalizeString(
  raw: string,
  variable: TemplateVariable,
): string {
  if (raw.length === 0) {
    throw invalid(variable.name, 'must not be empty');
  }
  if (/[\p{Cc}\p{Cf}]/u.test(raw)) {
    throw invalid(variable.name, 'must not contain control characters');
  }
  if (variable.maxLength !== undefined && raw.length > variable.maxLength) {
    throw invalid(variable.name, `must be at most ${variable.maxLength} characters`);
  }
  if (variable.pattern !== undefined) {
    let regex: RegExp;
    try {
      regex = new RegExp(variable.pattern, 'u');
    } catch {
      throw new Error(`Invalid pattern in template variable "${variable.name}"`);
    }
    if (!regex.test(raw)) {
      throw invalid(variable.name, 'does not match the required pattern');
    }
  }
  return raw;
}

export function normalizeInteger(
  raw: string,
  variable: TemplateVariable,
): number {
  if (!/^-?\d+$/.test(raw)) {
    throw invalid(variable.name, 'must be an integer');
  }
  const value = Number(raw);
  if (variable.min !== undefined && value < variable.min) {
    throw invalid(variable.name, `must be at least ${variable.min}`);
  }
  if (variable.max !== undefined && value > variable.max) {
    throw invalid(variable.name, `must be at most ${variable.max}`);
  }
  return value;
}

export function invalid(field: string, reason: string): BadRequestException {
  return new BadRequestException(`${field}: ${reason}`);
}
