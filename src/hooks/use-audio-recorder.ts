"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "requesting" | "recording" | "stopped" | "denied" | "unsupported" | "error";

export interface RecordedAudio {
  blob: Blob;
  url: string;
  mimeType: string;
  durationMs: number;
}

const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
// Prisma REST accepts clips up to 30 s (docs.gnani.ai). Longer reports need the streaming API.
export const MAX_RECORDING_MS = 30_000;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * Microphone capture with a live AnalyserNode for waveform rendering.
 * Audio stays in the browser until the caller uploads it.
 */
export function useAudioRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audio, setAudio] = useState<RecordedAudio | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);

  const teardown = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setAnalyser(null);
  }, []);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("unsupported");
      return;
    }
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      const node = ctx.createAnalyser();
      node.fftSize = 1024;
      node.smoothingTimeConstant = 0.6;
      ctx.createMediaStreamSource(stream).connect(node);
      ctxRef.current = ctx;
      setAnalyser(node);

      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const durationMs = performance.now() - startedAtRef.current;
        const type = rec.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setAudio({ blob, url, mimeType: type, durationMs });
        setElapsedMs(durationMs);
        setStatus("stopped");
        teardown();
      };

      startedAtRef.current = performance.now();
      setElapsedMs(0);
      rec.start(250);
      setStatus("recording");
      timerRef.current = window.setInterval(() => {
        const ms = performance.now() - startedAtRef.current;
        setElapsedMs(ms);
        if (ms >= MAX_RECORDING_MS) stop();
      }, 100);
    } catch (e) {
      teardown();
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setStatus(denied ? "denied" : "error");
      setError(denied ? "Microphone permission was denied." : e instanceof Error ? e.message : "Could not start recording.");
    }
  }, [stop, teardown]);

  const reset = useCallback(() => {
    stop();
    teardown();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setAudio(null);
    setElapsedMs(0);
    setError(null);
    setStatus("idle");
  }, [stop, teardown]);

  useEffect(
    () => () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      teardown();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [teardown],
  );

  return { status, elapsedMs, audio, analyser, error, start, stop, reset };
}
