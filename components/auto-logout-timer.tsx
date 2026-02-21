"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const IDLE_LIMIT_SECONDS = 10 * 60;

function formatTime(seconds: number) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function AutoLogoutTimer() {
  const [remaining, setRemaining] = useState(IDLE_LIMIT_SECONDS);
  const [paused, setPaused] = useState(false);
  const deadlineRef = useRef(Date.now() + IDLE_LIMIT_SECONDS * 1000);
  const loggingOutRef = useRef(false);

  function resetTimer() {
    deadlineRef.current = Date.now() + IDLE_LIMIT_SECONDS * 1000;
    setRemaining(IDLE_LIMIT_SECONDS);
  }

  useEffect(() => {
    const events: Array<keyof WindowEventMap> = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    const onActivity = () => {
      if (loggingOutRef.current) return;
      resetTimer();
    };

    for (const eventName of events) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }

    return () => {
      for (const eventName of events) {
        window.removeEventListener(eventName, onActivity);
      }
    };
  }, []);

  useEffect(() => {
    function isFormEditingTarget(target: EventTarget | null) {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tag = element.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (element.isContentEditable) return true;
      return false;
    }

    function onFocusIn(event: FocusEvent) {
      if (isFormEditingTarget(event.target)) {
        setPaused(true);
      }
    }

    function onFocusOut() {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName?.toLowerCase() ?? "";
      const stillEditing =
        tag === "input" || tag === "textarea" || tag === "select" || Boolean(active?.isContentEditable);
      setPaused(stillEditing);
    }

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (paused) return;
      const next = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemaining(next);

      if (next > 0 || loggingOutRef.current) return;
      loggingOutRef.current = true;
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } finally {
        window.location.href = "/login";
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [paused]);

  const danger = useMemo(() => remaining <= 60, [remaining]);

  return (
    <div
      className={`fixed bottom-3 left-3 z-50 rounded-lg border px-3 py-2 text-xs shadow-md ${
        danger ? "border-rose-300 bg-rose-50 text-rose-700" : "border-[var(--border)] bg-white text-slate-700"
      }`}
      title="Автовыход при бездействии через 10 минут"
    >
      {paused ? (
        <>
          Автовыход: <span className="font-semibold">Пауза</span>
        </>
      ) : (
        <>
          Автовыход: <span className="font-semibold">{formatTime(remaining)}</span>
        </>
      )}
    </div>
  );
}
