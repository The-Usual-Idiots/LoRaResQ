# LoRaResQ BLE protocol v1

This protocol is the phone-to-ESP32 bridge used by the current hardware slice.
It is intentionally separate from the later LoRa mesh packet format.

## BLE service

| Item | UUID | Properties |
|---|---|---|
| Service | `7f6c0001-6b52-4f5d-9a5e-4f6c6f726151` | Primary |
| Phone writes | `7f6c0002-6b52-4f5d-9a5e-4f6c6f726151` | Write |
| Node notifies | `7f6c0003-6b52-4f5d-9a5e-4f6c6f726151` | Notify |

The node advertises as `LoRaResQ ESP32` and advertises the service UUID.

## Frame

All multi-byte integers are unsigned little-endian.

| Offset | Size | Field |
|---:|---:|---|
| 0 | 1 | Magic `0x4c` (`L`) |
| 1 | 1 | Magic `0x51` (`Q`) |
| 2 | 1 | Protocol version, currently `1` |
| 3 | 1 | Frame type |
| 4 | 2 | Sequence number |
| 6 | 2 | UTF-8 JSON payload length |
| 8 | N | UTF-8 JSON payload |

Current frame types:

| Value | Type | Direction |
|---:|---|---|
| 0 | `HELLO` | Node → phone |
| 1 | `STATUS` / accepted response | Node → phone |
| 2 | `SEND_TEXT` | Phone → node |
| 3 | `MESSAGE_RECEIVED` | Node → phone |
| 4 | `ERROR` | Node → phone |

Payload is a bounded JSON object for this bridge slice. The message body is
limited to 120 characters by the app and must be validated again by firmware.
Unknown versions, malformed headers, mismatched lengths and oversized payloads
must be rejected.

## BLE chunking

Frames are split into 20-byte chunks for the default ATT payload. The receiver
reassembles chunks using the declared payload length. A notification may
contain only one complete frame or the beginning/continuation of a frame.

## Example

`SEND_TEXT` payload:

```json
{"destination":"community","body":"Meet at the school"}
```

The current bridge responds with a `STATUS` frame carrying the sequence and:

```json
{"id":"esp32-accepted","state":"acceptedByNode"}
```

This response confirms BLE acceptance by the ESP32 only. It is not proof of
LoRa transmission, mesh forwarding, recipient receipt or emergency response.

## Firmware entry point

The Arduino-compatible reference bridge is in
`firmware/esp32_ble_bridge/esp32_ble_bridge.ino`. It accepts a framed
`SEND_TEXT`, logs the JSON payload over serial, and returns an acceptance
notification. LoRa radio forwarding is intentionally the next firmware step.
