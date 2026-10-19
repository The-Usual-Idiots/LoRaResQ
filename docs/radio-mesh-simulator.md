# LoRaResQ Multi-Node RF Mesh Simulator

The **Multi-Node RF Mesh Simulator** models physical-layer Semtech SX1262 LoRa transmission, controlled flooding, CSMA/CA backoff, passive overhearing (Passive ACKs), and store-and-forward queueing in software before physical hardware integration.

---

## 1. Architecture

The simulator is implemented in TypeScript and consists of two layers:
1. **Mesh Simulation Engine ([`src/lib/simulator/meshSimulator.ts`](file:///c:/Users/tanis/Documents/VSC%20Projects/The%20Usual%20Idiots/LoRaResQ/src/lib/simulator/meshSimulator.ts)):**
   - Models individual mesh nodes (`SimulatedMeshNode`) with internal state, client lease registries, deduplication ring buffers, and store-and-forward queues.
   - Calculates exact physical **Time-on-Air (ToA)** based on Semtech SX1262 formulas ($SF = 9, BW = 125\text{ kHz}, CR = 4/5$).
   - Models path loss, RF link SNR/RSSI, packet drop rates, and network partitions between nodes.
   - Implements **Stop-and-Wait with Passive Overhearing** to confirm multi-hop deliveries without explicit ACK packet overhead.
2. **Standalone Gateway Server ([`simulator/server.ts`](file:///c:/Users/tanis/Documents/VSC%20Projects/The%20Usual%20Idiots/LoRaResQ/simulator/server.ts)):**
   - Launches three independent WebSocket gateway servers representing distinct physical geographic nodes:
     - **Node 1 (Alpha):** `ws://localhost:8081/ws` (Relief Camp Alpha)
     - **Node 2 (Bravo):** `ws://localhost:8082/ws` (Waypoint Relay Bravo)
     - **Node 3 (Charlie):** `ws://localhost:8083/ws` (Forest Hamlet Charlie)
   - Enables simultaneous multi-browser or multi-tab testing, allowing developers to switch gateways in the web console and observe multi-hop routing in real time.

---

## 2. Running the Simulator

### Step 1: Start the Gateway Server
```bash
npm run sim
```

Output:
```text
[LoRaResQ Simulator] Initializing 3-node RF mesh...
[LoRaResQ Simulator] Node 1 (Relief Camp Alpha) listening on ws://localhost:8081/ws
[LoRaResQ Simulator] Node 2 (Waypoint Relay Bravo) listening on ws://localhost:8082/ws
[LoRaResQ Simulator] Node 3 (Forest Hamlet Charlie) listening on ws://localhost:8083/ws
[LoRaResQ Simulator] Multi-node RF simulator online.
```

### Step 2: Start the Web Console
In a second terminal:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000). Use the **Gateway Switcher** dropdown in the top command header to connect to Port 8081, 8082, or 8083.

---

## 3. Running Automated Tests

To run the Vitest test suite that verifies the simulation engine:
```bash
npm test
```

Tests verify:
* 1:1 message delivery across multi-hop relays ($A \to B \to C$) and passive ACK triggering.
* 256-entry duplicate suppression ring buffer.
* Store-and-forward spooling on the serving node when a recipient is offline, with automatic flushing upon reconnection.
* 14-byte binary packet serialization, CRC, and AES-128-GCM authentication tags.
