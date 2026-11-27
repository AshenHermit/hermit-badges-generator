export type ParameterType = "string" | "color" | "integer" | "select";

export interface TemplateParameter {
  name: string;
  placeholder: string;
  type: ParameterType;
  required: boolean;
  default?: string;
  maxLength?: number;
  pattern?: string;
  description?: string;
  options?: { value: string; label: string }[];
}

export interface TemplateMetadata {
  id: string;
  parameters: TemplateParameter[];
}

export type ParameterValues = Record<string, string>;

export type BadgeFormat = "png" | "webp";
