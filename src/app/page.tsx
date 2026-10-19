'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Volume2,
  VolumeX,
  Compass,
  Activity,
  Signal,
  Cpu,
  Layers,
  Search,
  ArrowRight,
  Sliders,
  Check,
  ChevronRight,
} from 'lucide-react';
import {
  NodeInfo,
  UserProfile,
  PersonalMessage,
  GlobalMessage,
  DeviceLocation,
  NodeConfig,
  TransportConnectionState,
} from '@/types/loraresq';
import {
  getOrCreateDeviceUUID,
  getStoredDisplayName,
  setStoredDisplayName,
  getDetectedDeviceModel,
} from '@/lib/deviceIdentity';
import { NodeTransport } from '@/lib/transport/nodeTransport';
import {
  getPersonalMessages,
  getGlobalMessages,
  getRoster,
} from '@/lib/storage/offlineStore';
import { EMERGENCY_PRESETS, EmergencyPreset } from '@/lib/emergencyPresets';
import { playEmergencyAlarm, stopEmergencyAlarm } from '@/lib/alarm';
import OfflineMap, { MapCoordinates } from '@/components/OfflineMap';

// Preset quick replies for disaster resilience
const QUICK_REPLY_TEMPLATES = [
  'I am safe at current coordinates.',
  'Need medical triage urgently.',
  'Drinking water shortage here.',
  'Sheltered at village school.',
  'Moving to higher ground now.',
  'Awaiting rescue boat / vehicle.',
];

// Simulator preset endpoints
const GATEWAY_OPTIONS = [
  { id: 'sim-alpha', label: 'Node 1: Alpha (Virtual Port 8081)', url: 'ws://localhost:8081/ws', isSimulated: true },
  { id: 'sim-bravo', label: 'Node 2: Bravo (Virtual Port 8082)', url: 'ws://localhost:8082/ws', isSimulated: true },
  { id: 'sim-charlie', label: 'Node 3: Charlie (Virtual Port 8083)', url: 'ws://localhost:8083/ws', isSimulated: true },
  { id: 'esp32-live', label: 'ESP32 SoftAP Live (192.168.4.1:81)', url: 'ws://192.168.4.1:81/ws', isSimulated: false },
];

export default function LoRaResQConsole() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'roster' | 'messages' | 'global' | 'map' | 'sos'>('dashboard');

  // Connection & Node Status
  const [connectionState, setConnectionState] = useState<TransportConnectionState>('connecting');
  const [isSimulated, setIsSimulated] = useState<boolean>(true);
  const [connectionTarget, setConnectionTarget] = useState<string>('');
  const [selectedGatewayId, setSelectedGatewayId] = useState<string>('sim-alpha');

  const [nodeInfo, setNodeInfo] = useState<NodeInfo>({
    nodeId: '0x0001',
    name: 'LoRaResQ-Alpha',
    frequencyMhz: 865.125,
    channel: 15,
    txPowerDbm: 22,
    batteryVoltage: 3.98,
    batteryPercent: 88,
    connectedClients: 1,
    hopCount: 0,
    uptimeSeconds: 320,
    lastSeenAt: 'Active now',
    isSimulated: true,
  });

  // Client User Profile State
  const [deviceUuid, setDeviceUuid] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [deviceModel, setDeviceModel] = useState<string>('');
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [tempName, setTempName] = useState<string>('');

  // Mesh User Roster
  const [roster, setRoster] = useState<UserProfile[]>([]);
  const [rosterSearch, setRosterSearch] = useState<string>('');
  const [rosterFilter, setRosterFilter] = useState<'all' | 'connected' | 'offline'>('all');

  // 1:1 Messages
  const [personalMessages, setPersonalMessages] = useState<PersonalMessage[]>([]);
  const [selectedRecipientUuid, setSelectedRecipientUuid] = useState<string>('');
  const [personalMsgInput, setPersonalMsgInput] = useState<string>('');

  // Global Announcements
  const [globalMessages, setGlobalMessages] = useState<GlobalMessage[]>([]);
  const [globalMsgInput, setGlobalMsgInput] = useState<string>('');

  // Location State
  const [location, setLocation] = useState<DeviceLocation>({
    deviceUuid: '',
    latitude: 19.076,
    longitude: 72.8777,
    altitude: null,
    accuracyMeters: 20,
    updatedAt: 'Base Node Initial Fix',
    isStale: false,
    source: 'manual',
  });
  const [locationError, setLocationError] = useState<string | null>(null);

  // SOS & Emergency State
  const [sosSent, setSosSent] = useState<boolean>(false);
  const [sosMessage, setSosMessage] = useState<string>('EMERGENCY: Immediate medical and rescue assistance required.');
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'mr' | 'hi'>('en');
  const [isAlarmPlaying, setIsAlarmPlaying] = useState<boolean>(false);

  // 3-Second Hold to Trigger SOS safety control
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Admin Config Modal State
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [adminToken, setAdminToken] = useState<string>('');
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

  const transportRef = useRef<NodeTransport | null>(null);

  // Initialize client profile, offline database, and live transport
  useEffect(() => {
    const uuid = getOrCreateDeviceUUID();
    const name = getStoredDisplayName();
    const model = getDetectedDeviceModel();

    setDeviceUuid(uuid);
    setDisplayName(name);
    setTempName(name);
    setDeviceModel(model);

    setLocation((prev) => ({ ...prev, deviceUuid: uuid }));

    // Load persisted offline state from IndexedDB
    getPersonalMessages().then((msgs) => {
      if (msgs.length > 0) setPersonalMessages(msgs);
    });
    getGlobalMessages().then((msgs) => {
      if (msgs.length > 0) setGlobalMessages(msgs);
    });
    getRoster().then((savedRoster) => {
      if (savedRoster.length > 0) setRoster(savedRoster);
    });

    // Initialize Transport
    const transport = new NodeTransport({
      onConnectionChange: (state, details) => {
        setConnectionState(state);
        setIsSimulated(details.isSimulated);
        setConnectionTarget(details.targetUrl);
      },
      onNodeInfo: (info) => {
        setNodeInfo(info);
      },
      onRosterUpdate: (newRoster) => {
        setRoster(newRoster);
      },
      onNewPersonalMessage: (msg) => {
        setPersonalMessages((prev) => {
          if (prev.some((m) => m.messageId === msg.messageId)) return prev;
          return [msg, ...prev];
        });
      },
      onNewGlobalMessage: (msg) => {
        setGlobalMessages((prev) => {
          if (prev.some((m) => m.messageId === msg.messageId)) return prev;
          return [msg, ...prev];
        });
      },
      onMessageStatusUpdate: (messageId, status, deliveredTimestamp) => {
        setPersonalMessages((prev) =>
          prev.map((m) =>
            m.messageId === messageId
              ? {
                  ...m,
                  status: status as any,
                  deliveredTimestamp: deliveredTimestamp || m.deliveredTimestamp,
                }
              : m
          )
        );
      },
      onEmergencyAlert: (alert) => {
        setGlobalMessages((prev) => {
          if (prev.some((m) => m.messageId === alert.messageId)) return prev;
          return [alert, ...prev];
        });
        playEmergencyAlarm();
        setIsAlarmPlaying(true);
      },
    });

    transport.connect({ deviceUuid: uuid, displayName: name, deviceModel: model });
    transportRef.current = transport;

    return () => {
      transport.disconnect();
      stopEmergencyAlarm();
    };
  }, []);

  // Handle Switching Gateway Target (Simulator Node or Live Hardware)
  const handleSwitchGateway = (optionId: string) => {
    setSelectedGatewayId(optionId);
    const selected = GATEWAY_OPTIONS.find((g) => g.id === optionId);
    if (selected && transportRef.current) {
      transportRef.current.switchTarget(selected.url, selected.isSimulated);
    }
  };

  // Save Display Name
  const handleSaveName = () => {
    if (!tempName.trim()) return;
    setStoredDisplayName(tempName);
    setDisplayName(tempName);
    setIsEditingName(false);

    if (transportRef.current) {
      transportRef.current.connect({
        deviceUuid,
        displayName: tempName,
        deviceModel,
      });
    }

    setRoster((prev) =>
      prev.map((u) => (u.isSelf ? { ...u, displayName: tempName } : u))
    );
  };

  // Automated Device Geolocation
  const requestLocation = () => {
    setLocationError(null);

    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationError('Geolocation API not supported by browser. Drop a pin on the tactical grid below.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLoc: DeviceLocation = {
          deviceUuid,
          latitude: parseFloat(pos.coords.latitude.toFixed(6)),
          longitude: parseFloat(pos.coords.longitude.toFixed(6)),
          altitude: pos.coords.altitude ? parseFloat(pos.coords.altitude.toFixed(1)) : null,
          accuracyMeters: Math.round(pos.coords.accuracy),
          updatedAt: new Date().toLocaleTimeString(),
          isStale: false,
          source: 'gps',
        };
        setLocation(newLoc);
        transportRef.current?.updateLocation(newLoc);
      },
      (err) => {
        let msg = 'Failed to obtain GPS fix.';
        if (err.code === 1) {
          msg = 'Permission denied. (Captive portal browsers may block automated geolocation. Drop a pin on the tactical grid below).';
        } else if (err.code === 2) {
          msg = 'Position unavailable (check device location toggle).';
        } else if (err.code === 3) {
          msg = 'Location request timed out.';
        }
        setLocationError(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // Tactical Map Pin-Drop Selection Handler
  const handleMapCoordSelect = (coords: MapCoordinates) => {
    const updated: DeviceLocation = {
      deviceUuid,
      latitude: coords.latitude,
      longitude: coords.longitude,
      altitude: null,
      accuracyMeters: coords.distanceMeters ?? 20,
      updatedAt: new Date().toLocaleTimeString() + (coords.landmarkName ? ` (${coords.landmarkName})` : ' (Tactical Map)'),
      isStale: false,
      source: coords.source === 'gps' ? 'gps' : 'manual',
    };
    setLocation(updated);
    transportRef.current?.updateLocation(updated);
  };

  // Send Personal 1:1 Message
  const handleSendPersonalMessage = (e?: React.FormEvent, customBody?: string) => {
    if (e) e.preventDefault();
    const textToSend = (customBody || personalMsgInput).trim();
    if (!textToSend || !selectedRecipientUuid) return;

    const recipient = roster.find((u) => u.deviceUuid === selectedRecipientUuid);
    const recipientName = recipient ? recipient.displayName : 'Recipient';

    const msgId = transportRef.current?.sendPersonalMessage(
      selectedRecipientUuid,
      recipientName,
      textToSend
    ) || 'msg-' + Date.now();

    const isRecipientConnected = recipient?.presenceStatus === 'connected';

    const newMsg: PersonalMessage = {
      messageId: msgId,
      senderUuid: deviceUuid,
      senderName: displayName,
      recipientUuid: selectedRecipientUuid,
      recipientName,
      body: textToSend,
      originalTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: isRecipientConnected ? 'delivered' : 'pending',
      deliveredTimestamp: isRecipientConnected ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
      expiresAt: 'In 7 days' + (isRecipientConnected ? '' : ' (Queued on MicroSD store-and-forward)'),
      retryCount: 0,
    };

    setPersonalMessages((prev) => [newMsg, ...prev]);
    if (!customBody) setPersonalMsgInput('');
  };

  // Send Global Broadcast Message
  const handleSendGlobalMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalMsgInput.trim()) return;

    const msgId = transportRef.current?.sendGlobalMessage(globalMsgInput.trim(), false) || 'glob-' + Date.now();

    const newGlobalMsg: GlobalMessage = {
      messageId: msgId,
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

  // Apply Multilingual Emergency Preset
  const handleApplyPreset = (preset: EmergencyPreset) => {
    const text = preset[selectedLanguage];
    setSosMessage(text);
  };

  // Trigger Emergency SOS Broadcast
  const triggerSosBroadcast = () => {
    setSosSent(true);
    playEmergencyAlarm();
    setIsAlarmPlaying(true);

    const fullAlertText = `${sosMessage} [Coordinates: ${location.latitude ?? 'Unknown'}, ${location.longitude ?? 'Unknown'} (±${location.accuracyMeters}m)]`;

    const msgId = transportRef.current?.sendSosAlert(fullAlertText, location) || 'sos-' + Date.now();

    const sosAlert: GlobalMessage = {
      messageId: msgId,
      senderUuid: deviceUuid,
      senderName: '🚨 SOS: ' + displayName,
      senderNodeId: nodeInfo.nodeId,
      body: fullAlertText,
      originalTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      expiresAt: 'In 30 days',
      hopCount: 0,
      isEmergencyAlert: true,
    };

    setGlobalMessages((prev) => [sosAlert, ...prev]);
  };

  // Press-and-Hold Safety Logic for SOS
  const startHoldingSos = () => {
    setIsHolding(true);
    setHoldProgress(0);

    const startTime = Date.now();
    const durationMs = 2200; // 2.2 seconds required hold

    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);

    holdIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / durationMs) * 100, 100);
      setHoldProgress(progress);

      if (progress >= 100) {
        if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
        setIsHolding(false);
        setHoldProgress(0);
        triggerSosBroadcast();
      }
    }, 40);
  };

  const cancelHoldingSos = () => {
    setIsHolding(false);
    setHoldProgress(0);
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };

  const handleToggleAlarm = () => {
    if (isAlarmPlaying) {
      stopEmergencyAlarm();
      setIsAlarmPlaying(false);
    } else {
      playEmergencyAlarm();
      setIsAlarmPlaying(true);
    }
  };

  // Admin Auth & Save
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'admin123') {
      setIsAdminAuthenticated(true);
      setAdminToken('valid-admin-token');
      setAdminError(null);
    } else {
      setAdminError('Invalid firmware administrative key.');
    }
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (transportRef.current && adminToken) {
      transportRef.current.updateNodeConfig(adminToken, nodeConfig);
    }
    setNodeInfo((prev) => ({
      ...prev,
      name: nodeConfig.nodeName,
      channel: nodeConfig.radioChannel,
      frequencyMhz: nodeConfig.radioFrequencyMhz,
      txPowerDbm: nodeConfig.txPowerDbm,
    }));
    setIsAdminOpen(false);
  };

  // Filtered Roster
  const filteredRoster = useMemo(() => {
    return roster.filter((user) => {
      const matchesSearch =
        user.displayName.toLowerCase().includes(rosterSearch.toLowerCase()) ||
        user.deviceModel.toLowerCase().includes(rosterSearch.toLowerCase()) ||
        user.deviceUuid.toLowerCase().includes(rosterSearch.toLowerCase());

      if (!matchesSearch) return false;
      if (rosterFilter === 'connected') return user.presenceStatus === 'connected';
      if (rosterFilter === 'offline') return user.presenceStatus === 'offline';
      return true;
    });
  }, [roster, rosterSearch, rosterFilter]);

  // Selected Recipient Object
  const activeRecipient = useMemo(() => {
    return roster.find((u) => u.deviceUuid === selectedRecipientUuid);
  }, [roster, selectedRecipientUuid]);

  // Selected Recipient's Conversation Thread
  const conversationMessages = useMemo(() => {
    if (!selectedRecipientUuid) return [];
    return personalMessages.filter(
      (m) =>
        (m.senderUuid === deviceUuid && m.recipientUuid === selectedRecipientUuid) ||
        (m.senderUuid === selectedRecipientUuid && m.recipientUuid === deviceUuid)
    );
  }, [personalMessages, selectedRecipientUuid, deviceUuid]);

  return (
    <div>
      {/* 1. TOP COMMAND HEADER */}
      <header className="command-header">
        <div className="brand-badge">
          <div className="brand-emblem">
            <Radio size={20} />
            <div className="beacon-pulse" />
          </div>
          <div className="brand-text">
            <div className="brand-title">
              <span>LoRaResQ</span>
              <span className="badge badge-cyan font-mono" style={{ fontSize: '0.65rem' }}>
                TACTICAL CONSOLE
              </span>
            </div>
            <div className="brand-subtitle">
              Resilient Mesh • 865 MHz SRD
            </div>
          </div>
        </div>

        {/* Node & RF Telemetry Cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Target Gateway Switcher Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Gateway:
            </span>
            <select
              value={selectedGatewayId}
              onChange={(e) => handleSwitchGateway(e.target.value)}
              className="tactical-select"
              style={{
                padding: '0.25rem 0.55rem',
                fontSize: '0.74rem',
                height: '30px',
                width: 'auto',
                minWidth: '200px',
              }}
            >
              {GATEWAY_OPTIONS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          {/* Battery Status Pill */}
          <div
            className="badge badge-neutral font-mono"
            title={`Serving Node Voltage: ${nodeInfo.batteryVoltage}V`}
            style={{ padding: '0.3rem 0.65rem', gap: '0.45rem' }}
          >
            <Battery
              size={14}
              color={
                nodeInfo.batteryPercent > 50
                  ? '#10b981'
                  : nodeInfo.batteryPercent > 20
                  ? '#f59e0b'
                  : '#ef4444'
              }
            />
            <span>
              {nodeInfo.batteryPercent}% ({nodeInfo.batteryVoltage}V)
            </span>
          </div>

          {/* Connection Status Pill */}
          <div
            className={`badge ${
              connectionState === 'live'
                ? 'badge-green'
                : connectionState === 'simulated'
                ? 'badge-violet'
                : connectionState === 'connecting'
                ? 'badge-amber'
                : 'badge-crimson'
            }`}
            style={{ padding: '0.3rem 0.65rem', textTransform: 'uppercase' }}
          >
            <Wifi size={13} />
            <span>
              {connectionState === 'live'
                ? 'ESP32 HARDWARE'
                : connectionState === 'simulated'
                ? 'VIRTUAL MESH'
                : connectionState === 'connecting'
                ? 'CONNECTING'
                : 'OFFLINE'}
            </span>
          </div>

          {/* Acoustic Siren Toggle Button */}
          <button
            onClick={handleToggleAlarm}
            title={isAlarmPlaying ? 'Silence acoustic siren' : 'Test acoustic siren'}
            style={{
              background: isAlarmPlaying ? '#dc2626' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${isAlarmPlaying ? '#ef4444' : 'var(--border-subtle)'}`,
              color: isAlarmPlaying ? '#ffffff' : 'var(--text-muted)',
              padding: '0.35rem 0.6rem',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.75rem',
            }}
          >
            {isAlarmPlaying ? <VolumeX size={15} /> : <Volume2 size={15} />}
            <span style={{ display: 'none' }}>Siren</span>
          </button>

          {/* Admin Settings Button */}
          <button
            onClick={() => setIsAdminOpen(true)}
            title="Firmware & RF Parameter Administration"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
              padding: '0.35rem 0.6rem',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Settings size={15} />
          </button>
        </div>
      </header>

      {/* 2. RF SPECTRUM & HARDWARE TELEMETRY STRIP */}
      <div className="telemetry-strip">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-bright)' }}>
            <Signal size={13} color="var(--accent-cyan)" />
            <strong className="font-mono">{nodeInfo.frequencyMhz} MHz</strong> (Channel {nodeInfo.channel})
          </span>
          <span style={{ color: 'var(--text-dim)' }}>•</span>
          <span style={{ color: 'var(--text-muted)' }}>
            BW: <strong>125 kHz</strong> • SF: <strong>9</strong> • CR: <strong>4/5</strong>
          </span>
          <span style={{ color: 'var(--text-dim)' }}>•</span>
          <span style={{ color: 'var(--text-muted)' }}>
            ERP: <strong>{nodeInfo.txPowerDbm} dBm</strong> (160 mW Max)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
            Serving Node: <strong className="font-mono" style={{ color: 'var(--accent-cyan)' }}>{nodeInfo.name}</strong> ({nodeInfo.nodeId})
          </span>
          <span className="badge badge-neutral" style={{ fontSize: '0.68rem' }}>
            India SRD 865-867 Compliance
          </span>
        </div>
      </div>

      {/* 3. EMERGENCY AUDIO STROBE BANNER */}
      {isAlarmPlaying && (
        <div className="emergency-audio-strobe">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <AlertTriangle size={20} />
            <span>LOCAL EMERGENCY ACOUSTIC BEACON ACTIVE (Dual 800/1000Hz Siren Oscillating)</span>
          </div>
          <button
            onClick={handleToggleAlarm}
            style={{
              background: '#ffffff',
              color: '#991b1b',
              padding: '0.35rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 800,
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <VolumeX size={15} /> SILENCE SIREN
          </button>
        </div>
      )}

      {/* 4. MAIN WORKSPACE CONTAINER */}
      <main className="app-container">
        {/* Navigation Tabs */}
        <nav className="nav-tab-bar">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`nav-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            <Activity size={15} />
            <span>Tactical HUD</span>
          </button>
          <button
            onClick={() => setActiveTab('roster')}
            className={`nav-tab-btn ${activeTab === 'roster' ? 'active' : ''}`}
          >
            <Users size={15} />
            <span>Civilian Roster</span>
            <span className="badge badge-neutral font-mono">{roster.length}</span>
          </button>
          <button
            onClick={() => setActiveTab('messages')}
            className={`nav-tab-btn ${activeTab === 'messages' ? 'active' : ''}`}
          >
            <MessageSquare size={15} />
            <span>1:1 Secure Channel</span>
            {personalMessages.length > 0 && (
              <span className="badge badge-cyan font-mono">{personalMessages.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('global')}
            className={`nav-tab-btn ${activeTab === 'global' ? 'active' : ''}`}
          >
            <Globe size={15} />
            <span>Community Feed</span>
            {globalMessages.length > 0 && (
              <span className="badge badge-neutral font-mono">{globalMessages.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`nav-tab-btn ${activeTab === 'map' ? 'active' : ''}`}
          >
            <Compass size={15} />
            <span>Tactical Radar</span>
          </button>
          <button
            onClick={() => setActiveTab('sos')}
            className={`nav-tab-btn ${activeTab === 'sos' ? 'active-sos' : ''}`}
            style={{ color: activeTab === 'sos' ? '#ef4444' : undefined }}
          >
            <AlertTriangle size={15} />
            <span>Emergency SOS</span>
          </button>
        </nav>

        {/* ========================================================================= */}
        {/* TAB 1: TACTICAL HUD DASHBOARD                                             */}
        {/* ========================================================================= */}
        {activeTab === 'dashboard' && (
          <div>
            {/* Top Metrics Row */}
            <div className="hud-grid">
              <div className="hud-tile">
                <div className="hud-tile-label">
                  <span>Serving Node</span>
                  <Radio size={14} color="var(--accent-cyan)" />
                </div>
                <div className="hud-tile-value glow-cyan">{nodeInfo.nodeId}</div>
                <div className="hud-tile-sub">{nodeInfo.name} • Hop 0</div>
              </div>

              <div className="hud-tile">
                <div className="hud-tile-label">
                  <span>Mesh Population</span>
                  <Users size={14} color="var(--accent-emerald)" />
                </div>
                <div className="hud-tile-value glow-emerald">
                  {roster.filter((u) => u.presenceStatus === 'connected').length}
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    {' '}/ {roster.length} registered
                  </span>
                </div>
                <div className="hud-tile-sub">Active Civilian Leases</div>
              </div>

              <div className="hud-tile">
                <div className="hud-tile-label">
                  <span>RF Airtime Buffer</span>
                  <Signal size={14} color="var(--accent-blue)" />
                </div>
                <div className="hud-tile-value font-mono">132 ms</div>
                <div className="hud-tile-sub">Stop-and-Wait / Overhear</div>
              </div>

              <div className="hud-tile">
                <div className="hud-tile-label">
                  <span>Storage Queue</span>
                  <Layers size={14} color="var(--accent-amber)" />
                </div>
                <div className="hud-tile-value font-mono" style={{ color: '#fbbf24' }}>
                  {personalMessages.filter((m) => m.status === 'pending').length}
                </div>
                <div className="hud-tile-sub">MicroSD Store & Forward</div>
              </div>
            </div>

            {/* Quick Civilian Identity Card */}
            <section className="tactical-card">
              <div className="tactical-card-accent-top" />
              <div className="card-header-flex">
                <div className="card-title">
                  <Shield size={18} color="var(--accent-cyan)" />
                  <span>Local Civilian Identity & Station Profile</span>
                </div>
                <span className="badge badge-green">NVS & IndexedDB Persisted</span>
              </div>

              <div className="grid-3" style={{ alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                    Call Sign / Display Name
                  </div>
                  {isEditingName ? (
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        className="tactical-input"
                        style={{ padding: '0.35rem 0.6rem' }}
                      />
                      <button onClick={handleSaveName} className="btn-tactical btn-tactical-primary" style={{ padding: '0.35rem 0.75rem' }}>
                        Save
                      </button>
                    </div>
                  ) : (
                    <div
                      style={{ fontSize: '1.05rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      onClick={() => setIsEditingName(true)}
                    >
                      <span>{displayName}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', fontWeight: 500 }}>(Edit)</span>
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                    Station Device Model
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{deviceModel}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Web Browser Station</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                    RFC 4122 Persistent UUID
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--accent-blue)' }}>
                    {deviceUuid}
                  </div>
                </div>
              </div>
            </section>

            {/* Quick Actions & Emergency Trigger Widget */}
            <div className="grid-2">
              <section className="tactical-card">
                <div className="card-title" style={{ marginBottom: '0.6rem' }}>
                  <Compass size={17} color="var(--accent-cyan)" />
                  <span>Geo-Fix Telemetry</span>
                </div>
                <div style={{ fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '0.85rem' }}>
                  <div>Latitude: <strong className="font-mono">{location.latitude}°</strong></div>
                  <div>Longitude: <strong className="font-mono">{location.longitude}°</strong></div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    Accuracy: ±{location.accuracyMeters}m ({location.source.toUpperCase()}) • {location.updatedAt}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={requestLocation} className="btn-tactical btn-tactical-secondary" style={{ flex: 1 }}>
                    <RefreshCw size={14} /> Refresh GPS Fix
                  </button>
                  <button onClick={() => setActiveTab('map')} className="btn-tactical btn-tactical-primary" style={{ flex: 1 }}>
                    <Compass size={14} /> View Radar
                  </button>
                </div>
              </section>

              <section className="tactical-card" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                <div className="tactical-card-accent-crimson" />
                <div className="card-title" style={{ color: '#f87171', marginBottom: '0.6rem' }}>
                  <AlertTriangle size={17} />
                  <span>Rapid SOS Distress Beacon</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
                  Preempts routine mesh packets with high-priority CSMA/CA backoff, transmitting coordinates to all reachable nodes.
                </p>
                <button
                  onClick={() => setActiveTab('sos')}
                  className="btn-tactical btn-tactical-danger"
                  style={{ width: '100%' }}
                >
                  <AlertTriangle size={15} /> OPEN SOS EMERGENCY CONTROLS
                </button>
              </section>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: CIVILIAN MESH ROSTER                                               */}
        {/* ========================================================================= */}
        {activeTab === 'roster' && (
          <section className="tactical-card">
            <div className="tactical-card-accent-top" />
            <div className="card-header-flex">
              <div>
                <div className="card-title">
                  <Users size={18} color="var(--accent-cyan)" />
                  <span>Civilian Mesh Registry</span>
                </div>
                <div className="card-subtitle">
                  Synchronized across nodes via MicroSD and client IndexedDB. Handovers between nodes preserve identities.
                </div>
              </div>

              {/* Roster Filter Pills */}
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  onClick={() => setRosterFilter('all')}
                  className={`badge ${rosterFilter === 'all' ? 'badge-cyan' : 'badge-neutral'}`}
                >
                  All ({roster.length})
                </button>
                <button
                  onClick={() => setRosterFilter('connected')}
                  className={`badge ${rosterFilter === 'connected' ? 'badge-green' : 'badge-neutral'}`}
                >
                  Connected ({roster.filter((u) => u.presenceStatus === 'connected').length})
                </button>
                <button
                  onClick={() => setRosterFilter('offline')}
                  className={`badge ${rosterFilter === 'offline' ? 'badge-amber' : 'badge-neutral'}`}
                >
                  Offline ({roster.filter((u) => u.presenceStatus === 'offline').length})
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Search civilians by call sign, model, or UUID..."
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                className="tactical-input"
                style={{ paddingLeft: '2.2rem' }}
              />
              <Search
                size={16}
                color="var(--text-muted)"
                style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)' }}
              />
            </div>

            {/* Roster Cards List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {filteredRoster.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No civilians matching query.
                </div>
              ) : (
                filteredRoster.map((user) => (
                  <div
                    key={user.deviceUuid}
                    style={{
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      padding: '0.85rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-bright)' }}>
                          {user.displayName}
                        </span>
                        {user.deviceUuid === deviceUuid && (
                          <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>YOU</span>
                        )}
                        <span
                          className={`badge ${
                            user.presenceStatus === 'connected'
                              ? 'badge-green'
                              : user.presenceStatus === 'offline'
                              ? 'badge-neutral'
                              : 'badge-amber'
                          }`}
                        >
                          {user.presenceStatus.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Model: <strong>{user.deviceModel}</strong> • Serving Node:{' '}
                        <span className="font-mono" style={{ color: 'var(--accent-blue)' }}>{user.currentNodeId}</span> • Last seen {user.lastSeenAt}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {user.deviceUuid !== deviceUuid && (
                        <button
                          onClick={() => {
                            setSelectedRecipientUuid(user.deviceUuid);
                            setActiveTab('messages');
                          }}
                          className="btn-tactical btn-tactical-primary"
                          style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem' }}
                        >
                          <MessageSquare size={13} /> Secure Message
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: 1:1 SECURE MESSAGING                                               */}
        {/* ========================================================================= */}
        {activeTab === 'messages' && (
          <section className="tactical-card">
            <div className="tactical-card-accent-top" />
            <div className="card-header-flex">
              <div>
                <div className="card-title">
                  <MessageSquare size={18} color="var(--accent-cyan)" />
                  <span>Point-to-Point Secure Channel</span>
                </div>
                <div className="card-subtitle">
                  Stop-and-Wait ARQ with Passive Overhearing. Undelivered messages persist in MicroSD store-and-forward for 7 days.
                </div>
              </div>
              <span className="badge badge-amber font-mono">7-DAY RETENTION TTL</span>
            </div>

            {/* Recipient Dropdown */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>
                Select Destination Civilian:
              </label>
              <select
                value={selectedRecipientUuid}
                onChange={(e) => setSelectedRecipientUuid(e.target.value)}
                className="tactical-select"
              >
                <option value="">-- Choose recipient from roster --</option>
                {roster
                  .filter((u) => u.deviceUuid !== deviceUuid)
                  .map((u) => (
                    <option key={u.deviceUuid} value={u.deviceUuid}>
                      {u.displayName} ({u.presenceStatus.toUpperCase()} - Serving Node {u.currentNodeId})
                    </option>
                  ))}
              </select>
            </div>

            {/* Active Recipient Banner */}
            {activeRecipient && (
              <div
                style={{
                  background: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid var(--border-tactical)',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span style={{ fontWeight: 700, color: 'var(--text-bright)' }}>{activeRecipient.displayName}</span>{' '}
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>({activeRecipient.deviceModel})</span>
                </div>
                <span
                  className={`badge ${activeRecipient.presenceStatus === 'connected' ? 'badge-green' : 'badge-amber'}`}
                >
                  {activeRecipient.presenceStatus === 'connected' ? 'ONLINE (Direct RF)' : 'OFFLINE (Store-and-Forward)'}
                </span>
              </div>
            )}

            {/* Quick Emergency Replies */}
            {selectedRecipientUuid && (
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Quick Tactical Dispatch:
                </div>
                <div className="quick-reply-tray">
                  {QUICK_REPLY_TEMPLATES.map((reply, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendPersonalMessage(undefined, reply)}
                      className="quick-reply-chip"
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message Input Form */}
            <form onSubmit={handleSendPersonalMessage} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <input
                type="text"
                placeholder={selectedRecipientUuid ? 'Transmit private encrypted message...' : 'Select recipient above first'}
                value={personalMsgInput}
                disabled={!selectedRecipientUuid}
                onChange={(e) => setPersonalMsgInput(e.target.value)}
                className="tactical-input"
              />
              <button
                type="submit"
                disabled={!selectedRecipientUuid || !personalMsgInput.trim()}
                className="btn-tactical btn-tactical-primary"
              >
                <Send size={15} /> Transmit
              </button>
            </form>

            {/* Message History Feed */}
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.65rem' }}>
                Conversation Record & Transmission Pipeline:
              </div>

              {conversationMessages.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                  {selectedRecipientUuid
                    ? 'No messages in this channel yet. Type above or click a quick reply.'
                    : 'Select a civilian from the mesh roster to inspect message history.'}
                </div>
              ) : (
                <div className="chat-thread-container">
                  {conversationMessages.map((msg) => {
                    const isOutbound = msg.senderUuid === deviceUuid;
                    return (
                      <div
                        key={msg.messageId}
                        className={`chat-bubble ${isOutbound ? 'outbound' : 'inbound'}`}
                      >
                        <div className="bubble-meta-header">
                          <span style={{ fontWeight: 700 }}>
                            {isOutbound ? 'You' : msg.senderName}
                          </span>
                          <span className="font-mono">{msg.originalTimestamp}</span>
                        </div>
                        <div className="bubble-body">{msg.body}</div>

                        <div className="bubble-footer">
                          {/* 4-Step Pipeline Stepper */}
                          <div className="delivery-stepper">
                            <span className="step-node active-done">
                              <Check size={10} /> Queued
                            </span>
                            <ChevronRight size={12} color="var(--text-dim)" />
                            <span className={`step-node ${msg.status === 'delivered' ? 'active-done' : 'active-pending'}`}>
                              {msg.status === 'delivered' ? <Check size={10} /> : <Clock size={10} />} MicroSD
                            </span>
                            <ChevronRight size={12} color="var(--text-dim)" />
                            <span className={`step-node ${msg.status === 'delivered' ? 'active-done' : 'active-pending'}`}>
                              {msg.status === 'delivered' ? <Check size={10} /> : <Clock size={10} />} Mesh Hop
                            </span>
                            <ChevronRight size={12} color="var(--text-dim)" />
                            <span className={`step-node ${msg.status === 'delivered' ? 'active-done' : ''}`}>
                              {msg.status === 'delivered' ? (
                                <>
                                  <CheckCircle2 size={10} /> Delivered ({msg.deliveredTimestamp || 'ACK'})
                                </>
                              ) : (
                                'Waiting Lease'
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: GLOBAL COMMUNITY FEED                                              */}
        {/* ========================================================================= */}
        {activeTab === 'global' && (
          <section className="tactical-card">
            <div className="tactical-card-accent-top" />
            <div className="card-header-flex">
              <div>
                <div className="card-title">
                  <Globe size={18} color="var(--accent-cyan)" />
                  <span>Mesh Broadcast Channel</span>
                </div>
                <div className="card-subtitle">
                  Controlled flooding with passive duplicate suppression. Maximum 3-hop propagation across the disaster area.
                </div>
              </div>
              <span className="badge badge-neutral font-mono">30-DAY RETENTION TTL</span>
            </div>

            {/* Broadcast Input Form */}
            <form onSubmit={handleSendGlobalMessage} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <input
                type="text"
                placeholder="Broadcast community bulletin or shelter advisory..."
                value={globalMsgInput}
                onChange={(e) => setGlobalMsgInput(e.target.value)}
                className="tactical-input"
              />
              <button
                type="submit"
                disabled={!globalMsgInput.trim()}
                className="btn-tactical btn-tactical-primary"
              >
                <Send size={15} /> Broadcast
              </button>
            </form>

            {/* Announcements Feed */}
            <div className="chat-thread-container">
              {globalMessages.map((msg) => (
                <div
                  key={msg.messageId}
                  className={`chat-bubble ${msg.isEmergencyAlert ? 'alert-card' : ''}`}
                >
                  <div className="bubble-meta-header">
                    <span style={{ fontWeight: 800, color: msg.isEmergencyAlert ? '#f87171' : 'var(--accent-cyan)' }}>
                      {msg.senderName} (Origin: Node {msg.senderNodeId})
                    </span>
                    <span className="font-mono">
                      {msg.originalTimestamp} • {msg.hopCount} Hops
                    </span>
                  </div>

                  <div className="bubble-body" style={{ fontWeight: msg.isEmergencyAlert ? 600 : 400 }}>
                    {msg.body}
                  </div>

                  <div className="bubble-footer">
                    <span>Expires: {msg.expiresAt}</span>
                    {msg.isEmergencyAlert && (
                      <button
                        onClick={() => setActiveTab('map')}
                        className="btn-tactical btn-tactical-ghost"
                        style={{ fontSize: '0.72rem', color: '#fca5a5', padding: '0.1rem 0.4rem' }}
                      >
                        <Compass size={12} /> Pinpoint on Radar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: TACTICAL RADAR & MAP                                               */}
        {/* ========================================================================= */}
        {activeTab === 'map' && (
          <section className="tactical-card">
            <div className="tactical-card-accent-top" />
            <div className="card-header-flex">
              <div>
                <div className="card-title">
                  <Compass size={18} color="var(--accent-cyan)" />
                  <span>Tactical Vector Grid & Radar Telemetry</span>
                </div>
                <div className="card-subtitle">
                  100% offline vector projection. Computes distance and bearing to rural emergency shelters and relief camps.
                </div>
              </div>
              <span className={`badge ${location.isStale ? 'badge-amber' : 'badge-green'}`}>
                {location.isStale ? 'STALE FIX' : 'FRESH FIX'} ({location.source.toUpperCase()})
              </span>
            </div>

            {/* Offline Vector Map Component */}
            <OfflineMap
              baseLat={19.076}
              baseLon={72.8777}
              currentCoords={{ latitude: location.latitude, longitude: location.longitude }}
              onSelectCoords={handleMapCoordSelect}
            />

            {/* Location Coordinates Card */}
            <div
              style={{
                marginTop: '1.25rem',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-tactical)',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Registered Geolocation Telemetry</span>
                <span className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {location.updatedAt}
                </span>
              </div>

              <div className="grid-3" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                <div>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Latitude</span>
                  <div className="font-mono" style={{ fontWeight: 700 }}>{location.latitude}° N</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Longitude</span>
                  <div className="font-mono" style={{ fontWeight: 700 }}>{location.longitude}° E</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Estimated Accuracy</span>
                  <div className="font-mono" style={{ fontWeight: 700 }}>±{location.accuracyMeters} meters</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={requestLocation} className="btn-tactical btn-tactical-primary" style={{ flex: 1 }}>
                  <RefreshCw size={14} /> Request Browser Geolocation API
                </button>
              </div>

              {locationError && (
                <div
                  style={{
                    marginTop: '0.75rem',
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    padding: '0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    color: '#fca5a5',
                    fontSize: '0.8rem',
                  }}
                >
                  <AlertTriangle size={14} style={{ display: 'inline', marginRight: '0.35rem', verticalAlign: '-2px' }} />
                  {locationError}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: EMERGENCY SOS OPERATIONS CENTER                                    */}
        {/* ========================================================================= */}
        {activeTab === 'sos' && (
          <section className="tactical-card" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
            <div className="tactical-card-accent-crimson" />
            <div className="card-header-flex">
              <div>
                <div className="card-title" style={{ color: '#f87171' }}>
                  <AlertTriangle size={20} />
                  <span>High-Priority Emergency SOS Broadcast</span>
                </div>
                <div className="card-subtitle">
                  Preempts all routine mesh traffic. Activates buzzer beacons across all reachable nodes and alerts rescue teams.
                </div>
              </div>
              <span className="badge badge-crimson">RF QUEUE PREEMPTION</span>
            </div>

            {/* Language Selector for Presets */}
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Emergency Language:</span>
              <button
                type="button"
                onClick={() => setSelectedLanguage('en')}
                className={`badge ${selectedLanguage === 'en' ? 'badge-cyan' : 'badge-neutral'}`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setSelectedLanguage('mr')}
                className={`badge ${selectedLanguage === 'mr' ? 'badge-cyan' : 'badge-neutral'}`}
              >
                मराठी (Marathi)
              </button>
              <button
                type="button"
                onClick={() => setSelectedLanguage('hi')}
                className={`badge ${selectedLanguage === 'hi' ? 'badge-cyan' : 'badge-neutral'}`}
              >
                हिन्दी (Hindi)
              </button>
            </div>

            {/* Multilingual Emergency Preset Buttons */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.45rem' }}>
                One-Tap Disaster Presets:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {EMERGENCY_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    style={{
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      textAlign: 'left',
                      fontSize: '0.85rem',
                      color: 'var(--text-bright)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>{preset.icon}</span>
                    <span>{preset[selectedLanguage]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Editable Description */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>
                Distress Description:
              </label>
              <textarea
                rows={3}
                value={sosMessage}
                onChange={(e) => setSosMessage(e.target.value)}
                className="tactical-input"
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ marginBottom: '1.25rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Attached Coordinates:{' '}
              <strong className="font-mono" style={{ color: 'var(--accent-cyan)' }}>
                {location.latitude}° N, {location.longitude}° E (±{location.accuracyMeters}m)
              </strong>
            </div>

            {/* 3-Second Press-and-Hold Safety Action */}
            <div className="hold-to-confirm-wrapper" style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                onMouseDown={startHoldingSos}
                onMouseUp={cancelHoldingSos}
                onMouseLeave={cancelHoldingSos}
                onTouchStart={startHoldingSos}
                onTouchEnd={cancelHoldingSos}
                className="btn-tactical btn-tactical-danger"
                style={{ width: '100%', padding: '1rem', fontSize: '0.95rem' }}
              >
                <AlertTriangle size={20} />
                <span>
                  {isHolding
                    ? `HOLD TO BROADCAST SOS (${Math.round((100 - holdProgress) / 33)}s)...`
                    : 'HOLD 2 SECONDS TO BROADCAST SOS DISTRESS'}
                </span>
              </button>
              {isHolding && (
                <div
                  className="hold-progress-fill"
                  style={{ width: `${holdProgress}%` }}
                />
              )}
            </div>

            {sosSent && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.18)',
                  border: '1px solid rgba(239, 68, 68, 0.45)',
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  color: '#fca5a5',
                  fontSize: '0.88rem',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <CheckCircle2 size={16} /> EMERGENCY SOS BEACON DISPATCHED TO MESH
                </div>
                Coordinates broadcasted over RF Channel 15. Local acoustic siren triggered. Connected nodes are sounding alarm buzzers.
              </div>
            )}

            {/* Physical Enclosure Tactile Button Note */}
            <div
              style={{
                borderTop: '1px solid var(--border-tactical)',
                marginTop: '1.5rem',
                paddingTop: '1rem',
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              <strong>Physical Tactile Emergency Button:</strong> In addition to this screen, pressing the hardware push button on GPIO 0 (BOOT) of the ESP32 enclosure automatically broadcasts a high-priority distress alert with acoustic buzzer beacon, even without a connected smartphone.
            </div>
          </section>
        )}
      </main>

      {/* 5. ADMIN NODE CONFIGURATION MODAL */}
      {isAdminOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="card-title" style={{ marginBottom: '1rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Lock size={18} color="var(--accent-cyan)" /> Firmware Node Administration
              </span>
              <button
                onClick={() => {
                  setIsAdminOpen(false);
                  setIsAdminAuthenticated(false);
                  setAdminPassword('');
                }}
                className="btn-tactical btn-tactical-ghost"
                style={{ fontSize: '1.25rem', padding: '0.2rem 0.5rem' }}
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
                  className="tactical-input"
                  style={{ marginBottom: '0.75rem' }}
                  autoFocus
                />
                {adminError && (
                  <div style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                    {adminError}
                  </div>
                )}
                <button type="submit" className="btn-tactical btn-tactical-primary" style={{ width: '100%' }}>
                  Authenticate Session
                </button>
              </form>
            ) : (
              <form onSubmit={handleSaveConfig}>
                <p style={{ fontSize: '0.82rem', color: '#34d399', marginBottom: '1rem' }}>
                  ✓ Authenticated as Administrator. Modify runtime parameters:
                </p>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                    Node Display Name
                  </label>
                  <input
                    type="text"
                    value={nodeConfig.nodeName}
                    onChange={(e) => setNodeConfig({ ...nodeConfig, nodeName: e.target.value })}
                    className="tactical-input"
                  />
                </div>

                <div className="grid-2" style={{ marginBottom: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                      Radio Channel (865 MHz)
                    </label>
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
                      className="tactical-select"
                    >
                      <option value={15}>Channel 15 (865.125 MHz)</option>
                      <option value={16}>Channel 16 (866.125 MHz)</option>
                      <option value={17}>Channel 17 (867.125 MHz)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                      RF TX Power (dBm)
                    </label>
                    <select
                      value={nodeConfig.txPowerDbm}
                      onChange={(e) => setNodeConfig({ ...nodeConfig, txPowerDbm: parseInt(e.target.value) })}
                      className="tactical-select"
                    >
                      <option value={14}>14 dBm (25 mW)</option>
                      <option value={17}>17 dBm (50 mW)</option>
                      <option value={20}>20 dBm (100 mW)</option>
                      <option value={22}>22 dBm (160 mW - Legal Max)</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                    Wi-Fi SoftAP SSID
                  </label>
                  <input
                    type="text"
                    value={nodeConfig.wifiSsid}
                    onChange={(e) => setNodeConfig({ ...nodeConfig, wifiSsid: e.target.value })}
                    className="tactical-input"
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="submit" className="btn-tactical btn-tactical-primary" style={{ flex: 1 }}>
                    Apply Live Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAdminOpen(false)}
                    className="btn-tactical btn-tactical-secondary"
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
