import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { gpioAvailable, watchPIR } from "../gpio.js";

describe("gpio.ts", () => {
  const originalPlatform = process.platform;
  const originalArch = process.arch;

  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    Object.defineProperty(process, "arch", { value: originalArch });
    delete process.env.SCARECROW_SIMULATE_PIR;
    logSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("returns true on arm linux without simulate env", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    Object.defineProperty(process, "arch", { value: "arm64" });
    expect(gpioAvailable()).toBe(true);
  });

  it("returns false if SCARECROW_SIMULATE_PIR is set", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    Object.defineProperty(process, "arch", { value: "arm64" });
    process.env.SCARECROW_SIMULATE_PIR = "1";
    expect(gpioAvailable()).toBe(false);
  });

  it("watchPIR returns a stop function for simulated mode", async () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    const stop = watchPIR(handler, { simulate: true, simulateIntervalMs: 100 });
    
    vi.advanceTimersByTime(150);
    expect(handler).toHaveBeenCalled();

    // test throw doesn't crash
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    handler.mockImplementation(() => { throw new Error("mock error"); });
    vi.advanceTimersByTime(100);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("PIR handler threw"), expect.any(Error));
    consoleWarnSpy.mockRestore();
    
    stop();
    vi.useRealTimers();
  });

  it("watchPIR works with default options", () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    const stop = watchPIR(handler);
    vi.advanceTimersByTime(8100);
    expect(handler).toHaveBeenCalled();
    stop();
    vi.useRealTimers();
  });

  it("watchPIR falls back to simulation when GPIO module is missing on arm", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    Object.defineProperty(process, "arch", { value: "arm64" });
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stop = watchPIR(vi.fn());
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("GPIO binding unavailable"), expect.any(Error));
    stop();
    consoleWarnSpy.mockRestore();
  });
});
