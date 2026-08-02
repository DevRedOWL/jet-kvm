import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import { AnimatePresence, motion } from "framer-motion";
import { LuMousePointer2 } from "react-icons/lu";
import { PiMouseLeftClickFill, PiMouseRightClickFill } from "react-icons/pi";

import { cx } from "@/cva.config";
import { useHidStore } from "@hooks/stores";
import useMouse from "@hooks/useMouse";
import { Button } from "@components/Button";
import Card from "@components/Card";
import { m } from "@localizations/messages.js";

const WIDTH = 280;
const DRIFT_THRESHOLD_PX = 2;
const DOUBLE_TAP_MAX_DURATION_MS = 450;
const TAP_MAX_MOVEMENT_PX = 18;
const DOUBLE_TAP_INTERVAL_MS = 380;
const DOUBLE_TAP_MAX_DISTANCE_PX = 35;
const LONG_PRESS_MS = 500;
const LMB = 1;
const RMB = 2;
const MMB = 4;
const CLICK_RELEASE_DELAY_MS = 50;
const SCROLL_PX_PER_TICK = 16;
const MMB_SCROLL_THRESHOLD_PX = 8;

type Point = { x: number; y: number; time: number };
type TapRipple = { id: number; x: number; y: number };

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function preventIfCancelable(e: { cancelable: boolean; preventDefault: () => void }) {
  if (e.cancelable) e.preventDefault();
}

function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignore unsupported / blocked vibration
  }
}

function centroid(pointers: Map<number, { x: number; y: number }>) {
  let x = 0;
  let y = 0;
  for (const p of pointers.values()) {
    x += p.x;
    y += p.y;
  }
  const n = pointers.size || 1;
  return { x: x / n, y: y / n };
}

export default function VirtualTrackpad() {
  const { isVirtualTrackpadEnabled, setVirtualTrackpadEnabled } = useHidStore();
  const { sendTrackpadRelMouse, sendWheelReport } = useMouse();

  const [lockedButtons, setLockedButtons] = useState(0);
  const [pressedButtons, setPressedButtons] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [ripples, setRipples] = useState<TapRipple[]>([]);
  const [surfaceFlash, setSurfaceFlash] = useState(false);

  const heldButtonsRef = useRef(0);
  const lockedButtonsRef = useRef(0);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const isScrollingRef = useRef(false);
  const scrollAccumRef = useRef({ x: 0, y: 0 });
  const gestureStartRef = useRef<Point | null>(null);
  const lastPointRef = useRef<Point | null>(null);
  const lastTapRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const rippleIdRef = useRef(0);

  const longPressTimersRef = useRef<Partial<Record<number, number>>>({});
  const longPressFiredRef = useRef<Partial<Record<number, boolean>>>({});
  const skipButtonUpRef = useRef<Partial<Record<number, boolean>>>({});
  const clickReleaseTimerRef = useRef<number | null>(null);
  const mmbPointerIdRef = useRef<number | null>(null);
  const mmbStartYRef = useRef<number | null>(null);
  const mmbLastYRef = useRef<number | null>(null);
  const mmbDidScrollRef = useRef(false);

  const updateLockedButtons = useCallback((next: number) => {
    lockedButtonsRef.current = next;
    heldButtonsRef.current = next;
    setLockedButtons(next);
  }, []);

  const spawnRipple = useCallback((clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;

    const id = ++rippleIdRef.current;
    setRipples(prev => [...prev, { id, x: clientX - rect.left, y: clientY - rect.top }]);
    setSurfaceFlash(true);
    window.setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id));
    }, 420);
    window.setTimeout(() => setSurfaceFlash(false), 140);
  }, []);

  const sendDelta = useCallback(
    (dx: number, dy: number) => {
      if (Math.abs(dx) < DRIFT_THRESHOLD_PX && Math.abs(dy) < DRIFT_THRESHOLD_PX) return;
      sendTrackpadRelMouse(dx, dy, heldButtonsRef.current);
    },
    [sendTrackpadRelMouse],
  );

  const sendScrollDelta = useCallback(
    (dx: number, dy: number) => {
      scrollAccumRef.current.x += dx;
      scrollAccumRef.current.y += dy;

      let ticksX = 0;
      let ticksY = 0;

      while (Math.abs(scrollAccumRef.current.y) >= SCROLL_PX_PER_TICK) {
        ticksY += Math.sign(scrollAccumRef.current.y);
        scrollAccumRef.current.y -= Math.sign(scrollAccumRef.current.y) * SCROLL_PX_PER_TICK;
      }
      while (Math.abs(scrollAccumRef.current.x) >= SCROLL_PX_PER_TICK) {
        ticksX += Math.sign(scrollAccumRef.current.x);
        scrollAccumRef.current.x -= Math.sign(scrollAccumRef.current.x) * SCROLL_PX_PER_TICK;
      }

      if (ticksX === 0 && ticksY === 0) return;
      // Scale like browser wheel notches (~100) so clampWheel keeps tick magnitude.
      sendWheelReport(ticksY * 100, ticksX * 100);
    },
    [sendWheelReport],
  );

  const sendClick = useCallback(
    (buttonBit: number) => {
      if (clickReleaseTimerRef.current !== null) {
        window.clearTimeout(clickReleaseTimerRef.current);
        clickReleaseTimerRef.current = null;
      }

      sendTrackpadRelMouse(0, 0, heldButtonsRef.current | buttonBit);
      clickReleaseTimerRef.current = window.setTimeout(() => {
        clickReleaseTimerRef.current = null;
        sendTrackpadRelMouse(0, 0, heldButtonsRef.current);
      }, CLICK_RELEASE_DELAY_MS);
    },
    [sendTrackpadRelMouse],
  );

  const clearLongPressTimer = useCallback((bit: number) => {
    const timerId = longPressTimersRef.current[bit];
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      delete longPressTimersRef.current[bit];
    }
  }, []);

  const clearSurfacePointers = useCallback(() => {
    pointersRef.current.clear();
    isScrollingRef.current = false;
    scrollAccumRef.current = { x: 0, y: 0 };
    gestureStartRef.current = null;
    lastPointRef.current = null;
  }, []);

  const handleSurfacePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    preventIfCancelable(e);
    e.stopPropagation();

    const pointers = pointersRef.current;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);

    if (pointers.size >= 2) {
      isScrollingRef.current = true;
      scrollAccumRef.current = { x: 0, y: 0 };
      gestureStartRef.current = null;
      lastPointRef.current = null;
      return;
    }

    const point: Point = { x: e.clientX, y: e.clientY, time: Date.now() };
    gestureStartRef.current = point;
    lastPointRef.current = point;
  }, []);

  const handleSurfacePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      preventIfCancelable(e);
      e.stopPropagation();

      const pointers = pointersRef.current;
      if (!pointers.has(e.pointerId)) return;

      if (pointers.size >= 2) {
        isScrollingRef.current = true;
        const before = centroid(pointers);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const after = centroid(pointers);
        sendScrollDelta(after.x - before.x, after.y - before.y);
        return;
      }

      if (!lastPointRef.current) return;

      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const dx = e.clientX - lastPointRef.current.x;
      const dy = e.clientY - lastPointRef.current.y;
      lastPointRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
      sendDelta(dx, dy);
    },
    [sendDelta, sendScrollDelta],
  );

  const handleSurfacePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      preventIfCancelable(e);
      e.stopPropagation();

      const pointers = pointersRef.current;
      if (!pointers.has(e.pointerId)) return;

      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      const wasScrolling = isScrollingRef.current;
      const start = gestureStartRef.current;
      const end = { x: e.clientX, y: e.clientY, time: Date.now() };

      pointers.delete(e.pointerId);

      if (pointers.size < 2) {
        isScrollingRef.current = false;
        scrollAccumRef.current = { x: 0, y: 0 };
      }

      if (pointers.size > 0) {
        // Still tracking another finger — no tap on this release.
        gestureStartRef.current = null;
        lastPointRef.current = null;
        return;
      }

      gestureStartRef.current = null;
      lastPointRef.current = null;

      // Two-finger scroll just ended, or movement was too large — not a tap.
      if (wasScrolling || !start) return;

      const duration = end.time - start.time;
      const movement = distance(start, end);

      if (duration >= DOUBLE_TAP_MAX_DURATION_MS || movement >= TAP_MAX_MOVEMENT_PX) return;

      const lastTap = lastTapRef.current;
      if (
        lastTap &&
        end.time - lastTap.time < DOUBLE_TAP_INTERVAL_MS &&
        distance(lastTap, end) < DOUBLE_TAP_MAX_DISTANCE_PX
      ) {
        lastTapRef.current = null;
        spawnRipple(end.x, end.y);
        haptic([8, 24, 12]);
        sendClick(LMB);
        return;
      }

      lastTapRef.current = { x: end.x, y: end.y, time: end.time };
    },
    [sendClick, spawnRipple],
  );

  const handleSurfacePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    preventIfCancelable(e);
    e.stopPropagation();

    const pointers = pointersRef.current;
    if (!pointers.has(e.pointerId)) return;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      isScrollingRef.current = false;
      scrollAccumRef.current = { x: 0, y: 0 };
    }
    if (pointers.size === 0) {
      gestureStartRef.current = null;
      lastPointRef.current = null;
    }
  }, []);

  const resetMmbGesture = useCallback(() => {
    mmbPointerIdRef.current = null;
    mmbStartYRef.current = null;
    mmbLastYRef.current = null;
    mmbDidScrollRef.current = false;
    scrollAccumRef.current = { x: 0, y: 0 };
  }, []);

  const handleMmbPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      preventIfCancelable(e);
      e.stopPropagation();
      setPressedButtons(prev => prev | MMB);
      e.currentTarget.setPointerCapture(e.pointerId);

      if (lockedButtonsRef.current & MMB) {
        updateLockedButtons(lockedButtonsRef.current & ~MMB);
        sendTrackpadRelMouse(0, 0, heldButtonsRef.current);
        skipButtonUpRef.current[MMB] = true;
        resetMmbGesture();
        haptic(8);
        return;
      }

      mmbPointerIdRef.current = e.pointerId;
      mmbStartYRef.current = e.clientY;
      mmbLastYRef.current = e.clientY;
      mmbDidScrollRef.current = false;
      scrollAccumRef.current = { x: 0, y: 0 };
      skipButtonUpRef.current[MMB] = false;
      longPressFiredRef.current[MMB] = false;
      clearLongPressTimer(MMB);
      haptic(6);

      longPressTimersRef.current[MMB] = window.setTimeout(() => {
        if (mmbDidScrollRef.current) return;
        longPressFiredRef.current[MMB] = true;
        updateLockedButtons(lockedButtonsRef.current | MMB);
        sendTrackpadRelMouse(0, 0, heldButtonsRef.current);
        haptic(18);
      }, LONG_PRESS_MS);
    },
    [clearLongPressTimer, resetMmbGesture, sendTrackpadRelMouse, updateLockedButtons],
  );

  const handleMmbPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      preventIfCancelable(e);
      e.stopPropagation();
      if (
        e.pointerId !== mmbPointerIdRef.current ||
        mmbStartYRef.current === null ||
        mmbLastYRef.current === null
      ) {
        return;
      }

      if (
        !mmbDidScrollRef.current &&
        Math.abs(e.clientY - mmbStartYRef.current) < MMB_SCROLL_THRESHOLD_PX
      ) {
        return;
      }

      // Scroll gesture wins over hold-to-lock.
      if (!mmbDidScrollRef.current) {
        clearLongPressTimer(MMB);
        longPressFiredRef.current[MMB] = false;
      }

      const dy = e.clientY - mmbLastYRef.current;
      mmbLastYRef.current = e.clientY;
      mmbDidScrollRef.current = true;
      sendScrollDelta(0, dy);
    },
    [clearLongPressTimer, sendScrollDelta],
  );

  const handleMmbPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      preventIfCancelable(e);
      e.stopPropagation();
      if (e.pointerId !== mmbPointerIdRef.current && !skipButtonUpRef.current[MMB]) return;

      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      const didScroll = mmbDidScrollRef.current;
      setPressedButtons(prev => prev & ~MMB);
      clearLongPressTimer(MMB);
      resetMmbGesture();

      if (skipButtonUpRef.current[MMB]) {
        skipButtonUpRef.current[MMB] = false;
        return;
      }

      if (longPressFiredRef.current[MMB]) return;
      if (lockedButtonsRef.current & MMB) return;
      if (didScroll) return;

      haptic(10);
      sendClick(MMB);
    },
    [clearLongPressTimer, resetMmbGesture, sendClick],
  );

  const handleMmbPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      preventIfCancelable(e);
      e.stopPropagation();
      if (e.pointerId !== mmbPointerIdRef.current && !skipButtonUpRef.current[MMB]) return;

      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      setPressedButtons(prev => prev & ~MMB);
      clearLongPressTimer(MMB);
      resetMmbGesture();
    },
    [clearLongPressTimer, resetMmbGesture],
  );

  const handleButtonPointerDown = useCallback(
    (bit: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
      preventIfCancelable(e);
      e.stopPropagation();
      setPressedButtons(prev => prev | bit);

      if (lockedButtonsRef.current & bit) {
        updateLockedButtons(lockedButtonsRef.current & ~bit);
        sendTrackpadRelMouse(0, 0, heldButtonsRef.current);
        skipButtonUpRef.current[bit] = true;
        haptic(8);
        return;
      }

      skipButtonUpRef.current[bit] = false;
      longPressFiredRef.current[bit] = false;
      clearLongPressTimer(bit);
      haptic(6);

      longPressTimersRef.current[bit] = window.setTimeout(() => {
        longPressFiredRef.current[bit] = true;
        updateLockedButtons(lockedButtonsRef.current | bit);
        sendTrackpadRelMouse(0, 0, heldButtonsRef.current);
        haptic(18);
      }, LONG_PRESS_MS);
    },
    [clearLongPressTimer, sendTrackpadRelMouse, updateLockedButtons],
  );

  const handleButtonPointerUp = useCallback(
    (bit: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
      preventIfCancelable(e);
      e.stopPropagation();
      setPressedButtons(prev => prev & ~bit);
      clearLongPressTimer(bit);

      if (skipButtonUpRef.current[bit]) {
        skipButtonUpRef.current[bit] = false;
        return;
      }

      if (longPressFiredRef.current[bit]) return;
      if (lockedButtonsRef.current & bit) return;

      haptic(10);
      sendClick(bit);
    },
    [clearLongPressTimer, sendClick],
  );

  const handleButtonPointerCancel = useCallback(
    (bit: number) => () => {
      setPressedButtons(prev => prev & ~bit);
      clearLongPressTimer(bit);
    },
    [clearLongPressTimer],
  );

  const releaseAllButtons = useCallback(
    (forceHostRelease = false) => {
      clearLongPressTimer(LMB);
      clearLongPressTimer(MMB);
      clearLongPressTimer(RMB);
      if (clickReleaseTimerRef.current !== null) {
        window.clearTimeout(clickReleaseTimerRef.current);
        clickReleaseTimerRef.current = null;
      }
      setPressedButtons(0);
      setLockedButtons(0);
      lockedButtonsRef.current = 0;
      clearSurfacePointers();
      resetMmbGesture();

      if (heldButtonsRef.current !== 0 || forceHostRelease) {
        sendTrackpadRelMouse(0, 0, 0);
        heldButtonsRef.current = 0;
      }
    },
    [clearLongPressTimer, clearSurfacePointers, resetMmbGesture, sendTrackpadRelMouse],
  );

  const releaseAllButtonsRef = useRef(releaseAllButtons);
  releaseAllButtonsRef.current = releaseAllButtons;

  useEffect(() => {
    if (!isVirtualTrackpadEnabled) {
      setIsCollapsed(false);
      releaseAllButtons(false);
      return;
    }
    // Opening: also clear any host-side press left from the video surface.
    releaseAllButtons(true);
  }, [isVirtualTrackpadEnabled, releaseAllButtons]);

  useEffect(() => {
    return () => {
      releaseAllButtonsRef.current(true);
    };
  }, []);

  const buttonClass = (bit: number) => {
    const locked = Boolean(lockedButtons & bit);
    const pressed = Boolean(pressedButtons & bit);
    return cx(
      "flex h-14 min-h-[56px] touch-none items-center justify-center rounded-sm border select-none",
      "transition-[transform,background-color,box-shadow,border-color] duration-150 ease-out",
      "active:scale-[0.97]",
      bit === MMB ? "w-10 shrink-0" : "flex-1",
      locked
        ? "border-blue-900/60 bg-blue-700 text-white shadow-sm dark:border-blue-600"
        : cx(
            "border-slate-800/30 bg-white text-black shadow-xs dark:border-slate-300/20 dark:bg-slate-800 dark:text-white",
            "hover:bg-slate-50 hover:shadow-sm dark:hover:bg-slate-700/90",
          ),
      pressed && !locked && "scale-[0.97] bg-slate-100 shadow-inner dark:bg-slate-900",
      pressed && locked && "scale-[0.97] brightness-95",
    );
  };

  return (
    <div
      className={cx(
        "shrink-0 transition-all duration-500 ease-in-out md:h-full",
        !isVirtualTrackpadEnabled && "max-md:hidden",
        isVirtualTrackpadEnabled &&
          !isCollapsed &&
          "max-md:fixed max-md:inset-0 max-md:z-40 max-md:w-full!",
        isVirtualTrackpadEnabled &&
          isCollapsed &&
          "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:h-auto max-md:w-full!",
      )}
      style={{
        marginRight: isVirtualTrackpadEnabled ? "0px" : `-${WIDTH}px`,
        width: `${WIDTH}px`,
      }}
    >
      <AnimatePresence>
        {isVirtualTrackpadEnabled && (
          <motion.div
            className={cx("h-full", isCollapsed && "max-md:h-auto")}
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: "0%" }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{
              duration: 0.5,
              ease: "easeInOut",
            }}
          >
            <Card
              className={cx(
                "flex flex-col overflow-hidden rounded-none",
                isCollapsed ? "max-md:h-auto md:h-full" : "h-full",
              )}
            >
              <div className="flex items-center gap-2 border-b border-b-slate-800/30 bg-white px-2 py-3 dark:border-b-slate-300/20 dark:bg-slate-800">
                <LuMousePointer2 className="size-4 shrink-0 text-slate-500 dark:text-slate-400" />
                <h2 className="min-w-0 flex-1 truncate font-sans text-sm leading-none font-medium text-slate-700 select-none dark:text-slate-300">
                  {m.virtual_trackpad_header()}
                </h2>
                <Button
                  size="XS"
                  theme="light"
                  className="shrink-0 md:hidden"
                  LeadingIcon={isCollapsed ? ChevronUpIcon : ChevronDownIcon}
                  onClick={() => setIsCollapsed(prev => !prev)}
                />
                <Button
                  size="XS"
                  theme="light"
                  className="shrink-0"
                  text={m.hide()}
                  LeadingIcon={ChevronRightIcon}
                  onClick={() => setVirtualTrackpadEnabled(false)}
                />
              </div>

              <div
                className={cx(
                  "flex min-h-0 flex-1 flex-col bg-blue-50/80 dark:bg-slate-700",
                  isCollapsed && "max-md:hidden",
                )}
              >
                <div
                  ref={surfaceRef}
                  className={cx(
                    "relative mx-2 mt-2 mb-1 min-h-0 flex-1 touch-none overflow-hidden overscroll-none rounded-sm border select-none",
                    "border-slate-800/20 bg-slate-600/40 dark:border-slate-300/20 dark:bg-slate-800/80",
                    "transition-[background-color,box-shadow] duration-150 ease-out",
                    surfaceFlash &&
                      "bg-slate-500/55 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] dark:bg-slate-700/90",
                  )}
                  style={{ touchAction: "none" }}
                  onPointerDown={handleSurfacePointerDown}
                  onPointerMove={handleSurfacePointerMove}
                  onPointerUp={handleSurfacePointerUp}
                  onPointerCancel={handleSurfacePointerCancel}
                >
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-25">
                    <div className="h-px w-10 bg-slate-300 dark:bg-slate-500" />
                    <div className="absolute h-10 w-px bg-slate-300 dark:bg-slate-500" />
                  </div>

                  {ripples.map(ripple => (
                    <span
                      key={ripple.id}
                      className="pointer-events-none absolute size-10 animate-trackpadRipple rounded-full bg-white/35 dark:bg-white/25"
                      style={{ left: ripple.x, top: ripple.y }}
                    />
                  ))}
                </div>

                <div className="flex gap-1 px-2 pb-2">
                  <button
                    type="button"
                    aria-label={m.virtual_trackpad_lmb()}
                    className={buttonClass(LMB)}
                    style={{ touchAction: "none" }}
                    onPointerDown={handleButtonPointerDown(LMB)}
                    onPointerUp={handleButtonPointerUp(LMB)}
                    onPointerLeave={handleButtonPointerCancel(LMB)}
                    onPointerCancel={handleButtonPointerCancel(LMB)}
                  >
                    <PiMouseLeftClickFill className="size-6" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={m.virtual_trackpad_mmb()}
                    className={buttonClass(MMB)}
                    style={{ touchAction: "none" }}
                    onPointerDown={handleMmbPointerDown}
                    onPointerMove={handleMmbPointerMove}
                    onPointerUp={handleMmbPointerUp}
                    onPointerCancel={handleMmbPointerCancel}
                  >
                    <span className="flex flex-col items-center gap-1" aria-hidden>
                      <span className="size-1 rounded-full bg-current opacity-70" />
                      <span className="size-1 rounded-full bg-current opacity-70" />
                      <span className="size-1 rounded-full bg-current opacity-70" />
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={m.virtual_trackpad_rmb()}
                    className={buttonClass(RMB)}
                    style={{ touchAction: "none" }}
                    onPointerDown={handleButtonPointerDown(RMB)}
                    onPointerUp={handleButtonPointerUp(RMB)}
                    onPointerLeave={handleButtonPointerCancel(RMB)}
                    onPointerCancel={handleButtonPointerCancel(RMB)}
                  >
                    <PiMouseRightClickFill className="size-6" aria-hidden />
                  </button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
