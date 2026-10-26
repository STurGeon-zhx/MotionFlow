"use client";
import { useEffect, useState } from "react";
// Only the current device's rendering state is returned; no other user's jobs are exposed.
export function useRenderBusy() {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/runtime-config", {
          cache: "no-store",
        });
        const body = await response.json();
        if (active && response.ok) setBusy(Boolean(body.rendering));
      } catch {
        /* Keep the last known state during a transient network failure. */
      }
    };
    void load();
    const timer = setInterval(() => void load(), 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return busy;
}
