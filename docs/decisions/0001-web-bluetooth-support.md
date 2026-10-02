# ADR 0001: Browser transport support

- **Status:** Accepted
- **Date:** 2026-10-02

## Decision

LoRaResQ web support will use Web Bluetooth when the browser exposes the required
API and the page is running in a secure context. The app will detect capability
before scanning and show an explicit unsupported-browser state when Web
Bluetooth is unavailable.

The web client will reuse the same node transport contract, protocol framing,
delivery states and error wording as Android and Windows. It will not simulate a
successful hardware connection in production or silently fall back to a
different transport.

## Rationale

Web Bluetooth allows the browser client to connect directly to a nearby ESP32
without introducing a server or cloud dependency. Browser support and security
requirements vary, so capability detection and honest failure states are
necessary.

## Consequences

- Supported browsers require HTTPS (or localhost) and a user gesture to start
  device selection.
- Unsupported browsers can still render the app shell and explain how to use
  Android or Windows, but cannot claim node connectivity.
- A future browser-compatible bridge can be added behind the same transport
  boundary without changing domain or feature code.
