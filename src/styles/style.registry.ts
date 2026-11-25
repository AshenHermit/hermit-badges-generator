import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Sides, StyleDefinition } from './style-definition';

const TEMPLATES_DIR = path.resolve(process.cwd(), 'assets/templates');
const STYLE_ID_PATTERN = /^[a-z0-9-]+$/;
const SIDE_KEYS = ['top', 'right', 'bottom', 'left'] as const;

@Injectable()
export class StyleRegistry {
  private readonly styles = new Map<string, StyleDefinition>();
  private readonly fresh: boolean;

  constructor() {
    this.fresh = ['1', 'true', 'yes'].includes(
      (process.env.FRESH_MANIFEST ?? '').trim().toLowerCase(),
    );
    for (const entry of fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory() || !STYLE_ID_PATTERN.test(entry.name)) {
        continue;
      }
      const definition = this.readDefinition(entry.name);
      this.styles.set(definition.id, definition);
    }
  }

  private readDefinition(id: string): StyleDefinition {
    const manifestPath = path.resolve(TEMPLATES_DIR, id, 'manifest.json');
    const definition = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as StyleDefinition;
    const rawBorder = definition.border as { slice?: unknown; width?: unknown } | undefined;
    definition.border = {
      slice: this.readSides(rawBorder?.slice, 'border.slice'),
      width: this.readSides(rawBorder?.width, 'border.width'),
    };
    definition.padding = this.readSides(definition.padding, 'padding');

    const { slice, width } = definition.border;
    this.checkSpan(
      slice.top + slice.bottom,
      'border.slice.top',
      'border.slice.bottom',
      'height',
      definition.height,
    );
    for (const [side, half] of Object.entries(definition.halves)) {
      this.checkSpan(
        slice.left + slice.right,
        'border.slice.left',
        'border.slice.right',
        `halves.${side}.width`,
        half.width,
      );
    }
    this.checkSpan(
      width.top + width.bottom,
      'border.width.top',
      'border.width.bottom',
      'height',
      definition.height,
    );
    return definition;
  }

  private checkSpan(sum: number, first: string, second: string, limitLabel: string, limit: number): void {
    if (sum > limit) {
      throw new Error(`Invalid ${first} + ${second}: sum ${sum} exceeds ${limitLabel} ${limit}`);
    }
  }

  private readSides(raw: unknown, label: string): Sides {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Invalid ${label}: expected four-sided values`);
    }
    const values = raw as Record<string, unknown>;
    const sides = {} as Sides;
    for (const side of SIDE_KEYS) {
      const value = values[side];
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid ${label}.${side}: expected a positive finite number`);
      }
      sides[side] = value;
    }
    return sides;
  }

  list(): string[] {
    return [...this.styles.keys()];
  }

  get(id: string): StyleDefinition {
    if (!STYLE_ID_PATTERN.test(id)) {
      throw new Error(`Unknown style: ${id}`);
    }
    const definition = this.styles.get(id);
    if (!definition) {
      throw new Error(`Unknown style: ${id}`);
    }
    return this.fresh ? this.readDefinition(id) : definition;
  }
}
