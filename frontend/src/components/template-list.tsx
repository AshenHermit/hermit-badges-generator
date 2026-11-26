"use client";

import { Play } from "lucide-react";
import { motion } from "motion/react";
import { GlassPanel } from "@/components/glass-panel";
import { Button } from "@/components/ui/button";
import { buildThumbnailUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TemplateMetadata } from "@/types/template";

export interface TemplateListProps {
  templates: TemplateMetadata[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function TemplateList({
  templates,
  selectedId,
  onSelect,
  loading,
  error,
  onRetry,
}: TemplateListProps) {
  return (
    <GlassPanel className="flex w-full flex-col gap-4 p-5 sm:w-90">
      <header>
        <h2 className="text-base font-semibold">Templates</h2>
        <p className="text-xs text-neutral-400">Join in!</p>
      </header>

      {loading ? (
        <p role="status" className="text-sm text-neutral-400">
          Loading templates…
        </p>
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-red-300">{error}</p>
          <Button type="button" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : templates.length === 0 ? (
        <p className="text-sm text-neutral-400">No templates available</p>
      ) : (
        <div className="flex flex-col gap-3 overflow-y-auto pr-1">
          {templates.map((template, index) => {
            const selected = template.id === selectedId;
            return (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.04 }}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 p-3",
                  selected && "border-white/40 bg-white/10",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{template.id}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={buildThumbnailUrl(template.id, template)}
                    alt={`${template.id} preview`}
                    width={80}
                    height={40}
                    className="mt-2 h-10 w-20 rounded-md object-cover"
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  aria-label={`Use ${template.id}`}
                  aria-pressed={selected}
                  onClick={() => onSelect(template.id)}
                >
                  <Play className="size-4 fill-current" />
                </Button>
              </motion.div>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
}
