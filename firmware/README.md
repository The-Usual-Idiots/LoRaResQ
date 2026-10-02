# ESP32 firmware

`esp32_server/esp32_server.ino` is the only supported firmware. The ESP32 is
the BLE GATT server and both Android apps are BLE clients.

## Connection plan

1. Both phones scan for the advertised `LoRaResQ ESP32` node.
2. Phone A connects, subscribes to notifications, and sends its participant
   identity.
3. The ESP32 immediately restarts advertising after every connection, so Phone
   B can connect without waiting for Phone A to disconnect.
4. Phone B registers its identity. The complete roster is sent to both
   subscribed clients.
5. Each phone sends a presence heartbeat and answers the ESP32 probe. The
   server removes only participants that miss two probes, so an active client
   remains connected and visible.

The sketch uses the framed protocol in `lib/data/mesh_protocol.dart` and keeps
the connection/roster/message state on the ESP32. Generated Arduino output is
ignored by `firmware/.gitignore`; only the source sketch is committed.

## Build and flash

Open the sketch in Arduino IDE or build it with Arduino CLI after installing
the ESP32 Arduino core and NimBLE-Arduino:

```text
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/esp32_server
arduino-cli upload -p <port> --fqbn esp32:esp32:esp32 firmware/esp32_server
```

Use a 115200-baud serial monitor and confirm `[LoRaResQ] READY`. The serial
trace should show two `BLE_CONNECTED` events and `ROSTER_UPDATED` with two
participants while both apps remain open.
