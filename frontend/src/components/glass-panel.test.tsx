import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { GlassPanel } from "@/components/glass-panel";

test("renders children inside a glass surface", () => {
  const { container } = render(
    <GlassPanel className="custom-class">
      <p>panel content</p>
    </GlassPanel>,
  );

  const panel = container.querySelector("section");
  expect(panel).toHaveClass("glass-panel", "custom-class");
  expect(screen.getByText("panel content")).toBeInTheDocument();
});
