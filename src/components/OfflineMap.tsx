/**
 * LoRaResQ Offline Interactive Tactical Map
 * Pure client-side SVG/Canvas vector map that functions 100% offline
 * without internet access, external tile servers, or CA certificates.
 * Allows one-tap pin drop, landmark selection, and coordinate calculation.
 */

'use client';

import React, { useState, useRef } from 'react';
import { MapPin, Navigation, Compass, Layers } from 'lucide-react';

export interface MapCoordinates {
  latitude: number;
  longitude: number;
  source: 'gps' | 'manual' | 'landmark';
  landmarkName?: string;
  distanceMeters?: number;
}

interface OfflineMapProps {
  baseLat?: number;
  baseLon?: number;
  currentCoords?: { latitude: number | null; longitude: number | null };
  onSelectCoords: (coords: MapCoordinates) => void;
}

// Preset rural landmarks relative to base node (Maharashtra/Konkan flood zone prototype coordinates)
const RURAL_LANDMARKS = [
  { id: 'camp', name: 'Relief Camp Alpha (Base Node)', offsetLat: 0.0, offsetLon: 0.0, icon: '⛺' },
  { id: 'phc', name: 'Primary Health Center', offsetLat: 0.0052, offsetLon: 0.0031, icon: '🏥' },
  { id: 'bridge', name: 'River Bridge Checkpoint', offsetLat: -0.0075, offsetLon: 0.0045, icon: '🌉' },
  { id: 'school', name: 'Zilla Parishad School Shelter', offsetLat: 0.0035, offsetLon: -0.0062, icon: '🏫' },
  { id: 'panchayat', name: 'Gram Panchayat Office', offsetLat: -0.0028, offsetLon: -0.0038, icon: '🏛️' },
  { id: 'ridge', name: 'East Hill Ridge Sanctuary', offsetLat: 0.0091, offsetLon: 0.0084, icon: '⛰️' },
];

export default function OfflineMap({
  baseLat = 19.076,
  baseLon = 72.8777,
  currentCoords,
  onSelectCoords,
}: OfflineMapProps) {
  const [selectedLandmark, setSelectedLandmark] = useState<string>('camp');
  const [pinPos, setPinPos] = useState<{ x: number; y: number } | null>({ x: 200, y: 200 }); // Center by default

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Map viewport dimensions
  const width = 400;
  const height = 400;
  const centerX = width / 2;
  const centerY = height / 2;

  // Scale: 100 pixels = ~1.0 km (~0.009 degrees lat/lon)
  const degPerPixel = 0.00009;

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setPinPos({ x, y });
    setSelectedLandmark('custom');

    // Calculate derived latitude and longitude
    const deltaX = x - centerX;
    const deltaY = centerY - y; // inverted y

    const calculatedLon = parseFloat((baseLon + deltaX * degPerPixel).toFixed(6));
    const calculatedLat = parseFloat((baseLat + deltaY * degPerPixel).toFixed(6));

    const distanceM = Math.round(Math.sqrt(deltaX * deltaX + deltaY * deltaY) * 10);

    onSelectCoords({
      latitude: calculatedLat,
      longitude: calculatedLon,
      source: 'manual',
      distanceMeters: distanceM,
    });
  };

  const handleSelectLandmark = (landmark: typeof RURAL_LANDMARKS[0]) => {
    setSelectedLandmark(landmark.id);
    const pixelX = centerX + landmark.offsetLon / degPerPixel;
    const pixelY = centerY - landmark.offsetLat / degPerPixel;

    setPinPos({ x: pixelX, y: pixelY });

    const calculatedLat = parseFloat((baseLat + landmark.offsetLat).toFixed(6));
    const calculatedLon = parseFloat((baseLon + landmark.offsetLon).toFixed(6));
    const distanceM = Math.round(
      Math.sqrt(Math.pow(pixelX - centerX, 2) + Math.pow(pixelY - centerY, 2)) * 10
    );

    onSelectCoords({
      latitude: calculatedLat,
      longitude: calculatedLon,
      source: 'landmark',
      landmarkName: landmark.name,
      distanceMeters: distanceM,
    });
  };

  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '0.75rem', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Compass size={18} color="#06b6d4" />
          Offline Vector Tactical Grid
        </span>
        <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
          No Internet Required
        </span>
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        Click or tap on the tactical radar grid to drop a location pin, or select a known rural landmark below.
      </p>

      {/* SVG Vector Map Canvas */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '400px', margin: '0 auto', touchAction: 'none' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          onClick={handleSvgClick}
          style={{
            width: '100%',
            height: 'auto',
            background: '#09101d',
            borderRadius: '0.5rem',
            border: '1px solid #1e293b',
            cursor: 'crosshair',
          }}
        >
          {/* Grid lines */}
          <line x1={centerX} y1={0} x2={centerX} y2={height} stroke="#1e293b" strokeWidth={1} strokeDasharray="3 3" />
          <line x1={0} y1={centerY} x2={width} y2={centerY} stroke="#1e293b" strokeWidth={1} strokeDasharray="3 3" />

          {/* Range rings (500m, 1km, 1.5km) */}
          <circle cx={centerX} cy={centerY} r={50} fill="none" stroke="#1e293b" strokeWidth={1} />
          <circle cx={centerX} cy={centerY} r={100} fill="none" stroke="#1e293b" strokeWidth={1} />
          <circle cx={centerX} cy={centerY} r={150} fill="none" stroke="#1e293b" strokeWidth={1} />

          {/* Range labels */}
          <text x={centerX + 55} y={centerY - 5} fill="#475569" fontSize={9}>500m</text>
          <text x={centerX + 105} y={centerY - 5} fill="#475569" fontSize={9}>1.0km</text>
          <text x={centerX + 155} y={centerY - 5} fill="#475569" fontSize={9}>1.5km</text>

          {/* Cardinal Directions */}
          <text x={centerX - 5} y={15} fill="#64748b" fontSize={11} fontWeight="bold">N</text>
          <text x={centerX - 5} y={height - 8} fill="#64748b" fontSize={11} fontWeight="bold">S</text>
          <text x={width - 15} y={centerY + 4} fill="#64748b" fontSize={11} fontWeight="bold">E</text>
          <text x={8} y={centerY + 4} fill="#64748b" fontSize={11} fontWeight="bold">W</text>

          {/* Node Base Center Marker */}
          <circle cx={centerX} cy={centerY} r={6} fill="#06b6d4" />
          <circle cx={centerX} cy={centerY} r={12} fill="none" stroke="#06b6d4" strokeWidth={1.5} opacity={0.6}>
            <animate attributeName="r" values="6;16;6" dur="3s" repeatCount="indefinite" />
          </circle>
          <text x={centerX - 35} y={centerY + 20} fill="#38bdf8" fontSize={9} fontWeight={600}>
            Node Base
          </text>

          {/* Landmark Pins */}
          {RURAL_LANDMARKS.map((lm) => {
            const lx = centerX + lm.offsetLon / degPerPixel;
            const ly = centerY - lm.offsetLat / degPerPixel;
            if (lm.id === 'camp') return null; // already drawn as center
            return (
              <g key={lm.id} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleSelectLandmark(lm); }}>
                <circle cx={lx} cy={ly} r={4} fill="#f59e0b" />
                <text x={lx + 6} y={ly + 3} fill="#cbd5e1" fontSize={8}>
                  {lm.name.split(' ')[0]}
                </text>
              </g>
            );
          })}

          {/* User Dropped Pin */}
          {pinPos && (
            <g transform={`translate(${pinPos.x - 12}, ${pinPos.y - 24})`}>
              <path
                d="M12 0C7.58 0 4 3.58 4 8c0 5.25 8 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8zm0 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"
                fill="#ef4444"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Selected Coordinate Details */}
      <div style={{ marginTop: '0.75rem', background: '#0a0f1d', padding: '0.65rem', borderRadius: '0.4rem', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Selected Pin: </span>
          <strong>{currentCoords?.latitude ?? baseLat}°, {currentCoords?.longitude ?? baseLon}°</strong>
        </div>
        <div style={{ color: '#38bdf8' }}>
          {selectedLandmark !== 'custom' ? `Near ${RURAL_LANDMARKS.find((l) => l.id === selectedLandmark)?.name}` : 'Custom Visual Fix'}
        </div>
      </div>

      {/* Quick Rural Landmark Picker Buttons */}
      <div style={{ marginTop: '0.75rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
          Snap to Sector Landmark:
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {RURAL_LANDMARKS.map((lm) => (
            <button
              key={lm.id}
              type="button"
              onClick={() => handleSelectLandmark(lm)}
              style={{
                fontSize: '0.75rem',
                padding: '0.3rem 0.6rem',
                borderRadius: '0.35rem',
                background: selectedLandmark === lm.id ? '#06b6d4' : '#1e293b',
                color: selectedLandmark === lm.id ? '#0a0f1d' : '#f1f5f9',
                fontWeight: selectedLandmark === lm.id ? 700 : 500,
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              <span>{lm.icon}</span> {lm.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
