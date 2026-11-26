import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { TemplateMetadata } from "@/types/template";
import { TemplateList } from "@/components/template-list";

const templates: TemplateMetadata[] = [
  {
    id: "hermit-frame",
    parameters: [
      { name: "left", placeholder: "LEFT", type: "string", required: true },
      { name: "right", placeholder: "RIGHT", type: "string", required: true },
    ],
  },
  { id: "simple-badge", parameters: [] },
];

const noop = () => {};

beforeEach(() => {
  vi.restoreAllMocks();
});

test("renders the header and one row per template", () => {
  render(
    <TemplateList
      templates={templates}
      selectedId={null}
      onSelect={noop}
      loading={false}
      error={null}
      onRetry={noop}
    />,
  );

  expect(screen.getByText("Templates")).toBeInTheDocument();
  expect(screen.getByText("Join in!")).toBeInTheDocument();
  expect(screen.getByText("hermit-frame")).toBeInTheDocument();
  expect(screen.getByText("simple-badge")).toBeInTheDocument();
});

test("uses a small png thumbnail for every row", () => {
  render(
    <TemplateList
      templates={templates}
      selectedId={null}
      onSelect={noop}
      loading={false}
      error={null}
      onRetry={noop}
    />,
  );

  const images = screen.getAllByRole("img");
  expect(images).toHaveLength(2);
  for (const image of images) {
    expect(image).toHaveAttribute("src", expect.stringContaining("height=40"));
    expect(image).toHaveAttribute("src", expect.stringContaining("format=png"));
  }
});

test("selects a template and exposes the selected state", () => {
  const onSelect = vi.fn();
  render(
    <TemplateList
      templates={templates}
      selectedId="hermit-frame"
      onSelect={onSelect}
      loading={false}
      error={null}
      onRetry={noop}
    />,
  );

  const buttons = screen.getAllByRole("button");
  expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(buttons[1]);
  expect(onSelect).toHaveBeenCalledWith("simple-badge");
});

test("shows a loading indication instead of rows while loading", () => {
  render(
    <TemplateList
      templates={templates}
      selectedId={null}
      onSelect={noop}
      loading={true}
      error={null}
      onRetry={noop}
    />,
  );

  expect(screen.getByText(/loading/i)).toBeInTheDocument();
  expect(screen.queryByText("hermit-frame")).not.toBeInTheDocument();
});

test("shows the error message and retries", () => {
  const onRetry = vi.fn();
  render(
    <TemplateList
      templates={[]}
      selectedId={null}
      onSelect={noop}
      loading={false}
      error="API is down"
      onRetry={onRetry}
    />,
  );

  expect(screen.getByText("API is down")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /retry/i }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test("renders an empty state when there are no templates", () => {
  render(
    <TemplateList
      templates={[]}
      selectedId={null}
      onSelect={noop}
      loading={false}
      error={null}
      onRetry={noop}
    />,
  );

  expect(screen.getByText(/no templates/i)).toBeInTheDocument();
});
