"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const BAR_W = 3;
const GAP = 3;

/**
 * Scrolling level meter: each frame pushes the current RMS level as a new bar on the right.
 * Idle state renders a calm row of dots. Colours are read from CSS tokens so it follows the theme.
 */
export function LiveWaveform({ analyser, className }: { analyser: AnalyserNode | null; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const styles = getComputedStyle(canvas);
    const active = styles.getPropertyValue("--primary").trim() || "#7c7cf0";
    const idle = styles.getPropertyValue("--muted-foreground").trim() || "#888";

    let raf = 0;
    let levels: number[] = [];
    const buf = analyser ? new Uint8Array(analyser.fftSize) : null;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const count = Math.floor(width / (BAR_W + GAP));
      ctx.clearRect(0, 0, width, height);

      if (analyser && buf) {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        // Perceptual boost so normal speech fills the meter.
        const rms = Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
        levels.push(rms);
        if (levels.length > count) levels = levels.slice(-count);
      }

      const mid = height / 2;
      for (let i = 0; i < count; i++) {
        const level = analyser ? (levels[i - (count - levels.length)] ?? 0) : 0;
        const h = Math.max(3, level * (height - 4));
        const x = i * (BAR_W + GAP);
        ctx.fillStyle = analyser ? active : idle;
        ctx.globalAlpha = analyser ? 0.35 + 0.65 * Math.min(1, level * 1.6) : 0.35;
        ctx.beginPath();
        ctx.roundRect(x, mid - h / 2, BAR_W, h, 1.5);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (analyser) raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [analyser]);

  return <canvas ref={canvasRef} aria-hidden="true" className={cn("h-16 w-full", className)} />;
}
