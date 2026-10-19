# LoRaResQ Software Acceptance & Verification Contract (v2.0)

> [!NOTE]
> This document specifies the acceptance criteria for the current software slice (Next.js 15 PWA, multi-node RF simulator, and ESP32 SoftAP firmware). Legacy Flutter references have been replaced.

---

## 1. Acceptance Scenarios

### Scenario A: Standalone Multi-Node Mesh Simulation
1. **Launch Gateway Simulator:** Run `npm run sim` in terminal. Three virtual nodes initialize on ports 8081 (Alpha), 8082 (Bravo), and 8083 (Charlie).
2. **Launch Web Console:** Run `npm run dev` and navigate to `http://localhost:3000`.
3. **Verify Gateway Switcher:** Switch between Node 1 (Alpha) and Node 2 (Bravo). Verify that `NodeTransport` updates connection status to `VIRTUAL MESH` and displays correct frequency (865.125 MHz, Ch 15).
4. **Send 1:1 Personal Message:**
   - Select recipient from civilian roster.
   - Dispatch message: the delivery pipeline micro-stepper advances from `Queued` → `MicroSD` → `Mesh Hop` → `Delivered (ACK)` upon multi-hop relay.
5. **Send High-Priority Emergency SOS:**
   - Trigger 2.2-second press-and-hold safety button on Emergency SOS tab.
   - Verify that the local acoustic Web Audio siren starts oscillating (800/1200 Hz).
   - Verify that connected simulator nodes log high-priority preemptive delivery.

### Scenario B: Physical ESP32 Standalone Hardware (Loopback HAL Mode)
1. **Flash Bare ESP32:** Compile and upload `firmware/esp32_server/esp32_server.ino` using `arduino-cli`.
2. **Connect to SoftAP:** Connect laptop or smartphone to the open Wi-Fi network `LoRaResQ-Alpha`.
3. **Captive Portal Verification:** Operating system triggers the sign-in sheet redirecting to `http://192.168.4.1/`.
4. **WebSocket Connection:** Web console establishes WebSocket connection on `ws://192.168.4.1:81/ws` and displays `ESP32 HARDWARE`.
5. **Radio HAL Auto-Detection:** Inspect serial logs (`115200 baud`) to verify that floating GPIO 17/18 triggers the loopback warning: `"Radio HAL active in Loopback/Emulation Mode"`.
6. **Physical Enclosure Button SOS:** Press the tactile BOOT button (GPIO 0) on the ESP32. Confirm that the status LED enters emergency strobe mode and broadcasts an SOS alert frame.

---

## 2. Failure & Non-Negotiable Boundary Requirements

* **Zero Hardware Simulation Masking:** When connected to physical ESP32 hardware without an EBYTE E22 LoRa module, the UI and serial monitor must report `HAL Emulation Mode` and must never pretend real RF transmission occurred.
* **Overlong Message Bounds:** Payloads exceeding the Semtech SX1262 255-byte PHY boundary must be rejected before serialization.
* **Cryptographic Tamper Rejection:** Any packet whose 16-byte authentication tag does not verify must be rejected with an explicit integrity error.
* **Idempotent Deduplication:** Multiple receptions of the same `(sourceNodeId, messageId)` pair must be dropped by the 256-entry ring buffer without emitting duplicate events.

---

## 3. Automated Test Evidence

Automated verification is executed using Vitest:

```bash
npm test
```

Current test suites:
1. `tests/binaryPacket.test.ts`: Verifies 14-byte binary transport header packing, big-endian byte order, AES-128-GCM tag verification, and 255-byte boundary enforcement.
2. `tests/meshRouting.test.ts`: Verifies multi-hop relay (A → B → C), passive ACK overhearing, duplicate suppression, and store-and-forward queueing.
3. `tests/offlineStore.test.ts`: Verifies IndexedDB CRUD operations and fallback storage across page reloads.
