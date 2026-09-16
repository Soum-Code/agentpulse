/**
 * Tactile Chalk & Marker Acoustic Simulation Engine
 * Synthesizes realistic chalk scrape and marker friction on slate/whiteboard using Web Audio API.
 */

let audioCtx: AudioContext | null = null;
let chalkNoiseNode: AudioBufferSourceNode | null = null;
let chalkGainNode: GainNode | null = null;
let isAudioMuted = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

// Generate textured white/pink noise buffer for chalk friction
function createChalkNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const bufferSize = sampleRate * 1.5; // 1.5s loop
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);

  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    // Pink noise approximation mixed with textured granular spikes
    const white = Math.random() * 2 - 1;
    const pink = (lastOut * 0.92) + (white * 0.08);
    lastOut = pink;

    // Chalk calcium carbonate micro-granule grit spikes
    const grit = (Math.random() > 0.985 ? (Math.random() - 0.5) * 0.4 : 0);
    data[i] = (pink * 0.7 + grit);
  }
  return buffer;
}

/**
 * Play a continuous chalk/marker dragging stroke sound with variable speed/pressure.
 */
export function startChalkStrokeSound(type: 'chalk' | 'marker' | 'eraser' = 'chalk', pressure = 0.5): void {
  if (isAudioMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (chalkNoiseNode) {
      stopChalkStrokeSound();
    }

    const buffer = createChalkNoiseBuffer(ctx);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Bandpass filter to capture chalkboard resonance (chalk: 1200-2400Hz, marker: 600-1400Hz)
    const filter = ctx.createBiquadFilter();
    if (type === 'marker') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1100 + pressure * 400, ctx.currentTime);
      filter.Q.setValueAtTime(1.2, ctx.currentTime);
    } else if (type === 'eraser') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450 + pressure * 300, ctx.currentTime);
      filter.Q.setValueAtTime(0.8, ctx.currentTime);
    } else {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1600 + pressure * 800, ctx.currentTime);
      filter.Q.setValueAtTime(2.5, ctx.currentTime);
    }

    const gain = ctx.createGain();
    const baseVolume = type === 'marker' ? 0.04 : type === 'eraser' ? 0.07 : 0.05;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(baseVolume * Math.min(1, Math.max(0.2, pressure)), ctx.currentTime + 0.03);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start();
    chalkNoiseNode = source;
    chalkGainNode = gain;
  } catch {
    // Audio context may be blocked by browser policy
  }
}

/**
 * Update stroke acoustic dynamics (speed and pressure modulation)
 */
export function updateChalkStrokeSound(speed: number, pressure: number = 0.5): void {
  if (!chalkGainNode || !audioCtx) return;
  try {
    const clampedSpeed = Math.min(1.5, Math.max(0.1, speed / 30));
    const targetVolume = 0.05 * clampedSpeed * Math.min(1.2, Math.max(0.3, pressure));
    chalkGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    chalkGainNode.gain.setValueAtTime(Math.max(0.001, chalkGainNode.gain.value), audioCtx.currentTime);
    chalkGainNode.gain.linearRampToValueAtTime(targetVolume, audioCtx.currentTime + 0.04);
  } catch {
    // Ignore parameter scheduling errors
  }
}

/**
 * Stop chalk stroke sound cleanly with subtle decay
 */
export function stopChalkStrokeSound(): void {
  if (!chalkGainNode || !audioCtx) return;
  try {
    const ctx = audioCtx;
    chalkGainNode.gain.cancelScheduledValues(ctx.currentTime);
    chalkGainNode.gain.setValueAtTime(chalkGainNode.gain.value, ctx.currentTime);
    chalkGainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);

    const nodeToStop = chalkNoiseNode;
    setTimeout(() => {
      try {
        nodeToStop?.stop();
        nodeToStop?.disconnect();
      } catch {
        // Disconnect silently
      }
    }, 80);

    chalkNoiseNode = null;
    chalkGainNode = null;
  } catch {
    chalkNoiseNode = null;
    chalkGainNode = null;
  }
}

/**
 * Soft chalk tap / punctuation click
 */
export function playChalkTapSound(): void {
  if (isAudioMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  } catch {
    // Silent fail
  }
}

export function setChalkAudioMuted(muted: boolean): void {
  isAudioMuted = muted;
  if (muted) {
    stopChalkStrokeSound();
  }
}

export function getIsChalkAudioMuted(): boolean {
  return isAudioMuted;
}
