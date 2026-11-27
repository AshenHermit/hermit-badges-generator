import { Injectable } from '@nestjs/common';
import {
  TemplateDefinition,
  invalid,
  normalizeColor,
  normalizeInteger,
  normalizeSelect,
  normalizeString,
} from './template-definition';

export type ResolvedValues = Record<string, string>;

@Injectable()
export class TemplateParamsService {
  resolve(
    definition: TemplateDefinition,
    raw: Record<string, unknown>,
  ): ResolvedValues {
    const known = new Set(definition.variables.map((variable) => variable.name));
    for (const key of Object.keys(raw)) {
      if (!known.has(key)) {
        throw invalid(key, 'unknown query parameter for this template');
      }
    }

    const values: ResolvedValues = {};
    for (const variable of definition.variables) {
      // Defaults go through the same validation/normalization as query values.
      const supplied = raw[variable.name] ?? variable.default;
      if (supplied === undefined) {
        throw invalid(variable.name, 'is required');
      }
      if (typeof supplied !== 'string') {
        throw invalid(variable.name, 'must be a string');
      }

      switch (variable.type) {
        case 'string':
          values[variable.name] = normalizeString(supplied, variable);
          break;
        case 'color':
          values[variable.name] = normalizeColor(supplied, variable.name);
          break;
        case 'integer':
          values[variable.name] = String(normalizeInteger(supplied, variable));
          break;
        case 'select':
          values[variable.name] = normalizeSelect(supplied, variable);
          break;
      }
    }
    return values;
  }
}
