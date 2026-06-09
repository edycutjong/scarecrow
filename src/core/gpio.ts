/**
 * PIR (passive infrared) motion-sensor wake source.
 *
 * On a real Raspberry Pi this reads a GPIO pin via libgpiod/sysfs; in dev (or on
 * any host without GPIO) it transparently falls back to a simulated motion
 * source so the sentry loop and tests run everywhere. The power-aware design is
 * "sleep until motion, then wake → capture → infer → sleep" rather than polling
 * the camera on a fixed interval — this is what makes solar/battery operation
 * viable.
 */

export interface PIROptions {
  /** BCM pin the PIR's OUT line is wired to (default 17). */
  pin?: number;
  /** Force the simulated source even if GPIO would be available. */
  simulate?: boolean;
  /** Mean interval (ms) between simulated motion events. */
  simulateIntervalMs?: number;
}

export type MotionHandler = () => void;

/** True when running on hardware that exposes GPIO (best-effort detection). */
export function gpioAvailable(): boolean {
  if (process.env.SCARECROW_SIMULATE_PIR === "1") return false;
  return process.platform === "linux" && process.arch.startsWith("arm");
}

/**
 * Watch for PIR motion. Returns an unsubscribe function that stops the watch
 * and releases any timer/handle. The handler fires once per detected motion.
 */
export function watchPIR(onMotion: MotionHandler, opts: PIROptions = {}): () => void {
  const useSim = opts.simulate || !gpioAvailable();

  if (useSim) {
    const interval = opts.simulateIntervalMs ?? 8000;
    console.log(`[gpio] PIR simulated (no GPIO) — motion every ~${interval}ms`);
    const timer = setInterval(() => {
      try {
        onMotion();
      } catch (err) {
        console.warn("[gpio] PIR handler threw:", err);
      }
    }, interval);
    return () => clearInterval(timer);
  }

  // On real hardware we lazily require the GPIO binding so dev/CI never needs it.
  /* v8 ignore start */
  const pin = opts.pin ?? 17;
  console.log(`[gpio] Watching PIR on BCM pin ${pin}...`);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Gpio } = require("onoff");
    const sensor = new Gpio(pin, "in", "rising");
    sensor.watch((err: unknown) => {
      if (err) {
        console.warn("[gpio] PIR watch error:", err);
        return;
      }
      onMotion();
    });
    return () => {
      sensor.unwatchAll();
      sensor.unexport();
    };
  } catch (err) {
    console.warn("[gpio] GPIO binding unavailable, falling back to simulation:", err);
    return watchPIR(onMotion, { ...opts, simulate: true });
  }
  /* v8 ignore stop */
}
