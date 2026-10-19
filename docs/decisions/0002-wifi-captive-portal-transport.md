# ADR 0002: Wi-Fi SoftAP Captive Portal & WebSockets

- **Status:** **Accepted**
- **Date:** 2026-10-19
- **Supercedes:** [ADR 0001: Web Bluetooth Support](file:///c:/Users/tanis/Documents/VSC%20Projects/The%20Usual%20Idiots/LoRaResQ/docs/decisions/0001-web-bluetooth-support.md)
- **Authoritative Specification:** `blueprint.md` (v2.0)

## Context

LoRaResQ requires an off-grid civilian triage interface that works immediately on any smartphone, tablet, or laptop without pre-installing native apps from an app store, without requiring active internet connectivity, and without requiring technical pairing steps.

## Decision

Adopt a **Standalone Wi-Fi SoftAP (802.11 b/g/n) with Port 53 DNS Wildcard Captive Portal, Port 80 HTTP Web Server, and Port 81 WebSockets** as the authoritative civilian access mechanism:

1. **Wi-Fi SoftAP:** The ESP32 node broadcasts an open Wi-Fi network (SSID `LoRaResQ-Alpha` or node callsign) on 2.4 GHz Channel 6 at `192.168.4.1`.
2. **Wildcard DNS Captive Portal (RFC 8910):** A DNS server running on UDP Port 53 intercepts all domain lookup requests and responds with `192.168.4.1`. Operating systems (Apple iOS Captive Network Assistant, Android CaptivePortalLogin, Windows Network Connectivity Status Indicator) automatically trigger a "Sign in to network" sheet.
3. **Tier 1 Captive Splash Page (<10 KB):** Served immediately from ESP32 RAM over HTTP Port 80 for instant triage and instructions.
4. **Tier 2 Offline Progressive Web App (PWA):** A statically exported Next.js 15 PWA (`output: 'export'`) loaded from local SPIFFS or cached in the browser's service worker.
5. **Real-Time WebSocket Transport (Port 81):** Bidirectional JSON frame communication between the PWA and ESP32 gateway (`ws://192.168.4.1:81/ws`).

## Consequences

* **100% Platform Reach:** Functions universally across iOS (Mobile Safari), Android (Chrome, Samsung Internet), Windows, macOS, and Linux out of the box.
* **Zero App Store Dependency:** No App Store or Google Play downloads required during an active disaster.
* **No Secure Context / TLS Obstacle:** Standard captive portals operate over plain HTTP (`192.168.4.1`) without requiring signed public CA certificates or external DNS verification.
* **Concurrent Capacity:** Supports up to 16 concurrent Wi-Fi client stations per ESP32 node, with continuous lease tracking and 45-second heartbeat sweep.
