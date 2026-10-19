/**
 * LoRaResQ Core Data Contracts
 * Defines types for nodes, users, messages, location, and telemetry
 * shared between the Next.js client and ESP32-S3 firmware.
 */

export type PresenceStatus = 'connected' | 'offline' | 'unconfirmed';

export type MessageDeliveryStatus = 'pending' | 'delivered' | 'expired' | 'failed';

export interface NodeInfo {
  nodeId: string;
  name: string;
  frequencyMhz: number;
  channel: number;
  txPowerDbm: number;
  batteryVoltage: number;
  batteryPercent: number;
  connectedClients: number;
  hopCount: number;
  uptimeSeconds: number;
  lastSeenAt: string;
}

export interface UserProfile {
  deviceUuid: string;
  displayName: string;
  deviceModel: string;
  currentNodeId: string;
  presenceStatus: PresenceStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  isSelf?: boolean;
}

export interface PersonalMessage {
  messageId: string;
  senderUuid: string;
  senderName: string;
  recipientUuid: string;
  recipientName: string;
  body: string;
  originalTimestamp: string;
  deliveredTimestamp?: string;
  expiresAt: string; // 7-day retention
  status: MessageDeliveryStatus;
  retryCount: number;
}

export interface GlobalMessage {
  messageId: string;
  senderUuid: string;
  senderName: string;
  senderNodeId: string;
  body: string;
  originalTimestamp: string;
  expiresAt: string; // 30-day retention
  hopCount: number;
  isEmergencyAlert?: boolean;
}

export interface DeviceLocation {
  deviceUuid: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  accuracyMeters: number | null;
  updatedAt: string;
  isStale: boolean; // Marked stale if older than 15 minutes or unverified
  source: 'gps' | 'manual' | 'unavailable';
}

export interface NodeConfig {
  nodeName: string;
  nodeId: string;
  radioFrequencyMhz: number;
  radioChannel: number;
  txPowerDbm: number;
  spreadingFactor: number;
  bandwidthKhz: number;
  wifiSsid: string;
  wifiChannel: number;
  heartbeatIntervalSec: number;
}
