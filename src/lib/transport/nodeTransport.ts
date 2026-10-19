/**
 * Unified Node Transport Manager
 * Connects to physical ESP32 SoftAP (ws://192.168.4.1/ws) or
 * local simulator (ws://localhost:8081/ws) with automatic fallback
 * to an internal in-memory simulation engine.
 */

import {
  TransportConnectionState,
  ClientWsMessage,
  NodeWsMessage,
  NodeInfo,
  UserProfile,
  PersonalMessage,
  GlobalMessage,
  DeviceLocation,
  NodeConfig,
} from '@/types/loraresq';
import {
  savePersonalMessage,
  saveGlobalMessage,
  saveRoster,
  enqueueOutbox,
  getAndClearOutbox,
} from '@/lib/storage/offlineStore';
import { SimulatedMeshNode } from '@/lib/simulator/meshSimulator';

export interface TransportCallbacks {
  onConnectionChange: (state: TransportConnectionState, details: { isSimulated: boolean; targetUrl: string }) => void;
  onNodeInfo: (info: NodeInfo) => void;
  onRosterUpdate: (roster: UserProfile[]) => void;
  onNewPersonalMessage: (msg: PersonalMessage) => void;
  onNewGlobalMessage: (msg: GlobalMessage) => void;
  onMessageStatusUpdate: (messageId: string, status: string, deliveredTimestamp?: string) => void;
  onEmergencyAlert: (alert: GlobalMessage) => void;
}

export class NodeTransport {
  private ws: WebSocket | null = null;
  private state: TransportConnectionState = 'offline';
  private targetUrl = '';
  private isSimulated = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectBackoffMs = 1000;
  private inMemoryFallbackNode: SimulatedMeshNode | null = null;

  private clientProfile: {
    deviceUuid: string;
    displayName: string;
    deviceModel: string;
  } | null = null;

  constructor(private callbacks: TransportCallbacks) {}

  public connect(profile: { deviceUuid: string; displayName: string; deviceModel: string }): void {
    this.clientProfile = profile;
    this.resolveTargetUrl();
    this.attemptWebSocketConnect();
  }

  public switchTarget(newTargetUrl: string, isSimulated: boolean): void {
    this.cleanupConnection();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.inMemoryFallbackNode) {
      this.inMemoryFallbackNode = null;
    }
    this.targetUrl = newTargetUrl;
    this.isSimulated = isSimulated;
    this.reconnectBackoffMs = 1000;
    this.attemptWebSocketConnect();
  }

  private resolveTargetUrl(): void {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const simPort = urlParams.get('simPort');
    const customHost = urlParams.get('nodeHost');

    if (simPort) {
      this.targetUrl = `ws://localhost:${simPort}/ws`;
      this.isSimulated = true;
    } else if (customHost) {
      this.targetUrl = `ws://${customHost}/ws`;
      this.isSimulated = false;
    } else if (window.location.hostname === '192.168.4.1') {
      // Direct ESP32 SoftAP connection (WebSocket on port 81)
      this.targetUrl = `ws://192.168.4.1:81/ws`;
      this.isSimulated = false;
    } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      // Local dev machine
      this.targetUrl = `ws://localhost:8081/ws`;
      this.isSimulated = true;
    } else {
      this.targetUrl = `ws://${window.location.hostname}:81/ws`;
      this.isSimulated = false;
    }
  }

  private attemptWebSocketConnect(): void {
    if (typeof window === 'undefined' || !this.targetUrl) return;

    this.updateState('connecting');

    try {
      this.ws = new WebSocket(this.targetUrl);

      this.ws.onopen = () => {
        console.log(`[Transport] Connected to ${this.targetUrl}`);
        this.reconnectBackoffMs = 1000;
        this.updateState(this.isSimulated ? 'simulated' : 'live');

        // Send initial handshake
        if (this.clientProfile) {
          const hello: ClientWsMessage = {
            type: 'CLIENT_HELLO',
            deviceUuid: this.clientProfile.deviceUuid,
            displayName: this.clientProfile.displayName,
            deviceModel: this.clientProfile.deviceModel,
          };
          this.sendMessage(hello);
        }

        // Start heartbeat (15s)
        this.startHeartbeat();

        // Flush offline outbox
        this.flushOutbox();
      };

      this.ws.onmessage = (event) => {
        try {
          const frame: NodeWsMessage = JSON.parse(event.data);
          this.handleInboundFrame(frame);
        } catch (err) {
          console.warn('[Transport] Received non-JSON frame:', event.data);
        }
      };

      this.ws.onclose = () => {
        console.warn('[Transport] WebSocket closed');
        this.cleanupConnection();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        console.warn(`[Transport] Failed to reach ${this.targetUrl}`);
        // If local dev and socket fails, activate in-memory simulation fallback
        if (this.isSimulated && !this.inMemoryFallbackNode) {
          this.activateInMemoryFallback();
        }
      };
    } catch {
      this.cleanupConnection();
      this.scheduleReconnect();
    }
  }

  private handleInboundFrame(frame: NodeWsMessage): void {
    switch (frame.type) {
      case 'NODE_HELLO':
        this.isSimulated = !!frame.isSimulated;
        this.callbacks.onNodeInfo(frame.nodeInfo);
        this.callbacks.onRosterUpdate(frame.roster);
        saveRoster(frame.roster);
        for (const gm of frame.recentGlobal) {
          this.callbacks.onNewGlobalMessage(gm);
          saveGlobalMessage(gm);
        }
        for (const pm of frame.queuedPersonal) {
          this.callbacks.onNewPersonalMessage(pm);
          savePersonalMessage(pm);
        }
        break;

      case 'ROSTER_UPDATE':
        this.callbacks.onRosterUpdate(frame.roster);
        saveRoster(frame.roster);
        break;

      case 'NEW_PERSONAL_MESSAGE':
        this.callbacks.onNewPersonalMessage(frame.message);
        savePersonalMessage(frame.message);
        break;

      case 'NEW_GLOBAL_MESSAGE':
        this.callbacks.onNewGlobalMessage(frame.message);
        saveGlobalMessage(frame.message);
        break;

      case 'MESSAGE_STATUS_UPDATE':
        this.callbacks.onMessageStatusUpdate(frame.messageId, frame.status, frame.deliveredTimestamp);
        break;

      case 'EMERGENCY_ALERT':
        this.callbacks.onEmergencyAlert(frame.alert);
        saveGlobalMessage(frame.alert);
        break;

      case 'NODE_TELEMETRY':
        this.callbacks.onNodeInfo(frame.nodeInfo);
        break;
    }
  }

  public sendPersonalMessage(recipientUuid: string, recipientName: string, body: string): string {
    const messageId = 'msg-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000);
    const timestamp = Math.floor(Date.now() / 1000);

    const frame: ClientWsMessage = {
      type: 'SEND_PERSONAL',
      messageId,
      recipientUuid,
      recipientName,
      body,
      originalTimestamp: timestamp,
    };

    if (this.state === 'live' || this.state === 'simulated') {
      this.sendMessage(frame);
    } else {
      enqueueOutbox({ id: messageId, type: 'personal', payload: frame });
    }

    return messageId;
  }

  public sendGlobalMessage(body: string, isEmergencyAlert = false): string {
    const messageId = 'glob-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000);
    const timestamp = Math.floor(Date.now() / 1000);

    const frame: ClientWsMessage = {
      type: 'SEND_GLOBAL',
      messageId,
      body,
      originalTimestamp: timestamp,
      isEmergencyAlert,
    };

    if (this.state === 'live' || this.state === 'simulated') {
      this.sendMessage(frame);
    } else {
      enqueueOutbox({ id: messageId, type: 'global', payload: frame });
    }

    return messageId;
  }

  public sendSosAlert(body: string, location: DeviceLocation): string {
    const messageId = 'sos-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000);
    const timestamp = Math.floor(Date.now() / 1000);

    const frame: ClientWsMessage = {
      type: 'SEND_SOS',
      messageId,
      body,
      location,
      originalTimestamp: timestamp,
    };

    if (this.state === 'live' || this.state === 'simulated') {
      this.sendMessage(frame);
    } else {
      enqueueOutbox({ id: messageId, type: 'sos', payload: frame });
    }

    return messageId;
  }

  public updateLocation(location: DeviceLocation): void {
    const frame: ClientWsMessage = {
      type: 'UPDATE_LOCATION',
      location,
    };
    if (this.state === 'live' || this.state === 'simulated') {
      this.sendMessage(frame);
    }
  }

  public authenticateAdmin(password: string): void {
    this.sendMessage({
      type: 'ADMIN_AUTH',
      password,
    });
  }

  public updateNodeConfig(token: string, config: Partial<NodeConfig>): void {
    this.sendMessage({
      type: 'UPDATE_CONFIG',
      token,
      config,
    });
  }

  private sendMessage(msg: ClientWsMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else if (this.inMemoryFallbackNode && this.clientProfile) {
      // In-memory simulation fallback execution
      if (msg.type === 'SEND_PERSONAL') {
        this.inMemoryFallbackNode.sendPersonalMessage(
          this.clientProfile.deviceUuid,
          this.clientProfile.displayName,
          msg.recipientUuid,
          msg.recipientName,
          msg.body
        );
      } else if (msg.type === 'SEND_GLOBAL' || msg.type === 'SEND_SOS') {
        this.inMemoryFallbackNode.sendGlobalMessage(
          this.clientProfile.deviceUuid,
          this.clientProfile.displayName,
          msg.body,
          msg.type === 'SEND_SOS' || !!msg.isEmergencyAlert
        );
      }
    }
  }

  private activateInMemoryFallback(): void {
    console.log('[Transport] Activating standalone In-Memory Simulation Fallback');
    this.isSimulated = true;
    this.inMemoryFallbackNode = new SimulatedMeshNode(1, 'LoRaResQ-Alpha (In-Memory Simulator)');

    if (this.clientProfile) {
      this.inMemoryFallbackNode.registerClient({
        deviceUuid: this.clientProfile.deviceUuid,
        displayName: this.clientProfile.displayName,
        deviceModel: this.clientProfile.deviceModel,
        currentNodeId: '0x0001',
        presenceStatus: 'connected',
        firstSeenAt: new Date().toLocaleTimeString(),
        lastSeenAt: 'Active now',
        isSelf: true,
      });
    }

    this.inMemoryFallbackNode.onEvent = (ev) => {
      if (ev.type === 'NEW_PERSONAL') this.callbacks.onNewPersonalMessage(ev.data as any);
      if (ev.type === 'NEW_GLOBAL') this.callbacks.onNewGlobalMessage(ev.data as any);
      if (ev.type === 'EMERGENCY') this.callbacks.onEmergencyAlert(ev.data as any);
      if (ev.type === 'ROSTER') this.callbacks.onRosterUpdate(ev.data as any);
    };

    this.updateState('simulated');
    this.callbacks.onNodeInfo(this.inMemoryFallbackNode.nodeInfo);
    this.callbacks.onRosterUpdate(Array.from(this.inMemoryFallbackNode.connectedClients.values()));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.clientProfile && this.ws?.readyState === WebSocket.OPEN) {
        this.sendMessage({
          type: 'HEARTBEAT',
          deviceUuid: this.clientProfile.deviceUuid,
        });
      }
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private cleanupConnection(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws = null;
    }
    if (!this.inMemoryFallbackNode) {
      this.updateState('offline');
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.state === 'offline' && !this.inMemoryFallbackNode) {
        this.attemptWebSocketConnect();
      }
    }, this.reconnectBackoffMs);
    this.reconnectBackoffMs = Math.min(this.reconnectBackoffMs * 1.5, 10000);
  }

  private async flushOutbox(): Promise<void> {
    const items = await getAndClearOutbox();
    for (const item of items) {
      this.sendMessage(item.payload as ClientWsMessage);
    }
  }

  private updateState(state: TransportConnectionState): void {
    this.state = state;
    this.callbacks.onConnectionChange(state, {
      isSimulated: this.isSimulated,
      targetUrl: this.targetUrl,
    });
  }

  public disconnect(): void {
    this.cleanupConnection();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
  }
}
