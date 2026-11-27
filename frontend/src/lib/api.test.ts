import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAbsoluteGenerateUrl,
  buildGenerateSearch,
  buildThumbnailUrl,
  defaultValues,
  getTemplate,
  listTemplates,
} from "@/lib/api";
import type { TemplateMetadata } from "@/types/template";

const selectMeta: TemplateMetadata = {
  id: "select-badge",
  parameters: [
    {
      name: "theme",
      placeholder: "THEME",
      type: "select",
      required: true,
      options: [
        { value: "dark", label: "Тёмная" },
        { value: "light", label: "Светлая" },
      ],
    },
    {
      name: "density",
      placeholder: "DENSITY",
      type: "select",
      required: false,
      default: "compact",
      options: [
        { value: "compact", label: "Компактно" },
        { value: "roomy", label: "Свободно" },
      ],
    },
  ],
};

const meta: TemplateMetadata = {
  id: "hermit-frame",
  parameters: [
    {
      name: "left",
      placeholder: "LEFT",
      type: "string",
      required: true,
      maxLength: 32,
    },
    { name: "right", placeholder: "RIGHT", type: "string", required: true },
    {
      name: "borderColor",
      placeholder: "rgb(41,39,45)",
      type: "color",
      required: false,
      default: "rgb(41,39,45)",
    },
  ],
};

describe("buildGenerateSearch", () => {
  it("sorts keys alphabetically and URL-encodes values", () => {
    const search = buildGenerateSearch({
      template: "hermit-frame",
      format: "webp",
      height: 60,
      values: { left: "Hello World", right: "A&B" },
    });

    expect(search).toContain("left=Hello+World");
    expect(search).toContain("right=A%26B");
    expect([...new URLSearchParams(search).keys()]).toEqual([
      "format",
      "height",
      "left",
      "right",
      "template",
    ]);
  });

  it("clamps height to 1..1000", () => {
    const low = new URLSearchParams(
      buildGenerateSearch({
        template: "hermit-frame",
        format: "png",
        height: -5,
        values: {},
      }),
    );
    const high = new URLSearchParams(
      buildGenerateSearch({
        template: "hermit-frame",
        format: "png",
        height: 5000,
        values: {},
      }),
    );

    expect(low.get("height")).toBe("1");
    expect(high.get("height")).toBe("1000");
  });
});

describe("buildAbsoluteGenerateUrl", () => {
  it("uses the default API base from the environment", () => {
    expect(buildAbsoluteGenerateUrl("height=60")).toBe(
      "http://localhost:3000/api/v1/generate?height=60",
    );
  });
});

describe("buildThumbnailUrl", () => {
  it("uses a small height and sample text", () => {
    const search = new URLSearchParams(
      buildThumbnailUrl("hermit-frame", meta).split("?")[1],
    );

    expect(search.get("height")).toBe("40");
    expect(search.get("format")).toBe("png");
    expect(search.get("left")).toBe("Hawoo");
    expect(search.get("right")).toBe("Wovd");
  });
});

describe("defaultValues", () => {
  it("uses manifest defaults and sample text for required params", () => {
    expect(defaultValues(meta)).toEqual({
      left: "Hawoo",
      right: "Wovd",
      borderColor: "rgb(41,39,45)",
    });
  });

  it("uses the first option for required selects and the default for optional ones", () => {
    expect(defaultValues(selectMeta)).toEqual({
      theme: "dark",
      density: "compact",
    });
  });
});

describe("template API", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(["hermit-frame"]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("lists templates from the relative API path", async () => {
    await expect(listTemplates()).resolves.toEqual(["hermit-frame"]);
    expect(fetch).toHaveBeenCalledWith("/api/v1/templates", {
      signal: undefined,
    });
  });

  it("fetches one template with an encoded id", async () => {
    await getTemplate("a b/c");
    expect(fetch).toHaveBeenCalledWith("/api/v1/templates/a%20b%2Fc", {
      signal: undefined,
    });
  });
});
