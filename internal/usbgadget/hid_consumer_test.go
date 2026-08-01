package usbgadget

import (
	"bytes"
	"testing"
)

func TestIsKeyboardMediaKey(t *testing.T) {
	tests := []struct {
		key  byte
		want bool
	}{
		{keyboardKeyMute, true},
		{keyboardKeyVolumeUp, true},
		{keyboardKeyVolumeDown, true},
		{keyboardKeyMediaPlayPause, true},
		{keyboardKeyMediaTrackNext, true},
		{keyboardKeyMediaTrackPrevious, true},
		{keyboardKeyMediaStop, true},
		{0x04, false}, // KeyA
		{0x4c, false}, // Delete
		{0x48, false}, // Pause/Break — not media
		{0, false},
	}

	for _, tt := range tests {
		t.Run("", func(t *testing.T) {
			if got := isKeyboardMediaKey(tt.key); got != tt.want {
				t.Fatalf("isKeyboardMediaKey(0x%02x) = %v, want %v", tt.key, got, tt.want)
			}
		})
	}
}

func TestKeyboardMediaKeyToConsumerBit(t *testing.T) {
	tests := []struct {
		key  byte
		want byte
	}{
		{keyboardKeyVolumeUp, consumerBitVolumeUp},
		{keyboardKeyVolumeDown, consumerBitVolumeDown},
		{keyboardKeyMute, consumerBitMute},
		{keyboardKeyMediaPlayPause, consumerBitPlayPause},
		{keyboardKeyMediaTrackNext, consumerBitTrackNext},
		{keyboardKeyMediaTrackPrevious, consumerBitTrackPrevious},
		{keyboardKeyMediaStop, consumerBitStop},
		{0x04, 0},
		{0x48, 0}, // Pause/Break
		{0, 0},
	}

	for _, tt := range tests {
		t.Run("", func(t *testing.T) {
			if got := keyboardMediaKeyToConsumerBit(tt.key); got != tt.want {
				t.Fatalf("keyboardMediaKeyToConsumerBit(0x%02x) = 0x%02x, want 0x%02x", tt.key, got, tt.want)
			}
		})
	}
}

func TestStripMediaKeys(t *testing.T) {
	tests := []struct {
		name         string
		keys         []byte
		wantCleaned  []byte
		wantConsumer byte
	}{
		{
			name:         "volume up only",
			keys:         []byte{0x80, 0, 0, 0, 0, 0},
			wantCleaned:  []byte{0, 0, 0, 0, 0, 0},
			wantConsumer: consumerBitVolumeUp,
		},
		{
			name:         "volume down only",
			keys:         []byte{0x81, 0, 0, 0, 0, 0},
			wantCleaned:  []byte{0, 0, 0, 0, 0, 0},
			wantConsumer: consumerBitVolumeDown,
		},
		{
			name:         "mute only",
			keys:         []byte{0x7f, 0, 0, 0, 0, 0},
			wantCleaned:  []byte{0, 0, 0, 0, 0, 0},
			wantConsumer: consumerBitMute,
		},
		{
			name:         "play pause only",
			keys:         []byte{0xf1, 0, 0, 0, 0, 0},
			wantCleaned:  []byte{0, 0, 0, 0, 0, 0},
			wantConsumer: consumerBitPlayPause,
		},
		{
			name:         "regular key with volume up",
			keys:         []byte{0x04, 0x80, 0, 0, 0, 0},
			wantCleaned:  []byte{0x04, 0, 0, 0, 0, 0},
			wantConsumer: consumerBitVolumeUp,
		},
		{
			name:         "pause break not stripped",
			keys:         []byte{0x48, 0, 0, 0, 0, 0},
			wantCleaned:  []byte{0x48, 0, 0, 0, 0, 0},
			wantConsumer: 0,
		},
		{
			name:         "all three volume media keys",
			keys:         []byte{0x80, 0x81, 0x7f, 0, 0, 0},
			wantCleaned:  []byte{0, 0, 0, 0, 0, 0},
			wantConsumer: consumerBitVolumeUp | consumerBitVolumeDown | consumerBitMute,
		},
		{
			name:         "regular keys only",
			keys:         []byte{0x04, 0x05, 0, 0, 0, 0},
			wantCleaned:  []byte{0x04, 0x05, 0, 0, 0, 0},
			wantConsumer: 0,
		},
		{
			name:         "all zeros",
			keys:         []byte{0, 0, 0, 0, 0, 0},
			wantCleaned:  []byte{0, 0, 0, 0, 0, 0},
			wantConsumer: 0,
		},
		{
			name:         "nil keys",
			keys:         nil,
			wantCleaned:  nil,
			wantConsumer: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotCleaned, gotConsumer := stripMediaKeys(tt.keys)
			if !bytes.Equal(gotCleaned, tt.wantCleaned) {
				t.Fatalf("stripMediaKeys() cleaned = %v, want %v", gotCleaned, tt.wantCleaned)
			}
			if gotConsumer != tt.wantConsumer {
				t.Fatalf("stripMediaKeys() consumerBits = 0x%02x, want 0x%02x", gotConsumer, tt.wantConsumer)
			}
		})
	}
}
