# LoRaResQ

LoRaResQ is an offline-first Flutter client for a local LoRaResQ mesh. The
phone or desktop app will connect to an ESP32 personal node; nodes, rather
than the apps, carry messages through the mesh.

The current vertical slice uses a deterministic **Demo Node** so the app can
be tested before ESP32 firmware and BLE transport are integrated.

The application entry point now uses the real BLE transport. The Demo Node is
kept only through injected test controllers; a physical run requires the
reference ESP32 BLE bridge in `firmware/esp32_ble_bridge/`.

## Run the demo

```text
flutter run -d windows
flutter run -d chrome
```

For a physical BLE test:

1. Open `firmware/esp32_ble_bridge/esp32_ble_bridge.ino` in Arduino IDE or
   PlatformIO.
2. Install the ESP32 Arduino core and the ESP32 BLE library, select your ESP32
   board and port, then upload the sketch.
3. Open the serial monitor at `115200` baud and confirm
   `[LoRaResQ] READY`.
4. On Android, Windows, or a Web Bluetooth-capable Chrome/Edge page, run the
   app and select **Find node**.
5. Select **LoRaResQ ESP32**, open **Messages**, enter a short message, and
   select **Send to mesh**.
6. Confirm the app shows **Accepted by node** and the serial monitor prints
   `SEND_TEXT` with the JSON payload.

The Serial Monitor logs startup, BLE connect/disconnect events, inbound and
outbound chunks and frames, rejected or ignored frames, participant identity
announcements, roster changes, and message payloads. Filter for `[LoRaResQ]`
when reviewing the trace. This output proves app-to-ESP32 BLE activity only;
it does not prove LoRa transmission or recipient delivery.

The reference sketch currently proves real BLE discovery, connection,
chunked-frame transfer, and ESP32 acknowledgement. It does not yet send the
payload over LoRa; that is the next firmware/radio phase.

### Radio forwarding simulator

Before LoRa hardware is selected, the controlled-forwarding rules can be tested
in memory:

```text
flutter test test/radio_mesh_test.dart
```

This verifies bounded packets, A->B->C forwarding, duplicate suppression,
network/expiry checks and hop limits. It is not a radio-range or hardware
delivery test. See `docs/radio-mesh-simulator.md`.

When a node is connected, Alerts and Messages are enabled. Messages offer the
community plus every reported participant except the current app as
destinations. The Network screen shows the participant roster when the node
reports one. The reference firmware retains up to eight participant
identities in memory and broadcasts roster updates to connected BLE clients;
the roster is cleared when the last client disconnects or the ESP32 reboots.
Connected apps send a five-second identity heartbeat, and the ESP32 expires
participants after 15 seconds without one.

The app serializes BLE writes, paces frame chunks, and retries transient
`WRITE_REQUEST_BUSY` responses during connection and messaging.
After connecting, it also requests a fresh participant roster and shows
transport errors directly on the Messages and Alerts screens instead of
silently leaving entered text in place.

The sketch uses the Arduino-ESP32 BLE API where `BLECharacteristic::getValue()`
returns an Arduino `String`. If your installed ESP32 library reports a
`std::string` conversion error at the write callback, make sure the sketch
contains `String value = characteristic->getValue();`.

On the Home screen:

1. Select **Find node**.
2. Select **Demo Node**.
3. Open **Messages**, enter a short message, and select **Send to mesh**.
4. Confirm that the message shows **Acknowledged**.
5. Open **Alerts**, choose an alert, add an optional note, and confirm it.
6. Close and relaunch the app, open **Messages**, and verify the message remains.

This demo acknowledgement is simulated. It does not represent radio delivery,
an ESP32 connection, or contact with emergency services.

Message history is stored locally and bounded to the most recent 100 messages.
It is not encrypted at rest yet; do not enter real personal or
emergency-sensitive information into this demo.

## Checks

```text
flutter analyze
flutter test
flutter build web
flutter build windows
flutter build apk --debug
```

The supported-browser plan is documented in
`docs/decisions/0001-web-bluetooth-support.md`. The staged implementation
roadmap is in the session plan and the product/technical blueprint is in
`PLAN.md`.
