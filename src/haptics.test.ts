import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detentHaptic, stopHaptics, testVibration } from "./haptics";
let calls: { at: number; pattern: VibratePattern }[];
let vibrate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  calls = [];
  vibrate = vi.fn((pattern: VibratePattern) => {
    calls.push({ at: performance.now(), pattern });
    return true;
  });
  vi.stubGlobal("navigator", {
    vibrate,
    userActivation: { hasBeenActive: true },
  });
  vi.stubGlobal("document", { hidden: false });
  stopHaptics();
  vibrate.mockClear();
  calls = [];
});
afterEach(() => {
  stopHaptics();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("段階ごとの振動", () => {
  it("高速に5段階を通っても25msの振動を中断せず間隔を空けて送る", () => {
    detentHaptic();
    detentHaptic();
    detentHaptic();
    detentHaptic();
    detentHaptic();
    expect(vibrate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
    expect(calls).toEqual(
      [0, 55, 110, 165, 220].map((at) => ({ at, pattern: 25 })),
    );
  });
  it("飛び越えた段階の振動を送り、方向転換を繰り返してもキューを制限する", () => {
    detentHaptic(4);
    vi.advanceTimersByTime(300);
    expect(vibrate.mock.calls.map((c) => c[0])).toEqual([25, 25, 25, 25]);
    vibrate.mockClear();
    for (let i = 0; i < 100; i++) detentHaptic(4);
    vi.advanceTimersByTime(1000);
    expect(vibrate.mock.calls.length).toBeLessThanOrEqual(6);
  });
  it("キャンセルで保留分を破棄し、現在の振動も停止する", () => {
    detentHaptic(4);
    vi.advanceTimersByTime(10);
    stopHaptics();
    vi.advanceTimersByTime(500);
    expect(vibrate.mock.calls.map((c) => c[0])).toEqual([25, 0]);
  });
  it("非表示と未操作のページでは送らない", () => {
    vi.stubGlobal("document", { hidden: true });
    detentHaptic(4);
    expect(testVibration()).toBe("hidden");
    vi.stubGlobal("document", { hidden: false });
    vi.stubGlobal("navigator", {
      vibrate,
      userActivation: { hasBeenActive: false },
    });
    detentHaptic(4);
    expect(testVibration()).toBe("inactive");
    vi.advanceTimersByTime(500);
    expect(vibrate).not.toHaveBeenCalled();
  });
  it("非対応・拒否・例外を区別し、拒否されたキューを繰り返し再生しない", () => {
    vi.stubGlobal("navigator", {});
    expect(testVibration()).toBe("unsupported");
    vi.stubGlobal("navigator", { vibrate });
    vibrate.mockReturnValue(false);
    expect(testVibration()).toBe("rejected");
    vibrate.mockClear();
    detentHaptic(4);
    vi.advanceTimersByTime(500);
    expect(vibrate).toHaveBeenCalledTimes(1);
    vibrate.mockImplementation(() => {
      throw new Error("denied");
    });
    expect(testVibration()).toBe("rejected");
  });
  it("テストの明確な2パルスを送り、受付と物理的な振動を混同しない", () => {
    expect(testVibration()).toBe("requested");
    expect(vibrate).toHaveBeenCalledWith([60, 70, 60]);
  });
});
