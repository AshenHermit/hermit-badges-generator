import { BadRequestException } from '@nestjs/common';
import { ImageFormat } from '../rendering/image-transformer';
import { TemplateManifestService } from '../templates/template-manifest.service';
import {
  ResolvedValues,
  TemplateParamsService,
} from '../templates/template-params.service';
import { invalid } from '../templates/template-definition';

export const DEFAULT_TEMPLATE = 'hermit-frame';
export const DEFAULT_FORMAT: ImageFormat = 'png';
export const DEFAULT_HEIGHT = 60;
const MAX_HEIGHT = 1000;

export interface GenerateParams {
  templateId: string;
  format: ImageFormat;
  height: number;
  variables: ResolvedValues;
}

function stringParam(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw invalid(key, 'must be a single string value');
  }
  return value;
}

export function parseGenerateParams(
  query: Record<string, unknown>,
  manifests: TemplateManifestService,
  params: TemplateParamsService,
): GenerateParams {
  const templateId = stringParam(query, 'template') ?? DEFAULT_TEMPLATE;

  const format = stringParam(query, 'format') ?? DEFAULT_FORMAT;
  if (format !== 'png' && format !== 'webp') {
    throw new BadRequestException('format: must be png or webp');
  }

  const rawHeight = stringParam(query, 'height');
  let height = DEFAULT_HEIGHT;
  if (rawHeight !== undefined) {
    if (!/^\d+$/.test(rawHeight)) {
      throw invalid('height', 'must be an integer');
    }
    height = Number(rawHeight);
    if (height < 1 || height > MAX_HEIGHT) {
      throw invalid('height', `must be between 1 and ${MAX_HEIGHT}`);
    }
  }

  const variables: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key !== 'template' && key !== 'format' && key !== 'height') {
      variables[key] = value;
    }
  }

  const definition = manifests.get(templateId);
  return {
    templateId,
    format,
    height,
    variables: params.resolve(definition, variables),
  };
}
