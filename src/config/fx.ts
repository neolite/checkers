export const FX_TUNING = {
  audio: {
    masterGain: 0.55,
    echoDelay: 0.18,
    echoFeedback: 0.26,
    echoLowpassHz: 2200,
    echoGain: 0.22,
    minSpatialGain: 0.16,
    distanceFalloff: 36,
    panDivisor: 42,
  },
  fog: {
    unexploredAlpha: 255,
    exploredAlpha: 135,
    overlayY: 0.05,
  },
  render: {
    clearColor: '#05070b',
    terrainRoughnessSeed: 1337,
    gridOpacity: 0.25,
  },
} as const;
