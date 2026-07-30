import { useCallback, useEffect, useMemo } from "react";

import { useSettingsStore } from "@hooks/stores";
import { JsonRpcResponse, useJsonRpc } from "@hooks/useJsonRpc";
import useKeyboardLayout from "@hooks/useKeyboardLayout";
import { Checkbox } from "@components/Checkbox";
import { SelectMenuBasic } from "@components/SelectMenuBasic";
import { SettingsItem } from "@components/SettingsItem";
import { SettingsPageHeader } from "@components/SettingsPageheader";
import {
  MODIFIER_REMAP_SOURCES,
  MODIFIER_REMAP_TARGETS,
  type ModifierRemapSource,
  type ModifierRemapTarget,
} from "@/keyboardRemap";
import { isMac, isWindows } from "@/utils";
import notifications from "@/notifications";
import { m } from "@localizations/messages.js";

function sourceLabel(source: ModifierRemapSource): string {
  switch (source) {
    case "CapsLock":
      return "Caps Lock (⇪)";
    case "Control":
      return "Control (⌃)";
    case "Alt":
      return "Option (⌥)";
    case "Meta":
      if (isMac()) return "Command (⌘)";
      if (isWindows()) return "Windows (⊞)";
      return "Meta (❖)";
  }
}

function targetLabel(target: ModifierRemapTarget): string {
  switch (target) {
    case "CapsLock":
      return "⇪ Caps Lock";
    case "Control":
      return "⌃ Control";
    case "Alt":
      return "⌥ Option";
    case "Meta":
      return "⊞ / ⌘ Meta";
    case "None":
      return m.keyboard_remap_target_none();
  }
}

export default function SettingsKeyboardRoute() {
  const { setKeyboardLayout } = useSettingsStore();
  const { showPressedKeys, setShowPressedKeys, modifierRemap, setModifierRemapTarget } =
    useSettingsStore();
  const { selectedKeyboard, keyboardOptions } = useKeyboardLayout();

  const { send } = useJsonRpc();

  useEffect(() => {
    send("getKeyboardLayout", {}, (resp: JsonRpcResponse) => {
      if ("error" in resp) return;
      const isoCode = resp.result as string;
      console.log("Fetched keyboard layout from backend:", isoCode);
      if (isoCode && isoCode.length > 0) {
        setKeyboardLayout(isoCode);
      }
    });
  }, [send, setKeyboardLayout]);

  const onKeyboardLayoutChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const isoCode = e.target.value;
      send("setKeyboardLayout", { layout: isoCode }, resp => {
        if ("error" in resp) {
          notifications.error(
            m.keyboard_layout_error({ error: resp.error.data || m.unknown_error() }),
          );
        }
        notifications.success(m.keyboard_layout_success({ layout: isoCode }));
        setKeyboardLayout(isoCode);
      });
    },
    [send, setKeyboardLayout],
  );

  const targetOptions = useMemo(
    () => MODIFIER_REMAP_TARGETS.map(target => ({ value: target, label: targetLabel(target) })),
    [],
  );

  return (
    <div className="space-y-4">
      <SettingsPageHeader title={m.keyboard_title()} description={m.keyboard_description()} />

      <div className="space-y-4">
        <SettingsItem
          title={m.keyboard_layout_title()}
          description={m.keyboard_layout_description()}
        >
          <SelectMenuBasic
            size="SM"
            label=""
            fullWidth
            value={selectedKeyboard.isoCode}
            onChange={onKeyboardLayoutChange}
            options={keyboardOptions}
          />
        </SettingsItem>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {m.keyboard_layout_long_description()}
        </p>
      </div>

      <div className="space-y-4">
        <SettingsItem
          title={m.keyboard_show_pressed_keys_title()}
          description={m.keyboard_show_pressed_keys_description()}
        >
          <Checkbox
            checked={showPressedKeys}
            onChange={e => setShowPressedKeys(e.target.checked)}
          />
        </SettingsItem>
      </div>

      <div className="space-y-3">
        <div className="select-none">
          <h3 className="text-base font-semibold text-black dark:text-white">
            {m.keyboard_modifier_remap_title()}
          </h3>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {m.keyboard_modifier_remap_description()}
          </p>
        </div>
        <div className="space-y-2">
          {MODIFIER_REMAP_SOURCES.map(source => (
            <SettingsItem key={source} size="SM" title={sourceLabel(source)} description=" ">
              <div className="w-56">
                <SelectMenuBasic
                  size="SM"
                  label=""
                  fullWidth
                  value={modifierRemap[source]}
                  onChange={e =>
                    setModifierRemapTarget(source, e.target.value as ModifierRemapTarget)
                  }
                  options={targetOptions}
                />
              </div>
            </SettingsItem>
          ))}
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {m.keyboard_modifier_remap_long_description()}
        </p>
      </div>
    </div>
  );
}
