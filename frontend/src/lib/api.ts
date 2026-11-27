import type {
  BadgeFormat,
  ParameterValues,
  TemplateMetadata,
} from "@/types/template";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

const SAMPLE_VALUES: ParameterValues = { left: "Hawoo", right: "Wovd" };

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) {
    throw new Error(`API request failed (${response.status}): ${path}`);
  }
  return (await response.json()) as T;
}

export function listTemplates(signal?: AbortSignal): Promise<string[]> {
  return fetchJson<string[]>("/api/v1/templates", signal);
}

export function getTemplate(
  id: string,
  signal?: AbortSignal,
): Promise<TemplateMetadata> {
  return fetchJson<TemplateMetadata>(
    `/api/v1/templates/${encodeURIComponent(id)}`,
    signal,
  );
}

export function defaultValues(meta: TemplateMetadata): ParameterValues {
  const values: ParameterValues = {};

  for (const parameter of meta.parameters) {
    if (parameter.type === "select") {
      values[parameter.name] =
        parameter.default ?? parameter.options?.[0]?.value ?? "";
      continue;
    }
    if (parameter.default !== undefined) {
      values[parameter.name] = parameter.default;
    } else if (parameter.required) {
      values[parameter.name] =
        SAMPLE_VALUES[parameter.name] ?? parameter.placeholder;
    } else {
      values[parameter.name] = "";
    }
  }

  return values;
}

function clampHeight(height: number): number {
  if (!Number.isFinite(height)) return 60;
  return Math.max(1, Math.min(1000, Math.round(height)));
}

export function buildGenerateSearch({
  template,
  format,
  height,
  values,
}: {
  template: string;
  format: BadgeFormat;
  height: number;
  values: ParameterValues;
}): string {
  const all: ParameterValues = {
    template,
    format,
    height: String(clampHeight(height)),
    ...values,
  };

  const params = new URLSearchParams();
  for (const key of Object.keys(all).sort()) {
    params.set(key, all[key]);
  }

  return params.toString();
}

export function buildAbsoluteGenerateUrl(search: string): string {
  return `${API_BASE_URL}/api/v1/generate?${search}`;
}

export function buildThumbnailUrl(id: string, meta: TemplateMetadata): string {
  const search = buildGenerateSearch({
    template: id,
    format: "png",
    height: 40,
    values: defaultValues(meta),
  });

  return buildAbsoluteGenerateUrl(search);
}
