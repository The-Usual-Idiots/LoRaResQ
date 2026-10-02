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
static String inbound;
static BLECharacteristic *notifyCharacteristic;

void notifyFrame(uint8_t type, uint16_t sequence, const String &json) {
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

  for (size_t offset = 0; offset < frame.length(); offset += 20) {
    const size_t count = min((size_t)20, frame.length() - offset);
    notifyCharacteristic->setValue((uint8_t *)frame.c_str() + offset, count);
    notifyCharacteristic->notify();
    delay(8);
  }
}

class WriteCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    String value = characteristic->getValue();
    inbound += value;
    while (inbound.length() >= 8) {
      const uint16_t payloadLength =
          (uint8_t)inbound[6] | ((uint8_t)inbound[7] << 8);
      const size_t frameLength = 8 + payloadLength;
      if (inbound.length() < frameLength) return;
      if ((uint8_t)inbound[0] != 0x4c || (uint8_t)inbound[1] != 0x51 ||
          (uint8_t)inbound[2] != PROTOCOL_VERSION) {
        inbound = "";
        notifyFrame(4, 0, "{\"message\":\"Invalid frame\"}");
        return;
      }
      const uint16_t sequence =
          (uint8_t)inbound[4] | ((uint8_t)inbound[5] << 8);
      const uint8_t type = (uint8_t)inbound[3];
      String payload = inbound.substring(8, frameLength);
      inbound.remove(0, frameLength);
      if (type == 2) {
        Serial.printf("SEND_TEXT seq=%u payload=%s\n", sequence, payload.c_str());
        notifyFrame(1, sequence,
                    "{\"id\":\"esp32-accepted\",\"state\":\"acceptedByNode\"}");
      }
    }
  }
};

void setup() {
  Serial.begin(115200);
  BLEDevice::init("LoRaResQ ESP32");
  BLEServer *server = BLEDevice::createServer();
  BLEService *service = server->createService(SERVICE_UUID);
  BLECharacteristic *writeCharacteristic = service->createCharacteristic(
      WRITE_UUID, BLECharacteristic::PROPERTY_WRITE);
  writeCharacteristic->setCallbacks(new WriteCallbacks());
  notifyCharacteristic = service->createCharacteristic(
      NOTIFY_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  notifyCharacteristic->addDescriptor(new BLE2902());
  service->start();
  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("LoRaResQ BLE bridge ready");
}

void loop() {
  delay(100);
}
