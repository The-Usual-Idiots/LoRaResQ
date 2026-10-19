# LoRaResQ — Master Hardware & Software Integration Matrix
## Two-Day Hardware Integration Strategy & Acceptance Protocol

This document provides the definitive mapping between every physical hardware component defined in [BLUEPRINT.md](file:///c:/Users/tanis/Documents/VSC%20Projects/The%20Usual%20Idiots/LoRaResQ/BLUEPRINT.md) and its software interface, electrical parameters, current verification status, and day-by-day integration checklist.

---

## 1. Master Hardware / Software Component Mapping

| Component | Technical Model | ESP32-S3 Pinout / Bus | Voltage Rail | Software Interface | Software Integration Status | Physical Hardware Status |
|---|---|---|---|---|:---:|:---:|
| **Master MCU** | ESP32-S3 / ESP32 DevKit | USB-C / Onboard Reg | 5.0V / 3.3V | FreeRTOS / Arduino Core | **Verified & Ready** (Compiled) | **Available Now** |
| **Wi-Fi SoftAP** | ESP32 Internal Radio | 2.4 GHz 802.11 b/g/n | Internal | `WiFi.softAP()`, DHCP Option 114 | **Verified & Ready** | **Available Now** |
| **Captive Portal DNS** | Port 53 Daemon | Internal IP `192.168.4.1` | Internal | `DNSServer`, RFC 8910 handlers | **Verified & Ready** | **Available Now** |
| **Web & WS Server** | WebServer & WebSockets | Port 80 (HTTP) & Port 81 (WS) | Internal | `WebServer`, `WebSocketsServer` | **Verified & Ready** | **Available Now** |
| **Hardware SOS Button** | 12 mm tactile switch | **GPIO 0** (BOOT / Internal Pullup) | 3.3V Logic | Debounced timer (`millis() > 1500`) | **Verified & Ready** | **Available Now** (BOOT pin) |
| **Diagnostic Status LED** | 5 mm high-contrast LED | **GPIO 2** (Onboard LED via 330Ω) | 3.3V Logic | Heartbeat pulse vs Emergency Strobe | **Verified & Ready** | **Available Now** (Onboard LED) |
| **RF Transceiver** | EBYTE E22-900T22D-V2 (SX1262) | **TX: GPIO 17, RX: GPIO 18, M0: 4, M1: 5, AUX: 6** | **5.0V Bus** | Hardware Serial1 + Auto HAL Emulation | **Emulation Verified; Drivers Ready** | *Pending Delivery* |
| **Sub-GHz Antenna** | TX868-JKD-20 (3 dBi whip) | SMA-J male connector | Passive RF | Matched 865.125 MHz (CH 15) | **RF Protocol & ToA Verified** | *Pending Delivery* |
| **MicroSD Reader** | SPI FAT32 Module | **MOSI: 11, MISO: 13, SCK: 12, CS: 10** | **5.0V Bus** | SQLite 3 / NVS Flash Fallback | **Flash Fallback Active; Drivers Ready**| *Pending Delivery* |
| **Active Buzzer** | 5V DC Piezo Acoustic Siren | **GPIO 1** (via 2N2222 NPN + 1kΩ) | 5.0V Bus | Digital strobe output | **Verified & Ready** | *Pending Delivery* |
| **Battery Management** | TP4056 + DW01 + 8205A | USB-C Charging to LiPo | 3.7V - 4.2V | Dual protection low-voltage cutoff | **Safety protocol documented** | *Pending Delivery* |
| **Power Boost Converter** | MT3608 DC-DC Step-Up | Trimmed to **strictly 5.00V DC** | 5.00V Out | Regulated system bus feeder | **Calibration protocol documented** | *Pending Delivery* |
| **Decoupling Buffer** | 470 µF Electrolytic + 100 nF Ceramic | Across 5.0V & GND rail | 5.0V Bus | Buffers RF & Wi-Fi transient spikes | **Circuit schematic verified** | *Pending Delivery* |

---

## 2. Two-Day Hardware Integration Strategy

The software stack has been built so that **all software logic, protocols, UI, and simulated hardware operate today on your existing bare ESP32**. When the remaining components arrive, follow this prioritized 48-hour protocol.

### Day 1: Electrical Safety, Microcontroller Bring-Up & Single-Node Radio Integration

#### Prerequisites & Equipment
- Digital Multimeter (DC Voltage & Continuity mode)
- Small flathead screwdriver (for MT3608 potentiometer calibration)
- Soldering iron, solder, Kapton insulating tape, and breadboard/jumpers
- USB-C cable and computer with `arduino-cli` installed

#### Sequence of Tasks

- [ ] **Task 1.1: Flash & Verify Existing ESP32 (Can be done TODAY)**
  - Command:
    ```bash
    arduino-cli upload -p <COM_PORT> --fqbn esp32:esp32:esp32 firmware/esp32_server
    ```
  - Expected Serial Trace (115200 baud):
    ```text
    [LoRaResQ] BOOT | Initializing LoRaResQ Emergency Mesh Node Gateway v2.0
    [LoRaResQ] RADIO_HAL | HARDWARE NOTICE: EBYTE E22 LoRa module unpopulated on GPIO 17/18. Radio HAL active in Loopback/Emulation Mode.
    [LoRaResQ] WIFI_AP | SoftAP active. SSID: LoRaResQ-Alpha | IP: 192.168.4.1
    [LoRaResQ] DNS_SERVER | Captive Portal DNS active on Port 53 (* -> 192.168.4.1)
    [LoRaResQ] HTTP_SERVER | Web Server online on port 80
    [LoRaResQ] WS_SERVER | WebSocket Engine online on port 81 (/ws)
    [LoRaResQ] READY | Node initialization complete. Awaiting civilian connections.
    ```
  - Verification: Connect your phone to `LoRaResQ-Alpha` Wi-Fi. Verify captive portal loads `http://192.168.4.1`.
  - Press the BOOT button on the ESP32 for 2 seconds. Verify `[LoRaResQ] HARDWARE_SOS` triggers in the serial log and onboard LED flashes.

- [ ] **Task 1.2: Mandatory Power Supply Calibration (Before Connecting Peripherals!)**
  - **DANGER:** The MT3608 step-up module shipped from factories is often adjusted to 18V–24V. Applying this directly will destroy the ESP32 and E22 radio.
  - Step 1: Connect the 3.7V LiPo battery or bench power supply strictly to MT3608 `VIN+` and `VIN-`.
  - Step 2: Attach multimeter probes to `VOUT+` and `VOUT-` on DC voltage mode.
  - Step 3: Turn the brass screw counter-clockwise until output voltage measures **strictly 5.00V ± 0.05V**.
  - Step 4: Solder the 470 µF electrolytic decoupling capacitor (observe polarity: negative stripe to GND) and 100 nF ceramic capacitor across the 5V bus.

- [ ] **Task 1.3: Mandatory Antenna Pre-Connection Rule**
  - **CRITICAL RF RULE:** **Never power the EBYTE E22 module without the TX868-JKD-20 antenna securely screwed onto the SMA socket.**
  - Transmitting into an open port damages the SX1262 power amplifier within milliseconds due to reflected power (VSWR > 10:1).

- [ ] **Task 1.4: Connect EBYTE E22 Radio Module to ESP32**
  - Wire according to Master Pinout:
    - E22 `VCC` $\rightarrow$ 5.0V Rail
    - E22 `GND` $\rightarrow$ Common Ground
    - E22 `TXD` $\rightarrow$ ESP32 **GPIO 18** (U1_RXD)
    - E22 `RXD` $\rightarrow$ ESP32 **GPIO 17** (U1_TXD)
    - E22 `M0`  $\rightarrow$ ESP32 **GPIO 4**
    - E22 `M1`  $\rightarrow$ ESP32 **GPIO 5**
    - E22 `AUX` $\rightarrow$ ESP32 **GPIO 6**
  - Reboot ESP32 and check serial trace:
    ```text
    [LoRaResQ] RADIO_HAL | EBYTE E22 / SX1262 hardware detected on UART1 (865.125 MHz).
    ```
  - Verify that `isHardwareRadioAvailable` transitions from `false` (emulation) to `true` (live RF).

- [ ] **Task 1.5: Wire MicroSD SPI Reader Module**
  - Wire according to Master Pinout:
    - MicroSD `VCC`  $\rightarrow$ 5.0V Rail (powers onboard 3.3V LDO)
    - MicroSD `GND`  $\rightarrow$ Common Ground
    - MicroSD `MOSI` $\rightarrow$ ESP32 **GPIO 11**
    - MicroSD `MISO` $\rightarrow$ ESP32 **GPIO 13** (with 10k pull-up to 3.3V if card fails to mount)
    - MicroSD `SCK`  $\rightarrow$ ESP32 **GPIO 12**
    - MicroSD `CS`   $\rightarrow$ ESP32 **GPIO 10**
  - Insert FAT32 formatted 16GB MicroSD card. Verify mount.

---

### Day 2: Multi-Node Mesh Integration, Range Testing & Acceptance Sign-Off

#### Sequence of Tasks

- [ ] **Task 2.1: Flash Second ESP32 Node (Node 2 Bravo)**
  - In `firmware/esp32_server/esp32_server.ino`, change default node parameters:
    ```cpp
    const char* AP_SSID_DEFAULT = "LoRaResQ-Bravo";
    const char* NODE_ID_DEFAULT = "0x0002";
    ```
  - Flash Node 2 and connect its antenna and E22 transceiver.

- [ ] **Task 2.2: Verify Over-The-Air RF Communication Between Nodes**
  - Connect Phone A to `LoRaResQ-Alpha` (Node 1).
  - Connect Phone B to `LoRaResQ-Bravo` (Node 2).
  - Phone A broadcasts an announcement: *"First aid station active near Bridge"*.
  - Verify Phone B receives the broadcast over the 865.125 MHz LoRa link (hop count = 1).
  - Verify serial log on Node 1 confirms RF transmission and Node 2 confirms RF reception.

- [ ] **Task 2.3: Verify Store-and-Forward Unicast Queueing**
  - On Phone B, turn off Wi-Fi (Phone B goes offline).
  - On Phone A, send a 1:1 message to Bob's UUID: *"Water tanker needed at Sector 3"*.
  - Verify Node 1 marks status as `Queued on MicroSD store-and-forward`.
  - Reconnect Phone B to Node 2 Wi-Fi.
  - Verify Node 2 immediately flushes the pending message to Phone B!

- [ ] **Task 2.4: Outdoor Range & Terrain Penetration Test**
  - Leave Node 1 at base station.
  - Walk with Node 2 along typical disaster relief routes (500m, 1km, 2km).
  - Monitor packet RSSI and SNR on serial console.
  - Confirm signal remains demodulated down to $-15\text{ dB}$ SNR under dense foliage.

- [ ] **Task 2.5: Battery Life & Current Consumption Benchmark**
  - Measure total current draw on the 5.0V bus with a multimeter on current (A) mode:
    - Idle receive mode: expected $\sim 170-190\text{ mA}$.
    - Active LoRa +22 dBm transmission burst: expected peak $\sim 280-320\text{ mA}$.
  - Verify 1500 mAh battery delivers $\ge 5.0$ hours continuous autonomous operation.

---

## 3. Diagnostic Commands & Quick Troubleshooting

| Symptom | Probable Cause | Verification Command / Step | Resolution |
|---|---|---|---|
| **E22 Radio fails to detect (`HAL Emulation Mode`)** | Loose RX/TX or AUX wiring | Check continuity between ESP32 GPIO 17 $\leftrightarrow$ E22 RXD and GPIO 18 $\leftrightarrow$ E22 TXD | Verify M0=0, M1=0, and AUX is pulled up to 3.3V. |
| **Phone connects to Wi-Fi but captive portal doesn't pop up** | OS DNS caching or blocked Option 114 | Open mobile browser and manually type `http://192.168.4.1` | Ensure mobile data is temporarily disabled on test phone. |
| **WebSocket disconnects repeatedly** | ESP32 power dip during Wi-Fi burst | Measure 5.0V bus with multimeter during connection | Verify 470 µF capacitor is installed across 5V and GND. |
| **MicroSD card fails to mount** | MISO line floating or high SPI clock | Check voltage at MicroSD module VCC (must be $\ge 4.8\text{V}$) | Add 10k pull-up resistor between GPIO 13 (MISO) and 3.3V. |
| **Poor RF range (<100m)** | Antenna not matched or damaged PA | Inspect SMA pin and VSWR | Verify TX868-JKD-20 antenna is 868 MHz class; never power on without antenna. |
