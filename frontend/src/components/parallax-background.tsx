"use client";

import { useEffect, useRef } from "react";

const LERP_FACTOR = 0.08;
const SHIFT_PX = 14;

export function ParallaxBackground() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let frame = 0;

    const onPointerMove = (event: PointerEvent) => {
      target.x = (event.clientX / window.innerWidth) * 2 - 1;
      target.y = (event.clientY / window.innerHeight) * 2 - 1;
    };

    const tick = () => {
      current.x += (target.x - current.x) * LERP_FACTOR;
      current.y += (target.y - current.y) * LERP_FACTOR;

      if (layerRef.current) {
        layerRef.current.style.transform = `translate3d(${current.x * SHIFT_PX}px, ${current.y * SHIFT_PX}px, 0)`;
      }

      frame = window.requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onPointerMove);
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-neutral-950"
    >
      <div
        ref={layerRef}
        className="absolute -inset-[8%] scale-[1.08] bg-cover bg-center"
        style={{ backgroundImage: "url(/bg/bg_1.jpg)" }}
      />
    </div>
  );
}
