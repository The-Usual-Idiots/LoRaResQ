# ADR 0001: Browser Transport Support via Web Bluetooth

- **Status:** **Superseded by ADR 0002 (Wi-Fi SoftAP Captive Portal)**
- **Date:** 2026-10-02 (Superseded 2026-10-19)

## Context (Historical v1.0)

During initial proof-of-concept prototyping, Web Bluetooth was evaluated to connect browser clients to an ESP32 microcontroller without requiring intermediate network infrastructure.

## Superseded Decision

The original decision was to use the Web Bluetooth API (`navigator.bluetooth`) with a custom 128-bit GATT service UUID (`7f6c0001-6b52-4f5d-9a5e-4f6c6f726151`).

## Rationale for Supersession (Why Web Bluetooth Was Abandoned)

Field evaluation and blueprint reconciliation identified four critical blockers that made Web Bluetooth unsuitable for an emergency disaster communication network:

1. **Lack of iOS Mobile Safari Support:** Apple's WebKit does not implement Web Bluetooth due to privacy and fingerprinting concerns. Because iOS represents a significant share of civilian smartphones, disaster victims with iPhones were completely excluded from the mesh unless they installed niche third-party browsers beforehand.
2. **Strict Secure Context (HTTPS) Requirement:** The Web Bluetooth API is disabled by modern browsers unless served over a cryptographically verified HTTPS connection (`window.isSecureContext === true`). An off-grid, air-gapped ESP32 running in a flood zone cannot contact public Certificate Authorities (Let's Encrypt) to validate TLS certificates.
3. **Friction-Heavy Manual Pairing:** Web Bluetooth requires active user interaction with a browser security modal to scan, select, and pair peripheral devices. In high-stress emergency evacuations, non-technical users struggle with Bluetooth pairing.
4. **Airtime Inefficiency:** Bluetooth 2.4 GHz operates in the congested ISM band alongside Wi-Fi, suffering severe attenuation through wet foliage, floodwaters, and collapsed structural debris compared to sub-gigahertz LoRa (865 MHz).

## Replacement Architecture

See [ADR 0002: Wi-Fi SoftAP Captive Portal & WebSockets](file:///c:/Users/tanis/Documents/VSC%20Projects/The%20Usual%20Idiots/LoRaResQ/docs/decisions/0002-wifi-captive-portal-transport.md).
