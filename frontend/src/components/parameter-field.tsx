"use client";

import { ColorPicker } from "@/components/reui/color-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TemplateParameter } from "@/types/template";

export interface ParameterFieldProps {
  parameter: TemplateParameter;
  value: string;
  onChange: (value: string) => void;
}

export function ParameterField({ parameter, value, onChange }: ParameterFieldProps) {
  const labelId = `label-${parameter.name}`;
  const inputId = `param-${parameter.name}`;

  return (
    <div className="space-y-2">
      <Label id={labelId} htmlFor={parameter.type === "color" ? undefined : inputId}>
        {parameter.name}
      </Label>
      {parameter.type === "select" ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={inputId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(parameter.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : parameter.type === "color" ? (
        <ColorPicker
          format="hex"
          value={value || null}
          onValueChange={(next) => onChange(next ?? "")}
          aria-labelledby={labelId}
          placeholder={parameter.placeholder}
        />
      ) : (
        <Input
          id={inputId}
          type={parameter.type === "integer" ? "number" : "text"}
          value={value}
          maxLength={parameter.maxLength}
          placeholder={parameter.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {parameter.description ? (
        <p className="text-xs text-muted-foreground">{parameter.description}</p>
      ) : null}
    </div>
  );
}
