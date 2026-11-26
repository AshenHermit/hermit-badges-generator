"use client";

import { useMemo, useState } from "react";
import {
  buildAbsoluteGenerateUrl,
  buildGenerateSearch,
  defaultValues,
} from "@/lib/api";
import type {
  BadgeFormat,
  ParameterValues,
  TemplateMetadata,
} from "@/types/template";
import { useDebouncedValue } from "./use-debounced-value";

const DEBOUNCE_MS = 250;
const DEFAULT_HEIGHT = 60;

export interface GeneratorApi {
  values: ParameterValues;
  format: BadgeFormat;
  height: number;
  setParam: (name: string, value: string) => void;
  setFormat: (format: BadgeFormat) => void;
  setHeight: (height: number) => void;
  previewUrl: string;
  linkUrl: string;
  search: string;
}

export function useGenerator(template: TemplateMetadata | null): GeneratorApi {
  const [values, setValues] = useState<ParameterValues>(() =>
    template ? defaultValues(template) : {},
  );
  const [format, setFormat] = useState<BadgeFormat>("png");
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  const rawSearch = useMemo(
    () =>
      template
        ? buildGenerateSearch({ template: template.id, format, height, values })
        : "",
    [template, format, height, values],
  );
  const search = useDebouncedValue(rawSearch, DEBOUNCE_MS);
  const url = search ? buildAbsoluteGenerateUrl(search) : "";

  return {
    values,
    format,
    height,
    setParam(name, value) {
      setValues((current) => ({ ...current, [name]: value }));
    },
    setFormat,
    setHeight,
    previewUrl: url,
    linkUrl: url,
    search,
  };
}
