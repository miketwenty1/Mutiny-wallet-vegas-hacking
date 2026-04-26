import confetti from "canvas-confetti";

function burst(opts: Parameters<typeof confetti>[0]): void {
  void confetti({ ticks: 220, gravity: 1.05, decay: 0.92, scalar: 1.05, ...opts });
}

/**
 * Call only after a successful broadcast.
 * Light sparks — main send visuals are DOM (unicorn + nukes).
 */
export function fxSendFunds(): void {
  burst({
    particleCount: 26,
    spread: 360,
    origin: { x: 0.5, y: 0.55 },
    ticks: 90,
    scalar: 0.85,
    colors: ["#ff4500", "#ffd700", "#ffffff", "#00ffaa"],
  });
}

/**
 * Call only when a scan shows balance increased (incoming funds).
 * Cannon → impact → rain on the “stage”.
 */
export function fxReceiveFunds(): void {
  void confetti({
    particleCount: 95,
    angle: 42,
    spread: 38,
    startVelocity: 58,
    origin: { x: 0.04, y: 0.98 },
    colors: ["#ff00aa", "#00f5ff", "#ffd700", "#ff3355", "#7cff00", "#ffffff"],
  });
  window.setTimeout(() => {
    void confetti({
      particleCount: 120,
      angle: 62,
      spread: 52,
      origin: { x: 0.28, y: 0.88 },
      scalar: 1.08,
      colors: ["#ff69b4", "#dda0dd", "#fff", "#00ffff"],
    });
  }, 160);
  window.setTimeout(() => {
    void confetti({
      particleCount: 160,
      spread: 140,
      origin: { x: 0.58, y: 0.28 },
      ticks: 280,
      gravity: 1.05,
      decay: 0.9,
      shapes: ["circle", "square"],
      colors: ["#ff1493", "#ffd700", "#7fff00", "#fff"],
    });
  }, 420);
  window.setTimeout(() => {
    const end = Date.now() + 1400;
    const frame = () => {
      void confetti({
        particleCount: 5,
        angle: 90,
        spread: 180,
        startVelocity: 12,
        origin: { x: Math.random(), y: 0.02 },
        colors: ["#ffd700", "#ff69b4", "#e0e0e0", "#00ffcc"],
        scalar: 0.75,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, 650);
}
