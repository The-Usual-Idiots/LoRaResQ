/**
 * Acoustic & Visual Emergency Alarm Dispatcher
 * Synthesizes an emergency alert tone using the Web Audio API without external audio files.
 */

let audioCtx: AudioContext | null = null;
let sirenOscillator: OscillatorNode | null = null;
let sirenGain: GainNode | null = null;
let sirenInterval: NodeJS.Timeout | null = null;

export function playEmergencyAlarm(): void {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    // Stop existing if running
    stopEmergencyAlarm();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();

    sirenOscillator = osc;
    sirenGain = gain;

    // Two-tone European/Indian emergency siren alternation (800 Hz <-> 1200 Hz)
    let high = false;
    sirenInterval = setInterval(() => {
      if (sirenOscillator && audioCtx) {
        sirenOscillator.frequency.setValueAtTime(high ? 1200 : 800, audioCtx.currentTime);
        high = !high;
      }
    }, 400);

    // Auto-silence after 15 seconds to prevent user fatigue
    setTimeout(() => {
      stopEmergencyAlarm();
    }, 15000);
  } catch (err) {
    console.warn('[Alarm] Audio context blocked or unsupported:', err);
  }
}

export function stopEmergencyAlarm(): void {
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
  if (sirenOscillator) {
    try {
      sirenOscillator.stop();
      sirenOscillator.disconnect();
    } catch {}
    sirenOscillator = null;
  }
  if (sirenGain) {
    try {
      sirenGain.disconnect();
    } catch {}
    sirenGain = null;
  }
}
