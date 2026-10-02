#include <Arduino.h>
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

// LoRaResQ BLE protocol v1:
// 8-byte header: 0x4c 0x51, version, type, uint16 sequence, uint16 payload length.
// Payload is UTF-8 JSON. BLE writes and notifications are reassembled in 20-byte chunks.
static const char *SERVICE_UUID = "7f6c0001-6b52-4f5d-9a5e-4f6c6f726151";
static const char *WRITE_UUID = "7f6c0002-6b52-4f5d-9a5e-4f6c6f726151";
static const char *NOTIFY_UUID = "7f6c0003-6b52-4f5d-9a5e-4f6c6f726151";
static const uint8_t PROTOCOL_VERSION = 1;
static BLECharacteristic *notifyCharacteristic;
static BLEServer *bleServer;
static uint16_t connectedClients = 0;
static const unsigned long PARTICIPANT_PROBE_INTERVAL_MS = 10000;
static unsigned long lastParticipantProbe = 0;
static uint16_t participantProbeSequence = 0;
void notifyFrame(uint8_t type, uint16_t sequence, const String &json,
                 uint16_t targetConnId = 0xffff);

struct Participant {
  String id;
  String name;
  unsigned long lastHeard;
  uint16_t connId;
  uint8_t missedProbes;
};

static Participant participants[8];
static size_t participantCount = 0;

struct ClientBuffer {
  uint16_t connId;
  String inbound;
};

static ClientBuffer clientBuffers[8];
static size_t clientBufferCount = 0;

void logEvent(const char *event, const String &detail = "") {
  Serial.print("[LoRaResQ] ");
  Serial.print(event);
  if (detail.length() > 0) {
    Serial.print(" | ");
    Serial.print(detail);
  }
  Serial.println();
}

String jsonField(const String &json, const char *field) {
  String key = String("\"") + field + "\":\"";
  const int start = json.indexOf(key);
  if (start < 0) return "";
  const int valueStart = start + key.length();
  const int valueEnd = json.indexOf('"', valueStart);
  if (valueEnd < 0) return "";
  return json.substring(valueStart, valueEnd);
}

String rosterJson() {
  String json = "{\"participants\":[";
  for (size_t index = 0; index < participantCount; index++) {
    if (index > 0) json += ",";
    json += "{\"id\":\"";
    json += participants[index].id;
    json += "\",\"name\":\"";
    json += participants[index].name;
    json += "\",\"connected\":true,\"lastHeard\":\"";
    json += String(participants[index].lastHeard);
    json += "\"}";
  }
  json += "]}";
  return json;
}

void notifyRoster() {
  const String json = rosterJson();
  logEvent("ROSTER_UPDATED", "participants=" + String(participantCount));
  notifyFrame(6, 0, json);
}

bool rememberParticipant(const String &id, const String &name, uint16_t connId) {
  if (id.length() == 0 || name.length() == 0) return false;
  for (size_t index = 0; index < participantCount; index++) {
    if (participants[index].id == id) {
      participants[index].name = name;
      participants[index].lastHeard = millis();
      participants[index].connId = connId;
      participants[index].missedProbes = 0;
      logEvent("PARTICIPANT_REFRESHED", "id=" + id + " name=" + name);
      return false;
    }
    if (participants[index].name == name) {
      logEvent("PARTICIPANT_REJECTED_DUPLICATE_NAME",
               "id=" + id + " name=" + name);
      return false;
    }
  }
  if (participantCount >= 8) return false;
  participants[participantCount++] = {id, name, millis(), connId, 0};
  logEvent("PARTICIPANT_STORED", "id=" + id + " name=" + name);
  return true;
}

void probeParticipants() {
  if (participantCount == 0 ||
      millis() - lastParticipantProbe < PARTICIPANT_PROBE_INTERVAL_MS) {
    return;
  }
  lastParticipantProbe = millis();
  bool changed = false;
  for (size_t index = 0; index < participantCount;) {
    Participant &participant = participants[index];
    participant.missedProbes++;
    logEvent("PARTICIPANT_PROBE", "id=" + participant.id +
                                      " attempt=" +
                                      String(participant.missedProbes));
    if (participant.missedProbes >= 2) {
      logEvent("PARTICIPANT_REMOVED_NO_RESPONSE", "id=" + participant.id);
      for (size_t move = index + 1; move < participantCount; move++) {
        participants[move - 1] = participants[move];
      }
      participantCount--;
      changed = true;
      continue;
    }
    index++;
  }
  notifyFrame(10, ++participantProbeSequence,
              "{\"state\":\"participantPresenceProbe\"}");
  if (changed) notifyRoster();
}

void acknowledgeParticipantPresence(uint16_t connId, const String &id) {
  for (size_t index = 0; index < participantCount; index++) {
    if (participants[index].connId == connId &&
        (id.length() == 0 || participants[index].id == id)) {
      participants[index].lastHeard = millis();
      participants[index].missedProbes = 0;
      logEvent("PARTICIPANT_PRESENCE_ACK", "id=" + participants[index].id);
      return;
    }
  }
  logEvent("PARTICIPANT_PRESENCE_ACK_UNKNOWN", "conn=" + String(connId));
}

void notifyFrame(uint8_t type, uint16_t sequence, const String &json,
                 uint16_t targetConnId) {
  const uint16_t length = json.length();
  String frame;
  frame.reserve(8 + length);
  frame += char(0x4c);
  frame += char(0x51);
  frame += char(PROTOCOL_VERSION);
  frame += char(type);
  frame += char(sequence & 0xff);
  frame += char((sequence >> 8) & 0xff);
  frame += char(length & 0xff);
  frame += char((length >> 8) & 0xff);
  frame += json;
  logEvent("OUT_FRAME", "type=" + String(type) + " seq=" + String(sequence) +
                           " bytes=" + String(frame.length()));

  for (size_t offset = 0; offset < frame.length(); offset += 20) {
    const size_t count = min((size_t)20, frame.length() - offset);
    notifyCharacteristic->setValue((uint8_t *)frame.c_str() + offset, count);
    // The Arduino BLE facade only exposes broadcast notify(). Keep the
    // destination in the broker event; clients discard direct events not
    // addressed to them. This preserves the protocol while remaining
    // compatible with the installed ESP32 core.
    notifyCharacteristic->notify();
    logEvent("OUT_CHUNK", "offset=" + String(offset) + " bytes=" + String(count) +
                              " target=" + String(targetConnId));
    delay(40);
  }
}

class WriteCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic,
               esp_ble_gatts_cb_param_t *param) override {
    const uint16_t connId = param->write.conn_id;
    String value = characteristic->getValue();
    ClientBuffer *buffer = nullptr;
    for (size_t index = 0; index < clientBufferCount; index++) {
      if (clientBuffers[index].connId == connId) {
        buffer = &clientBuffers[index];
        break;
      }
    }
    if (buffer == nullptr && clientBufferCount < 8) {
      clientBuffers[clientBufferCount] = {connId, ""};
      buffer = &clientBuffers[clientBufferCount++];
    }
    if (buffer == nullptr) return;
    logEvent("IN_CHUNK", "conn=" + String(connId) + " bytes=" + String(value.length()));
    buffer->inbound += value;
    while (buffer->inbound.length() >= 8) {
      const uint16_t payloadLength =
          (uint8_t)buffer->inbound[6] | ((uint8_t)buffer->inbound[7] << 8);
      const size_t frameLength = 8 + payloadLength;
      if (buffer->inbound.length() < frameLength) return;
      if ((uint8_t)buffer->inbound[0] != 0x4c ||
          (uint8_t)buffer->inbound[1] != 0x51 ||
          (uint8_t)buffer->inbound[2] != PROTOCOL_VERSION) {
        logEvent("FRAME_REJECTED", "invalid header");
        buffer->inbound = "";
        notifyFrame(4, 0, "{\"message\":\"Invalid frame\"}", connId);
        return;
      }
      const uint16_t sequence =
          (uint8_t)buffer->inbound[4] | ((uint8_t)buffer->inbound[5] << 8);
      const uint8_t type = (uint8_t)buffer->inbound[3];
      String payload = buffer->inbound.substring(8, frameLength);
      buffer->inbound.remove(0, frameLength);
      logEvent("IN_FRAME", "conn=" + String(connId) + " type=" + String(type) +
                              " seq=" + String(sequence) +
                              " payloadBytes=" + String(payloadLength));
      if (type == 1 &&
          jsonField(payload, "state") == "participantPresenceAck") {
        acknowledgeParticipantPresence(connId, jsonField(payload, "participantId"));
      } else if (type == 2) {
        logEvent("SEND_TEXT", "seq=" + String(sequence) + " payload=" + payload);
        const String messageId = jsonField(payload, "messageId");
        const String senderId = jsonField(payload, "senderId");
        const String destination = jsonField(payload, "destination");
        const String body = jsonField(payload, "body");
        const String alertKind = jsonField(payload, "alertKind");
        const String broadcastedAt = jsonField(payload, "broadcastedAt");
        notifyFrame(1, sequence,
                    "{\"id\":\"" + messageId +
                        "\",\"state\":\"acceptedByNode\"}", connId);
        String event = "{\"messageId\":\"" + messageId +
                       "\",\"senderId\":\"" + senderId +
                       "\",\"destination\":\"" + destination +
                       "\",\"body\":\"" + body +
                       "\",\"broadcastedAt\":\"" + broadcastedAt + "\"";
        if (alertKind.length() > 0) {
          event += ",\"alertKind\":\"" + alertKind + "\"";
        }
        event += "}";
        const uint8_t eventType = alertKind.length() > 0 ? 9 : 8;
        uint16_t target = 0xffff;
        if (destination != "community") {
          target = 0xffff;
          for (size_t index = 0; index < participantCount; index++) {
            if (participants[index].id == destination) {
              target = participants[index].connId;
              break;
            }
          }
        }
        logEvent("DELIVER", "messageId=" + messageId +
                           " destination=" + destination +
                           " target=" + String(target));
        if (destination == "community" || target != 0xffff) {
          notifyFrame(eventType, 0, event, target);
        } else {
          notifyFrame(4, sequence, "{\"message\":\"Participant unavailable\"}",
                      connId);
        }
      } else if (type == 5) {
        logEvent("PARTICIPANT_HELLO", "seq=" + String(sequence) +
                                        " payload=" + payload);
        const String participantId = jsonField(payload, "participantId");
        const String displayName = jsonField(payload, "displayName");
        const bool added = rememberParticipant(
            participantId, displayName, connId);
        // The joining phone gets a reverse acknowledgement containing the
        // complete roster. Existing phones receive the same updated table
        // through the shared roster event below.
        notifyFrame(1, sequence,
                    "{\"state\":\"participantAccepted\",\"stored\":" +
                        String(added ? "true" : "false") +
                        ",\"participants\":" + rosterJson().substring(16),
                    connId);
        if (added) notifyRoster();
      } else if (type == 7) {
        logEvent("PARTICIPANT_ROSTER_REQUEST", "seq=" + String(sequence));
        notifyRoster();
        notifyFrame(1, sequence, "{\"state\":\"rosterSent\"}", connId);
      } else {
        logEvent("FRAME_IGNORED", "unsupported type=" + String(type));
      }
    }
  }
};

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    connectedClients++;
    logEvent("BLE_CONNECTED", "clients=" + String(connectedClients));
    BLEDevice::startAdvertising();
  }

  void onDisconnect(BLEServer *server) override {
    if (connectedClients > 0) connectedClients--;
    logEvent("BLE_DISCONNECTED", "clients=" + String(connectedClients));
    for (size_t index = 0; index < clientBufferCount; index++) {
      if (clientBuffers[index].connId == server->getConnId()) {
        clientBuffers[index] = clientBuffers[--clientBufferCount];
        break;
      }
    }
    if (connectedClients == 0) {
      participantCount = 0;
      logEvent("ROSTER_CLEARED", "last client disconnected");
      notifyRoster();
    }
    BLEDevice::startAdvertising();
  }
};

void setup() {
  Serial.begin(115200);
  delay(100);
  logEvent("BOOT", "starting BLE bridge");
  BLEDevice::init("LoRaResQ ESP32");
  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());
  BLEService *service = bleServer->createService(SERVICE_UUID);
  BLECharacteristic *writeCharacteristic = service->createCharacteristic(
      WRITE_UUID,
      BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  writeCharacteristic->setCallbacks(new WriteCallbacks());
  notifyCharacteristic = service->createCharacteristic(
      NOTIFY_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  notifyCharacteristic->addDescriptor(new BLE2902());
  service->start();
  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
  logEvent("READY", "name=LoRaResQ ESP32 service=" + String(SERVICE_UUID));
}

void loop() {
  probeParticipants();
  delay(100);
}
