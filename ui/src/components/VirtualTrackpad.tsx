import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import { AnimatePresence, motion } from "framer-motion";

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
const CLICK_RELEASE_DELAY_MS = 50;

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

export default function VirtualTrackpad() {
  const { isVirtualTrackpadEnabled, setVirtualTrackpadEnabled } = useHidStore();
  const { sendTrackpadRelMouse } = useMouse();

  const [lockedButtons, setLockedButtons] = useState(0);
  const [pressedButtons, setPressedButtons] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [ripples, setRipples] = useState<TapRipple[]>([]);
  const [surfaceFlash, setSurfaceFlash] = useState(false);

  const heldButtonsRef = useRef(0);
  const lockedButtonsRef = useRef(0);
  const activePointerIdRef = useRef<number | null>(null);
  const gestureStartRef = useRef<Point | null>(null);
  const lastPointRef = useRef<Point | null>(null);
  const lastTapRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const rippleIdRef = useRef(0);

  const longPressTimersRef = useRef<Partial<Record<number, number>>>({});
  const longPressFiredRef = useRef<Partial<Record<number, boolean>>>({});
  const skipButtonUpRef = useRef<Partial<Record<number, boolean>>>({});
  const clickReleaseTimerRef = useRef<number | null>(null);

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

  const handleSurfacePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    preventIfCancelable(e);
    e.stopPropagation();
    if (activePointerIdRef.current !== null) return;

    activePointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);

    const point: Point = { x: e.clientX, y: e.clientY, time: Date.now() };
    gestureStartRef.current = point;
    lastPointRef.current = point;
  }, []);

  const handleSurfacePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      preventIfCancelable(e);
      e.stopPropagation();
      if (e.pointerId !== activePointerIdRef.current || !lastPointRef.current) return;

      const dx = e.clientX - lastPointRef.current.x;
      const dy = e.clientY - lastPointRef.current.y;
      lastPointRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
      sendDelta(dx, dy);
    },
    [sendDelta],
  );

  const handleSurfacePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      preventIfCancelable(e);
      e.stopPropagation();
      if (e.pointerId !== activePointerIdRef.current) return;

      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      const start = gestureStartRef.current;
      const end = { x: e.clientX, y: e.clientY, time: Date.now() };

      activePointerIdRef.current = null;
      gestureStartRef.current = null;
      lastPointRef.current = null;

      if (!start) return;

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
    if (e.pointerId !== activePointerIdRef.current) return;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    activePointerIdRef.current = null;
    gestureStartRef.current = null;
    lastPointRef.current = null;
  }, []);

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
      clearLongPressTimer(RMB);
      if (clickReleaseTimerRef.current !== null) {
        window.clearTimeout(clickReleaseTimerRef.current);
        clickReleaseTimerRef.current = null;
      }
      setPressedButtons(0);
      setLockedButtons(0);
      lockedButtonsRef.current = 0;

      if (heldButtonsRef.current !== 0 || forceHostRelease) {
        sendTrackpadRelMouse(0, 0, 0);
        heldButtonsRef.current = 0;
      }
    },
    [clearLongPressTimer, sendTrackpadRelMouse],
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
      "flex h-14 min-h-[56px] flex-1 touch-none items-center justify-center rounded-sm border text-sm font-medium select-none",
      "transition-[transform,background-color,box-shadow,border-color] duration-150 ease-out",
      "active:scale-[0.97]",
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
              <div className="relative flex items-center justify-center border-b border-b-slate-800/30 bg-white px-2 py-4 dark:border-b-slate-300/20 dark:bg-slate-800">
                <h2 className="self-center font-sans text-sm leading-none font-medium text-slate-700 select-none dark:text-slate-300">
                  {m.virtual_trackpad_header()}
                </h2>
                <div className="absolute right-2 flex items-center gap-x-2">
                  <Button
                    size="XS"
                    theme="light"
                    className="md:hidden"
                    LeadingIcon={isCollapsed ? ChevronUpIcon : ChevronDownIcon}
                    onClick={() => setIsCollapsed(prev => !prev)}
                  />
                  <Button
                    size="XS"
                    theme="light"
                    text={m.hide()}
                    LeadingIcon={ChevronRightIcon}
                    onClick={() => setVirtualTrackpadEnabled(false)}
                  />
                </div>
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
                    "relative m-2 min-h-0 flex-1 touch-none overflow-hidden overscroll-none rounded-sm border select-none",
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

                <div className="flex gap-2 p-2 pt-0">
                  <button
                    type="button"
                    className={buttonClass(LMB)}
                    style={{ touchAction: "none" }}
                    onPointerDown={handleButtonPointerDown(LMB)}
                    onPointerUp={handleButtonPointerUp(LMB)}
                    onPointerLeave={handleButtonPointerCancel(LMB)}
                    onPointerCancel={handleButtonPointerCancel(LMB)}
                  >
                    {m.virtual_trackpad_lmb()}
                  </button>
                  <button
                    type="button"
                    className={buttonClass(RMB)}
                    style={{ touchAction: "none" }}
                    onPointerDown={handleButtonPointerDown(RMB)}
                    onPointerUp={handleButtonPointerUp(RMB)}
                    onPointerLeave={handleButtonPointerCancel(RMB)}
                    onPointerCancel={handleButtonPointerCancel(RMB)}
                  >
                    {m.virtual_trackpad_rmb()}
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
