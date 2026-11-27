import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildAbsoluteHtmlUrl, defaultValues } from "@/lib/api";
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
  it("starts with applied defaults, png format and height 60", () => {
    const { result } = renderHook(() => useGenerator(template));
    expect(result.current.values).toEqual(defaultValues(template));
    expect(result.current.format).toBe("png");
    expect(result.current.height).toBe(60);
    expect(result.current.dirty).toBe(false);
    expect(result.current.search).toContain("height=60");
    expect(result.current.previewUrl).toBe(result.current.linkUrl);
    expect(result.current.iframeUrl).toContain("/api/v1/generate/html?");
    expect(result.current.iframeUrl).toBe(
      buildAbsoluteHtmlUrl(result.current.search),
    );
  });

  it("marks parameter edits dirty but keeps the applied URL until apply", () => {
    const { result } = renderHook(() => useGenerator(template));
    const initialUrl = result.current.previewUrl;
    const initialIframeUrl = result.current.iframeUrl;

    act(() => result.current.setParam("left", "Hi"));

    expect(result.current.dirty).toBe(true);
    expect(result.current.previewUrl).toBe(initialUrl);
    expect(result.current.linkUrl).toBe(initialUrl);
    expect(result.current.iframeUrl).toBe(initialIframeUrl);

    act(() => result.current.apply());

    expect(result.current.dirty).toBe(false);
    expect(result.current.search).toContain("left=Hi");
    expect(result.current.previewUrl).toBe(result.current.linkUrl);
    expect(result.current.previewUrl).not.toBe(initialUrl);
    expect(result.current.iframeUrl).not.toBe(initialIframeUrl);
    expect(result.current.iframeUrl).toBe(
      buildAbsoluteHtmlUrl(result.current.search),
    );
  });

  it("applies height edits only after apply", () => {
    const { result } = renderHook(() => useGenerator(template));
    act(() => result.current.setHeight(140));
    expect(result.current.search).toContain("height=60");
    act(() => result.current.apply());
    expect(result.current.search).toContain("height=140");
    expect(result.current.dirty).toBe(false);
  });

  it("applies format edits and keeps preview equal to link", () => {
    const { result } = renderHook(() => useGenerator(template));
    act(() => result.current.setFormat("webp"));
    expect(result.current.dirty).toBe(true);
    act(() => result.current.apply());
    expect(result.current.search).toContain("format=webp");
    expect(result.current.previewUrl).toBe(result.current.linkUrl);
  });

  it("has an empty preview when no template is selected", () => {
    const { result } = renderHook(() => useGenerator(null));
    expect(result.current.previewUrl).toBe("");
    expect(result.current.linkUrl).toBe("");
    expect(result.current.iframeUrl).toBe("");
    expect(result.current.dirty).toBe(false);
  });
});
