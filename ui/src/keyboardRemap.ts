import { keys } from "@/keyboardMappings";

/** Physical key pressed on the client. */
export type ModifierRemapSource = "CapsLock" | "Control" | "Alt" | "Meta";

/** What that physical key sends to the remote host. */
export type ModifierRemapTarget = "CapsLock" | "Control" | "Alt" | "Meta" | "None";

export type ModifierRemapMap = Record<ModifierRemapSource, ModifierRemapTarget>;

export const DEFAULT_MODIFIER_REMAP: ModifierRemapMap = {
  CapsLock: "CapsLock",
  Control: "Control",
  Alt: "Alt",
  Meta: "Meta",
};

export const MODIFIER_REMAP_SOURCES: ModifierRemapSource[] = ["CapsLock", "Control", "Alt", "Meta"];

export const MODIFIER_REMAP_TARGETS: ModifierRemapTarget[] = [
  "CapsLock",
  "Control",
  "Alt",
  "Meta",
  "None",
];

export function resolveModifierSource(code: string): ModifierRemapSource | null {
  if (code === "CapsLock") return "CapsLock";
  if (code === "ControlLeft" || code === "ControlRight") return "Control";
  if (code === "AltLeft" || code === "AltRight" || code === "AltGr") return "Alt";
  if (code === "MetaLeft" || code === "MetaRight") return "Meta";
  return null;
}

function sideFromCode(code: string): "Left" | "Right" {
  return code.includes("Right") ? "Right" : "Left";
}

/**
 * Map a physical key to a HID usage.
 * Returns null when the key should be swallowed (target None).
 */
export function applyModifierRemap(
  code: string,
  hidKey: number,
  remap: ModifierRemapMap,
): number | null {
  const source = resolveModifierSource(code);
  if (!source) return hidKey;

  const target = remap[source] ?? DEFAULT_MODIFIER_REMAP[source];
  if (target === "None") return null;
  if (target === "CapsLock") return keys.CapsLock;

  const side = source === "CapsLock" ? "Left" : sideFromCode(code);
  if (target === "Control") return keys[`Control${side}`];
  if (target === "Alt") return keys[`Alt${side}`];
  if (target === "Meta") return keys[`Meta${side}`];

  return hidKey;
}
