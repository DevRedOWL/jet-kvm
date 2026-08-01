package kvm

import "testing"

func TestMqttMediaCommandToKey(t *testing.T) {
	tests := []struct {
		payload string
		want    string
	}{
		{"PLAY_PAUSE", "MediaPlayPause"},
		{"play", "MediaPlayPause"},
		{"PAUSE", "MediaPlayPause"},
		{"NEXT", "MediaTrackNext"},
		{"PREVIOUS", "MediaTrackPrevious"},
		{"VOLUME_UP", "VolumeUp"},
		{"VOLUME_DOWN", "VolumeDown"},
		{"VOLUME_MUTE", "Mute"},
		{"MUTE", "Mute"},
		{"STOP", "MediaStop"},
	}

	for _, tt := range tests {
		got, err := mqttMediaCommandToKey(tt.payload)
		if err != nil {
			t.Fatalf("mqttMediaCommandToKey(%q): %v", tt.payload, err)
		}
		if got != tt.want {
			t.Fatalf("mqttMediaCommandToKey(%q) = %q, want %q", tt.payload, got, tt.want)
		}
	}

	if _, err := mqttMediaCommandToKey("NOPE"); err == nil {
		t.Fatal("expected error for unknown command")
	}
}
