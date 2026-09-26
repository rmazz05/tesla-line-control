"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/** FLIP keeps each incident recognizable as it moves through the live queue.
 * Clock ticks only refresh measurements; only arrivals or movement animate. */
export function usePriorityMotion(enabled: boolean) {
  const list = useRef<HTMLDivElement>(null);
  const previous = useRef<Map<string, number> | null>(null);
  const animations = useRef(new Map<string, Animation>());

  useEffect(() => {
    const active = animations.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cancel = () => { active.forEach(animation => animation.cancel()); active.clear(); };
    const changed = () => { if (preference.matches) cancel(); };
    preference.addEventListener("change", changed);
    return () => { preference.removeEventListener("change", changed); cancel(); };
  }, []);

  useLayoutEffect(() => {
    const root = list.current;
    if (!enabled || !root) { previous.current = null; return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-motion-id]"));
    // Batch all layout/style reads before animation writes. offsetTop is relative
    // to the list, so scrolling the phone doesn't trigger false reorder motion.
    const measurements = elements.map(element => {
      const transform = animations.current.has(element.dataset.motionId!) ? getComputedStyle(element).transform : "none";
      return { element, id: element.dataset.motionId!, top: element.offsetTop,
        translation: transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42 };
    });
    const current = new Map(measurements.map(item => [item.id, item.top]));
    for (const [id, animation] of animations.current) {
      if (!current.has(id) || reduced) { animation.cancel(); animations.current.delete(id); }
    }
    if (!reduced && previous.current) {
      for (const { element, id, top, translation } of measurements) {
        const oldTop = previous.current.get(id);
        if (oldTop !== undefined && Math.abs(oldTop - top) < 1) continue;
        animations.current.get(id)?.cancel();
        const arrival = oldTop === undefined;
        const animation = element.animate([
          { transform: `translateY(${arrival ? 10 : oldTop + translation - top}px)`, opacity: arrival ? 0 : 1 },
          { transform: "translateY(0)", opacity: 1 },
        ], { duration: arrival ? 240 : 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
        animations.current.set(id, animation);
        animation.onfinish = () => { if (animations.current.get(id) === animation) animations.current.delete(id); };
      }
    }
    previous.current = current;
  });

  return list;
}
