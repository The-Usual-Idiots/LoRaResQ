# First vertical-slice acceptance

This is the Phase 0 acceptance contract for the first implementation slice.
The hardware transport is not required yet; the deterministic fake transport
stands in for the ESP32.

## Scenario

1. Launch the LoRaResQ app.
2. The Home screen shows that no node is connected and provides a connection
   action.
3. Discover and connect to a fake node named `Demo Node`.
4. The Home screen shows the node as connected.
5. Send one bounded short message through the fake node.
6. The UI shows each evidence-based state in order:
   `Accepted by node` → `Queued for radio` → `Sent to mesh`.
7. When the fake node emits a matching acknowledgement, the UI shows
   `Acknowledged`.

## Failure requirements

- A disconnected or unsupported transport must not appear connected.
- A message must not show `Acknowledged` without a matching acknowledgement
  event.
- An overlong message must be rejected before it is sent.
- Transport failures must be visible as an error state; they must not become a
  successful-looking fallback.

## Test evidence

The scenario will be covered by Flutter widget tests once the app shell and
fake transport phases are implemented. Hardware and BLE are intentionally
outside this Phase 0 contract.
