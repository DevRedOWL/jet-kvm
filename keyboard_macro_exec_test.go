package kvm

import (
	"testing"

	"github.com/jetkvm/kvm/internal/hidrpc"
)

func TestConvertConfigMacroToHidSteps(t *testing.T) {
	macro := KeyboardMacro{
		ID:   "macro-1",
		Name: "Ctrl+Alt+Del",
		Steps: []KeyboardMacroStep{
			{
				Keys:      []string{"Delete"},
				Modifiers: []string{"ControlLeft", "AltLeft"},
				Delay:     150,
			},
		},
	}

	steps, err := convertConfigMacroToHidSteps(macro)
	if err != nil {
		t.Fatalf("convertConfigMacroToHidSteps: %v", err)
	}
	if len(steps) != 2 {
		t.Fatalf("expected press+release steps, got %d", len(steps))
	}

	if steps[0].Modifier != (hidModifiers["ControlLeft"] | hidModifiers["AltLeft"]) {
		t.Fatalf("unexpected modifier mask: %#x", steps[0].Modifier)
	}
	if steps[0].Keys[0] != hidKeys["Delete"] {
		t.Fatalf("unexpected key: %#x", steps[0].Keys[0])
	}
	if steps[0].Delay != macroPressDelayMs {
		t.Fatalf("unexpected press delay: %d", steps[0].Delay)
	}
	if len(steps[0].Keys) != hidrpc.HidKeyBufferSize {
		t.Fatalf("keys not padded to %d", hidrpc.HidKeyBufferSize)
	}

	if steps[1].Modifier != 0 || steps[1].Delay != 150 {
		t.Fatalf("unexpected release step: %+v", steps[1])
	}
	for _, b := range steps[1].Keys {
		if b != 0 {
			t.Fatalf("release keys not cleared: %v", steps[1].Keys)
		}
	}
}

func TestConvertConfigMacroUnknownKey(t *testing.T) {
	_, err := convertConfigMacroToHidSteps(KeyboardMacro{
		ID: "bad",
		Steps: []KeyboardMacroStep{
			{Keys: []string{"NotARealKey"}, Delay: 100},
		},
	})
	if err == nil {
		t.Fatal("expected error for unknown key")
	}
}

func TestExecuteKeyboardMacroByIDNotFound(t *testing.T) {
	prev := config
	t.Cleanup(func() { config = prev })
	config = &Config{KeyboardMacros: nil}

	if err := executeKeyboardMacroByID("missing"); err == nil {
		t.Fatal("expected not found error")
	}
}
