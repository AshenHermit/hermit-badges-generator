import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ParameterField } from "@/components/parameter-field";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("ParameterField", () => {
  it("renders select options and reports the chosen value", async () => {
    const onChange = vi.fn();

    render(
      <ParameterField
        parameter={{
          name: "theme",
          placeholder: "THEME",
          type: "select",
          required: true,
          options: [
            { value: "dark", label: "Тёмная" },
            { value: "light", label: "Светлая" },
          ],
        }}
        value="dark"
        onChange={onChange}
      />
    );

    const trigger = screen.getByLabelText("theme");
    expect(trigger).toBeInTheDocument();
    expect(screen.getByText("Тёмная")).toBeVisible();

    fireEvent.keyDown(trigger, { key: "Enter" });
    const option = await screen.findByRole("option", { name: "Светлая" });
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledWith("light");
  });
});
