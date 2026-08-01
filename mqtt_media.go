package kvm

import (
	"fmt"
	"strings"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

// MQTT media command payloads (also used as HA button payload_press values).
const (
	mqttMediaPlayPause  = "PLAY_PAUSE"
	mqttMediaPlay       = "PLAY"
	mqttMediaPause      = "PAUSE"
	mqttMediaNext       = "NEXT"
	mqttMediaPrevious   = "PREVIOUS"
	mqttMediaVolumeUp   = "VOLUME_UP"
	mqttMediaVolumeDown = "VOLUME_DOWN"
	mqttMediaMute       = "VOLUME_MUTE"
	mqttMediaStop       = "STOP"
)

type mqttMediaButton struct {
	objectID string
	name     string
	payload  string
	icon     string
}

var mqttMediaButtons = []mqttMediaButton{
	{objectID: "media_play_pause", name: "Media Play/Pause", payload: mqttMediaPlayPause, icon: "mdi:play-pause"},
	{objectID: "media_next", name: "Media Next", payload: mqttMediaNext, icon: "mdi:skip-next"},
	{objectID: "media_previous", name: "Media Previous", payload: mqttMediaPrevious, icon: "mdi:skip-previous"},
	{objectID: "media_volume_up", name: "Media Volume Up", payload: mqttMediaVolumeUp, icon: "mdi:volume-plus"},
	{objectID: "media_volume_down", name: "Media Volume Down", payload: mqttMediaVolumeDown, icon: "mdi:volume-minus"},
	{objectID: "media_mute", name: "Media Mute", payload: mqttMediaMute, icon: "mdi:volume-off"},
	{objectID: "media_stop", name: "Media Stop", payload: mqttMediaStop, icon: "mdi:stop"},
}

func mqttMediaCommandToKey(payload string) (string, error) {
	switch strings.ToUpper(strings.TrimSpace(payload)) {
	case mqttMediaPlayPause, mqttMediaPlay, mqttMediaPause:
		return "MediaPlayPause", nil
	case mqttMediaNext:
		return "MediaTrackNext", nil
	case mqttMediaPrevious:
		return "MediaTrackPrevious", nil
	case mqttMediaVolumeUp:
		return "VolumeUp", nil
	case mqttMediaVolumeDown:
		return "VolumeDown", nil
	case mqttMediaMute, "MUTE":
		return "Mute", nil
	case mqttMediaStop:
		return "MediaStop", nil
	default:
		return "", fmt.Errorf("unknown media command %q", payload)
	}
}

func pulseMediaKeyByName(name string) error {
	code, ok := hidKeys[name]
	if !ok {
		return fmt.Errorf("unknown media key %q", name)
	}
	// KeypressReport auto-releases; media keys are routed to Consumer Control.
	return rpcKeypressReport(code, true)
}

func (m *MQTTManager) handleMediaCommand(client mqtt.Client, msg mqtt.Message) {
	if !m.actionsAllowed() {
		mqttLogger.Warn().Msg("media command rejected: actions are disabled")
		return
	}

	payload := strings.TrimSpace(string(msg.Payload()))
	keyName, err := mqttMediaCommandToKey(payload)
	if err != nil {
		mqttLogger.Warn().Str("payload", payload).Msg("unknown media command")
		return
	}

	mqttLogger.Info().Str("payload", payload).Str("key", keyName).Msg("received media command")

	go func() {
		if err := pulseMediaKeyByName(keyName); err != nil {
			mqttLogger.Error().Err(err).Str("key", keyName).Msg("failed to send media key via MQTT")
		}
	}()
}
