/* eslint-disable @next/next/no-img-element */
"use client";

import { CopyButton, CopyButtonIcon } from "@animate-ui/react/primitives/buttons/copy";
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsHighlight,
  TabsHighlightItem,
  TabsList,
  TabsTrigger,
} from "@animate-ui/react/primitives/tabs";
import { Check, Copy } from "lucide-react";

import type { GeneratorApi } from "@/hooks/use-generator";
import type { TemplateMetadata } from "@/types/template";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GlassPanel } from "@/components/glass-panel";
import { ParameterField } from "@/components/parameter-field";

export interface GeneratorPanelProps {
  template: TemplateMetadata | null;
  generator: GeneratorApi;
}

const TAB_TRIGGER_CLASS =
  "data-[state=active]:text-foreground text-muted-foreground inline-flex h-[calc(100%-1px)] w-full flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium whitespace-nowrap transition-colors duration-500 ease-in-out focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-ring focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export function GeneratorPanel({ template, generator }: GeneratorPanelProps) {
  return (
    <GlassPanel className="min-w-0 flex-1 p-5 sm:p-7">
      <h1 className="text-center text-lg font-medium tracking-wide">
        {template?.id ?? "No template selected"}
      </h1>

      <Tabs defaultValue="render" className="mt-6 flex w-full flex-col gap-2">
        <TabsHighlight className="absolute z-0 inset-0 rounded-md border border-transparent bg-background shadow-sm dark:border-input dark:bg-input/30">
          <TabsList className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]">
            <TabsHighlightItem value="render" className="flex-1">
              <TabsTrigger value="render" className={TAB_TRIGGER_CLASS}>
                Render
              </TabsTrigger>
            </TabsHighlightItem>
            <TabsHighlightItem value="iframe" className="flex-1">
              <TabsTrigger value="iframe" className={TAB_TRIGGER_CLASS}>
                IFrame
              </TabsTrigger>
            </TabsHighlightItem>
          </TabsList>
        </TabsHighlight>

        <div className="flex min-h-48 w-full items-center justify-center rounded-xl border border-white/10 bg-black/20 p-4">
          <TabsContents className="w-full">
            <TabsContent
              value="render"
              className="outline-none flex min-h-48 w-full items-center justify-center"
            >
              {generator.previewUrl ? (
                <img
                  src={generator.previewUrl}
                  alt="Badge preview"
                  className="max-h-48 w-auto max-w-full object-contain"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a template to see a preview
                </p>
              )}
            </TabsContent>

            <TabsContent
              value="iframe"
              className="outline-none flex min-h-48 w-full items-center justify-center"
            >
              {generator.iframeUrl ? (
                <iframe
                  title="Badge HTML preview"
                  src={generator.iframeUrl}
                  className="min-h-48 w-full"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a template to see a preview
                </p>
              )}
            </TabsContent>
          </TabsContents>
        </div>
      </Tabs>

      <div className="mt-5 flex gap-2">
        <Label htmlFor="generated-link" className="sr-only">
          Generated link
        </Label>
        <Input
          id="generated-link"
          aria-label="Generated link"
          readOnly
          value={generator.linkUrl}
          className="min-w-0 flex-1 font-mono text-xs"
        />
        <CopyButton
          type="button"
          content={generator.linkUrl}
          aria-label="Copy"
          className={buttonVariants()}
        >
          <CopyButtonIcon
            icon={<Copy className="size-4" />}
            copiedIcon={<Check className="size-4" />}
          />
        </CopyButton>
        <Button
          type="button"
          onClick={generator.apply}
          aria-label="Apply"
          data-dirty={generator.dirty}
          className={
            generator.dirty
              ? "ring-2 ring-fuchsia-400/70 shadow-[0_0_18px_rgba(232,121,249,0.65)]"
              : "opacity-60"
          }
        >
          <Check className="size-4" />
          Apply
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="format">format</Label>
          <Select
            value={generator.format}
            onValueChange={(value) => generator.setFormat(value as "png" | "webp")}
          >
            <SelectTrigger id="format" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="png">png</SelectItem>
              <SelectItem value="webp">webp</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="height">height</Label>
          <Input
            id="height"
            type="number"
            min={1}
            max={1000}
            value={generator.height}
            onChange={(event) => generator.setHeight(Number(event.target.value))}
          />
        </div>
      </div>

      {template ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {template.parameters.map((parameter) => (
            <ParameterField
              key={parameter.name}
              parameter={parameter}
              value={generator.values[parameter.name] ?? ""}
              onChange={(value) => generator.setParam(parameter.name, value)}
            />
          ))}
        </div>
      ) : null}
    </GlassPanel>
  );
}
