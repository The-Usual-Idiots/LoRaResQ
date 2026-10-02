# LoRaResQ

LoRaResQ is an offline-first Flutter client for a local LoRaResQ mesh. The
phone or desktop app will connect to an ESP32 personal node; nodes, rather
than the apps, carry messages through the mesh.

The current vertical slice uses a deterministic **Demo Node** so the app can
be tested before ESP32 firmware and BLE transport are integrated.

## Run the demo

```text
flutter run -d windows
flutter run -d chrome
```

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
