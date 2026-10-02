# Radio mesh simulator slice

This slice validates the forwarding rules before a LoRa driver is connected to
the ESP32 firmware. It is deliberately an in-memory protocol core, not a claim
that radio transmission works yet.

## Packet rules

Each packet contains a network ID, stable source ID, message ID, destination,
packet type, hop limit, creation/expiry timestamps and a bounded payload.
Packets are UTF-8 JSON for simulator readability; the hardware implementation
must replace this with the versioned, authenticated radio encoding described in
`PLAN.md` before field use.

`RadioMeshEngine` applies the controlled-flooding rules:

- reject packets from another network;
- reject expired packets;
- remember each `(source ID, message ID)` once to suppress duplicates;
- deliver packets addressed to the node or the `community` destination;
- forward an eligible packet at most once with its hop limit decremented; and
- stop forwarding when the hop limit reaches zero.

## Run the test

```text
flutter test test/radio_mesh_test.dart
```

The test covers encode/decode, A->B->C forwarding, duplicate suppression,
wrong-network rejection, expiry, hop exhaustion and packet-size limits.

The next hardware phase still requires selecting the exact LoRa module,
frequency profile, wiring and a second radio node. This simulator must not be
presented as evidence of radio range or delivery reliability.
