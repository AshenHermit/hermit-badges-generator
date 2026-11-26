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

const DEFAULT_HEIGHT = 60;

export interface GeneratorApi {
  values: ParameterValues;
  format: BadgeFormat;
  height: number;
  setParam: (name: string, value: string) => void;
  setFormat: (format: BadgeFormat) => void;
  setHeight: (height: number) => void;
  dirty: boolean;
  apply: () => void;
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
  const [appliedSearch, setAppliedSearch] = useState(() =>
    template
      ? buildGenerateSearch({
          template: template.id,
          format: "png",
          height: DEFAULT_HEIGHT,
          values: defaultValues(template),
        })
      : "",
  );

  const draftSearch = useMemo(
    () =>
      template
        ? buildGenerateSearch({ template: template.id, format, height, values })
        : "",
    [template, format, height, values],
  );
  const dirty = draftSearch !== appliedSearch;
  const url = appliedSearch ? buildAbsoluteGenerateUrl(appliedSearch) : "";

  return {
    values,
    format,
    height,
    setParam(name, value) {
      setValues((current) => ({ ...current, [name]: value }));
    },
    setFormat,
    setHeight,
    dirty,
    apply() {
      if (dirty) setAppliedSearch(draftSearch);
    },
    previewUrl: url,
    linkUrl: url,
    search: appliedSearch,
  };
}
