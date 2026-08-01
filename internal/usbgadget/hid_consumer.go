package usbgadget

// Consumer Control shares the keyboard HID interface (hid.usb0 / /dev/hidg0).
// Linux f_hid caps instances at HIDG_MINORS=4; JetKVM already uses all four
// (keyboard, abs mouse, rel mouse, wake), so a separate hid.usb4 is impossible.

const (
	keyboardReportID byte = 0x01
	consumerReportID byte = 0x02
)

// Internal sentinel key codes (not real keyboard-page usages). Macros/UI use
// names like MediaPlayPause; these bytes are stripped and sent as Consumer Control.
const (
	keyboardKeyMute               byte = 0x7f // real Keyboard Mute → Consumer Mute
	keyboardKeyVolumeUp           byte = 0x80 // real Keyboard Volume Up → Consumer Vol Up
	keyboardKeyVolumeDown         byte = 0x81 // real Keyboard Volume Down → Consumer Vol Down
	keyboardKeyMediaPlayPause     byte = 0xf1
	keyboardKeyMediaTrackNext     byte = 0xf2
	keyboardKeyMediaTrackPrevious byte = 0xf3
	keyboardKeyMediaStop          byte = 0xf4
)

// Consumer Control report bitfield (matches descriptor order under Report ID 2)
const (
	consumerBitVolumeUp      byte = 1 << 0 // Usage 0xE9
	consumerBitVolumeDown    byte = 1 << 1 // Usage 0xEA
	consumerBitMute          byte = 1 << 2 // Usage 0xE2
	consumerBitPlayPause     byte = 1 << 3 // Usage 0xCD
	consumerBitTrackNext     byte = 1 << 4 // Usage 0xB5
	consumerBitTrackPrevious byte = 1 << 5 // Usage 0xB6
	consumerBitStop          byte = 1 << 6 // Usage 0xB7
)

var keyboardMediaKeyBits = map[byte]byte{
	keyboardKeyVolumeUp:           consumerBitVolumeUp,
	keyboardKeyVolumeDown:         consumerBitVolumeDown,
	keyboardKeyMute:               consumerBitMute,
	keyboardKeyMediaPlayPause:     consumerBitPlayPause,
	keyboardKeyMediaTrackNext:     consumerBitTrackNext,
	keyboardKeyMediaTrackPrevious: consumerBitTrackPrevious,
	keyboardKeyMediaStop:          consumerBitStop,
}

// isKeyboardMediaKey reports whether key is routed to Consumer Control.
func isKeyboardMediaKey(key byte) bool {
	_, ok := keyboardMediaKeyBits[key]
	return ok
}

// keyboardMediaKeyToConsumerBit maps a media key sentinel to its consumer bit, or 0.
func keyboardMediaKeyToConsumerBit(key byte) byte {
	return keyboardMediaKeyBits[key]
}

// stripMediaKeys removes media keys from a 6-slot keyboard key buffer (compact non-zero keys left).
// Returns cleaned keys (same length as input, padded with zeros) and OR of consumer bits for removed keys.
func stripMediaKeys(keys []byte) (cleaned []byte, consumerBits byte) {
	if keys == nil {
		return nil, 0
	}

	cleaned = make([]byte, 0, len(keys))
	for _, key := range keys {
		if key == 0 {
			continue
		}
		if isKeyboardMediaKey(key) {
			consumerBits |= keyboardMediaKeyToConsumerBit(key)
			continue
		}
		cleaned = append(cleaned, key)
	}

	for len(cleaned) < len(keys) {
		cleaned = append(cleaned, 0)
	}

	return cleaned, consumerBits
}

// consumerControlReportDesc is appended to the keyboard HID descriptor as a
// second Application Collection (Report ID 2).
var consumerControlReportDesc = []byte{
	0x05, 0x0C, // Usage Page (Consumer)
	0x09, 0x01, // Usage (Consumer Control)
	0xA1, 0x01, // Collection (Application)
	0x85, consumerReportID, // Report ID (2)
	0x15, 0x00, // Logical Minimum (0)
	0x25, 0x01, // Logical Maximum (1)
	0x09, 0xE9, // Usage (Volume Increment)
	0x09, 0xEA, // Usage (Volume Decrement)
	0x09, 0xE2, // Usage (Mute)
	0x09, 0xCD, // Usage (Play/Pause)
	0x09, 0xB5, // Usage (Scan Next Track)
	0x09, 0xB6, // Usage (Scan Previous Track)
	0x09, 0xB7, // Usage (Stop)
	0x75, 0x01, // Report Size (1)
	0x95, 0x07, // Report Count (7)
	0x81, 0x02, // Input (Data,Var,Abs)
	0x95, 0x01, // Report Count (1) padding
	0x81, 0x03, // Input (Cnst,Var,Abs)
	0xC0, // End Collection
}

// ConsumerControlReport writes a Consumer Control report on hidg0 (Report ID 2)
// and updates u.consumerState after a successful write.
func (u *UsbGadget) ConsumerControlReport(bits byte) error {
	u.keyboardLock.Lock()
	defer unlockWithLog(&u.keyboardLock, u.log, "consumerControl wrote")

	if err := u.openKeyboardHidFileLocked(false); err != nil {
		return err
	}

	_, err := u.writeWithTimeout(u.keyboardHidFile, []byte{consumerReportID, bits})
	if err != nil {
		u.logWithSuppression("consumerWriteHidFile", 100, u.log, err, "failed to write consumer report to hidg0")
		u.closeKeyboardHidFileLocked()
		return err
	}
	u.resetLogSuppressionCounter("consumerWriteHidFile")
	u.consumerState = bits
	return nil
}
