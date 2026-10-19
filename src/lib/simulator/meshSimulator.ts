/**
 * LoRaResQ Multi-Node Mesh Simulator
 * Implements BLUEPRINT.md Sections 2, 6, 7 & 8:
 * - Half-duplex RF channel emulation with SF9 airtime calculations
 * - Gradient-directed opportunistic flooding with passive overhearing (Passive ACK)
 * - 256-entry circular deduplication ring cache
 * - SNR-weighted jitter backoff and overheard transmission suppression
 * - Store-and-forward queueing with recipient presence delivery
 * - Horizon vector partition recovery
 */

import {
  PACKET_MAGIC,
  PROTOCOL_VERSION,
  NETWORK_ID,
  PacketClass,
  BROADCAST_NODE_ID,
  BinaryPacket,
  NodeInfo,
  UserProfile,
  PersonalMessage,
  GlobalMessage,
  DeviceLocation,
  NodeConfig,
  DecryptedPacketPayload,
} from '@/types/loraresq';
import {
  serializePacket,
  deserializePacket,
  encodePayload,
  decodePayload,
  getPacketDeduplicationKey,
  MAX_CIPHERTEXT_SIZE,
} from '@/lib/protocol/binaryPacket';

export interface SimulatedRFLink {
  fromNodeId: number;
  toNodeId: number;
  snrDb: number; // e.g. +8 dB to -15 dB
  rssi: number; // e.g. -75 dBm to -125 dBm
  packetLossRate: number; // 0.0 to 1.0
  isPartitioned: boolean;
}

export interface RelayTimer {
  messageKey: bigint;
  packet: BinaryPacket;
  scheduledTime: number;
  timeoutHandle?: NodeJS.Timeout;
}

export interface PassiveAckTimer {
  messageKey: bigint;
  sourceNodeId: number;
  messageId: number;
  deadline: number;
  retriesRemaining: number;
  rawBytes: Uint8Array;
}

/**
 * Calculates Semtech SX1262 LoRa physical time-on-air (ToA) in milliseconds
 * Default profile: Bandwidth = 125 kHz, SF = 9, CR = 4/5, Preamble = 8
 */
export function calculateLoRaToA(payloadBytes: number, sf = 9, bwKhz = 125, cr = 1, preamble = 8): number {
  const bw = bwKhz * 1000;
  const tSym = (Math.pow(2, sf) / bw) * 1000; // ms
  const tPreamble = (preamble + 4.25) * tSym;

  // Semtech formula for payload symbol count
  const de = sf >= 11 ? 1 : 0; // Low Data Rate Optimization
  const num = 8 * payloadBytes - 4 * sf + 28 + 16 - 20 * 0;
  const den = 4 * (sf - 2 * de);
  const nPayload = 8 + Math.max(Math.ceil(num / den) * (cr + 4), 0);

  return tPreamble + nPayload * tSym;
}

export class SimulatedMeshNode {
  public readonly nodeId: number;
  public readonly name: string;
  public nodeInfo: NodeInfo;
  public config: NodeConfig;

  // Connected clients on this node's SoftAP (UUID -> UserProfile)
  public connectedClients = new Map<string, UserProfile>();

  // 256-entry deduplication ring buffer (FIFO)
  public deduplicationCache: bigint[] = [];
  public readonly maxDeduplicationEntries = 256;

  // Local Store-and-Forward Queues (simulating SQLite)
  public personalMessageQueue: PersonalMessage[] = [];
  public globalMessages: GlobalMessage[] = [];
  public deviceLocations = new Map<string, DeviceLocation>();

  // Monotonic sequence counter
  private messageCounter = 1;

  // Pending Passive ACKs being monitored
  public pendingPassiveAcks = new Map<bigint, PassiveAckTimer>();

  // Pending jittered relays awaiting transmission
  public pendingRelays = new Map<bigint, RelayTimer>();

  // Event listener callback to notify client/gateway
  public onEvent?: (event: {
    type: 'NEW_PERSONAL' | 'NEW_GLOBAL' | 'DELIVERED' | 'ROSTER' | 'RF_TX' | 'RF_RX' | 'EMERGENCY';
    data: unknown;
  }) => void;

  // Reference to mesh router
  public meshRouter?: MeshSimulator;

  constructor(nodeId: number, name: string) {
    this.nodeId = nodeId;
    this.name = name;
    this.config = {
      nodeName: name,
      nodeId: '0x' + nodeId.toString(16).padStart(4, '0'),
      radioFrequencyMhz: 865.125,
      radioChannel: 15,
      txPowerDbm: 22,
      spreadingFactor: 9,
      bandwidthKhz: 125,
      wifiSsid: `${name}-Mesh`,
      wifiChannel: 6,
      heartbeatIntervalSec: 15,
    };

    this.nodeInfo = {
      nodeId: this.config.nodeId,
      name: this.name,
      frequencyMhz: this.config.radioFrequencyMhz,
      channel: this.config.radioChannel,
      txPowerDbm: this.config.txPowerDbm,
      batteryVoltage: 3.98,
      batteryPercent: 88,
      connectedClients: 0,
      hopCount: 0,
      uptimeSeconds: 120,
      lastSeenAt: 'Active',
      isSimulated: true,
    };
  }

  public registerClient(profile: UserProfile): void {
    const updated: UserProfile = {
      ...profile,
      currentNodeId: this.config.nodeId,
      presenceStatus: 'connected',
      lastSeenAt: 'Active now',
    };
    this.connectedClients.set(profile.deviceUuid, updated);
    this.nodeInfo.connectedClients = this.connectedClients.size;

    this.emitEvent('ROSTER', Array.from(this.connectedClients.values()));

    // Check store-and-forward queue for this user
    this.flushStoreAndForwardQueueForUser(profile.deviceUuid);
  }

  public disconnectClient(deviceUuid: string): void {
    const client = this.connectedClients.get(deviceUuid);
    if (client) {
      client.presenceStatus = 'offline';
      client.lastSeenAt = new Date().toLocaleTimeString();
      this.nodeInfo.connectedClients = Math.max(0, this.connectedClients.size - 1);
      this.emitEvent('ROSTER', Array.from(this.connectedClients.values()));
    }
  }

  public updateClientHeartbeat(deviceUuid: string): void {
    const client = this.connectedClients.get(deviceUuid);
    if (client) {
      client.lastSeenAt = 'Active now';
    }
  }

  public updateDeviceLocation(location: DeviceLocation): void {
    // Strictly 1-row overwrite (BLUEPRINT.md Section 8.2)
    this.deviceLocations.set(location.deviceUuid, {
      ...location,
      updatedAt: new Date().toLocaleTimeString(),
      isStale: false,
    });
  }

  /**
   * Originates a 1:1 Personal Message from a connected client
   */
  public sendPersonalMessage(
    senderUuid: string,
    senderName: string,
    recipientUuid: string,
    recipientName: string,
    body: string
  ): PersonalMessage {
    const messageId = this.messageCounter++;
    const msgIdStr = `msg-${this.nodeId}-${messageId}`;
    const timestamp = Math.floor(Date.now() / 1000);

    const personalMsg: PersonalMessage = {
      messageId: msgIdStr,
      senderUuid,
      senderName,
      recipientUuid,
      recipientName,
      body,
      originalTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      expiresAt: 'In 7 days',
      status: 'pending',
      retryCount: 0,
    };

    // Check if recipient is connected locally on this node
    if (this.connectedClients.has(recipientUuid)) {
      personalMsg.status = 'delivered';
      personalMsg.deliveredTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.emitEvent('DELIVERED', personalMsg);
      return personalMsg;
    }

    // Otherwise, dispatch to LoRa Mesh
    this.personalMessageQueue.push(personalMsg);

    const { ciphertext, authTag } = encodePayload({
      senderUuid,
      recipientUuid,
      timestamp,
      text: body,
    });

    const packet: BinaryPacket = {
      header: {
        magic: PACKET_MAGIC,
        version: PROTOCOL_VERSION,
        networkId: NETWORK_ID,
        packetClass: PacketClass.DIRECT_TEXT,
        messageId,
        sourceNodeId: this.nodeId,
        destNodeId: BROADCAST_NODE_ID, // Flood-search for destination
        hopLimit: 3,
        payloadLen: ciphertext.length,
      },
      ciphertextPayload: ciphertext,
      authTag,
    };

    this.transmitPacketOverMesh(packet);
    return personalMsg;
  }

  /**
   * Originates a Global Chat / Announcement Message
   */
  public sendGlobalMessage(
    senderUuid: string,
    senderName: string,
    body: string,
    isEmergencyAlert = false
  ): GlobalMessage {
    const messageId = this.messageCounter++;
    const msgIdStr = `glob-${this.nodeId}-${messageId}`;
    const timestamp = Math.floor(Date.now() / 1000);

    const globalMsg: GlobalMessage = {
      messageId: msgIdStr,
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

    const { ciphertext, authTag } = encodePayload({
      senderUuid,
      timestamp,
      text: body,
    });

    const packet: BinaryPacket = {
      header: {
        magic: PACKET_MAGIC,
        version: PROTOCOL_VERSION,
        networkId: NETWORK_ID,
        packetClass: isEmergencyAlert ? PacketClass.EMERGENCY_SOS : PacketClass.GLOBAL_CHAT,
        messageId,
        sourceNodeId: this.nodeId,
        destNodeId: BROADCAST_NODE_ID,
        hopLimit: isEmergencyAlert ? 5 : 3, // Higher TTL for emergency
        payloadLen: ciphertext.length,
      },
      ciphertextPayload: ciphertext,
      authTag,
    };

    this.transmitPacketOverMesh(packet);
    return globalMsg;
  }

  /**
   * Transmits raw packet out to simulated RF channel
   */
  public transmitPacketOverMesh(packet: BinaryPacket): void {
    const rawBytes = serializePacket(packet);
    const key = getPacketDeduplicationKey(packet.header.sourceNodeId, packet.header.messageId);

    // Record in local deduplication cache
    this.recordDeduplicationKey(key);

    // If this is an originator transmission, arm Passive ACK timer
    if (packet.header.sourceNodeId === this.nodeId && packet.header.packetClass !== PacketClass.ACK) {
      this.pendingPassiveAcks.set(key, {
        messageKey: key,
        sourceNodeId: packet.header.sourceNodeId,
        messageId: packet.header.messageId,
        deadline: Date.now() + 650, // 650 ms passive ACK window
        retriesRemaining: 2,
        rawBytes,
      });
    }

    this.emitEvent('RF_TX', {
      nodeId: this.nodeId,
      packetClass: packet.header.packetClass,
      messageId: packet.header.messageId,
      bytes: rawBytes.length,
      airtimeMs: calculateLoRaToA(rawBytes.length),
    });

    if (this.meshRouter) {
      this.meshRouter.broadcastFromNode(this.nodeId, rawBytes);
    }
  }

  /**
   * Ingress packet handler from RF layer
   */
  public receivePacketFromMesh(rawBytes: Uint8Array, snrDb = 10): void {
    let packet: BinaryPacket;
    try {
      packet = deserializePacket(rawBytes);
    } catch {
      // Corrupted packet or foreign network
      return;
    }

    const key = getPacketDeduplicationKey(packet.header.sourceNodeId, packet.header.messageId);

    // Passive Overhearing Check: Did an intermediate node forward a packet we originated?
    if (this.pendingPassiveAcks.has(key)) {
      // We overheard a peer retransmitting our packet! Passive ACK satisfied!
      this.pendingPassiveAcks.delete(key);
      const pendingMsg = this.personalMessageQueue.find(
        (m) => m.messageId === `msg-${this.nodeId}-${packet.header.messageId}`
      );
      if (pendingMsg) {
        pendingMsg.status = 'pending';
        this.emitEvent('DELIVERED', { ...pendingMsg, note: 'Relayed via mesh peer (Passive ACK)' });
      }
    }

    // Check circular deduplication cache
    if (this.isDuplicate(key)) {
      // Overheard transmission suppression:
      // If we are currently holding a pending relay for this exact packet, cancel it!
      if (this.pendingRelays.has(key)) {
        const relay = this.pendingRelays.get(key);
        if (relay?.timeoutHandle) clearTimeout(relay.timeoutHandle);
        this.pendingRelays.delete(key);
      }
      return;
    }

    // Record in deduplication cache
    this.recordDeduplicationKey(key);

    // Cryptographic validation and decryption
    let payload: DecryptedPacketPayload;
    try {
      payload = decodePayload(packet.ciphertextPayload, packet.authTag);
    } catch {
      // Tampered payload
      return;
    }

    this.emitEvent('RF_RX', {
      nodeId: this.nodeId,
      packetClass: packet.header.packetClass,
      sourceNode: packet.header.sourceNodeId,
      messageId: packet.header.messageId,
      snrDb,
    });

    // Handle Packet Classes
    if (packet.header.packetClass === PacketClass.ACK) {
      // Destination has received the message!
      const ackMsgId = `msg-${this.nodeId}-${packet.header.messageId}`;
      const msg = this.personalMessageQueue.find((m) => m.messageId === ackMsgId);
      if (msg) {
        msg.status = 'delivered';
        msg.deliveredTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.emitEvent('DELIVERED', msg);
      }
    } else if (
      packet.header.packetClass === PacketClass.GLOBAL_CHAT ||
      packet.header.packetClass === PacketClass.EMERGENCY_SOS
    ) {
      const isSos = packet.header.packetClass === PacketClass.EMERGENCY_SOS;
      const globalMsg: GlobalMessage = {
        messageId: `glob-${packet.header.sourceNodeId}-${packet.header.messageId}`,
        senderUuid: payload.senderUuid,
        senderName: (isSos ? 'SOS: ' : '') + 'Peer ' + packet.header.sourceNodeId,
        senderNodeId: '0x' + packet.header.sourceNodeId.toString(16).padStart(4, '0'),
        body: payload.text || 'Emergency Alert',
        originalTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        expiresAt: 'In 30 days',
        hopCount: 4 - packet.header.hopLimit,
        isEmergencyAlert: isSos,
      };
      this.globalMessages.unshift(globalMsg);
      this.emitEvent(isSos ? 'EMERGENCY' : 'NEW_GLOBAL', globalMsg);
    } else if (packet.header.packetClass === PacketClass.DIRECT_TEXT) {
      // Check if recipient is connected here
      const recipientUuid = payload.recipientUuid;
      if (recipientUuid && this.connectedClients.has(recipientUuid)) {
        // Deliver to connected user
        const personalMsg: PersonalMessage = {
          messageId: `msg-${packet.header.sourceNodeId}-${packet.header.messageId}`,
          senderUuid: payload.senderUuid,
          senderName: 'Mesh User (' + packet.header.sourceNodeId + ')',
          recipientUuid,
          recipientName: this.connectedClients.get(recipientUuid)?.displayName || 'Local User',
          body: payload.text || '',
          originalTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          expiresAt: 'In 7 days',
          status: 'delivered',
          deliveredTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          retryCount: 0,
        };
        this.emitEvent('NEW_PERSONAL', personalMsg);

        // Send explicit E2E ACK back to originator
        this.transmitExplicitAck(packet.header.sourceNodeId, packet.header.messageId);
        return;
      } else if (recipientUuid) {
        // Enqueue into store-and-forward queue
        const queuedMsg: PersonalMessage = {
          messageId: `msg-${packet.header.sourceNodeId}-${packet.header.messageId}`,
          senderUuid: payload.senderUuid,
          senderName: 'Mesh User (' + packet.header.sourceNodeId + ')',
          recipientUuid,
          recipientName: 'Offline User',
          body: payload.text || '',
          originalTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          expiresAt: 'In 7 days (Store & Forward on MicroSD)',
          status: 'pending',
          retryCount: 0,
        };
        this.personalMessageQueue.push(queuedMsg);
      }
    }

    // Forwarding / Relay decision (BLUEPRINT.md Section 6.3)
    if (packet.header.hopLimit > 1) {
      const decrementedPacket: BinaryPacket = {
        ...packet,
        header: {
          ...packet.header,
          hopLimit: packet.header.hopLimit - 1,
        },
      };

      // Calculate SNR-weighted randomized jitter backoff
      // T_backoff = 50ms + max(0, (10 - SNR) * 15ms) + rand(0, 100ms)
      const jitterMs = 50 + Math.max(0, (10 - snrDb) * 15) + Math.floor(Math.random() * 100);

      const relayTimer: RelayTimer = {
        messageKey: key,
        packet: decrementedPacket,
        scheduledTime: Date.now() + jitterMs,
      };

      relayTimer.timeoutHandle = setTimeout(() => {
        if (this.pendingRelays.has(key)) {
          this.pendingRelays.delete(key);
          this.transmitPacketOverMesh(decrementedPacket);
        }
      }, jitterMs);

      this.pendingRelays.set(key, relayTimer);
    }
  }

  private transmitExplicitAck(originNodeId: number, originalMessageId: number): void {
    const { ciphertext, authTag } = encodePayload({
      senderUuid: 'node-' + this.nodeId,
      timestamp: Math.floor(Date.now() / 1000),
      text: 'ACK',
    });

    const ackPacket: BinaryPacket = {
      header: {
        magic: PACKET_MAGIC,
        version: PROTOCOL_VERSION,
        networkId: NETWORK_ID,
        packetClass: PacketClass.ACK,
        messageId: originalMessageId,
        sourceNodeId: this.nodeId,
        destNodeId: originNodeId,
        hopLimit: 3,
        payloadLen: ciphertext.length,
      },
      ciphertextPayload: ciphertext,
      authTag,
    };

    this.transmitPacketOverMesh(ackPacket);
  }

  private flushStoreAndForwardQueueForUser(userUuid: string): void {
    const pending = this.personalMessageQueue.filter(
      (m) => m.recipientUuid === userUuid && m.status === 'pending'
    );
    for (const msg of pending) {
      msg.status = 'delivered';
      msg.deliveredTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.emitEvent('NEW_PERSONAL', msg);
    }
  }

  private isDuplicate(key: bigint): boolean {
    return this.deduplicationCache.includes(key);
  }

  private recordDeduplicationKey(key: bigint): void {
    if (this.deduplicationCache.length >= this.maxDeduplicationEntries) {
      this.deduplicationCache.shift(); // Evict oldest FIFO entry
    }
    this.deduplicationCache.push(key);
  }

  private emitEvent(
    type: 'NEW_PERSONAL' | 'NEW_GLOBAL' | 'DELIVERED' | 'ROSTER' | 'RF_TX' | 'RF_RX' | 'EMERGENCY',
    data: unknown
  ): void {
    if (this.onEvent) {
      this.onEvent({ type, data });
    }
  }
}

/**
 * Mesh Network Orchestrator
 * Connects simulated nodes and models path loss, distance, and partition states
 */
export class MeshSimulator {
  public nodes = new Map<number, SimulatedMeshNode>();
  public links: SimulatedRFLink[] = [];

  constructor() {
    // Default 3-node topology (Camp -> Relay -> Hamlet)
    const node1 = new SimulatedMeshNode(1, 'Relief Camp Alpha');
    const node2 = new SimulatedMeshNode(2, 'Waypoint Relay Bravo');
    const node3 = new SimulatedMeshNode(3, 'Forest Hamlet Charlie');

    this.addNode(node1);
    this.addNode(node2);
    this.addNode(node3);

    // Node 1 <-> Node 2
    this.setLink(1, 2, { snrDb: 10, rssi: -85, packetLossRate: 0.0, isPartitioned: false });
    // Node 2 <-> Node 3
    this.setLink(2, 3, { snrDb: 8, rssi: -92, packetLossRate: 0.0, isPartitioned: false });
    // Node 1 <-/-> Node 3 (Too distant for 1-hop; requires Node 2 relay)
    this.setLink(1, 3, { snrDb: -18, rssi: -130, packetLossRate: 1.0, isPartitioned: true });
  }

  public addNode(node: SimulatedMeshNode): void {
    node.meshRouter = this;
    this.nodes.set(node.nodeId, node);
  }

  public setLink(
    nodeA: number,
    nodeB: number,
    options: { snrDb: number; rssi: number; packetLossRate: number; isPartitioned: boolean }
  ): void {
    this.links = this.links.filter(
      (l) => !( (l.fromNodeId === nodeA && l.toNodeId === nodeB) || (l.fromNodeId === nodeB && l.toNodeId === nodeA) )
    );
    this.links.push({ fromNodeId: nodeA, toNodeId: nodeB, ...options });
    this.links.push({ fromNodeId: nodeB, toNodeId: nodeA, ...options });
  }

  public setPartition(nodeA: number, nodeB: number, isPartitioned: boolean): void {
    for (const link of this.links) {
      if (
        (link.fromNodeId === nodeA && link.toNodeId === nodeB) ||
        (link.fromNodeId === nodeB && link.toNodeId === nodeA)
      ) {
        link.isPartitioned = isPartitioned;
      }
    }
  }

  public broadcastFromNode(sourceNodeId: number, rawBytes: Uint8Array): void {
    for (const [targetId, targetNode] of this.nodes) {
      if (targetId === sourceNodeId) continue;

      const link = this.links.find((l) => l.fromNodeId === sourceNodeId && l.toNodeId === targetId);
      if (!link || link.isPartitioned) {
        continue;
      }

      if (link.packetLossRate > 0 && Math.random() < link.packetLossRate) {
        continue; // Simulated packet drop
      }

      // Model RF propagation delay (speed of light + transceiver processing ~ 15ms)
      setTimeout(() => {
        targetNode.receivePacketFromMesh(rawBytes, link.snrDb);
      }, 15);
    }
  }
}
