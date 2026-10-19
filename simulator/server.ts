/**
 * LoRaResQ Standalone Multi-Node WebSocket Server
 * Enables end-to-end testing of the complete software stack without hardware.
 * Runs 3 virtual nodes on ports 8081 (Alpha), 8082 (Bravo), and 8083 (Charlie).
 */

import { WebSocketServer, WebSocket } from 'ws';
import { MeshSimulator, SimulatedMeshNode } from '../src/lib/simulator/meshSimulator';
import {
  ClientWsMessage,
  NodeWsMessage,
  UserProfile,
} from '../src/types/loraresq';

const sim = new MeshSimulator();

const NODE_PORTS: Record<number, number> = {
  1: 8081,
  2: 8082,
  3: 8083,
};

interface ConnectedWsClient {
  ws: WebSocket;
  deviceUuid?: string;
}

function startNodeServer(node: SimulatedMeshNode, port: number) {
  const wss = new WebSocketServer({ port });
  const clients = new Set<ConnectedWsClient>();

  console.log(`[LoRaResQ Sim] Node ${node.nodeId} (${node.name}) online -> ws://localhost:${port}/ws`);

  // Wire node events to connected WebSockets
  node.onEvent = (event) => {
    let msg: NodeWsMessage | null = null;
    switch (event.type) {
      case 'NEW_PERSONAL':
        msg = {
          type: 'NEW_PERSONAL_MESSAGE',
          message: event.data as any,
        };
        break;
      case 'NEW_GLOBAL':
        msg = {
          type: 'NEW_GLOBAL_MESSAGE',
          message: event.data as any,
        };
        break;
      case 'EMERGENCY':
        msg = {
          type: 'EMERGENCY_ALERT',
          alert: event.data as any,
        };
        break;
      case 'DELIVERED': {
        const item = event.data as any;
        msg = {
          type: 'MESSAGE_STATUS_UPDATE',
          messageId: item.messageId,
          status: item.status,
          deliveredTimestamp: item.deliveredTimestamp,
        };
        break;
      }
      case 'ROSTER':
        msg = {
          type: 'ROSTER_UPDATE',
          roster: event.data as UserProfile[],
        };
        break;
    }

    if (msg) {
      const payload = JSON.stringify(msg);
      for (const client of clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(payload);
        }
      }
    }
  };

  wss.on('connection', (ws) => {
    const clientRef: ConnectedWsClient = { ws };
    clients.add(clientRef);

    ws.on('message', (data) => {
      try {
        const parsed: ClientWsMessage = JSON.parse(data.toString());

        switch (parsed.type) {
          case 'CLIENT_HELLO': {
            clientRef.deviceUuid = parsed.deviceUuid;
            const profile: UserProfile = {
              deviceUuid: parsed.deviceUuid,
              displayName: parsed.displayName,
              deviceModel: parsed.deviceModel,
              currentNodeId: node.config.nodeId,
              presenceStatus: 'connected',
              firstSeenAt: new Date().toLocaleTimeString(),
              lastSeenAt: 'Active now',
            };
            node.registerClient(profile);

            // Respond with initial node state
            const welcome: NodeWsMessage = {
              type: 'NODE_HELLO',
              nodeInfo: node.nodeInfo,
              roster: Array.from(node.connectedClients.values()),
              recentGlobal: node.globalMessages.slice(0, 20),
              queuedPersonal: node.personalMessageQueue.filter(
                (m) => m.recipientUuid === parsed.deviceUuid || m.senderUuid === parsed.deviceUuid
              ),
              isSimulated: true,
            };
            ws.send(JSON.stringify(welcome));
            break;
          }

          case 'HEARTBEAT': {
            node.updateClientHeartbeat(parsed.deviceUuid);
            const ack: NodeWsMessage = {
              type: 'HEARTBEAT_ACK',
              timestamp: Date.now(),
            };
            ws.send(JSON.stringify(ack));
            break;
          }

          case 'SEND_PERSONAL': {
            const senderProfile = node.connectedClients.get(clientRef.deviceUuid || '');
            const senderName = senderProfile?.displayName || 'Client';
            node.sendPersonalMessage(
              clientRef.deviceUuid || 'unknown',
              senderName,
              parsed.recipientUuid,
              parsed.recipientName,
              parsed.body
            );
            break;
          }

          case 'SEND_GLOBAL': {
            const senderProfile = node.connectedClients.get(clientRef.deviceUuid || '');
            const senderName = senderProfile?.displayName || 'Client';
            node.sendGlobalMessage(
              clientRef.deviceUuid || 'unknown',
              senderName,
              parsed.body,
              parsed.isEmergencyAlert
            );
            break;
          }

          case 'SEND_SOS': {
            const senderProfile = node.connectedClients.get(clientRef.deviceUuid || '');
            const senderName = senderProfile?.displayName || 'Client';
            node.sendGlobalMessage(
              clientRef.deviceUuid || 'unknown',
              'SOS: ' + senderName,
              `${parsed.body} [Coords: ${parsed.location.latitude ?? 'Unknown'}, ${parsed.location.longitude ?? 'Unknown'}]`,
              true
            );
            break;
          }

          case 'UPDATE_LOCATION': {
            node.updateDeviceLocation(parsed.location);
            break;
          }

          case 'ADMIN_AUTH': {
            const success = parsed.password === 'admin123';
            const authRes: NodeWsMessage = {
              type: 'ADMIN_AUTH_RESULT',
              success,
              token: success ? 'sim-admin-token-' + Date.now() : undefined,
              error: success ? undefined : 'Invalid administrative key',
            };
            ws.send(JSON.stringify(authRes));
            break;
          }

          case 'UPDATE_CONFIG': {
            if (parsed.token?.startsWith('sim-admin-token')) {
              Object.assign(node.config, parsed.config);
              node.nodeInfo.name = node.config.nodeName;
              node.nodeInfo.channel = node.config.radioChannel;
              node.nodeInfo.frequencyMhz = node.config.radioFrequencyMhz;
              node.nodeInfo.txPowerDbm = node.config.txPowerDbm;

              const confRes: NodeWsMessage = {
                type: 'CONFIG_UPDATED',
                config: node.config,
              };
              ws.send(JSON.stringify(confRes));
            }
            break;
          }
        }
      } catch (err) {
        console.error('[Sim Server] Frame parse error:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(clientRef);
      if (clientRef.deviceUuid) {
        node.disconnectClient(clientRef.deviceUuid);
      }
    });
  });
}

// Start servers for each node in the mesh
for (const [nodeId, node] of sim.nodes) {
  const port = NODE_PORTS[nodeId] || (8080 + nodeId);
  startNodeServer(node, port);
}

console.log('\n[LoRaResQ Simulator Ready]');
console.log('Connect browser tabs to test multi-hop mesh:');
console.log(' -> http://localhost:3000/?simPort=8081 (Relief Camp Alpha)');
console.log(' -> http://localhost:3000/?simPort=8082 (Waypoint Relay Bravo)');
console.log(' -> http://localhost:3000/?simPort=8083 (Forest Hamlet Charlie)');
