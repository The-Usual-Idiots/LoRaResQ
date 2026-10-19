# LoRaResQ Software Architecture & Engineering Audit

**Document:** `SOFTWARE_AUDIT.md`  
**Date:** 2026-10-19  
**Status:** Complete / Static Inspection Only  
**Scope:** Frontend (Next.js 15 PWA), Protocol/Transport Layer, Multi-Node RF Simulator, Storage/IndexedDB, ESP32 Master Firmware, and Tactical Telemetry  
**Authoritative Specification:** `blueprint.md` (v2.0)

---

## 1. Executive Summary

A comprehensive, static read-only architectural audit of the **LoRaResQ** codebase was conducted to inspect three critical system areas:
1. **Community Feed Message Duplication:** Identification of the precise mechanical and algorithmic causes leading to every broadcast message appearing duplicated in the user interface.
2. **Tactical Radar Landmark Modernization:** Architectural evaluation of replacing fixed, hardcoded landmark coordinates with dynamic, coordinate-based geospatial discovery suited for off-grid disaster environments.
3. **Comprehensive Hardcoded, Mocked, Simulated, and Placeholder Inventory:** System-wide catalog of all static values, mock payloads, stubbed functions, and development fallbacks across the frontend, simulator, protocol engine, and ESP32 C++ firmware.

### Key Audit Conclusions

* **Community Feed Duplication Root Cause (Confirmed):** The duplication is caused by a **Message ID Mismatch between the Client's Optimistic State Insertion and the Gateway's Asynchronous Echo-Back Broadcast**. 
  When a user transmits a global broadcast, the frontend immediately generates a client-side ID (e.g., `glob-m83fa9-412`) and prepends it to React state. Simultaneously, the simulator/gateway generates an independent, monotonic sequence ID (e.g., `glob-1-1`) and broadcasts the packet back to *all* connected WebSocket clients—including the originating client. The client's deduplication check compares `m.messageId === msg.messageId`. Because the two IDs differ, deduplication fails and the message is inserted a second time.
* **Tactical Radar Dynamic Discovery:** The current radar implementation relies on an in-memory static array of six Konkan flood-zone landmarks and planar equirectangular pixel math. Because LoRaResQ operates off-grid without internet or cellular infrastructure, dynamic landmark discovery cannot rely on live cloud APIs (such as Google Places or live Overpass queries) during field operations. The recommended architecture is a **dual-stage approach**: an online pre-caching/staging pipeline using OpenStreetMap Overpass data, coupled with an off-grid edge spatial query engine (spatial SQLite R-Tree or GeoJSON bounding box search) running locally on the ESP32 MicroSD card and browser IndexedDB.
* **Hardcoded Data Inventory:** The codebase contains 24 distinct items of hardcoded, mocked, or simulated data. While many serve as necessary development fallbacks for the currently unpopulated hardware (such as the Radio HAL loopback fallback for missing E22 SX1262 modules), critical production blockers exist: hardcoded administrative credentials (`admin123`), fixed static auth tokens (`esp32-valid-token`), hardcoded symmetric XOR encryption keys (`LoRaResQ_SecretK`), mock battery ADC readings, and unpopulated MicroSD SPI FAT32 drivers in firmware.

---

## 2. Repository Areas Inspected and Inspection Limitations

### 2.1 Areas Inspected

The static inspection encompassed the following files and modules:

| Component | File Path | Focus Area |
| :--- | :--- | :--- |
| **Frontend UI / Console** | `src/app/page.tsx` | State lifecycles, message handlers, GPS acquisition, SOS triggers, admin modal |
| **Global Styling & Tokens** | `src/app/globals.css` | Tactical CSS custom properties, responsive breakpoints, layout containers |
| **Tactical Radar & Map** | `src/components/OfflineMap.tsx` | SVG vector radar, equirectangular projection, landmark array, coordinate click handler |
| **Transport Manager** | `src/lib/transport/nodeTransport.ts` | WebSocket client lifecycle, frame dispatch, message ID generation, in-memory fallback |
| **RF Mesh Simulator** | `src/lib/simulator/meshSimulator.ts` | Node simulation, CSMA/CA, Time-on-Air (ToA), passive ACKs, store-and-forward |
| **Simulator Gateway Server** | `simulator/server.ts` | Standalone Node.js WebSocket gateway, 3-port multiplexer (8081–8083), event fan-out |
| **Offline Storage Engine** | `src/lib/storage/offlineStore.ts` | IndexedDB stores, schema migrations, localStorage fallback arrays, outbox queue |
| **Binary Protocol & Crypto** | `src/lib/protocol/binaryPacket.ts` | 14-byte header framing, payload XOR encryption, FNV-1a hash auth tag, ring-buffer keys |
| **Device Identity & Telemetry**| `src/lib/deviceIdentity.ts` | RFC 4122 v4 UUID persistence, User-Agent device model heuristics |
| **Emergency Presets** | `src/lib/emergencyPresets.ts` | Trilingual disaster canned messages (English, Marathi, Hindi) |
| **Acoustic Synthesizer** | `src/lib/alarm.ts` | Web Audio API dual-tone emergency siren oscillator |
| **ESP32 Firmware** | `firmware/esp32_server/esp32_server.ino` | SoftAP, Captive Portal DNS, HTTP server, WebSocket server, Radio HAL, NVS config |
| **Hardware Documentation** | `docs/HARDWARE_INTEGRATION_MATRIX.md` | Pinout assignments, MT3608 multimeter calibration, integration checklists |
| **Specifications & Config** | `blueprint.md`, `PLAN.md`, `.env.example`, `package.json` | System contracts, frequency compliance (865–867 MHz), build parameters |

### 2.2 Inspection Limitations
* **Static Analysis Only:** In accordance with instructions, no processes were executed, no servers were started, no build tasks were run, and no automated tests were triggered.
* **Hardware Absence:** Physical peripherals (E22 SX1262 LoRa module, TX868 antenna, MicroSD card reader, TP4056 charger, MT3608 boost converter) are physically absent, precluding oscilloscope, multimeter, or physical UART logic analysis.

---

## 3. Community Feed: Duplicate Messages Investigation

### 3.1 Problem Statement
When a user posts a message in the Community Feed (Global Chat tab) or dispatches an Emergency SOS broadcast, the sent message appears **twice** in the UI message list.

### 3.2 Evidence and Code Path Trace

To trace the message lifecycle, we examine the path from user submission to rendering.

```
[User Types Message]
       │
       ▼
[page.tsx: handleSendGlobalMessage]
       │
       ├─── 1. Optimistic Insert: setGlobalMessages([newGlobalMsg, ...prev])
       │       (ID: "glob-m83fa9-412" generated by nodeTransport.sendGlobalMessage)
       │
       └─── 2. WebSocket Transmission: SEND_GLOBAL frame dispatched
                   │
                   ▼
       [simulator/server.ts: case 'SEND_GLOBAL']
                   │
                   ▼
       [meshSimulator.ts: sendGlobalMessage]
                   │
                   ├── Generates NEW ID: "glob-1-1" (nodeId + monotonic counter)
                   ├── Dispatches NEW_GLOBAL event to router
                   │
                   ▼
       [simulator/server.ts: onEvent broadcast]
                   │
                   └── Broadcasts NEW_GLOBAL_MESSAGE to ALL clients (including sender!)
                               │
                               ▼
       [nodeTransport.ts: handleInboundFrame -> onNewGlobalMessage]
                               │
                               ▼
       [page.tsx: onNewGlobalMessage callback]
                   │
                   ├── Checks: prev.some(m => m.messageId === "glob-1-1")
                   ├── Comparison: "glob-1-1" vs "glob-m83fa9-412" (MISMATCH!)
                   └── Inserts duplicate: setGlobalMessages([msg, ...prev])
```

#### Step 1: User Submission and Optimistic Insert in `src/app/page.tsx`
Lines 368–387:
```typescript
const handleSendGlobalMessage = (e: React.FormEvent) => {
  e.preventDefault();
  if (!globalMsgInput.trim()) return;

  // Calls transport which generates an optimistic messageId:
  const msgId = transportRef.current?.sendGlobalMessage(globalMsgInput.trim(), false) || 'glob-' + Date.now();

  const newGlobalMsg: GlobalMessage = {
    messageId: msgId,                     // e.g. "glob-m83fa9-412"
    senderUuid: deviceUuid,
    senderName: displayName,
    senderNodeId: nodeInfo.nodeId,
    body: globalMsgInput.trim(),
    originalTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    expiresAt: 'In 30 days',
    hopCount: 0,
  };

  // Optimistic local state insertion:
  setGlobalMessages((prev) => [newGlobalMsg, ...prev]);
  setGlobalMsgInput('');
};
```
*Finding:* The message is inserted directly into the client state using `msgId` generated by `nodeTransport.ts`.

#### Step 2: Message ID Generation in `src/lib/transport/nodeTransport.ts`
Lines 229–248:
```typescript
public sendGlobalMessage(body: string, isEmergencyAlert = false): string {
  const messageId = 'glob-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000);
  const timestamp = Math.floor(Date.now() / 1000);

  const frame: ClientWsMessage = {
    type: 'SEND_GLOBAL',
    messageId,                            // Passed in WebSocket frame
    body,
    originalTimestamp: timestamp,
    isEmergencyAlert,
  };

  if (this.state === 'live' || this.state === 'simulated') {
    this.sendMessage(frame);
  } else {
    enqueueOutbox({ id: messageId, type: 'global', payload: frame });
  }

  return messageId;
}
```
*Finding:* `NodeTransport` generates an alphanumeric ID containing the millisecond timestamp in base-36 and a random suffix (e.g., `glob-m83fa9-412`).

#### Step 3: Server Ingestion and ID Discard in `simulator/server.ts`
Lines 144–154:
```typescript
case 'SEND_GLOBAL': {
  const senderProfile = node.connectedClients.get(clientRef.deviceUuid || '');
  const senderName = senderProfile?.displayName || 'Client';
  node.sendGlobalMessage(
    clientRef.deviceUuid || 'unknown',
    senderName,
    parsed.body,
    parsed.isEmergencyAlert
  );
  break;
}
```
*Finding:* Notice that `simulator/server.ts` parses `parsed.body` and `parsed.isEmergencyAlert`, but **completely ignores `parsed.messageId`**. It does not pass the client's `messageId` into `node.sendGlobalMessage()`.

#### Step 4: Secondary ID Generation in `src/lib/simulator/meshSimulator.ts`
Lines 257–278:
```typescript
public sendGlobalMessage(
  senderUuid: string,
  senderName: string,
  body: string,
  isEmergencyAlert = false
): GlobalMessage {
  const messageId = this.messageCounter++;
  const msgIdStr = `glob-${this.nodeId}-${messageId}`;  // e.g. "glob-1-1"
  const timestamp = Math.floor(Date.now() / 1000);

  const globalMsg: GlobalMessage = {
    messageId: msgIdStr,                               // Discarded client ID replaced here!
    senderUuid,
    senderName,
    senderNodeId: this.config.nodeId,
    body,
    originalTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    expiresAt: 'In 30 days',
    hopCount: 0,
    isEmergencyAlert,
  };

  this.globalMessages.unshift(globalMsg);
  this.emitEvent('NEW_GLOBAL', globalMsg);
  // ...
}
```
*Finding:* `SimulatedMeshNode` assigns its own sequence-based ID (`glob-{nodeId}-{counter}`, such as `glob-1-1`). It then emits a `NEW_GLOBAL` event containing this new ID.

#### Step 5: Unfiltered Broadcast Fan-out in `simulator/server.ts`
Lines 35–81:
```typescript
node.onEvent = (ev) => {
  let msg: NodeWsMessage | null = null;
  // ...
  case 'NEW_GLOBAL':
    msg = {
      type: 'NEW_GLOBAL_MESSAGE',
      message: ev.data as GlobalMessage,
    };
    break;
  // ...
  if (msg) {
    const payload = JSON.stringify(msg);
    for (const client of clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);                       // Broadcasts to ALL clients including SENDER!
      }
    }
  }
};
```
*Finding:* The gateway server broadcasts the message to every connected WebSocket client, including the client connection from which the message originated.

#### Step 6: Deduplication Failure in `src/app/page.tsx`
Lines 210–215:
```typescript
onNewGlobalMessage: (msg) => {
  setGlobalMessages((prev) => {
    if (prev.some((m) => m.messageId === msg.messageId)) return prev;
    return [msg, ...prev];
  });
},
```
*Finding:* The incoming `msg` has `messageId: "glob-1-1"`. The state array `prev` contains `messageId: "glob-m83fa9-412"`. The condition `prev.some(m => m.messageId === msg.messageId)` returns `false`. Therefore, `[msg, ...prev]` prepends the message a second time.

---

### 3.3 Evaluation of Alternative Plausible Causes

| Hypothesis | Evaluation | Evidence | Conclusion |
| :--- | :--- | :--- | :--- |
| **React Strict Mode Double-Mount** | Disproven | `next.config.mjs` (L1–11) does not enable `reactStrictMode: true`. `layout.tsx` (L1–38) renders `<body>{children}</body>` directly without `<React.StrictMode>`. Double-mount state duplication does not occur. | Not a factor. |
| **Multi-Hop Mesh Reflection / Echo** | Disproven | In `meshSimulator.ts` (L614–616), `broadcastFromNode` explicitly checks `if (targetId === sourceNodeId) continue`. The originating node never receives its own radio transmission over the RF link. Deduplication key caching in `transmitPacketOverMesh` (L316) also drops reflections. | Not a factor. |
| **IndexedDB Race Condition on Initial Mount** | Secondary Defect | `getGlobalMessages()` is called asynchronously on mount (L184–186). Simultaneously, `CLIENT_HELLO` prompts a `NODE_HELLO` frame containing `recentGlobal` (L167–170). In `nodeTransport.ts`, `NODE_HELLO` iterates through `recentGlobal` and fires `onNewGlobalMessage(gm)`. If IndexedDB resolves after `NODE_HELLO`, line 185 (`setGlobalMessages(msgs)`) replaces the array rather than merging it. | Latent race condition; does not cause the dual-insert on user send. |
| **SOS Distress Beacon Dual-Insert** | **Confirmed** | In `page.tsx` (L396–418), `triggerSosBroadcast` creates an optimistic message with `sos-{base36}-{random}`. In `simulator/server.ts` (L156–165), `SEND_SOS` routes through `node.sendGlobalMessage(...)`, which emits `NEW_GLOBAL` with a `glob-{nodeId}-{counter}` ID. The exact same ID mismatch occurs. | **Confirmed secondary occurrence of Root Cause.** |
| **Firmware WebSocket Broadcast Behavior** | Verified Neutral | In `firmware/esp32_server/esp32_server.ino` (L454–460), `broadcastToAllClients` echoes `NEW_GLOBAL_MESSAGE` with the client's original JSON string payload. However, on the ESP32, if the client performed an optimistic update, it still receives an echo of its own frame. | Firmware perpetuates echo; requires client-side deduplication. |

---

### 3.4 Recommended Fix

To resolve the duplication without removing optimistic updates or dropping messages, implement the following two coordinated changes:

#### Fix 1: Preserve Client `messageId` Through Simulator Server
In `simulator/server.ts` (L144–154) and `src/lib/simulator/meshSimulator.ts` (L257–264):
Pass `parsed.messageId` from the client WebSocket frame into `node.sendGlobalMessage()`. Only generate a fallback ID if `clientMessageId` is absent:
```typescript
// In meshSimulator.ts:
public sendGlobalMessage(
  senderUuid: string,
  senderName: string,
  body: string,
  isEmergencyAlert = false,
  clientMessageId?: string
): GlobalMessage {
  const messageId = this.messageCounter++;
  const msgIdStr = clientMessageId || `glob-${this.nodeId}-${messageId}`;
  // ...
}
```

#### Fix 2: Multi-Field Deduplication in `src/app/page.tsx`
Update the state insertion callback in `src/app/page.tsx` (L210–215 and L229–236) to check for duplicate content from the same sender within a temporal threshold (5 seconds), handling cases where an intermediate gateway re-indexes the packet:
```typescript
onNewGlobalMessage: (msg) => {
  setGlobalMessages((prev) => {
    // 1. Primary check by messageId
    if (prev.some((m) => m.messageId === msg.messageId)) return prev;
    
    // 2. Secondary check for optimistic reconciliation: same sender, same text, within recent window
    const isOptimisticEcho = prev.some(
      (m) => m.senderUuid === msg.senderUuid &&
             m.body === msg.body &&
             Math.abs(Date.parse(m.originalTimestamp) - Date.parse(msg.originalTimestamp)) < 5000
    );
    if (isOptimisticEcho) {
      // Reconcile optimistic entry with authoritative server entry
      return prev.map((m) =>
        m.senderUuid === msg.senderUuid && m.body === msg.body ? msg : m
      );
    }
    
    return [msg, ...prev];
  });
},
```

---

## 4. Tactical Radar: Dynamic Coordinate-Based Landmark Discovery

### 4.1 Current Implementation Audit

The Tactical Radar component is defined in [`src/components/OfflineMap.tsx`](file:///c:/Users/tanis/Documents/VSC%20Projects/The%20Usual%20Idiots/LoRaResQ/src/components/OfflineMap.tsx) and embedded in [`src/app/page.tsx`](file:///c:/Users/tanis/Documents/VSC%20Projects/The%20Usual%20Idiots/LoRaResQ/src/app/page.tsx).

#### Static Landmark Array (`src/components/OfflineMap.tsx` lines 29–36):
```typescript
const RURAL_LANDMARKS = [
  { id: 'camp', name: 'Relief Camp Alpha (Base Node)', offsetLat: 0.0, offsetLon: 0.0, icon: '⛺' },
  { id: 'phc', name: 'Primary Health Center', offsetLat: 0.0052, offsetLon: 0.0031, icon: '🏥' },
  { id: 'bridge', name: 'River Bridge Checkpoint', offsetLat: -0.0075, offsetLon: 0.0045, icon: '🌉' },
  { id: 'school', name: 'Zilla Parishad School Shelter', offsetLat: 0.0035, offsetLon: -0.0062, icon: '🏫' },
  { id: 'panchayat', name: 'Gram Panchayat Office', offsetLat: -0.0028, offsetLon: -0.0038, icon: '🏛️' },
  { id: 'ridge', name: 'East Hill Ridge Sanctuary', offsetLat: 0.0091, offsetLon: 0.0084, icon: '⛰️' },
];
```

#### Deficiencies in Current Design:
1. **Hardcoded Offsets:** Landmarks are defined as fixed floating-point offsets relative to an arbitrary center coordinate (`offsetLat: 0.0052, offsetLon: 0.0031`).
2. **Fixed Scale Ratio:** Line 56 sets `degPerPixel = 0.00009` (assuming $100\text{ px} \approx 1.0\text{ km}$).
3. **Planar Equirectangular Distortion:** Lines 68–72 compute latitude and longitude via simple linear projection:
   $$\text{calculatedLon} = \text{baseLon} + \Delta x \times \text{degPerPixel}$$
   $$\text{calculatedLat} = \text{baseLat} + \Delta y \times \text{degPerPixel}$$
   This neglects the cosine scaling of longitude as latitude diverges from the equator ($\Delta \lambda = \frac{\Delta x}{\cos(\phi)}$). At 19°N (Maharashtra), 1° of longitude spans $105.2\text{ km}$, while 1° of latitude spans $111.0\text{ km}$, introducing a ~5.2% distortion.
4. **Hardcoded UI Snap Buttons:** Lines 205–231 render fixed buttons that only select among these six hardcoded items.

---

### 4.2 Disaster Mesh Context & Constraints

Any dynamic landmark discovery solution for LoRaResQ must respect the physical constraints of disaster operation:

* **Zero Internet Connectivity in the Field:** When civilians connect to the ESP32 Wi-Fi SoftAP (`192.168.4.1`), there is no cellular upstream, no external WAN access, and no public DNS resolution. **A standard client-side `fetch('https://maps.googleapis.com/...')` or `fetch('https://overpass-api.de/...')` will completely fail in the disaster field.**
* **ESP32 Resource Limits:** The ESP32-WROOM-32 has 520 KB of internal SRAM and 4 MB of SPI flash. It cannot host a global vector tile server or execute complex PostGIS topological queries.
* **Storage Availability:** The hardware specification includes an SPI MicroSD card module (FAT32 filesystem), providing 8 GB to 32 GB of offline storage.
* **Licensing & Usage Terms:**
  * *Google Places API:* Prohibits offline caching of Places content beyond 30 days and strictly requires results to be displayed on an official Google Basemap. Using Google Places data on an offline custom vector SVG radar breaches Google Maps Platform Terms of Service (Section 3.2.3).
  * *OpenStreetMap (OSM) / Overpass:* Licensed under the Open Database License (ODbL). Permitted to be downloaded, pre-filtered, bundled, cached offline indefinitely, and rendered on custom vector canvases without external dependencies or license violations.

---

### 4.3 Recommended Architecture: Dual-Stage Geospatial Discovery

We recommend a **Dual-Stage Geospatial Architecture**:
1. **Stage 1 (Online Staging / Mission Provisioning):** An automated ingest tool queries OpenStreetMap Overpass API for emergency infrastructure within the target operational district and compiles an offline GeoJSON / SQLite spatial database.
2. **Stage 2 (Field Operation / 100% Offline Query):** The web application or ESP32 queries the local spatial database using Great-Circle bounding boxes, dynamically populating the Tactical Radar.

```
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: ONLINE PROVISIONING & DISTRICT STAGING (Pre-Disaster / Base)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
       [Overpass API / Geofabrik District Ingest Script]
       Filter: amenity=hospital|clinic|doctors, emergency=*
               amenity=school|community_centre|shelter
               highway=bridge, natural=peak|ridge, building=civic
                                    │
                                    ▼
       [Compile Localized GeoJSON / SQLite Spatial Tile]
       Bound: District Bounding Box (e.g. 50 km x 50 km)
       Size: ~250 KB - 1.5 MB (Highly compressible)
                                    │
       ┌────────────────────────────┴─────────────────────────────┐
       ▼                                                          ▼
[Burn to ESP32 MicroSD]                                 [Pre-cache in PWA]
Path: /data/landmarks.geojson                           IndexedDB: 'landmarks_cache'
       │                                                          │
┌──────┴──────────────────────────────────────────────────────────┴──────┐
│ STAGE 2: FIELD OPERATION & RADAR QUERY (100% Offline Disconnected)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
       [User Drops Pin / GPS Fix Acquired at (lat, lon)]
                                    │
                                    ▼
       [Spatial Query Engine: Bounding Box + Haversine Radius]
       r = Search Radius (e.g., 2,500m around active coordinates)
                                    │
                                    ▼
       [Dynamic Landmark Extraction & Bearing Calculation]
       Calculate relative distance (m) & azimuth angle (θ°)
                                    │
                                    ▼
       [Render Real Coordinates on Tactical Radar Canvas]
       Categorical icons: 🏥 Medical • 🏫 Shelter • 🌉 Bridge • 🏛️ Civic
       Allow user to select any discovered point for "Snap to Landmark"
```

---

### 4.4 Technical Specification for Future Implementation

#### 1. Overpass Query Filter Definition
The staging script queries OpenStreetMap using the following bounding-box Overpass QL query:
```ql
[out:json][timeout:25];
(
  node["amenity"~"hospital|clinic|doctors|pharmacy"]({{bbox}});
  node["amenity"~"school|community_centre|shelter|place_of_worship"]({{bbox}});
  node["amenity"~"police|fire_station|townhall"]({{bbox}});
  node["emergency"]({{bbox}});
  way["highway"="bridge"]({{bbox}});
  node["natural"="peak"]({{bbox}});
);
out body center qt;
```

#### 2. Normalized Discovered Landmark Data Contract
The data model for discovered landmarks will be structured as follows:
```typescript
export interface DiscoveredLandmark {
  id: string;               // e.g. "osm-node-18293819"
  name: string;             // e.g. "Primary Health Center Mahad"
  category: 'medical' | 'shelter' | 'civic' | 'infrastructure' | 'elevation' | 'hazard';
  latitude: number;
  longitude: number;
  distanceMeters: number;   // Computed dynamically relative to current fix
  bearingDegrees: number;   // 0° to 359° relative to North
  attributes: {
    emergencyType?: string;
    operator?: string;
    capacityEstimate?: number;
  };
}
```

#### 3. Great-Circle Haversine & Azimuth Formulation
To eliminate planar equirectangular distortion, dynamic position mapping will use the Haversine distance formula and spherical forward azimuth:
$$a = \sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)$$
$$d = 2R \cdot \text{atan2}\left(\sqrt{a}, \sqrt{1-a}\right)$$
$$\theta = \text{atan2}\left(\sin(\Delta\lambda)\cos(\phi_2), \cos(\phi_1)\sin(\phi_2) - \sin(\phi_1)\cos(\phi_2)\cos(\Delta\lambda)\right)$$
where $\phi$ is latitude in radians, $\lambda$ is longitude in radians, and $R = 6,371,000\text{ m}$.

#### 4. Fallback Handling
* **Empty Search Area:** If no formal OSM landmarks exist within the radar radius (e.g., remote forest or uninhabited flood terrain), the radar renders an empty state: `"No registered public infrastructure within 2.5 km. Drop a tactical pin or transmit custom GPS coordinates."`
* **GPS Unavailable:** If browser permissions block geolocation, the radar centers on the serving base node's pre-configured hardware coordinates (`NEXT_PUBLIC_BASE_LATITUDE`, `NEXT_PUBLIC_BASE_LONGITUDE`).

---

## 5. Comprehensive Inventory of Hardcoded, Mocked, Simulated, and Placeholder Data

Every instance of fixed, mocked, or placeholder data across the repository is classified in the inventory below.

### Classification Taxonomy:
* **Intentional Default:** Legitimate system parameter, regulatory constant, or safe initial fallback.
* **Useful Development Mock:** Valid test fixture or simulator module that enables testing without hardware.
* **Temporary Placeholder:** UI placeholder or stub waiting for live data integration.
* **Actual Defect:** Incorrect code logic, hardcoded secret, or functional bypass.
* **Unconfirmed Behavior:** Implementation requiring physical hardware to verify.

---

### Inventory Table

| ID | Item Description | Exact Location | Current Behavior | Intended Behavior | Classification | Priority | Required Change & Prerequisites |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **H-01** | Hardcoded Rural Landmarks | `src/components/OfflineMap.tsx` L29–36 | In-memory array of 6 fixed landmarks with hardcoded relative offsets (`offsetLat: 0.0052`, etc.). | Real landmarks queried dynamically from a localized spatial index based on the active coordinate fix. | Temporary Placeholder | **High** | Replace array with local GeoJSON / IndexedDB spatial query engine using Haversine calculation. |
| **H-02** | Hardcoded Base Coordinates | `src/components/OfflineMap.tsx` L39–40, `.env.example` L17–18 | Center point defaults to `19.076, 72.8777` (Mumbai, India). | Base coordinates loaded from ESP32 node runtime config via WebSocket `NODE_HELLO` frame. | Intentional Default | **Medium** | Bind `baseLat` and `baseLon` props in `page.tsx` directly to `nodeInfo.latitude/longitude`. |
| **H-03** | Planar Distance Scale Constant | `src/components/OfflineMap.tsx` L56 | Fixed constant `degPerPixel = 0.00009` assumes uniform flat earth projection. | Latitude-dependent scale factor: $\Delta \lambda = \frac{\Delta x}{\cos(\phi)}$. | Actual Defect | **Medium** | Implement spherical forward projection on the radar canvas with cosine latitude correction. |
| **H-04** | Initial Node Telemetry State | `src/app/page.tsx` L58–71 | Static initial state: `batteryVoltage: 3.98, batteryPercent: 88, uptimeSeconds: 320`. | Displays `"Reading telemetry..."` or loading skeleton until `NODE_HELLO` frame arrives. | Temporary Placeholder | **Medium** | Initialize numeric telemetry to `null` or `0` and render loading state until WebSocket handshake completes. |
| **H-05** | Initial Location State | `src/app/page.tsx` L123–132 | Hardcoded coordinates: `latitude: 19.076, longitude: 72.8777`. | Displays `latitude: null, longitude: null` with status `"Acquiring fix..."` until GPS or user input. | Temporary Placeholder | **Medium** | Set initial latitude/longitude to `null`; prompt user to allow GPS or drop pin on radar. |
| **H-06** | Hardcoded Gateway Selection List | `src/app/page.tsx` L43–48 | Static array of 4 gateway options (`localhost:8081` to `8083` and `192.168.4.1:81`). | Automatically discovers gateway based on `window.location.hostname`; hides dev options in production. | Useful Development Mock | **Low** | Guard simulator options with `process.env.NODE_ENV !== 'production'` and allow custom gateway input. |
| **H-07** | Hardcoded Quick Reply Templates | `src/app/page.tsx` L34–41 | Static string array of 6 preset emergency canned messages. | Configurable disaster reply presets localized by language selection. | Intentional Default | **Low** | Connect quick replies to `EMERGENCY_PRESETS` in `emergencyPresets.ts` to support Hindi/Marathi. |
| **H-08** | Hardcoded Administrative Password | `src/app/page.tsx` L448, `firmware/.../esp32_server.ino` L42 | Hardcoded string `"admin123"` checks admin auth in both frontend and firmware. | Configurable passkey hashed via SHA-256 and provisioned securely via NVS / serial console. | **Actual Defect / Security Risk** | **Critical** | Remove plaintext password check; implement salt + SHA-256 challenge-response auth. |
| **H-09** | Static Admin Auth Token | `src/app/page.tsx` L450, `firmware/.../esp32_server.ino` L468 | Hardcoded static token string `"valid-admin-token"` / `"esp32-valid-token"`. | Cryptographically random, time-expiring session token generated by ESP32 RNG. | **Actual Defect / Security Risk** | **Critical** | Generate 32-byte pseudo-random session token with 15-minute lease in firmware RAM. |
| **H-10** | Hardcoded Symmetric Encryption Key | `src/lib/protocol/binaryPacket.ts` L137, L172 | Hardcoded key string `key = 'LoRaResQ_SecretK'` in XOR encryption functions. | Provisioned 128-bit key derived from pre-shared mission passphrase or ECDH key exchange. | **Actual Defect / Security Risk** | **Critical** | Move key to secure NVS storage; replace mock XOR cipher with AES-128-GCM via mbedTLS. |
| **H-11** | Mock XOR Cipher & FNV-1a Hash Tag | `src/lib/protocol/binaryPacket.ts` L148–161, L178–194 | Deterministic XOR masking and FNV-1a hash derivative used in place of AES-128-GCM. | True hardware-accelerated AES-128-GCM encryption with 128-bit Galois authentication tag. | Useful Development Mock | **High** | Replace with Web Crypto API (`SubtleCrypto`) in frontend and ESP32 mbedTLS on hardware. |
| **H-12** | Fixed RF Simulated Topology Links | `src/lib/simulator/meshSimulator.ts` L570–584 | Fixed 3-node linear topology with hardcoded SNR values (`10 dB`, `8 dB`, `-18 dB`). | Dynamic RF attenuation model based on simulated node GPS distances and Okumura-Hata path loss. | Useful Development Mock | **Low** | Retain for unit tests; add dynamic distance-based path loss function for interactive testing. |
| **H-13** | Monotonic Simulated Message IDs | `src/lib/simulator/meshSimulator.ts` L263–264 | Formats IDs as `glob-${nodeId}-${counter}`, discarding client-generated UUIDs. | Preserves client-generated message IDs to ensure idempotent end-to-end deduplication. | Actual Defect | **High** | Accept `clientMessageId` parameter and pass through in `NEW_GLOBAL` event (Fixes Duplication). |
| **H-14** | Hardcoded Battery Readings in Firmware | `firmware/.../esp32_server.ino` L382–383 | Fixed JSON output: `info["batteryVoltage"] = 3.96; info["batteryPercent"] = 85;`. | Samples ADC voltage on `PIN_BATTERY_ADC` (GPIO 7), calculates battery curve percentage. | Temporary Placeholder | **High** | Implement `analogReadMilliVolts(PIN_BATTERY_ADC)` with resistor divider scaling factor. |
| **H-15** | Simulated Radio HAL Loopback | `firmware/.../esp32_server.ino` L241–252, L261–263 | When UART1 probe fails, sets `isHardwareRadioAvailable = false` and prints simulated log. | Communicates via physical UART1 with Semtech SX1262 EBYTE E22-900T22D module. | Intentional Fallback | **Critical** (Blocked by Hardware) | Connect physical E22 module on GPIO 16/17/18 during Day 1 hardware integration window. |
| **H-16** | Missing MicroSD Driver in Firmware | `firmware/.../esp32_server.ino` L74–76 | MicroSD SPI bus uninitialized; stores up to 16 participants in static RAM array. | FAT32 filesystem initialized via `SD.h` / `SPI.h`; stores messages in SQLite or flat append logs. | Temporary Placeholder | **High** (Blocked by Hardware) | Add `SD.begin(PIN_SD_CS)` and implement 7-day store-and-forward file queue on MicroSD. |
| **H-17** | Raw String UART Read in Firmware | `firmware/.../esp32_server.ino` L217–222 | Does `Serial1.readString()` and wraps raw string into JSON without binary packet parsing. | Parses 14-byte binary transport header, checks magic `0x52`, verifies auth tag, checks CRC. | Temporary Placeholder | **High** | Port `binaryPacket.ts` serialization and validation logic to C++ in firmware. |
| **H-18** | Fixed Regulatory Radio Channel Defaults | `src/types/loraresq.ts` L80, `esp32_server.ino` L56–60 | Hardcoded frequency `865.125 MHz`, Channel `15`, TX Power `22 dBm`. | Configurable via NVS / Admin Console, constrained by regulatory domain (India SRD 865–867 MHz). | Intentional Default | **Low** | Ensure input validation prevents setting frequencies outside 865.0–867.0 MHz band. |
| **H-19** | Fixed SoftAP Lease Timers | `firmware/.../esp32_server.ino` L204–214 | 45-second fixed lease expiration sweep for civilian Wi-Fi participants. | Configurable lease timeout based on Wi-Fi beacon intervals and client mobility models. | Intentional Default | **Low** | Valid as configured; consider extending to 60s for power-saving smartphones. |
| **H-20** | Synthetic Web Audio Siren Frequencies | `src/lib/alarm.ts` L33, L48 | Hardcoded frequencies `800 Hz` and `1200 Hz` alternating every 400 ms. | Standardized public safety acoustic emergency alert tone. | Intentional Default | **Low** | Compliant with standard acoustic warning specifications; no change required. |
| **H-21** | Fixed Trilingual Emergency Presets | `src/lib/emergencyPresets.ts` L15–56 | 5 hardcoded disaster preset messages in English, Marathi, and Hindi. | Allows mission commanders to upload regional disaster templates (e.g. Gujarati, Bengali). | Intentional Default | **Low** | Store presets in IndexedDB with fallback to static constants; allow mission customization. |
| **H-22** | User-Agent Regex Device Identification | `src/lib/deviceIdentity.ts` L91–108 | Heuristic regex parsing of `navigator.userAgent` to extract device model string. | Standard client-side device labeling for mesh roster diagnostics. | Intentional Default | **Low** | Valid heuristic fallback when Client Hints API is unavailable over HTTP captive portal. |
| **H-23** | LocalStorage Array Fallback | `src/lib/storage/offlineStore.ts` L170–201 | In-memory / `localStorage` string serialization when IndexedDB is blocked. | Persistent client-side message retention across AP handovers. | Intentional Fallback | **Low** | Production-ready fallback for restricted captive portal webviews. |
| **H-24** | Fixed India SRD Channel Table | `src/app/page.tsx` L1085–1087, L1581–1583 | Dropdown contains only Channels 15, 16, 17 (865.125, 866.125, 867.125 MHz). | Full channel allocation matching India GSR 564(E) regulations (Channels 1 to 20). | Intentional Default | **Medium** | Expand dropdown to support full 865.0–867.0 MHz channel raster (100 kHz channel spacing). |

---

## 6. Transition to Real Functionality

To transition LoRaResQ from its current development state into an operational off-grid emergency mesh deployment, work must be completed across nine architectural categories.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PHASE A: SOFTWARE ONLY                          │
│           (Execute immediately without physical hardware)              │
├────────────────────────────────────────────────────────────────────────┤
│  1. Fix Community Feed Duplication (ID Preservation & Reconcile)       │
│  2. Replace Hardcoded Landmarks with Haversine Dynamic Discovery       │
│  3. Remediate Security Vulnerabilities (Admin Passkey & Crypto Key)    │
│  4. Implement Realistic Battery Voltage ADC Profiling in Firmware      │
│  5. Port Binary Packet Framing (C++ Header Parsing & AES-GCM)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        PHASE B: HARDWARE INTEGRATION                   │
│             (Execute during the strict 2-day hardware window)          │
├────────────────────────────────────────────────────────────────────────┤
│  6. Multimeter Calibration: Tune MT3608 Boost to STRICTLY 5.00V DC     │
│  7. Wire & Validate EBYTE E22 SX1262 LoRa Module on UART1 (GPIO 16/17) │
│  8. Wire & Mount SPI MicroSD Card Reader on GPIO 5/18/19/23            │
│  9. RF Range & Airtime Validation (Stop-and-Wait + Passive ACKs)       │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Category 1: Frontend and State Management
* **Current Situation:** `src/app/page.tsx` contains optimistic insertion logic that collides with gateway echo-backs. Telemetry states default to non-null mock values.
* **Required Changes:**
  1. Update `handleSendGlobalMessage` and `triggerSosBroadcast` to reconcile with server echo-backs.
  2. Implement optimistic reconciliation in `onNewGlobalMessage` using sender UUID and message timestamps.
  3. Change initial numeric telemetry values (`batteryVoltage`, `batteryPercent`) to `null` and render skeleton loaders until the first WebSocket `NODE_HELLO` frame arrives.
* **Prerequisites:** None (Software-only).

### Category 2: Backend and API Integration
* **Current Situation:** `simulator/server.ts` drops client message IDs and broadcasts frames unconditionally to all clients, causing echoes.
* **Required Changes:**
  1. Pass client `messageId` through `server.ts` into `meshSimulator.ts`.
  2. Support client socket filtering so the originating client is not sent an echo of its own broadcast, OR ensure the echo carries the identical client ID.
* **Prerequisites:** None (Software-only).

### Category 3: Database and Persistence Layer
* **Current Situation:** Browser IndexedDB handles client-side persistence, but firmware storage is limited to a volatile 16-entry RAM array (`UserRecord participants[16]`) and basic NVS configuration.
* **Required Changes:**
  1. Initialize SPI MicroSD module in firmware using `SD.h`.
  2. Implement circular file logging for the 7-day store-and-forward message queue (`/spool/messages.dat`) on the FAT32 SD card.
  3. Implement message compaction and expiration sweeps to enforce the 7-day personal and 30-day global TTL limits specified in `blueprint.md` Section 8.
* **Prerequisites:** MicroSD Card Module & FAT32 formatted card (Hardware-dependent).

### Category 4: Real-time Community Feed Updates
* **Current Situation:** Community messages are exchanged as plain JSON objects over WebSocket and looped through simulator events.
* **Required Changes:**
  1. Reconcile race condition between IndexedDB `getGlobalMessages()` and `NODE_HELLO` message history. Merge arrays using a deduplicated union on `messageId`.
  2. Handle disconnection outbox flushing: when a device reconnects after losing Wi-Fi, flush queued outbox items with guaranteed sequential ordering.
* **Prerequisites:** None (Software-only).

### Category 5: Geospatial Discovery and Tactical Radar
* **Current Situation:** `src/components/OfflineMap.tsx` renders six static landmarks using a fixed planar equirectangular projection.
* **Required Changes:**
  1. Remove `RURAL_LANDMARKS` static array.
  2. Create an offline spatial query service in `src/lib/geo/spatialDiscovery.ts` that ingests GeoJSON feature collections.
  3. Implement Haversine distance and forward azimuth calculation to project landmarks onto radar concentric rings (500m, 1km, 1.5km, 2km).
  4. Build dynamic landmark category filtering (Medical, Shelter, Civic, Hazard).
  5. Connect radar landmark selection directly to the SOS coordinate attachment workflow.
* **Prerequisites:** None for software engine; GeoJSON district dataset required for operational deployment.

### Category 6: Hardware, Firmware, and Device Communication
* **Current Situation:** Firmware detects missing E22 module and enters loopback mode. Radio UART code does not parse 14-byte binary transport headers. Battery ADC is mocked.
* **Required Changes:**
  1. Implement `analogReadMilliVolts(PIN_BATTERY_ADC)` with resistor divider scaling factor ($R_1 = 100\text{ k}\Omega, R_2 = 100\text{ k}\Omega$) to read real LiPo battery voltage.
  2. Implement C++ binary packet serializer/deserializer in firmware to process the 14-byte over-the-air header on UART1.
  3. Implement CSMA/CA channel sensing using the E22 `AUX` pin (GPIO 6) before initiating transmission.
* **Prerequisites:** ESP32 board for ADC testing; E22 SX1262 LoRa module for UART HAL testing.

### Category 7: External Services, Credentials, and Configuration
* **Current Situation:** Administrative password is hardcoded as `"admin123"` in plaintext. Encryption key is hardcoded as `"LoRaResQ_SecretK"`.
* **Required Changes:**
  1. Remove plaintext admin password from client source code. Implement a PBKDF2/SHA-256 challenge-response handshake over WebSocket.
  2. Store the node administrative hash in ESP32 NVS `Preferences`.
  3. Externalize radio network parameters and mission keys via `.env.local` and runtime configuration.
* **Prerequisites:** None (Software-only).

### Category 8: Security, Error Handling, and Privacy
* **Current Situation:** Symmetric encryption uses an insecure XOR mock cipher with FNV-1a hash tags. Location tracking overwrites in one row, but coordinates are transmitted unencrypted in some simulator frames.
* **Required Changes:**
  1. Upgrade payload encryption in `binaryPacket.ts` to authenticated AES-128-GCM using Web Crypto API (`window.crypto.subtle`) in the browser.
  2. Integrate mbedTLS AES-GCM in ESP32 firmware for over-the-air packet decryption.
  3. Validate input lengths against the SX1262 255-byte physical buffer limit to prevent buffer overflow attacks over UART.
  4. Ensure GPS coordinates are only attached to SOS packets or explicit user location shares, never in routine heartbeats.
* **Prerequisites:** None (Software-only).

### Category 9: Testing, Deployment, and Operational Readiness
* **Current Situation:** Automated tests exist for packet serialization, multi-hop routing, and IndexedDB storage. No automated test verifies end-to-end WebSocket deduplication or offline spatial radar projection.
* **Required Changes:**
  1. Add integration tests for WebSocket broadcast deduplication under simulator load.
  2. Add unit tests for the Haversine projection engine across varying latitudes.
  3. Establish hardware bench testing scripts for the 2-day integration window.
* **Prerequisites:** Vitest framework (already configured).

---

## 7. Recommended Implementation Order (Prioritized Roadmap)

The recommended implementation is structured into sequential phases to ensure software stability before physical hardware arrives.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                 TASK IMPLEMENTATION ROADMAP                             │
├─────────┬──────────────────────────────────────────┬────────────────────┤
│ Phase 1 │ Community Feed Duplication Fix           │ Immediate (Day 0)  │
├─────────┼──────────────────────────────────────────┼────────────────────┤
│ Phase 2 │ Tactical Radar Dynamic Discovery         │ Immediate (Day 0)  │
├─────────┼──────────────────────────────────────────┼────────────────────┤
│ Phase 3 │ Security & Credential Hardening          │ Immediate (Day 0)  │
├─────────┼──────────────────────────────────────────┼────────────────────┤
│ Phase 4 │ Firmware ADC & Binary Protocol Engine    │ Pre-Hardware (Day 0│
├─────────┼──────────────────────────────────────────┼────────────────────┤
│ Phase 5 │ Hardware Integration Bench (2-Day Window)│ Day 1 & Day 2      │
└─────────┴──────────────────────────────────────────┴────────────────────┘
```

---

### Phase 1: Community Feed Duplication Fix
* **Priority:** **Critical (P0)**
* **Prerequisites:** None (Software-only).
* **Target Files:**
  * `simulator/server.ts` (L144–165)
  * `src/lib/simulator/meshSimulator.ts` (L257–278)
  * `src/app/page.tsx` (L210–215, L368–387, L396–418)
* **Expected Outcome:** Community Feed and SOS messages appear exactly once when sent. Optimistic UI update matches the server's broadcast echo.
* **Verification:** Launch `npm run sim` and `npm run dev`. Transmit 5 consecutive global messages across simulated nodes. Verify that exactly 5 messages appear in the feed without duplicates.

---

### Phase 2: Dynamic Coordinate-Based Tactical Radar
* **Priority:** **High (P1)**
* **Prerequisites:** Phase 1 complete.
* **Target Files:**
  * `src/components/OfflineMap.tsx`
  * `src/lib/geo/spatialDiscovery.ts` (New module)
  * `src/app/page.tsx` (L829–878)
* **Expected Outcome:** Radar displays real nearby landmarks loaded from a local GeoJSON dataset based on the active coordinate fix. Landmarks update dynamically when coordinates change. Users can click any discovered landmark to snap coordinates.
* **Verification:** Load mock GeoJSON datasets for two distinct geographic regions (e.g. Raigad District vs. Mumbai Suburban). Set map coordinates to each region; verify that only landmarks within the 2.5 km radius are rendered on the radar grid with correct bearing and distance.

---

### Phase 3: Security & Credential Hardening
* **Priority:** **High (P1)**
* **Prerequisites:** None (Software-only).
* **Target Files:**
  * `src/app/page.tsx` (L446–472)
  * `firmware/esp32_server/esp32_server.ino` (L42, L464–472)
  * `src/lib/protocol/binaryPacket.ts` (L135–199)
* **Expected Outcome:** Plaintext passwords (`admin123`) and static tokens (`esp32-valid-token`) removed. Administrative access authenticated via SHA-256 token challenge. Payload encryption upgraded to true AES-128-GCM.
* **Verification:** Verify that default passkey cannot be inspected in client bundle. Verify that invalid passwords fail WebSocket authentication. Confirm tamper-resistance by modifying ciphertext and asserting that auth tag verification throws an error.

---

### Phase 4: Firmware Telemetry & Binary Protocol Engine
* **Priority:** **Medium (P2)**
* **Prerequisites:** Phase 3 complete.
* **Target Files:**
  * `firmware/esp32_server/esp32_server.ino` (L26–36, L216–223, L382–383)
* **Expected Outcome:** Firmware samples actual ADC battery voltage on GPIO 7. Firmware UART engine parses 14-byte binary transport headers instead of raw strings.
* **Verification:** Compile firmware using `arduino-cli compile --fqbn esp32:esp32:esp32 firmware/esp32_server`. Flash to bare ESP32. Inspect serial monitor to verify ADC readings and loopback HAL diagnostic logs.

---

### Phase 5: Hardware Integration Bench (Strict 2-Day Window)
* **Priority:** **High (P1 - Hardware Dependent)**
* **Prerequisites:** Hardware arrival; Phases 1–4 complete.
* **Reference Guide:** [`docs/HARDWARE_INTEGRATION_MATRIX.md`](file:///c:/Users/tanis/Documents/VSC%20Projects/The%20Usual%20Idiots/LoRaResQ/docs/HARDWARE_INTEGRATION_MATRIX.md)
* **Schedule:**
  * **Day 1 (Power & RF):**
    1. Calibrate MT3608 boost converter trimpot to **strictly 5.00V DC** using a digital multimeter before wiring to the E22 VCC pin.
    2. Attach 868 MHz antenna to SMA connector before applying power.
    3. Wire EBYTE E22 to ESP32 UART1 (GPIO 16 RX, GPIO 17 TX, GPIO 18 AUX, GPIO 21 M0, GPIO 22 M1).
    4. Verify radio detection via serial log: `"EBYTE E22 / SX1262 hardware detected on UART1"`.
  * **Day 2 (Storage & End-to-End Mesh):**
    1. Wire SPI MicroSD module to GPIO 5 (CS), 18 (SCK), 19 (MISO), 23 (MOSI).
    2. Format MicroSD card with FAT32.
    3. Verify 7-day store-and-forward queueing by powering off a receiving node, sending a 1:1 message, and confirming delivery upon node reboot.

---

## 8. Final Checklist of Findings Needing Confirmation

The following findings require user confirmation or physical verification once the hardware components arrive:

- [ ] **Community Feed Duplication Resolution Preference:** Confirm whether to implement Client-ID Preservation through the gateway (recommended) or to suppress client echo-back at the WebSocket broadcast level.
- [ ] **Tactical Radar Offline Geographic Scope:** Define the primary operational district (e.g. specific district/taluka in Maharashtra) to determine the bounding box and GeoJSON payload size for offline bundling.
- [ ] **Physical Battery Resistor Divider Ratios:** When the custom PCB or breadboard is assembled, confirm the exact resistor values used for the battery voltage divider on GPIO 7 ($R_1$ and $R_2$) to calibrate the firmware ADC scaling constant.
- [ ] **MT3608 Trimpot Output Pre-Check:** Verify that the boost converter output has been measured at **5.00V DC** with a multimeter *before* connecting the EBYTE E22 VCC rail.
- [ ] **Radio Antenna Safety:** Confirm that the 868 MHz antenna is securely threaded onto the SMA connector before powering the SX1262 power amplifier to prevent RF transistor blowout.
- [ ] **NVS Mission Passkey Provisioning:** Decide whether administrative passkeys should be provisioned via serial console during flashing or loaded from a configuration file on the MicroSD card.

---

*End of Engineering Audit Report — `SOFTWARE_AUDIT.md`*
