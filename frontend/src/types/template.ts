export type ParameterType = "string" | "color" | "integer";

export interface TemplateParameter {
  name: string;
  placeholder: string;
  type: ParameterType;
  required: boolean;
  default?: string;
  maxLength?: number;
  pattern?: string;
  description?: string;
}

export interface TemplateMetadata {
  id: string;
  parameters: TemplateParameter[];
}

export type ParameterValues = Record<string, string>;

export type BadgeFormat = "png" | "webp";
