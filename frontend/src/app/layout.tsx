import { AnimateUIProvider } from "@animate-ui/react/provider";
import type { Metadata } from "next";
import { ParallaxBackground } from "@/components/parallax-background";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hermit Badges",
  description: "Generate framed badges from templates",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <ParallaxBackground />
        <AnimateUIProvider>{children}</AnimateUIProvider>
      </body>
    </html>
  );
}
