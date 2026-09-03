import type { MessageEffect } from "./widget";

/** Параметры появления новой строки чата. */
export function getMessageMotion(effect: MessageEffect, duration: number, delay = 0) {
  const transition = {
    duration: effect === "none" ? 0 : duration,
    delay,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  };

  switch (effect) {
    case "fade":
      return { initial: { opacity: 0 }, animate: { opacity: 1 }, transition };
    case "slide-up":
      return { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition };
    case "slide-left":
      return { initial: { opacity: 0, x: 42 }, animate: { opacity: 1, x: 0 }, transition };
    case "scale":
      return { initial: { opacity: 0, scale: 0.86 }, animate: { opacity: 1, scale: 1 }, transition };
    case "pop":
      return {
        initial: { opacity: 0, scale: 0.72, rotate: -1.5 },
        animate: { opacity: 1, scale: [0.72, 1.04, 1], rotate: 0 },
        transition,
      };
    case "bounce":
      return {
        initial: { opacity: 0, y: 30, scale: 0.94 },
        animate: { opacity: [0, 1, 1], y: [30, -5, 0], scale: [0.94, 1.02, 1] },
        transition,
      };
    default:
      return { initial: false as const, animate: {}, transition };
  }
}