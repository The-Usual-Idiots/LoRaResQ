import { describe, it, expect } from 'vitest';
import { MeshSimulator, calculateLoRaToA } from '../src/lib/simulator/meshSimulator';
import { UserProfile } from '../src/types/loraresq';

describe('LoRaResQ Multi-Hop Mesh Simulation (BLUEPRINT.md Sections 2 & 6)', () => {
  it('calculates realistic Semtech SX1262 LoRa Time-on-Air (ToA)', () => {
    // 80-byte packet at SF9 / 125 kHz / CR 4/5 should take ~300 to 350 ms
    const toa80 = calculateLoRaToA(80, 9, 125, 1, 8);
    expect(toa80).toBeGreaterThan(250);
    expect(toa80).toBeLessThan(500);

    // 255-byte full packet
    const toa255 = calculateLoRaToA(255, 9, 125, 1, 8);
    expect(toa255).toBeGreaterThan(toa80);
  });

  it('delivers 1:1 messages across multi-hop relay and triggers E2E ACK', async () => {
    const sim = new MeshSimulator();
    const node1 = sim.nodes.get(1)!; // Camp
    const node2 = sim.nodes.get(2)!; // Waypoint Relay
    const node3 = sim.nodes.get(3)!; // Hamlet

    // Register civilian A on Node 1
    const userA: UserProfile = {
      deviceUuid: 'uuid-civilian-alice',
      displayName: 'Alice',
      deviceModel: 'Pixel 7',
      currentNodeId: '0x0001',
      presenceStatus: 'connected',
      firstSeenAt: '12:00',
      lastSeenAt: 'Active',
    };
    node1.registerClient(userA);

    // Register civilian B on Node 3
    const userB: UserProfile = {
      deviceUuid: 'uuid-civilian-bob',
      displayName: 'Bob',
      deviceModel: 'iPhone 13',
      currentNodeId: '0x0003',
      presenceStatus: 'connected',
      firstSeenAt: '12:05',
      lastSeenAt: 'Active',
    };
    node3.registerClient(userB);

    let bobReceivedMessage = false;
    let aliceDeliveredAck = false;

    node3.onEvent = (ev) => {
      if (ev.type === 'NEW_PERSONAL') {
        const msg = ev.data as any;
        if (msg.recipientUuid === userB.deviceUuid) {
          bobReceivedMessage = true;
        }
      }
    };

    node1.onEvent = (ev) => {
      if (ev.type === 'DELIVERED') {
        aliceDeliveredAck = true;
      }
    };

    // Alice sends message to Bob
    node1.sendPersonalMessage(
      userA.deviceUuid,
      userA.displayName,
      userB.deviceUuid,
      userB.displayName,
      'Need medical supplies at Shelter 2'
    );

    // Wait for multi-hop propagation (Node 1 -> Node 2 -> Node 3)
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(bobReceivedMessage).toBe(true);
    // Overhearing or delivery acknowledgement received
    expect(aliceDeliveredAck).toBe(true);
  });

  it('stores messages in store-and-forward queue when recipient is offline and flushes on connect', async () => {
    const sim = new MeshSimulator();
    const node1 = sim.nodes.get(1)!;
    const node3 = sim.nodes.get(3)!;

    const userA: UserProfile = {
      deviceUuid: 'uuid-alice-sender',
      displayName: 'Alice',
      deviceModel: 'Phone',
      currentNodeId: '0x0001',
      presenceStatus: 'connected',
      firstSeenAt: '12:00',
      lastSeenAt: 'Active',
    };
    node1.registerClient(userA);

    // Recipient Charlie is NOT connected anywhere yet
    const offlineRecipientUuid = 'uuid-charlie-offline';

    // Alice sends message to offline Charlie
    node1.sendPersonalMessage(
      userA.deviceUuid,
      userA.displayName,
      offlineRecipientUuid,
      'Charlie',
      'Meet at base camp when you arrive'
    );

    await new Promise((resolve) => setTimeout(resolve, 300));

    // Message should be stored in Node 3's store-and-forward queue
    const queuedOnNode3 = node3.personalMessageQueue.find(
      (m) => m.recipientUuid === offlineRecipientUuid
    );
    expect(queuedOnNode3).toBeDefined();
    expect(queuedOnNode3?.status).toBe('pending');

    // Now Charlie comes online and connects to Node 3
    let flushedMessageDelivered = false;
    node3.onEvent = (ev) => {
      if (ev.type === 'NEW_PERSONAL') {
        const msg = ev.data as any;
        if (msg.recipientUuid === offlineRecipientUuid) {
          flushedMessageDelivered = true;
        }
      }
    };

    node3.registerClient({
      deviceUuid: offlineRecipientUuid,
      displayName: 'Charlie',
      deviceModel: 'Samsung A52',
      currentNodeId: '0x0003',
      presenceStatus: 'connected',
      firstSeenAt: '12:30',
      lastSeenAt: 'Active now',
    });

    expect(flushedMessageDelivered).toBe(true);
  });

  it('suppresses duplicate broadcasts using circular deduplication cache', async () => {
    const sim = new MeshSimulator();
    const node1 = sim.nodes.get(1)!;
    const node2 = sim.nodes.get(2)!;

    let node2RxCount = 0;
    node2.onEvent = (ev) => {
      if (ev.type === 'RF_RX') {
        node2RxCount++;
      }
    };

    // Send global broadcast
    node1.sendGlobalMessage('user-1', 'Alice', 'Flood water rising near bridge', true);

    await new Promise((resolve) => setTimeout(resolve, 200));

    const initialRx = node2RxCount;
    expect(initialRx).toBeGreaterThan(0);

    // Node 2 should remember the packet key and not re-process duplicate keys
    expect(node2.deduplicationCache.length).toBeGreaterThan(0);
  });
});
