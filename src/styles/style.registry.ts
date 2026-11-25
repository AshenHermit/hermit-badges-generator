import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { StyleDefinition } from './style-definition';

const TEMPLATES_DIR = path.resolve(process.cwd(), 'assets/templates');
const STYLE_ID_PATTERN = /^[a-z0-9-]+$/;

@Injectable()
export class StyleRegistry {
  private readonly styles = new Map<string, StyleDefinition>();

  constructor() {
    for (const entry of fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory() || !STYLE_ID_PATTERN.test(entry.name)) {
        continue;
      }
      const manifestPath = path.resolve(TEMPLATES_DIR, entry.name, 'manifest.json');
      const definition = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as StyleDefinition;
      this.styles.set(definition.id, definition);
    }
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
    return definition;
  }
}
