"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function AutoRefresh({
  intervalSec = 10,
  enabledByDefault = true,
}: {
  intervalSec?: number;
  enabledByDefault?: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(enabledByDefault);
  const timerRef = useRef<number | undefined>(undefined);

  // start/stop interval when enabled toggles
  useEffect(() => {
    function tick() {
      router.refresh();
    }
    function stop() {
      if (timerRef.current !== undefined) {
        clearInterval(timerRef.current);
        timerRef.current = undefined;
      }
    }
    function start() {
      stop();
      timerRef.current = window.setInterval(tick, intervalSec * 1000);
    }

    if (enabled) start(); else stop();
    return () => stop();
  }, [enabled, intervalSec, router]);

  // pause when tab hidden; refresh immediately when visible again
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (timerRef.current) clearInterval(timerRef.current);
      } else if (enabled) {
        router.refresh();
        timerRef.current = window.setInterval(() => router.refresh(), intervalSec * 1000);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled, intervalSec, router]);

  return (
    <div style={{ display: "inline-flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
        />
        Auto-refresh every {intervalSec}s
      </label>
      <button onClick={() => router.refresh()}>Refresh now</button>
    </div>
  );
}
