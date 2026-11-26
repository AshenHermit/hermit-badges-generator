import { cn } from "@/lib/utils";

interface GlassPanelProps {
  className?: string;
  children: React.ReactNode;
}

export function GlassPanel({ className, children }: GlassPanelProps) {
  return <section className={cn("glass-panel", className)}>{children}</section>;
}
