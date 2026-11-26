import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultValues } from "@/lib/api";
import type { TemplateMetadata } from "@/types/template";
import { useGenerator } from "@/hooks/use-generator";

const template: TemplateMetadata = {
  id: "hermit-frame",
  parameters: [
    { name: "left", placeholder: "LEFT", type: "string", required: true },
    { name: "right", placeholder: "RIGHT", type: "string", required: true },
    {
      name: "borderColor",
      placeholder: "#000000",
      type: "color",
      required: false,
      default: "#0b0b0b",
    },
  ],
};

describe("useGenerator", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts with template defaults, png format and height 60", () => {
    const { result } = renderHook(() => useGenerator(template));
    expect(result.current.values).toEqual(defaultValues(template));
    expect(result.current.format).toBe("png");
    expect(result.current.height).toBe(60);
  });

  it("debounces parameter edits and keeps preview equal to link", () => {
    const { result } = renderHook(() => useGenerator(template));
    act(() => result.current.setParam("left", "Hi"));
    act(() => vi.advanceTimersByTime(250));
    expect(result.current.search).toContain("left=Hi");
    expect(result.current.previewUrl).toBe(result.current.linkUrl);
  });

  it("debounces height edits", () => {
    const { result } = renderHook(() => useGenerator(template));
    act(() => result.current.setHeight(140));
    act(() => vi.advanceTimersByTime(250));
    expect(result.current.search).toContain("height=140");
  });

  it("debounces format edits and keeps preview equal to link", () => {
    const { result } = renderHook(() => useGenerator(template));
    act(() => result.current.setFormat("webp"));
    act(() => vi.advanceTimersByTime(250));
    expect(result.current.search).toContain("format=webp");
    expect(result.current.previewUrl).toBe(result.current.linkUrl);
  });

  it("has an empty preview when no template is selected", () => {
    const { result } = renderHook(() => useGenerator(null));
    expect(result.current.previewUrl).toBe("");
    expect(result.current.linkUrl).toBe("");
  });
});
