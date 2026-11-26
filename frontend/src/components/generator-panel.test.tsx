import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { GeneratorPanel } from "@/components/generator-panel";
import { useGenerator } from "@/hooks/use-generator";
import { listTemplates } from "@/lib/api";
import type { TemplateMetadata } from "@/types/template";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, listTemplates: vi.fn(actual.listTemplates) };
});

const template: TemplateMetadata = {
  id: "hermit-frame",
  parameters: [
    { name: "left", placeholder: "LEFT", type: "string", required: true, maxLength: 32 },
    { name: "right", placeholder: "RIGHT", type: "string", required: true },
    { name: "borderColor", placeholder: "#29272D", type: "color", required: false, default: "#29272D" },
  ],
};

function Harness({ current = template }: { current?: TemplateMetadata }) {
  const generator = useGenerator(current);
  return <GeneratorPanel template={current} generator={generator} />;
}

describe("GeneratorPanel", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("renders format, height and one control per parameter", () => {
    render(<Harness />);
    expect(screen.getByLabelText("format")).toBeInTheDocument();
    expect(screen.getByLabelText("height")).toHaveValue(60);
    for (const parameter of template.parameters) {
      expect(screen.getByLabelText(parameter.name)).toBeInTheDocument();
    }
  });

  test("Apply glows after an edit and only then updates the preview URL", () => {
    render(<Harness />);
    const apply = screen.getByRole("button", { name: "Apply" });
    const preview = screen.getByAltText("Badge preview");
    expect(apply).toHaveAttribute("data-dirty", "false");

    fireEvent.change(screen.getByLabelText("height"), { target: { value: "140" } });
    expect(apply).toHaveAttribute("data-dirty", "true");
    expect(apply.className).toContain("ring-");
    expect(preview).toHaveAttribute("src", expect.stringContaining("height=60"));

    fireEvent.click(apply);
    expect(apply).toHaveAttribute("data-dirty", "false");
    expect(preview).toHaveAttribute("src", expect.stringContaining("height=140"));
  });

  test("after Apply, preview src and link value stay identical", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("left"), { target: { value: "Hi There" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    const preview = screen.getByAltText("Badge preview");
    const link = screen.getByLabelText("Generated link");
    expect(link).toHaveValue(preview.getAttribute("src"));
    expect(preview.getAttribute("src")).toContain("left=Hi+There");
  });

  test("Copy writes the generated link to the clipboard", () => {
    render(<Harness />);
    const link = screen.getByLabelText("Generated link");
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith((link as HTMLInputElement).value);
  });
});

test("page shows the error and a Retry button when metadata loading fails", async () => {
  vi.mocked(listTemplates).mockRejectedValueOnce(new Error("service offline"));
  const { default: Home } = await import("@/app/page");
  render(<Home />);
  expect(await screen.findByText(/service offline/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  expect(screen.getByText("Templates")).toBeInTheDocument();
  await waitFor(() => expect(vi.mocked(listTemplates).mock.calls.length).toBeGreaterThan(0));
});
