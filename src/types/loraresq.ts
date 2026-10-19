/**
 * LoRaResQ Core Data Contracts
 * Defines types for nodes, users, messages, location, telemetry,
 * WebSocket frames, and binary over-the-air packets according to BLUEPRINT.md.
 */

export type PresenceStatus = 'connected' | 'offline' | 'unconfirmed';

export type MessageDeliveryStatus = 'pending' | 'delivered' | 'expired' | 'failed';

export type TransportConnectionState = 'live' | 'simulated' | 'offline' | 'connecting';

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
  isSimulated?: boolean;
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

/**
 * Binary Over-The-Air Packet Specification (BLUEPRINT.md Section 7)
 */
export const PACKET_MAGIC = 0x52; // 'R'
export const PROTOCOL_VERSION = 0x02;
export const NETWORK_ID = 0x26; // LoRaResQ network isolation
export const BROADCAST_NODE_ID = 0xffff;

export enum PacketClass {
  DIRECT_TEXT = 0x01,
  GLOBAL_CHAT = 0x02,
  EMERGENCY_SOS = 0x03,
  ACK = 0x04,
  TELEMETRY = 0x05,
  HORIZON_SYNC = 0x06,
}

export interface BinaryPacketHeader {
  magic: number; // 1B (0x52)
  version: number; // 1B (0x02)
  networkId: number; // 1B (0x26)
  packetClass: PacketClass; // 1B
  messageId: number; // 4B (uint32)
  sourceNodeId: number; // 2B (uint16)
  destNodeId: number; // 2B (uint16)
  hopLimit: number; // 1B (TTL)
  payloadLen: number; // 1B
}

export interface BinaryPacket {
  header: BinaryPacketHeader;
  ciphertextPayload: Uint8Array;
  authTag: Uint8Array; // 16B AES-128-GCM authentication tag
}

export interface DecryptedPacketPayload {
  senderUuid: string;
  recipientUuid?: string;
  timestamp: number;
  text?: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

/**
 * WebSocket Protocol Types (Client <-> ESP32 Gateway via ws://192.168.4.1/ws)
 */

export type ClientWsMessage =
  | {
      type: 'CLIENT_HELLO';
      deviceUuid: string;
      displayName: string;
      deviceModel: string;
    }
  | {
      type: 'HEARTBEAT';
      deviceUuid: string;
    }
  | {
      type: 'SEND_PERSONAL';
      messageId: string;
      recipientUuid: string;
      recipientName: string;
      body: string;
      originalTimestamp: number;
    }
  | {
      type: 'SEND_GLOBAL';
      messageId: string;
      body: string;
      originalTimestamp: number;
      isEmergencyAlert?: boolean;
    }
  | {
      type: 'SEND_SOS';
      messageId: string;
      body: string;
      location: DeviceLocation;
      originalTimestamp: number;
    }
  | {
      type: 'UPDATE_LOCATION';
      location: DeviceLocation;
    }
  | {
      type: 'ADMIN_AUTH';
      password: string;
    }
  | {
      type: 'UPDATE_CONFIG';
      token: string;
      config: Partial<NodeConfig>;
    };

export type NodeWsMessage =
  | {
      type: 'NODE_HELLO';
      nodeInfo: NodeInfo;
      roster: UserProfile[];
      recentGlobal: GlobalMessage[];
      queuedPersonal: PersonalMessage[];
      isSimulated?: boolean;
    }
  | {
      type: 'HEARTBEAT_ACK';
      timestamp: number;
    }
  | {
      type: 'ROSTER_UPDATE';
      roster: UserProfile[];
    }
  | {
      type: 'NEW_PERSONAL_MESSAGE';
      message: PersonalMessage;
    }
  | {
      type: 'NEW_GLOBAL_MESSAGE';
      message: GlobalMessage;
    }
  | {
      type: 'MESSAGE_STATUS_UPDATE';
      messageId: string;
      status: MessageDeliveryStatus;
      deliveredTimestamp?: string;
    }
  | {
      type: 'EMERGENCY_ALERT';
      alert: GlobalMessage;
    }
  | {
      type: 'NODE_TELEMETRY';
      nodeInfo: NodeInfo;
    }
  | {
      type: 'ADMIN_AUTH_RESULT';
      success: boolean;
      token?: string;
      error?: string;
    }
  | {
      type: 'CONFIG_UPDATED';
      config: NodeConfig;
    }
  | {
      type: 'ERROR';
      code: string;
      message: string;
    };
