# LoRaResQ Protocol Specification (v2.0)

> [!NOTE]
> **Architectural Transition Notice:** The legacy Bluetooth Low Energy (BLE GATT) bridge specified in v1.0 has been **superseded** by the standalone **Wi-Fi SoftAP Captive Portal + WebSockets** architecture in accordance with `blueprint.md` v2.0. This eliminates browser incompatibility (especially iOS Mobile Safari) and the requirement for secure HTTPS contexts on air-gapped emergency hardware.

The LoRaResQ system utilizes a **two-tier protocol hierarchy**:
1. **Tier 1 / Tier 2: Client-to-Node Local Bridge** (Wi-Fi SoftAP, HTTP Captive Portal, and WebSocket Frames)
2. **Tier 3: Node-to-Node Over-The-Air LoRa Mesh Transport** (14-Byte Binary Packets with AES-128-GCM and Passive ACKs)

---

## 1. Client-to-Node Local Bridge (Wi-Fi & WebSockets)

Each LoRaResQ node functions as an autonomous Wi-Fi access point and local web server.

### Network Configuration
* **SSID:** `LoRaResQ-Alpha` (or node-configured callsign, e.g. `LoRaResQ-0x0001`)
* **Security:** Open / Unencrypted (802.11 b/g/n, Channel 6) for instant civilian triage
* **IPv4 Address:** `192.168.4.1` (Subnet: `255.255.255.0`)
* **DNS Server (Port 53):** Wildcard DNS responder directing all queries to `192.168.4.1` (Captive Portal)
* **HTTP Web Server (Port 80):** Serves Tier 1 Captive Splash (`<10 KB`) and statically exported Next.js 15 PWA
* **WebSocket Server (Port 81):** Real-time bidirectional JSON frame multiplexer (`ws://192.168.4.1:81/ws`)

### WebSocket Frame Schema

All WebSocket frames are serialized as UTF-8 JSON objects.

#### A. Inbound Frames (Client → ESP32 / Simulator)

| Frame Type | Key Payload Fields | Description |
| :--- | :--- | :--- |
| `CLIENT_HELLO` | `deviceUuid`, `displayName`, `deviceModel` | Initial handshake registering civilian identity and lease with the node. |
| `HEARTBEAT` | `deviceUuid` | Keepalive frame sent every 15 seconds to maintain client lease. |
| `SEND_PERSONAL` | `messageId`, `recipientUuid`, `recipientName`, `body` | Transmits an encrypted 1:1 message (destined for local client or LoRa mesh). |
| `SEND_GLOBAL` | `messageId`, `body`, `isEmergencyAlert` | Transmits a broadcast announcement to the mesh community feed. |
| `SEND_SOS` | `messageId`, `body`, `location` | High-priority emergency broadcast preempting routine queue. |
| `UPDATE_LOCATION` | `location: DeviceLocation` | Overwrites the client's latest registered GPS coordinates (1-row overwrite). |
| `ADMIN_AUTH` | `password` | Authenticates administrative session (`admin123` by default). |
| `UPDATE_CONFIG` | `token`, `config: NodeConfig` | Updates node runtime parameters (RF channel, TX power, SSID). |

#### B. Outbound Frames (ESP32 / Simulator → Client)

| Frame Type | Key Payload Fields | Description |
| :--- | :--- | :--- |
| `NODE_HELLO` | `nodeInfo`, `roster`, `recentGlobal`, `queuedPersonal`, `isSimulated` | Initial state response carrying node health, connected peers, and recent messages. |
| `HEARTBEAT_ACK` | `timestamp` | Acknowledges receipt of client heartbeat. |
| `NEW_PERSONAL_MESSAGE` | `message: PersonalMessage` | Delivers an incoming 1:1 message to the recipient client. |
| `NEW_GLOBAL_MESSAGE` | `message: GlobalMessage` | Pushes a received mesh broadcast announcement to the feed. |
| `EMERGENCY_ALERT` | `alert: GlobalMessage` | Dispatches high-priority SOS alert (triggers local acoustic siren). |
| `MESSAGE_STATUS_UPDATE` | `messageId`, `status`, `deliveredTimestamp` | Notifies sender of message delivery state (`pending` vs `delivered`). |
| `ROSTER_UPDATE` | `roster: UserProfile[]` | Broadcasts refreshed civilian mesh peer registry. |
| `ADMIN_AUTH_RESULT` | `success`, `token`, `error` | Reports result of administrative authentication attempt. |

---

## 2. Node-to-Node Over-The-Air LoRa Protocol

Over-the-air communication between LoRa nodes operates on **865.125 MHz** (India SRD Channel 15) using an authenticated, packed binary framing format.

### Physical RF Parameters
* **Transceiver:** Semtech SX1262 (EBYTE E22-900T22D module)
* **Operating Frequency:** 865.125 MHz (Channel 15, GSR 564(E) license-exempt SRD band)
* **Bandwidth (BW):** 125 kHz
* **Spreading Factor (SF):** 9
* **Coding Rate (CR):** 4/5
* **Preamble Length:** 8 symbols
* **Transmit Power:** 22 dBm (160 mW ERP max legal limit)
* **Maximum PHY Packet Size:** 255 bytes

### Binary Packet Structure (14-Byte Fixed Header)

Every over-the-air frame starts with an unencrypted 14-byte transport header, followed by an encrypted payload and a 16-byte authentication tag:

```
+--------+--------+--------+--------+--------+--------+--------+--------+
| Byte 0 | Byte 1 | Byte 2 | Byte 3 | Byte 4 | Byte 5 | Byte 6 | Byte 7 |
| Magic  | Version| Net ID | Class  |           Message ID            |
| (0x52) | (0x02) | (0x26) | (Type) |          (32-bit uint)          |
+--------+--------+--------+--------+--------+--------+--------+--------+
| Byte 8 | Byte 9 | Byte 10| Byte 11| Byte 12| Byte 13| 14 .. 13+N     |
| Source Node ID  |  Dest Node ID   |  Hop   | Payload| Ciphertext     |
| (16-bit uint)   | (16-bit uint)   | Limit  | Length | Payload        |
+--------+--------+--------+--------+--------+--------+----------------+
| (14+N) .. (29+N)                                                     |
| 16-Byte Cryptographic Authentication Tag (AES-128-GCM Tag)           |
+----------------------------------------------------------------------+
```

#### Field Specifications:

| Offset | Size (Bytes) | Field Name | Type | Value / Purpose |
| :---: | :---: | :--- | :--- | :--- |
| `0` | 1 | `Magic` | `uint8` | Fixed constant `0x52` (`'R'`) |
| `1` | 1 | `Version` | `uint8` | Fixed constant `0x02` (Protocol Version 2) |
| `2` | 1 | `Network ID` | `uint8` | Fixed constant `0x26` (Network isolation identifier) |
| `3` | 1 | `Packet Class` | `uint8` | `0x01` Direct Text, `0x02` Global Chat, `0x03` SOS Alert, `0x04` Node Beacon, `0x05` Passive ACK |
| `4` | 4 | `Message ID` | `uint32` (BE) | Monotonic message identifier (used for 64-bit deduplication key) |
| `8` | 2 | `Source Node ID` | `uint16` (BE) | Originating gateway node ID (`0x0001` to `0xfffe`) |
| `10` | 2 | `Dest Node ID` | `uint16` (BE) | Destination node ID (`0xffff` for mesh broadcast) |
| `12` | 1 | `Hop Limit` | `uint8` | Time-to-Live hop counter (starts at 3, decremented on relay) |
| `13` | 1 | `Payload Length` | `uint8` | Ciphertext length $N$ (maximum 225 bytes) |
| `14` | $N$ | `Ciphertext` | `bytes` | AES-128-GCM encrypted application payload |
| `14+N` | 16 | `Auth Tag` | `bytes` | Cryptographic authentication tag (tamper detection) |

---

## 3. Mesh Routing & Transmission Control

1. **Stop-and-Wait with Passive Overhearing:**
   - To conserve airtime on half-duplex LoRa channels, nodes utilize **Passive Acknowledgements (Passive ACKs)**. When Node 1 relays to Node 2 destined for Node 3, Node 1 listens for Node 2 forwarding the packet to Node 3. Overhearing Node 2's transmission serves as an implicit ACK, eliminating explicit ACK packet overhead.
2. **Duplicate Suppression:**
   - Every node maintains a 256-entry FIFO ring buffer of 64-bit keys:
     $$\text{Key} = (\text{SourceNodeID} \ll 32) \mid \text{MessageID}$$
   - Any packet whose key is already present in the cache is discarded immediately.
3. **SNR-Weighted Jitter Backoff:**
   - To prevent packet collisions during controlled flooding, relay nodes apply a randomized delay inversely proportional to signal quality before retransmitting:
     $$T_{\text{delay}} = T_{\text{base}} + \text{Uniform}(0, T_{\text{jitter}}) \times \frac{1}{\text{SNR}_{\text{norm}}}$$
4. **Store-and-Forward Retention:**
   - Undelivered 1:1 messages are spooled to the serving node's MicroSD card storage for up to **7 days**.
   - Global announcements and emergency broadcasts are retained for up to **30 days**.
