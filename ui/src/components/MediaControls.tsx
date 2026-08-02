import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { AnimatePresence, motion } from "framer-motion";
import { MdOutlineSettingsRemote } from "react-icons/md";
import {
  LuCircleStop,
  LuPlay,
  LuRotateCcw,
  LuRotateCw,
  LuSkipBack,
  LuSkipForward,
  LuVolume1,
  LuVolume2,
  LuVolumeX,
} from "react-icons/lu";

import { cx } from "@/cva.config";
import { keys } from "@/keyboardMappings";
import { useHidStore } from "@hooks/stores";
import useKeyboard from "@hooks/useKeyboard";
import { Button } from "@components/Button";
import Card from "@components/Card";
import { m } from "@localizations/messages.js";

const WIDTH = 260;
const PRESS_MS = 120;

type PulseKeyName =
  | "MediaTrackPrevious"
  | "MediaPlayPause"
  | "MediaTrackNext"
  | "Mute"
  | "MediaStop";

type HoldKeyName = "VolumeUp" | "VolumeDown" | "ArrowLeft" | "ArrowRight";

type PressedKeyName = PulseKeyName | HoldKeyName;

const baseButtonClass = cx(
  "touch-none items-center justify-center rounded-full border text-black select-none",
  "transition-[transform,background-color,box-shadow,border-color] duration-150 ease-out",
  "border-slate-800/30 bg-white shadow-xs dark:border-slate-300/20 dark:bg-slate-800 dark:text-white",
  "hover:bg-slate-50 hover:shadow-sm dark:hover:bg-slate-700/90",
);

function remoteButtonClass(pressed: boolean, sizeClass: string) {
  return cx(
    "flex",
    sizeClass,
    baseButtonClass,
    pressed && "scale-[0.94] bg-slate-100 shadow-inner dark:bg-slate-900",
  );
}

export default function MediaControls() {
  const { isMediaControlsEnabled, setMediaControlsEnabled } = useHidStore();
  const { handleKeyPress } = useKeyboard();
  const [pressedKey, setPressedKey] = useState<PressedKeyName | null>(null);
  const heldKeyRef = useRef<HoldKeyName | null>(null);

  const releaseHeldKey = useCallback(() => {
    const held = heldKeyRef.current;
    if (!held) return;
    heldKeyRef.current = null;
    setPressedKey(current => (current === held ? null : current));
    void handleKeyPress(keys[held], false);
  }, [handleKeyPress]);

  useEffect(() => {
    if (!isMediaControlsEnabled) {
      releaseHeldKey();
    }
  }, [isMediaControlsEnabled, releaseHeldKey]);

  useEffect(() => {
    return () => {
      releaseHeldKey();
    };
  }, [releaseHeldKey]);

  const pulseKey = (keyName: PulseKeyName) => {
    setPressedKey(keyName);
    void handleKeyPress(keys[keyName], true);
    setTimeout(() => {
      void handleKeyPress(keys[keyName], false);
      setPressedKey(current => (current === keyName ? null : current));
    }, PRESS_MS);
  };

  const onHoldPointerDown = (keyName: HoldKeyName) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    releaseHeldKey();
    e.currentTarget.setPointerCapture(e.pointerId);
    heldKeyRef.current = keyName;
    setPressedKey(keyName);
    void handleKeyPress(keys[keyName], true);
  };

  const onHoldPointerUp = (keyName: HoldKeyName) => () => {
    if (heldKeyRef.current !== keyName) return;
    releaseHeldKey();
  };

  return (
    <div
      className={cx(
        "shrink-0 transition-all duration-500 ease-in-out md:h-full",
        !isMediaControlsEnabled && "max-md:hidden",
        isMediaControlsEnabled && "max-md:fixed max-md:inset-0 max-md:z-40 max-md:w-full!",
      )}
      style={{
        marginRight: isMediaControlsEnabled ? "0px" : `-${WIDTH}px`,
        width: `${WIDTH}px`,
      }}
    >
      <AnimatePresence>
        {isMediaControlsEnabled && (
          <motion.div
            className="h-full"
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: "0%" }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{
              duration: 0.5,
              ease: "easeInOut",
            }}
          >
            <Card className="flex h-full flex-col overflow-hidden rounded-none">
              <div className="flex items-center gap-2 border-b border-b-slate-800/30 bg-white px-2 py-3 dark:border-b-slate-300/20 dark:bg-slate-800">
                <MdOutlineSettingsRemote className="size-4 shrink-0 text-slate-500 dark:text-slate-400" />
                <h2 className="min-w-0 flex-1 truncate font-sans text-sm leading-none font-medium text-slate-700 select-none dark:text-slate-300">
                  {m.media_controls_header()}
                </h2>
                <Button
                  size="XS"
                  theme="light"
                  className="shrink-0"
                  text={m.hide()}
                  LeadingIcon={ChevronRightIcon}
                  onClick={() => setMediaControlsEnabled(false)}
                />
              </div>

              <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-blue-50/80 px-3 py-6 dark:bg-slate-700">
                <div className="relative size-56">
                  <div className="pointer-events-none absolute inset-[1.375rem] rounded-full border border-slate-800/10 dark:border-slate-300/10" />

                  <button
                    type="button"
                    className={cx(
                      remoteButtonClass(pressedKey === "VolumeUp", "size-11"),
                      "absolute top-0 left-1/2 -translate-x-1/2",
                    )}
                    aria-label={m.media_controls_volume_up()}
                    onPointerDown={onHoldPointerDown("VolumeUp")}
                    onPointerUp={onHoldPointerUp("VolumeUp")}
                    onPointerCancel={onHoldPointerUp("VolumeUp")}
                  >
                    <LuVolume2 className="size-5" />
                  </button>

                  <button
                    type="button"
                    className={cx(
                      remoteButtonClass(pressedKey === "MediaTrackPrevious", "size-11"),
                      "absolute top-1/2 left-0 -translate-y-1/2",
                    )}
                    aria-label={m.media_controls_previous()}
                    onClick={() => pulseKey("MediaTrackPrevious")}
                  >
                    <LuSkipBack className="size-5" />
                  </button>

                  <button
                    type="button"
                    className={cx(
                      remoteButtonClass(pressedKey === "MediaPlayPause", "size-20"),
                      "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 shadow-sm",
                    )}
                    aria-label={m.media_controls_play_pause()}
                    onClick={() => pulseKey("MediaPlayPause")}
                  >
                    <LuPlay className="size-8 translate-x-0.5" />
                  </button>

                  <button
                    type="button"
                    className={cx(
                      remoteButtonClass(pressedKey === "MediaTrackNext", "size-11"),
                      "absolute top-1/2 right-0 -translate-y-1/2",
                    )}
                    aria-label={m.media_controls_next()}
                    onClick={() => pulseKey("MediaTrackNext")}
                  >
                    <LuSkipForward className="size-5" />
                  </button>

                  <button
                    type="button"
                    className={cx(
                      remoteButtonClass(pressedKey === "VolumeDown", "size-11"),
                      "absolute bottom-0 left-1/2 -translate-x-1/2",
                    )}
                    aria-label={m.media_controls_volume_down()}
                    onPointerDown={onHoldPointerDown("VolumeDown")}
                    onPointerUp={onHoldPointerUp("VolumeDown")}
                    onPointerCancel={onHoldPointerUp("VolumeDown")}
                  >
                    <LuVolume1 className="size-5" />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className={remoteButtonClass(pressedKey === "ArrowLeft", "size-10")}
                    aria-label={m.media_controls_rewind()}
                    onPointerDown={onHoldPointerDown("ArrowLeft")}
                    onPointerUp={onHoldPointerUp("ArrowLeft")}
                    onPointerCancel={onHoldPointerUp("ArrowLeft")}
                  >
                    <LuRotateCcw className="size-4" />
                  </button>
                  <button
                    type="button"
                    className={remoteButtonClass(pressedKey === "Mute", "size-12")}
                    aria-label={m.media_controls_mute()}
                    onClick={() => pulseKey("Mute")}
                  >
                    <LuVolumeX className="size-5" />
                  </button>
                  <button
                    type="button"
                    className={remoteButtonClass(pressedKey === "MediaStop", "size-12")}
                    aria-label={m.media_controls_stop()}
                    onClick={() => pulseKey("MediaStop")}
                  >
                    <LuCircleStop className="size-5" />
                  </button>
                  <button
                    type="button"
                    className={remoteButtonClass(pressedKey === "ArrowRight", "size-10")}
                    aria-label={m.media_controls_fast_forward()}
                    onPointerDown={onHoldPointerDown("ArrowRight")}
                    onPointerUp={onHoldPointerUp("ArrowRight")}
                    onPointerCancel={onHoldPointerUp("ArrowRight")}
                  >
                    <LuRotateCw className="size-4" />
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
