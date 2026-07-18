"use client";
import { useState, useEffect, useRef } from "react";

export function showToast(message: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("qa:toast", { detail: message }));
  }
}

export default function Toast() {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    function onToast(e: Event) {
      const text = (e as CustomEvent<string>).detail;
      const id = ++counter.current;
      setItems(prev => [...prev, { id, text }]);
      setTimeout(() => setItems(prev => prev.filter(m => m.id !== id)), 2500);
    }
    window.addEventListener("qa:toast", onToast);
    return () => window.removeEventListener("qa:toast", onToast);
  }, []);

  if (!items.length) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] pointer-events-none flex flex-col-reverse gap-2 items-center">
      {items.map(({ id, text }) => (
        <div key={id}
             className="px-4 py-2.5 rounded-xl bg-stone-900 text-stone-100 text-[13px] shadow-xl whitespace-nowrap"
             style={{ fontFamily: "Courier New, monospace" }}>
          {text}
        </div>
      ))}
    </div>
  );
}
