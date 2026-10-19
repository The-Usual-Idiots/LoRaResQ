'use client';

import React, { useState, useEffect } from 'react';
import {
  Radio,
  Wifi,
  Battery,
  Users,
  MessageSquare,
  Globe,
  AlertTriangle,
  Settings,
  MapPin,
  Clock,
  Shield,
  CheckCircle2,
  RefreshCw,
  Send,
  Lock,
} from 'lucide-react';
import {
  NodeInfo,
  UserProfile,
  PersonalMessage,
  GlobalMessage,
  DeviceLocation,
  NodeConfig,
} from '@/types/loraresq';
import {
  getOrCreateDeviceUUID,
  getStoredDisplayName,
  setStoredDisplayName,
  getDetectedDeviceModel,
} from '@/lib/deviceIdentity';

export default function LoRaResQConsole() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'roster' | 'messages' | 'global' | 'location' | 'sos'>('roster');

  // Connected ESP32 Node State (Simulated baseline for initial PWA scaffolding)
  const [nodeInfo, setNodeInfo] = useState<NodeInfo>({
    nodeId: '0x0001',
    name: 'LoRaResQ-Alpha',
    frequencyMhz: 865.125,
    channel: 15,
    txPowerDbm: 22,
    batteryVoltage: 3.96,
    batteryPercent: 82,
    connectedClients: 3,
    hopCount: 0,
    uptimeSeconds: 14200,
    lastSeenAt: 'Just now',
  });

  // Client User Profile State
  const [deviceUuid, setDeviceUuid] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [deviceModel, setDeviceModel] = useState<string>('');
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [tempName, setTempName] = useState<string>('');

  // Mesh User Roster
  const [roster, setRoster] = useState<UserProfile[]>([]);

  // Messages
  const [personalMessages, setPersonalMessages] = useState<PersonalMessage[]>([]);
  const [selectedRecipientUuid, setSelectedRecipientUuid] = useState<string>('');
  const [personalMsgInput, setPersonalMsgInput] = useState<string>('');

  const [globalMessages, setGlobalMessages] = useState<GlobalMessage[]>([]);
  const [globalMsgInput, setGlobalMsgInput] = useState<string>('');

  // Location State
  const [location, setLocation] = useState<DeviceLocation>({
    deviceUuid: '',
    latitude: null,
    longitude: null,
    altitude: null,
    accuracyMeters: null,
    updatedAt: 'Never',
    isStale: true,
    source: 'unavailable',
  });
  const [locationError, setLocationError] = useState<string | null>(null);
  const [manualLat, setManualLat] = useState<string>('');
  const [manualLon, setManualLon] = useState<string>('');

  // SOS State
  const [sosSent, setSosSent] = useState<boolean>(false);
  const [sosMessage, setSosMessage] = useState<string>('EMERGENCY: Immediate assistance required at our location.');

  // Admin Config Modal State
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [nodeConfig, setNodeConfig] = useState<NodeConfig>({
    nodeName: 'LoRaResQ-Alpha',
    nodeId: '0x0001',
    radioFrequencyMhz: 865.125,
    radioChannel: 15,
    txPowerDbm: 22,
    spreadingFactor: 9,
    bandwidthKhz: 125,
    wifiSsid: 'LoRaResQ-Alpha',
    wifiChannel: 6,
    heartbeatIntervalSec: 15,
  });

  // Initialize client identity and sample mesh data
  useEffect(() => {
    const uuid = getOrCreateDeviceUUID();
    const name = getStoredDisplayName();
    const model = getDetectedDeviceModel();

    setDeviceUuid(uuid);
    setDisplayName(name);
    setTempName(name);
    setDeviceModel(model);

    // Initial Roster Data
    setRoster([
      {
        deviceUuid: uuid,
        displayName: name,
        deviceModel: model,
        currentNodeId: '0x0001',
        presenceStatus: 'connected',
        firstSeenAt: 'Today, 18:00',
        lastSeenAt: 'Active now',
        isSelf: true,
      },
      {
        deviceUuid: '3f81e4b2-c011-4b1f-90e8-08d4b3123891',
        displayName: 'Health Worker - Priya',
        deviceModel: 'Samsung Galaxy M31',
        currentNodeId: '0x0001',
        presenceStatus: 'connected',
        firstSeenAt: 'Today, 17:30',
        lastSeenAt: '1 min ago',
      },
      {
        deviceUuid: 'a89c4501-12ef-46c9-b702-613d9a5b3012',
        displayName: 'Rescue Volunteer - Rahul',
        deviceModel: 'Redmi Note 10',
        currentNodeId: '0x0002',
        presenceStatus: 'connected',
        firstSeenAt: 'Today, 16:15',
        lastSeenAt: '3 mins ago',
      },
      {
        deviceUuid: '5561a098-99e3-4de0-a299-198f3cc004e1',
        displayName: 'Panchayat Office - Suresh',
        deviceModel: 'Motorola G52',
        currentNodeId: '0x0002',
        presenceStatus: 'offline',
        firstSeenAt: 'Yesterday, 11:20',
        lastSeenAt: '4 hours ago',
      },
      {
        deviceUuid: '772b11cd-83aa-448f-89de-d992e591010a',
        displayName: 'Shelter Lead - Anjali',
        deviceModel: 'Realme 8',
        currentNodeId: '0x0003',
        presenceStatus: 'unconfirmed',
        firstSeenAt: '2 days ago',
        lastSeenAt: '42 mins ago',
      },
    ]);

    // Initial Personal Messages (Demonstrating store-and-forward states)
    setPersonalMessages([
      {
        messageId: 'msg-001',
        senderUuid: uuid,
        senderName: name,
        recipientUuid: '3f81e4b2-c011-4b1f-90e8-08d4b3123891',
        recipientName: 'Health Worker - Priya',
        body: 'Do you have extra saline packets at the primary relief point?',
        originalTimestamp: '18:15',
        status: 'delivered',
        deliveredTimestamp: '18:16',
        expiresAt: 'In 7 days',
        retryCount: 0,
      },
      {
        messageId: 'msg-002',
        senderUuid: uuid,
        senderName: name,
        recipientUuid: '5561a098-99e3-4de0-a299-198f3cc004e1',
        recipientName: 'Panchayat Office - Suresh',
        body: 'Water supply tanker arrival time required for Sector 4.',
        originalTimestamp: '18:22',
        status: 'pending',
        expiresAt: 'In 7 days (Queued on MicroSD)',
        retryCount: 2,
      },
    ]);

    // Initial Global Chat Messages (Demonstrating 30-day retention)
    setGlobalMessages([
      {
        messageId: 'glob-101',
        senderUuid: '3f81e4b2-c011-4b1f-90e8-08d4b3123891',
        senderName: 'Health Worker - Priya',
        senderNodeId: '0x0001',
        body: 'First aid outpost active near River Bridge. Clean drinking water available.',
        originalTimestamp: '17:45',
        expiresAt: 'In 30 days',
        hopCount: 0,
      },
      {
        messageId: 'glob-102',
        senderUuid: 'a89c4501-12ef-46c9-b702-613d9a5b3012',
        senderName: 'Rescue Volunteer - Rahul',
        senderNodeId: '0x0002',
        body: 'ALERT: Sector 2 access road blocked by fallen electrical tree. Use East ridge path.',
        originalTimestamp: '18:10',
        expiresAt: 'In 30 days',
        hopCount: 1,
        isEmergencyAlert: true,
      },
    ]);
  }, []);

  // Update Display Name
  const handleSaveName = () => {
    if (!tempName.trim()) return;
    setStoredDisplayName(tempName);
    setDisplayName(tempName);
    setIsEditingName(false);

    // Update roster entry for self
    setRoster((prev) =>
      prev.map((u) => (u.isSelf ? { ...u, displayName: tempName } : u))
    );
  };

  // Request Location Function with Fallback
  const requestLocation = () => {
    setLocationError(null);

    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationError('Geolocation API not supported by this browser. Enter coordinates manually below.');
      return;
    }

    // Check Secure Context
    if (window.isSecureContext === false) {
      console.warn('Geolocation requested in non-secure HTTP context');
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          deviceUuid,
          latitude: parseFloat(pos.coords.latitude.toFixed(6)),
          longitude: parseFloat(pos.coords.longitude.toFixed(6)),
          altitude: pos.coords.altitude ? parseFloat(pos.coords.altitude.toFixed(1)) : null,
          accuracyMeters: Math.round(pos.coords.accuracy),
          updatedAt: new Date().toLocaleTimeString(),
          isStale: false,
          source: 'gps',
        });
      },
      (err) => {
        let msg = 'Failed to obtain GPS fix.';
        if (err.code === 1) {
          msg = 'Permission denied. (Note: Non-secure HTTP captive portals often block geolocation by policy. Use manual coordinates below).';
        } else if (err.code === 2) {
          msg = 'Position unavailable (check GPS toggle).';
        } else if (err.code === 3) {
          msg = 'Location request timed out.';
        }
        setLocationError(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  const handleManualLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);
    if (isNaN(lat) || isNaN(lon)) {
      setLocationError('Please enter valid numeric latitude and longitude.');
      return;
    }
    setLocation({
      deviceUuid,
      latitude: lat,
      longitude: lon,
      altitude: null,
      accuracyMeters: 50,
      updatedAt: new Date().toLocaleTimeString() + ' (Manual)',
      isStale: false,
      source: 'manual',
    });
    setLocationError(null);
  };

  // Send Personal Message
  const handleSendPersonalMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personalMsgInput.trim() || !selectedRecipientUuid) return;

    const recipient = roster.find((u) => u.deviceUuid === selectedRecipientUuid);
    const isRecipientConnected = recipient?.presenceStatus === 'connected';

    const newMsg: PersonalMessage = {
      messageId: 'msg-' + Date.now().toString(36),
      senderUuid: deviceUuid,
      senderName: displayName,
      recipientUuid: selectedRecipientUuid,
      recipientName: recipient ? recipient.displayName : 'Recipient',
      body: personalMsgInput.trim(),
      originalTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: isRecipientConnected ? 'delivered' : 'pending',
      deliveredTimestamp: isRecipientConnected ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
      expiresAt: 'In 7 days' + (isRecipientConnected ? '' : ' (Stored on MicroSD queue)'),
      retryCount: 0,
    };

    setPersonalMessages((prev) => [newMsg, ...prev]);
    setPersonalMsgInput('');
  };

  // Send Global Message
  const handleSendGlobalMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalMsgInput.trim()) return;

    const newGlobalMsg: GlobalMessage = {
      messageId: 'glob-' + Date.now().toString(36),
      senderUuid: deviceUuid,
      senderName: displayName,
      senderNodeId: nodeInfo.nodeId,
      body: globalMsgInput.trim(),
      originalTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      expiresAt: 'In 30 days',
      hopCount: 0,
    };

    setGlobalMessages((prev) => [newGlobalMsg, ...prev]);
    setGlobalMsgInput('');
  };

  // Trigger Phone SOS
  const handleTriggerSos = () => {
    setSosSent(true);
    const sosAlert: GlobalMessage = {
      messageId: 'sos-' + Date.now().toString(36),
      senderUuid: deviceUuid,
      senderName: 'SOS: ' + displayName,
      senderNodeId: nodeInfo.nodeId,
      body: `${sosMessage} [Coords: ${location.latitude ?? 'Unknown'}, ${location.longitude ?? 'Unknown'}]`,
      originalTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      expiresAt: 'In 30 days',
      hopCount: 0,
      isEmergencyAlert: true,
    };
    setGlobalMessages((prev) => [sosAlert, ...prev]);
  };

  // Admin Config Auth
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'admin123') {
      setIsAdminAuthenticated(true);
      setAdminError(null);
    } else {
      setAdminError('Invalid firmware administrative key.');
    }
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setNodeInfo((prev) => ({
      ...prev,
      name: nodeConfig.nodeName,
      channel: nodeConfig.radioChannel,
      frequencyMhz: nodeConfig.radioFrequencyMhz,
      txPowerDbm: nodeConfig.txPowerDbm,
    }));
    setIsAdminOpen(false);
  };

  return (
    <div>
      {/* Top Node Banner */}
      <header className="header">
        <div className="header-brand">
          <Radio size={22} />
          <span>LoRaResQ</span>
          <span className="badge badge-green" style={{ marginLeft: '0.5rem' }}>
            {nodeInfo.name} ({nodeInfo.nodeId})
          </span>
        </div>
        <div className="header-status">
          <span title="RF Operating Band">
            {nodeInfo.frequencyMhz} MHz (Ch {nodeInfo.channel})
          </span>
          <span style={{ display: 'flex', alignContent: 'center', gap: '0.25rem' }}>
            <Battery size={16} /> {nodeInfo.batteryPercent}% ({nodeInfo.batteryVoltage}V)
          </span>
          <button
            onClick={() => setIsAdminOpen(true)}
            title="Node Admin Configuration"
            style={{ background: 'transparent', color: '#94a3b8' }}
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <main className="container">
        {/* Device Profile & Connection State Card */}
        <section className="card">
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={18} color="#06b6d4" />
              Connected Civilian Identity
            </span>
            <span className="badge badge-green">Online on SoftAP</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Display Name</div>
              {isEditingName ? (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <input
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    className="input-field"
                    style={{ marginBottom: 0, padding: '0.3rem 0.5rem' }}
                  />
                  <button onClick={handleSaveName} className="btn-primary" style={{ padding: '0.3rem 0.75rem' }}>
                    Save
                  </button>
                </div>
              ) : (
                <div style={{ fontWeight: 600, fontSize: '1rem', cursor: 'pointer' }} onClick={() => setIsEditingName(true)}>
                  {displayName} <span style={{ fontSize: '0.75rem', color: '#06b6d4' }}>(Edit)</span>
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Device Model</div>
              <div style={{ fontWeight: 500 }}>{deviceModel}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Persistent Stable UUID</div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#94a3b8' }}>
                {deviceUuid.slice(0, 8)}...{deviceUuid.slice(-6)}
              </div>
            </div>
          </div>
        </section>

        {/* Navigation Tabs */}
        <nav className="tabs">
          <button
            onClick={() => setActiveTab('roster')}
            className={`tab-btn ${activeTab === 'roster' ? 'active' : ''}`}
          >
            <Users size={16} style={{ display: 'inline', marginRight: '0.35rem', verticalAlign: '-2px' }} />
            Mesh Roster ({roster.length})
          </button>
          <button
            onClick={() => setActiveTab('messages')}
            className={`tab-btn ${activeTab === 'messages' ? 'active' : ''}`}
          >
            <MessageSquare size={16} style={{ display: 'inline', marginRight: '0.35rem', verticalAlign: '-2px' }} />
            Personal 1:1
          </button>
          <button
            onClick={() => setActiveTab('global')}
            className={`tab-btn ${activeTab === 'global' ? 'active' : ''}`}
          >
            <Globe size={16} style={{ display: 'inline', marginRight: '0.35rem', verticalAlign: '-2px' }} />
            Global Chat
          </button>
          <button
            onClick={() => setActiveTab('location')}
            className={`tab-btn ${activeTab === 'location' ? 'active' : ''}`}
          >
            <MapPin size={16} style={{ display: 'inline', marginRight: '0.35rem', verticalAlign: '-2px' }} />
            Location & GPS
          </button>
          <button
            onClick={() => setActiveTab('sos')}
            className={`tab-btn ${activeTab === 'sos' ? 'active' : ''}`}
            style={{ color: activeTab === 'sos' ? '#ef4444' : undefined }}
          >
            <AlertTriangle size={16} style={{ display: 'inline', marginRight: '0.35rem', verticalAlign: '-2px' }} />
            Emergency SOS
          </button>
        </nav>

        {/* TAB 1: MESH USER ROSTER */}
        {activeTab === 'roster' && (
          <section className="card">
            <div className="card-title">
              <span>Persistent User Registry</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Retained Indefinitely on MicroSD</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Civilian identities persist across AP handovers. Reconnecting to another node updates the serving node without duplicate registration.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {roster.map((user) => (
                <div
                  key={user.deviceUuid}
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    padding: '0.85rem',
                    borderRadius: '0.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 600 }}>{user.displayName}</span>
                      {user.isSelf && <span className="badge badge-gray">You</span>}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {user.deviceModel} • Node {user.currentNodeId} • Last seen {user.lastSeenAt}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {user.presenceStatus === 'connected' && (
                      <span className="badge badge-green">Connected</span>
                    )}
                    {user.presenceStatus === 'offline' && (
                      <span className="badge badge-gray">Offline</span>
                    )}
                    {user.presenceStatus === 'unconfirmed' && (
                      <span className="badge badge-amber" title="Node partitioned or lease unconfirmed">
                        Unconfirmed
                      </span>
                    )}
                    {!user.isSelf && (
                      <button
                        onClick={() => {
                          setSelectedRecipientUuid(user.deviceUuid);
                          setActiveTab('messages');
                        }}
                        className="btn-primary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                      >
                        Message
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 2: PERSONAL 1:1 MESSAGING */}
        {activeTab === 'messages' && (
          <section className="card">
            <div className="card-title">
              <span>One-to-One Private Messaging</span>
              <span className="badge badge-gray">7-Day Retention Limit</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Messages destined for offline users are retained in the serving node's MicroSD store-and-forward queue for up to 7 days.
            </p>

            {/* Recipient Selector */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                Select Recipient from Mesh Roster:
              </label>
              <select
                value={selectedRecipientUuid}
                onChange={(e) => setSelectedRecipientUuid(e.target.value)}
                className="input-field"
              >
                <option value="">-- Choose recipient --</option>
                {roster
                  .filter((u) => !u.isSelf)
                  .map((u) => (
                    <option key={u.deviceUuid} value={u.deviceUuid}>
                      {u.displayName} ({u.presenceStatus.toUpperCase()} - Node {u.currentNodeId})
                    </option>
                  ))}
              </select>
            </div>

            {/* Message Input Form */}
            <form onSubmit={handleSendPersonalMessage} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <input
                type="text"
                placeholder={selectedRecipientUuid ? 'Type private message...' : 'Select recipient above first'}
                value={personalMsgInput}
                disabled={!selectedRecipientUuid}
                onChange={(e) => setPersonalMsgInput(e.target.value)}
                className="input-field"
                style={{ marginBottom: 0 }}
              />
              <button
                type="submit"
                disabled={!selectedRecipientUuid || !personalMsgInput.trim()}
                className="btn-primary"
              >
                <Send size={16} /> Send
              </button>
            </form>

            {/* Message History List */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                Message History & Store-and-Forward Queue:
              </div>
              {personalMessages.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No 1:1 messages exchanged yet.
                </div>
              ) : (
                personalMessages.map((msg) => (
                  <div key={msg.messageId} className="message-bubble">
                    <div className="message-header">
                      <span>
                        To: <strong>{msg.recipientName}</strong>
                      </span>
                      <span>{msg.originalTimestamp}</span>
                    </div>
                    <div className="message-body">{msg.body}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{msg.expiresAt}</span>
                      <span>
                        {msg.status === 'delivered' && (
                          <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                            <CheckCircle2 size={12} /> Delivered ({msg.deliveredTimestamp})
                          </span>
                        )}
                        {msg.status === 'pending' && (
                          <span className="badge badge-amber" style={{ fontSize: '0.7rem' }}>
                            <Clock size={12} /> Queued for Offline Recipient
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* TAB 3: GLOBAL CHAT */}
        {activeTab === 'global' && (
          <section className="card">
            <div className="card-title">
              <span>LoRaResQ Global Mesh Chat</span>
              <span className="badge badge-gray">30-Day Retention Limit</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Messages broadcast to all connected civilian devices across the multi-hop LoRa mesh. Duplicate suppression prevents packet looping.
            </p>

            <form onSubmit={handleSendGlobalMessage} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <input
                type="text"
                placeholder="Broadcast community announcement..."
                value={globalMsgInput}
                onChange={(e) => setGlobalMsgInput(e.target.value)}
                className="input-field"
                style={{ marginBottom: 0 }}
              />
              <button type="submit" disabled={!globalMsgInput.trim()} className="btn-primary">
                <Send size={16} /> Broadcast
              </button>
            </form>

            <div>
              {globalMessages.map((msg) => (
                <div
                  key={msg.messageId}
                  className={`message-bubble ${msg.isEmergencyAlert ? 'emergency' : ''}`}
                >
                  <div className="message-header">
                    <span>
                      <strong style={{ color: msg.isEmergencyAlert ? '#f87171' : '#38bdf8' }}>
                        {msg.senderName}
                      </strong>{' '}
                      (Origin: Node {msg.senderNodeId})
                    </span>
                    <span>
                      {msg.originalTimestamp} • Hops: {msg.hopCount}
                    </span>
                  </div>
                  <div className="message-body">{msg.body}</div>
                  <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Expires: {msg.expiresAt}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 4: LOCATION & GPS */}
        {activeTab === 'location' && (
          <section className="card">
            <div className="card-title">
              <span>Device Location & GPS Telemetry</span>
              <span className="badge badge-gray">Overwrites Latest Fix Only</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Location coordinates are attached to SOS packets and emergency alerts. To prevent tracking risks, only the single most recent valid fix is stored.
            </p>

            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 600 }}>Current Registered Fix:</span>
                {location.latitude ? (
                  <span className={`badge ${location.isStale ? 'badge-amber' : 'badge-green'}`}>
                    {location.isStale ? 'Stale Fix' : 'Fresh Fix'} ({location.source.toUpperCase()})
                  </span>
                ) : (
                  <span className="badge badge-gray">No Fix Acquired</span>
                )}
              </div>

              {location.latitude ? (
                <div style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
                  <div>Latitude: <strong>{location.latitude}°</strong></div>
                  <div>Longitude: <strong>{location.longitude}°</strong></div>
                  <div>Accuracy: ±{location.accuracyMeters} meters</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Last Fix Recorded: {location.updatedAt}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  No GPS coordinates recorded yet. Click below to request location fix.
                </div>
              )}

              <div style={{ marginTop: '1rem' }}>
                <button onClick={requestLocation} className="btn-primary" style={{ width: '100%' }}>
                  <RefreshCw size={16} /> Request Device GPS Coordinates
                </button>
              </div>
            </div>

            {/* Error & Captive Portal Context Notice */}
            {locationError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', color: '#fca5a5', fontSize: '0.85rem' }}>
                <AlertTriangle size={16} style={{ display: 'inline', marginRight: '0.35rem', verticalAlign: '-2px' }} />
                {locationError}
              </div>
            )}

            {/* Manual Coordinate Entry Fallback */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Manual Coordinate Entry (Captive Portal / Non-Secure Context Fallback):
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                When connecting via an offline HTTP captive portal (`192.168.4.1`), mobile browsers restrict automated Geolocation API access. Enter coordinates or landmarks manually:
              </p>

              <form onSubmit={handleManualLocationSubmit} className="grid-2">
                <input
                  type="text"
                  placeholder="Latitude (e.g. 19.0760)"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  className="input-field"
                />
                <input
                  type="text"
                  placeholder="Longitude (e.g. 72.8777)"
                  value={manualLon}
                  onChange={(e) => setManualLon(e.target.value)}
                  className="input-field"
                />
                <button type="submit" className="btn-primary" style={{ gridColumn: 'span 2' }}>
                  Save Manual Coordinates
                </button>
              </form>
            </div>
          </section>
        )}

        {/* TAB 5: EMERGENCY SOS */}
        {activeTab === 'sos' && (
          <section className="card">
            <div className="card-title" style={{ color: '#ef4444' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={20} />
                Emergency SOS Broadcast
              </span>
              <span className="badge badge-red">High Priority RF Queue</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Triggering an SOS dispatches an emergency frame across the entire LoRa mesh. It preempts routine chatter and sounds the physical buzzer on nearby nodes.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                Emergency Alert Description:
              </label>
              <textarea
                rows={3}
                value={sosMessage}
                onChange={(e) => setSosMessage(e.target.value)}
                className="input-field"
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Location to be attached:{' '}
              <strong>
                {location.latitude ? `${location.latitude}°, ${location.longitude}° (±${location.accuracyMeters}m)` : 'UNAVAILABLE (Coordinates pending fix)'}
              </strong>
            </div>

            <button onClick={handleTriggerSos} className="btn-danger">
              <AlertTriangle size={20} /> BROADCAST SOS TO ALL NODES
            </button>

            {sosSent && (
              <div style={{ marginTop: '1rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', padding: '0.85rem', borderRadius: '0.5rem', color: '#fca5a5', fontSize: '0.85rem' }}>
                <CheckCircle2 size={16} style={{ display: 'inline', marginRight: '0.35rem', verticalAlign: '-2px' }} />
                SOS alert broadcasted to local node queue. Hardware buzzer triggered on Node {nodeInfo.nodeId}.
              </div>
            )}

            {/* Hardware Button Reference */}
            <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '1.5rem', paddingTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <strong>Physical Node Button:</strong> In addition to the web console, pressing the physical tactile button on the ESP32 enclosure automatically emits a high-priority SOS packet with firmware-embedded emergency coordinates.
            </div>
          </section>
        )}
      </main>

      {/* ADMIN NODE CONFIGURATION MODAL */}
      {isAdminOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="card-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Lock size={18} /> Node Runtime Administration
              </span>
              <button
                onClick={() => {
                  setIsAdminOpen(false);
                  setIsAdminAuthenticated(false);
                  setAdminPassword('');
                }}
                style={{ background: 'transparent', color: '#94a3b8', fontSize: '1.25rem' }}
              >
                ×
              </button>
            </div>

            {!isAdminAuthenticated ? (
              <form onSubmit={handleAdminLogin}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Enter firmware administrative password provisioned during flashing (default: <code>admin123</code>):
                </p>
                <input
                  type="password"
                  placeholder="Admin Password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="input-field"
                  autoFocus
                />
                {adminError && (
                  <div style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                    {adminError}
                  </div>
                )}
                <button type="submit" className="btn-primary" style={{ width: '100%' }}>
                  Authenticate Session
                </button>
              </form>
            ) : (
              <form onSubmit={handleSaveConfig}>
                <p style={{ fontSize: '0.85rem', color: '#34d399', marginBottom: '1rem' }}>
                  ✓ Authenticated as Administrator. Modify runtime parameters:
                </p>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Node Display Name</label>
                  <input
                    type="text"
                    value={nodeConfig.nodeName}
                    onChange={(e) => setNodeConfig({ ...nodeConfig, nodeName: e.target.value })}
                    className="input-field"
                  />
                </div>

                <div className="grid-2">
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Radio Channel (865 MHz)</label>
                    <select
                      value={nodeConfig.radioChannel}
                      onChange={(e) => {
                        const ch = parseInt(e.target.value);
                        setNodeConfig({
                          ...nodeConfig,
                          radioChannel: ch,
                          radioFrequencyMhz: 865.125 + (ch - 15) * 1.0,
                        });
                      }}
                      className="input-field"
                    >
                      <option value={15}>Channel 15 (865.125 MHz)</option>
                      <option value={16}>Channel 16 (866.125 MHz)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>RF TX Power (dBm)</label>
                    <select
                      value={nodeConfig.txPowerDbm}
                      onChange={(e) => setNodeConfig({ ...nodeConfig, txPowerDbm: parseInt(e.target.value) })}
                      className="input-field"
                    >
                      <option value={14}>14 dBm (25 mW)</option>
                      <option value={17}>17 dBm (50 mW)</option>
                      <option value={20}>20 dBm (100 mW)</option>
                      <option value={22}>22 dBm (160 mW - Max)</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Wi-Fi SoftAP SSID</label>
                  <input
                    type="text"
                    value={nodeConfig.wifiSsid}
                    onChange={(e) => setNodeConfig({ ...nodeConfig, wifiSsid: e.target.value })}
                    className="input-field"
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                    Apply Live Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAdminOpen(false)}
                    className="tab-btn"
                    style={{ border: '1px solid var(--border-color)' }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
