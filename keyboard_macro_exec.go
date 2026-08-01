package kvm

import (
	"fmt"

	"github.com/jetkvm/kvm/internal/hidrpc"
)

const macroPressDelayMs = 20
const macroReleaseDelayDefaultMs = 100

var keyboardMacroReleaseKeys = make([]byte, hidrpc.HidKeyBufferSize)

func convertConfigMacroToHidSteps(macro KeyboardMacro) ([]hidrpc.KeyboardMacroStep, error) {
	steps := make([]hidrpc.KeyboardMacroStep, 0, len(macro.Steps)*2)

	for _, step := range macro.Steps {
		if len(step.Keys) == 0 && len(step.Modifiers) == 0 {
			continue
		}

		keyBytes, err := configKeysToHID(step.Keys)
		if err != nil {
			return nil, err
		}

		modifier, err := configModifiersToHID(step.Modifiers)
		if err != nil {
			return nil, err
		}

		if len(keyBytes) == 0 && modifier == 0 {
			continue
		}

		steps = append(steps, hidrpc.KeyboardMacroStep{
			Modifier: modifier,
			Keys:     keyBytes,
			Delay:    macroPressDelayMs,
		})

		releaseDelay := uint16(macroReleaseDelayDefaultMs)
		if step.Delay > 0 {
			releaseDelay = uint16(step.Delay)
		}

		steps = append(steps, hidrpc.KeyboardMacroStep{
			Modifier: 0,
			Keys:     append([]byte(nil), keyboardMacroReleaseKeys...),
			Delay:    releaseDelay,
		})
	}

	if len(steps) == 0 {
		return nil, fmt.Errorf("macro %q has no convertible steps", macro.ID)
	}

	return steps, nil
}

func configKeysToHID(names []string) ([]byte, error) {
	if len(names) > hidrpc.HidKeyBufferSize {
		return nil, fmt.Errorf("too many keys in step (max %d)", hidrpc.HidKeyBufferSize)
	}

	keys := make([]byte, 0, len(names))
	for _, name := range names {
		code, ok := hidKeys[name]
		if !ok {
			return nil, fmt.Errorf("unknown key %q", name)
		}
		keys = append(keys, code)
	}

	for len(keys) < hidrpc.HidKeyBufferSize {
		keys = append(keys, 0)
	}

	return keys, nil
}

func configModifiersToHID(names []string) (byte, error) {
	var modifier byte
	for _, name := range names {
		mask, ok := hidModifiers[name]
		if !ok {
			return 0, fmt.Errorf("unknown modifier %q", name)
		}
		modifier |= mask
	}

	return modifier, nil
}

func executeKeyboardMacroByID(id string) error {
	var macro *KeyboardMacro
	for i := range config.KeyboardMacros {
		if config.KeyboardMacros[i].ID == id {
			macro = &config.KeyboardMacros[i]
			break
		}
	}

	if macro == nil {
		return fmt.Errorf("keyboard macro %q not found", id)
	}

	steps, err := convertConfigMacroToHidSteps(*macro)
	if err != nil {
		return err
	}

	return rpcExecuteKeyboardMacro(steps)
}

func notifyMQTTMacrosChanged() {
	if mqttManager == nil {
		return
	}
	if !mqttManager.IsConnected() {
		return
	}

	mqttManager.onMacrosChanged()
}
