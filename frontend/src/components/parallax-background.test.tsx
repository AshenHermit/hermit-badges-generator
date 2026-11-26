import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { ParallaxBackground } from "@/components/parallax-background";

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn(() => ({
      matches,
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  Object.defineProperty(window, "requestAnimationFrame", {
    writable: true,
    configurable: true,
    value: vi.fn(() => 1),
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    writable: true,
    configurable: true,
    value: vi.fn(),
  });
});

test("does not listen to pointer movement when reduced motion is preferred", () => {
  mockMatchMedia(true);
  const addSpy = vi.spyOn(window, "addEventListener");

  render(<ParallaxBackground />);

  expect(addSpy).not.toHaveBeenCalledWith("pointermove", expect.any(Function));
});

test("registers and cleans up pointer movement otherwise", () => {
  mockMatchMedia(false);
  const addSpy = vi.spyOn(window, "addEventListener");
  const removeSpy = vi.spyOn(window, "removeEventListener");

  const { container, unmount } = render(<ParallaxBackground />);

  expect(addSpy).toHaveBeenCalledWith("pointermove", expect.any(Function));
  expect(container.querySelector("[style*='bg_1.jpg']")).toBeInTheDocument();

  unmount();
  expect(removeSpy).toHaveBeenCalledWith("pointermove", expect.any(Function));
  expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
});
