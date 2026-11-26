"use client";

import { useCallback, useEffect, useState } from "react";

import { GeneratorPanel } from "@/components/generator-panel";
import { TemplateList } from "@/components/template-list";
import { useGenerator } from "@/hooks/use-generator";
import { getTemplate, listTemplates } from "@/lib/api";
import type { TemplateMetadata } from "@/types/template";

function SelectedGenerator({ template }: { template: TemplateMetadata | null }) {
  const generator = useGenerator(template);
  return <GeneratorPanel template={template} generator={generator} />;
}

export default function Home() {
  const [templates, setTemplates] = useState<TemplateMetadata[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const ids = await listTemplates(signal);
      const result = await Promise.all(ids.map((id) => getTemplate(id, signal)));
      setTemplates(result);
      setSelectedId((current) =>
        result.some((item) => item.id === current) ? current : (result[0]?.id ?? null),
      );
    } catch (cause) {
      if ((cause as Error).name === "AbortError") return;
      setError((cause as Error).message || "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const selected = templates.find((item) => item.id === selectedId) ?? null;

  return (
    <main className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 items-start gap-6 px-4 py-10 sm:grid-cols-[22rem_1fr]">
      <TemplateList
        templates={templates}
        selectedId={selectedId}
        onSelect={setSelectedId}
        loading={loading}
        error={error}
        onRetry={() => void load()}
      />
      <SelectedGenerator key={selected?.id ?? "none"} template={selected} />
    </main>
  );
}
