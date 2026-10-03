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
| 5 | `PARTICIPANT_HELLO` | Phone → node |
| 6 | `PARTICIPANT_ROSTER` | Node → phone |
| 7 | `PARTICIPANT_ROSTER_REQUEST` | Phone → node |
| 8 | `MESSAGE_BROADCAST` | Node → all subscribed phones |
| 9 | `ALERT_BROADCAST` | Node → all subscribed phones |
| 10 | `PARTICIPANT_PRESENCE_PROBE` | Node → subscribed phones |

`SEND_TEXT` payloads include `messageId`, `senderId`, `destination`, `body`,
`broadcastedAt`, and optional `alertKind`. The ESP32 first responds with a
sequence-matched accepted response, then emits an event. The ESP32 is a
long-lived broker: phones keep their BLE connections open, send HELLO and
heartbeats, and may receive roster or event frames without a preceding
request.

`destination` is either `community` or a participant ID. Community events are
intended for every connected phone. The broker selects the destination participant and records it in the event.
The Arduino BLE facade used by this firmware exposes one shared notification
characteristic, so packets are fanned out at the BLE layer while the app
enforces the destination filter and discards direct events addressed to
another participant. A direct event from the local participant is not added to
the sender's history. Apps use the message ID to change the sender's local
community record to `Broadcasted` and to deduplicate incoming records.

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

`PARTICIPANT_HELLO` carries the app's stable participant ID and display name
after BLE connection. The reference firmware retains up to eight participant
identities and uses the ID as the deduplication key. A new ID is stored once;
a repeated ID refreshes its connection association and heartbeat instead of
creating another row. Display names are also unique, so a different ID using
an existing name is rejected without changing the stored participant.

For every HELLO, the node sends a sequence-matched `STATUS` response to the
joining phone with `state: "participantAccepted"`, a boolean `stored` field,
and the complete `participants` array. When a new ID is stored, it also emits
one `PARTICIPANT_ROSTER` notification to all subscribed phones, including
already-connected phones. Flutter applies the roster from either the
acknowledgement or the unsolicited roster event, so the joining phone does
not depend on notification timing.

The current bridge uses a simple in-memory roster and is not yet persisted
across ESP32 reboot. A normal BLE disconnect removes that connection's
participant immediately and broadcasts the updated roster to the remaining
clients. Clients refresh their participant hello every five seconds. The bridge
also expires participants after two missed ten-second probes, covering silent
radio loss or sudden power-off where the BLE disconnect callback may not run.
The notify characteristic also exposes the current roster as a plain readable
JSON value. After connecting, and whenever the user opens the roster, Flutter
performs one direct GATT read of that value. This keeps roster retrieval
independent from framed notification ordering and request timeouts.

Every ten seconds, the node probes each participant in its table with a
`PARTICIPANT_PRESENCE_PROBE`. A connected app answers with a sequence-matched
`STATUS` payload containing `state: "participantPresenceAck"` and its
`participantId`. The node clears that participant's missed-probe count when
the response arrives. A participant that misses two consecutive probes is
removed, and the changed roster is then broadcast to the remaining phones.

The Flutter transport serializes all writes per BLE connection, waits 25 ms
between chunks and retries Android `WRITE_REQUEST_BUSY` responses up to three
times. This is required because ATT write requests must not overlap.

## Serial trace

The reference firmware logs the complete BLE bridge lifecycle at 115200 baud.
Each line begins with `[LoRaResQ]` and an event name:

| Event | Meaning |
|---|---|
| `BOOT` / `READY` | Firmware startup and advertising is ready |
| `BLE_CONNECTED` / `BLE_DISCONNECTED` | BLE client count changed |
| `IN_CHUNK` / `OUT_CHUNK` | BLE bytes received or notified |
| `IN_FRAME` / `OUT_FRAME` | Complete protocol frame received or sent |
| `FRAME_REJECTED` / `FRAME_IGNORED` | Invalid or unsupported input |
| `SEND_TEXT` | Text command payload received |
| `PARTICIPANT_HELLO` | App identity announcement received |
| `PARTICIPANT_STORED` / `PARTICIPANT_REFRESHED` | Registration was added or refreshed without duplication |
| `PARTICIPANT_REJECTED_DUPLICATE_NAME` | Registration was rejected because its display name is already used |
| `ROSTER_UPDATED` / `ROSTER_CLEARED` | Participant roster changed |

Do not treat serial output as proof of LoRa delivery; it proves only the local
BLE bridge activity.

## Firmware entry point

The Arduino-compatible reference bridge is in
`firmware/esp32_server/esp32_server.ino`. It accepts a framed
`SEND_TEXT`, logs the JSON payload over serial, and returns an acceptance
notification. LoRa radio forwarding is intentionally the next firmware step.

## Radio packet simulator slice

The in-memory radio forwarding rules are implemented in
`lib/data/radio_mesh.dart` and cover network isolation, expiry, duplicate
suppression and bounded hop forwarding. They are documented and tested in
`docs/radio-mesh-simulator.md`. This is a software-only acceptance slice; it
does not validate a LoRa module, antenna, frequency profile or range.
