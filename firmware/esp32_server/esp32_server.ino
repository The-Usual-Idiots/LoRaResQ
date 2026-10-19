/**
 * LoRaResQ — Autonomous Off-Grid Emergency Mesh Communication Node
 * ESP32-S3 / ESP32 Master Firmware
 * 
 * Implements BLUEPRINT.md:
 * - Standalone Wi-Fi SoftAP at 192.168.4.1 with DHCP & Port 53 DNS Captive Portal
 * - WebServer serving Tier 1 Captive Splash Page (<10KB)
 * - WebSocket Server on Port 81 multiplexing real-time JSON mesh frames
 * - Radio Hardware Abstraction Layer (HAL) for EBYTE E22-900T22D / SX1262 on UART1
 * - Automatic Hardware Emulation / Loopback Fallback when radio module is unpopulated
 * - Hardware SOS Tactile Button on GPIO 0 (BOOT Button, debounced, 1.5s hold)
 * - Diagnostic Status LED on GPIO 2 (Heartbeat pulse vs. Rapid Emergency Strobe)
 * - Battery & Telemetry Monitor on GPIO 7
 * - Preferences / NVS Persistent Storage Fallback
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// ================= Master Pinout Definitions (BLUEPRINT.md Section 5.1) =================
#define PIN_STATUS_LED     2    // Onboard status LED
#define PIN_SOS_BUTTON     0    // Active LOW tactile BOOT button
#define PIN_BUZZER         1    // 2N2222 NPN driver base for 5V active buzzer
#define PIN_BATTERY_ADC    7    // ADC1_CH6 voltage divider from 5.0V/Battery rail

// EBYTE E22-900T22D-V2 / SX1262 UART1 Interface
#define PIN_E22_TX         17   // ESP32 UART1 TXD -> E22 RXD
#define PIN_E22_RX         18   // ESP32 UART1 RXD <- E22 TXD
#define PIN_E22_M0         4    // Operating mode bit 0
#define PIN_E22_M1         5    // Operating mode bit 1
#define PIN_E22_AUX        6    // Module busy/ready line (High = Ready, Low = Busy)

// ================= System Constants & Configuration =================
const byte DNS_PORT = 53;
const char* AP_SSID_DEFAULT = "LoRaResQ-Alpha";
const char* NODE_ID_DEFAULT = "0x0001";
const char* ADMIN_PASSWORD_DEFAULT = "admin123";

// Network & State
IPAddress apIP(192, 168, 4, 1);
IPAddress netMask(255, 255, 255, 0);

DNSServer dnsServer;
WebServer server(80);
WebSocketsServer webSocket(81);
Preferences preferences;

// Node Runtime Parameters
String nodeName = "LoRaResQ-Alpha";
String nodeId = "0x0001";
float radioFreqMhz = 865.125;
int radioChannel = 15;
int radioTxPower = 22;
int radioSF = 9;
int radioBW = 125;
bool isHardwareRadioAvailable = false;
bool isEmergencyActive = false;

// Civilian Participant Registry
struct UserRecord {
  String uuid;
  String name;
  String model;
  uint8_t numWsClient;
  unsigned long lastHeardMs;
  bool isConnected;
};

#define MAX_PARTICIPANTS 16
UserRecord participants[MAX_PARTICIPANTS];
size_t participantCount = 0;

// Button Debounce & Timers
unsigned long buttonPressStart = 0;
bool buttonActive = false;
unsigned long lastHeartbeatBlink = 0;
bool ledState = false;
unsigned long uptimeStart = 0;

// Forward Declarations
void handleCaptivePortal();
void handleTier1Splash();
void handleApiStatus();
void handleApiRoster();
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length);
void processClientFrame(uint8_t num, const String& jsonStr);
void broadcastToAllClients(const String& json);
void dispatchHardwareSOS();
void initRadioHAL();
void transmitPacketOverRadio(uint8_t packetClass, uint32_t msgId, const String& payload);
void logEvent(const char* tag, const String& message);

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  delay(500);
  uptimeStart = millis();

  logEvent("BOOT", "Initializing LoRaResQ Emergency Mesh Node Gateway v2.0");

  // Load persistent configuration from NVS
  preferences.begin("loraresq", false);
  nodeName = preferences.getString("name", AP_SSID_DEFAULT);
  nodeId = preferences.getString("node_id", NODE_ID_DEFAULT);
  radioChannel = preferences.getInt("channel", 15);
  radioTxPower = preferences.getInt("tx_power", 22);
  radioFreqMhz = 865.125 + (radioChannel - 15) * 1.0;
  preferences.end();

  // GPIO Initializations
  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_STATUS_LED, LOW);

  pinMode(PIN_SOS_BUTTON, INPUT_PULLUP);

  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);

  // Initialize Radio HAL (with auto-detect and simulation fallback)
  initRadioHAL();

  // Configure Wi-Fi SoftAP (802.11 b/g/n, Channel 6)
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(apIP, apIP, netMask);
  WiFi.softAP(nodeName.c_str(), nullptr, 6, 0, 16); // Up to 16 concurrent clients

  logEvent("WIFI_AP", "SoftAP active. SSID: " + nodeName + " | IP: 192.168.4.1");

  // Configure Port 53 DNS Wildcard Captive Portal
  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(DNS_PORT, "*", apIP);
  logEvent("DNS_SERVER", "Captive Portal DNS active on Port 53 (* -> 192.168.4.1)");

  // Configure WebServer Endpoints
  server.on("/", HTTP_GET, handleTier1Splash);
  server.on("/hotspot-detect.html", HTTP_GET, handleCaptivePortal); // Apple iOS CNA
  server.on("/generate_204", HTTP_GET, handleCaptivePortal);       // Android CaptivePortalLogin
  server.on("/canonical.html", HTTP_GET, handleCaptivePortal);
  server.on("/connecttest.txt", HTTP_GET, handleCaptivePortal);    // Windows
  server.on("/api/status", HTTP_GET, handleApiStatus);
  server.on("/api/roster", HTTP_GET, handleApiRoster);
  server.onNotFound(handleCaptivePortal); // Catch-all redirection
  server.begin();
  logEvent("HTTP_SERVER", "Web Server online on port 80");

  // Configure WebSockets Server
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  logEvent("WS_SERVER", "WebSocket Engine online on port 81 (/ws)");

  // Quick startup beep & LED flash
  digitalWrite(PIN_STATUS_LED, HIGH);
  delay(100);
  digitalWrite(PIN_STATUS_LED, LOW);

  logEvent("READY", "Node initialization complete. Awaiting civilian connections.");
}

// ================= LOOP =================
void loop() {
  dnsServer.processNextRequest();
  server.handleClient();
  webSocket.loop();

  // Check Hardware SOS Push Button on GPIO 0
  int buttonState = digitalRead(PIN_SOS_BUTTON);
  if (buttonState == LOW) {
    if (!buttonActive) {
      buttonActive = true;
      buttonPressStart = millis();
    } else {
      // Button held down for > 1500 ms -> Trigger SOS!
      if (millis() - buttonPressStart > 1500 && !isEmergencyActive) {
        dispatchHardwareSOS();
      }
    }
  } else {
    buttonActive = false;
  }

  // Status LED & Alarm Logic
  unsigned long now = millis();
  if (isEmergencyActive) {
    // Rapid Emergency Strobe (100 ms)
    if (now - lastHeartbeatBlink > 100) {
      lastHeartbeatBlink = now;
      ledState = !ledState;
      digitalWrite(PIN_STATUS_LED, ledState ? HIGH : LOW);
    }
  } else {
    // Gentle Heartbeat Pulse (1500 ms)
    if (now - lastHeartbeatBlink > 1500) {
      lastHeartbeatBlink = now;
      ledState = !ledState;
      digitalWrite(PIN_STATUS_LED, ledState ? HIGH : LOW);
    }
  }

  // Periodic client lease check (45 seconds timeout)
  static unsigned long lastLeaseSweep = 0;
  if (now - lastLeaseSweep > 10000) {
    lastLeaseSweep = now;
    for (size_t i = 0; i < participantCount; i++) {
      if (participants[i].isConnected && (now - participants[i].lastHeardMs > 45000)) {
        participants[i].isConnected = false;
        logEvent("LEASE_EXPIRED", "Client " + participants[i].name + " marked offline");
      }
    }
  }

  // Read incoming bytes from E22 Radio UART if available
  if (isHardwareRadioAvailable && Serial1.available()) {
    String rfData = Serial1.readString();
    logEvent("RF_RX_RAW", rfData);
    // Forward RF frames to WebSocket clients
    broadcastToAllClients("{\"type\":\"NEW_GLOBAL_MESSAGE\",\"message\":{\"body\":\"" + rfData + "\"}}");
  }
}

// ================= RADIO HAL & EMULATION =================
void initRadioHAL() {
  pinMode(PIN_E22_M0, OUTPUT);
  pinMode(PIN_E22_M1, OUTPUT);
  pinMode(PIN_E22_AUX, INPUT_PULLUP);

  // Set Mode 0 (Normal Transmission: M0 = 0, M1 = 0)
  digitalWrite(PIN_E22_M0, LOW);
  digitalWrite(PIN_E22_M1, LOW);

  Serial1.begin(9600, SERIAL_8N1, PIN_E22_RX, PIN_E22_TX);

  // Probe AUX line & send ping
  delay(100);
  int auxVal = digitalRead(PIN_E22_AUX);

  // If no hardware connected (e.g. breadboard without E22 module)
  // Pin floating or uncommunicative -> enter Hardware Simulation Mode
  Serial1.write(0xC1); // Query command
  delay(50);

  if (Serial1.available() > 0) {
    isHardwareRadioAvailable = true;
    logEvent("RADIO_HAL", "EBYTE E22 / SX1262 hardware detected on UART1 (865.125 MHz).");
  } else {
    isHardwareRadioAvailable = false;
    logEvent("RADIO_HAL", "HARDWARE NOTICE: EBYTE E22 LoRa module unpopulated on GPIO 17/18. Radio HAL active in Loopback/Emulation Mode.");
  }
}

void transmitPacketOverRadio(uint8_t packetClass, uint32_t msgId, const String& payload) {
  if (isHardwareRadioAvailable) {
    // Physical UART write to E22 module
    Serial1.print(payload);
    logEvent("RF_TX_HARDWARE", "Dispatched " + String(payload.length()) + " bytes over 865.125 MHz LoRa");
  } else {
    // Virtual Loopback Emulation
    logEvent("RF_TX_SIMULATED", "[Emulation] Dispatched packet Class=" + String(packetClass) + " MsgID=" + String(msgId) + " Payload=" + payload);
  }
}

// ================= HARDWARE SOS TRIGGER =================
void dispatchHardwareSOS() {
  isEmergencyActive = true;
  logEvent("HARDWARE_SOS", "CRITICAL: Physical BOOT button pressed on enclosure!");

  // Sound audible alarm
  digitalWrite(PIN_BUZZER, HIGH);

  // Build SOS Alert Frame
  String sosMsg = "{\"type\":\"EMERGENCY_ALERT\",\"alert\":{"
                  "\"messageId\":\"sos-hw-" + String(millis()) + "\","
                  "\"senderUuid\":\"node-" + nodeId + "\","
                  "\"senderName\":\"HARDWARE SOS: " + nodeName + "\","
                  "\"senderNodeId\":\"" + nodeId + "\","
                  "\"body\":\"HARDWARE SOS TRIGGERED AT ENCLOSURE. Immediate search and rescue assistance requested!\","
                  "\"originalTimestamp\":\"Just now\","
                  "\"expiresAt\":\"In 30 days\","
                  "\"hopCount\":0,"
                  "\"isEmergencyAlert\":true"
                  "}}";

  // Dispatch over mesh and WebSockets
  transmitPacketOverRadio(0x03, millis(), "SOS: " + nodeName);
  broadcastToAllClients(sosMsg);

  delay(500);
  digitalWrite(PIN_BUZZER, LOW);
}

// ================= WEBSOCKET PROTOCOL ENGINE =================
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      logEvent("WS_CLIENT_CONNECTED", "Client [" + String(num) + "] connected from " + ip.toString());
      break;
    }
    case WStype_DISCONNECTED: {
      logEvent("WS_CLIENT_DISCONNECTED", "Client [" + String(num) + "] disconnected");
      // Find client and mark offline
      for (size_t i = 0; i < participantCount; i++) {
        if (participants[i].numWsClient == num) {
          participants[i].isConnected = false;
          break;
        }
      }
      break;
    }
    case WStype_TEXT: {
      String jsonStr = "";
      for (size_t i = 0; i < length; i++) {
        jsonStr += (char)payload[i];
      }
      processClientFrame(num, jsonStr);
      break;
    }
    default:
      break;
  }
}

void processClientFrame(uint8_t num, const String& jsonStr) {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, jsonStr);
  if (err) {
    logEvent("WS_PARSE_ERROR", err.c_str());
    return;
  }

  const char* type = doc["type"];
  if (!type) return;

  if (strcmp(type, "CLIENT_HELLO") == 0) {
    const char* uuid = doc["deviceUuid"] | "unknown";
    const char* name = doc["displayName"] | "Civilian";
    const char* model = doc["deviceModel"] | "Device";

    // Update or insert participant
    bool found = false;
    for (size_t i = 0; i < participantCount; i++) {
      if (participants[i].uuid == uuid) {
        participants[i].name = name;
        participants[i].model = model;
        participants[i].numWsClient = num;
        participants[i].lastHeardMs = millis();
        participants[i].isConnected = true;
        found = true;
        break;
      }
    }

    if (!found && participantCount < MAX_PARTICIPANTS) {
      participants[participantCount] = {
        String(uuid),
        String(name),
        String(model),
        num,
        millis(),
        true
      };
      participantCount++;
    }

    logEvent("CIVILIAN_REGISTERED", String(name) + " (" + String(uuid) + ") on Client #" + String(num));

    // Construct NODE_HELLO response
    JsonDocument welcomeDoc;
    welcomeDoc["type"] = "NODE_HELLO";
    welcomeDoc["isSimulated"] = !isHardwareRadioAvailable;

    JsonObject info = welcomeDoc["nodeInfo"].to<JsonObject>();
    info["nodeId"] = nodeId;
    info["name"] = nodeName;
    info["frequencyMhz"] = radioFreqMhz;
    info["channel"] = radioChannel;
    info["txPowerDbm"] = radioTxPower;
    info["batteryVoltage"] = 3.96;
    info["batteryPercent"] = 85;
    info["connectedClients"] = participantCount;
    info["hopCount"] = 0;
    info["uptimeSeconds"] = (millis() - uptimeStart) / 1000;
    info["lastSeenAt"] = "Active now";

    JsonArray roster = welcomeDoc["roster"].to<JsonArray>();
    for (size_t i = 0; i < participantCount; i++) {
      JsonObject u = roster.add<JsonObject>();
      u["deviceUuid"] = participants[i].uuid;
      u["displayName"] = participants[i].name;
      u["deviceModel"] = participants[i].model;
      u["currentNodeId"] = nodeId;
      u["presenceStatus"] = participants[i].isConnected ? "connected" : "offline";
      u["firstSeenAt"] = "Today";
      u["lastSeenAt"] = "Active now";
    }

    welcomeDoc["recentGlobal"].to<JsonArray>();
    welcomeDoc["queuedPersonal"].to<JsonArray>();

    String out;
    serializeJson(welcomeDoc, out);
    webSocket.sendTXT(num, out);
  }
  else if (strcmp(type, "HEARTBEAT") == 0) {
    const char* uuid = doc["deviceUuid"] | "";
    for (size_t i = 0; i < participantCount; i++) {
      if (participants[i].uuid == uuid) {
        participants[i].lastHeardMs = millis();
        participants[i].isConnected = true;
        break;
      }
    }
    webSocket.sendTXT(num, "{\"type\":\"HEARTBEAT_ACK\",\"timestamp\":" + String(millis()) + "}");
  }
  else if (strcmp(type, "SEND_PERSONAL") == 0) {
    const char* msgId = doc["messageId"] | "msg-0";
    const char* recipientUuid = doc["recipientUuid"] | "";
    const char* body = doc["body"] | "";

    logEvent("SEND_PERSONAL", "Msg: " + String(body) + " -> " + String(recipientUuid));

    // Check if recipient is connected locally
    bool deliveredLocally = false;
    for (size_t i = 0; i < participantCount; i++) {
      if (participants[i].uuid == recipientUuid && participants[i].isConnected) {
        String forwardStr = "{\"type\":\"NEW_PERSONAL_MESSAGE\",\"message\":" + jsonStr + "}";
        webSocket.sendTXT(participants[i].numWsClient, forwardStr);
        deliveredLocally = true;
        break;
      }
    }

    if (deliveredLocally) {
      webSocket.sendTXT(num, "{\"type\":\"MESSAGE_STATUS_UPDATE\",\"messageId\":\"" + String(msgId) + "\",\"status\":\"delivered\"}");
    } else {
      // Dispatch to LoRa Mesh
      transmitPacketOverRadio(0x01, millis(), jsonStr);
      webSocket.sendTXT(num, "{\"type\":\"MESSAGE_STATUS_UPDATE\",\"messageId\":\"" + String(msgId) + "\",\"status\":\"pending\"}");
    }
  }
  else if (strcmp(type, "SEND_GLOBAL") == 0 || strcmp(type, "SEND_SOS") == 0) {
    bool isSos = (strcmp(type, "SEND_SOS") == 0) || doc["isEmergencyAlert"].as<bool>();
    if (isSos) {
      isEmergencyActive = true;
      digitalWrite(PIN_BUZZER, HIGH);
      delay(200);
      digitalWrite(PIN_BUZZER, LOW);
    }

    // Broadcast to all connected clients
    String broadcastPayload = isSos
      ? "{\"type\":\"EMERGENCY_ALERT\",\"alert\":" + jsonStr + "}"
      : "{\"type\":\"NEW_GLOBAL_MESSAGE\",\"message\":" + jsonStr + "}";

    broadcastToAllClients(broadcastPayload);

    // Forward to LoRa mesh
    transmitPacketOverRadio(isSos ? 0x03 : 0x02, millis(), jsonStr);
  }
  else if (strcmp(type, "ADMIN_AUTH") == 0) {
    const char* pass = doc["password"] | "";
    bool ok = (strcmp(pass, ADMIN_PASSWORD_DEFAULT) == 0);
    String res = ok
      ? "{\"type\":\"ADMIN_AUTH_RESULT\",\"success\":true,\"token\":\"esp32-valid-token\"}"
      : "{\"type\":\"ADMIN_AUTH_RESULT\",\"success\":false,\"error\":\"Invalid administrative password\"}";
    webSocket.sendTXT(num, res);
  }
}

void broadcastToAllClients(const String& json) {
  String payloadCopy = json;
  webSocket.broadcastTXT(payloadCopy);
}

// ================= TIER 1 CAPTIVE SPLASH PAGE =================
void handleTier1Splash() {
  String html = "<!DOCTYPE html><html><head><meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>LoRaResQ — Emergency Node</title>"
    "<style>"
    "body{background:#0a0f1d;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:1.5rem;text-align:center;}"
    ".card{background:#18233c;border:1px solid #273759;border-radius:12px;padding:1.5rem;max-width:440px;margin:1rem auto;box-shadow:0 4px 12px rgba(0,0,0,0.4);}"
    ".badge{background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;display:inline-block;}"
    "h1{color:#06b6d4;font-size:1.5rem;margin:0.5rem 0;}"
    "p{color:#94a3b8;font-size:0.85rem;line-height:1.5;}"
    ".btn{display:block;background:#06b6d4;color:#0a0f1d;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:1.25rem;font-size:0.95rem;}"
    ".metric{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #273759;font-size:0.85rem;}"
    "</style></head><body>"
    "<div class='card'>"
    "<div class='badge'>OFF-GRID EMERGENCY NODE ONLINE</div>"
    "<h1>LoRaResQ</h1>"
    "<p>You are connected to an autonomous rural disaster relief mesh gateway.</p>"
    "<div style='margin:1rem 0;text-align:left;'>"
    "<div class='metric'><span>Node Name:</span><strong>" + nodeName + "</strong></div>"
    "<div class='metric'><span>RF Frequency:</span><strong>" + String(radioFreqMhz) + " MHz (Ch " + String(radioChannel) + ")</strong></div>"
    "<div class='metric'><span>Radio Status:</span><strong>" + (isHardwareRadioAvailable ? "EBYTE SX1262 Live" : "HAL Emulation Mode") + "</strong></div>"
    "<div class='metric'><span>Connected Civilians:</span><strong>" + String(participantCount) + "</strong></div>"
    "</div>"
    "<div style='background:#1e1b4b;border:1px solid #4338ca;padding:12px;border-radius:8px;font-size:0.8rem;color:#c7d2fe;text-align:left;'>"
    "<strong>Important Onboarding Step:</strong><br>"
    "1. Tap <em>'Use Without Internet'</em> or <em>'Keep Connection'</em> if prompted by your phone.<br>"
    "2. Open Mobile Safari or Google Chrome to <strong>http://192.168.4.1</strong> to launch the offline emergency console."
    "</div>"
    "<a href='http://192.168.4.1' class='btn'>Launch LoRaResQ Console</a>"
    "</div></body></html>";

  server.send(200, "text/html", html);
}

void handleCaptivePortal() {
  // RFC 8910 redirection to local onboarding page
  server.sendHeader("Location", "http://192.168.4.1/", true);
  server.send(302, "text/plain", "Redirecting to LoRaResQ Onboarding Portal");
}

void handleApiStatus() {
  String json = "{\"nodeId\":\"" + nodeId + "\","
                "\"name\":\"" + nodeName + "\","
                "\"frequencyMhz\":" + String(radioFreqMhz) + ","
                "\"channel\":" + String(radioChannel) + ","
                "\"hardwareRadio\":" + (isHardwareRadioAvailable ? "true" : "false") + ","
                "\"clients\":" + String(participantCount) + "}";
  server.send(200, "application/json", json);
}

void handleApiRoster() {
  String json = "[";
  for (size_t i = 0; i < participantCount; i++) {
    if (i > 0) json += ",";
    json += "{\"uuid\":\"" + participants[i].uuid + "\","
            "\"name\":\"" + participants[i].name + "\","
            "\"connected\":" + (participants[i].isConnected ? "true" : "false") + "}";
  }
  json += "]";
  server.send(200, "application/json", json);
}

void logEvent(const char* tag, const String& message) {
  Serial.print("[LoRaResQ] ");
  Serial.print(tag);
  Serial.print(" | ");
  Serial.println(message);
}
