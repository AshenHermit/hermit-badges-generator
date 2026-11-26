/* eslint-disable @next/next/no-img-element */
"use client";

import { Copy } from "lucide-react";

import type { GeneratorApi } from "@/hooks/use-generator";
import type { TemplateMetadata } from "@/types/template";
import { Button } from "@/components/ui/button";
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

export function GeneratorPanel({ template, generator }: GeneratorPanelProps) {
  async function copyLink() {
    if (!generator.linkUrl) return;
    await navigator.clipboard.writeText(generator.linkUrl);
  }

  return (
    <GlassPanel className="min-w-0 flex-1 p-5 sm:p-7">
      <h1 className="text-center text-lg font-medium tracking-wide">
        {template?.id ?? "No template selected"}
      </h1>

      <div className="mt-6 flex min-h-40 items-center justify-center rounded-xl border border-white/10 bg-black/20 p-4">
        {generator.previewUrl ? (
          <img
            src={generator.previewUrl}
            alt="Badge preview"
            className="max-h-48 w-auto max-w-full object-contain"
          />
        ) : (
          <p className="text-sm text-muted-foreground">Select a template to see a preview</p>
        )}
      </div>

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
        <Button type="button" onClick={() => void copyLink()} aria-label="Copy">
          <Copy className="size-4" />
          Copy
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
