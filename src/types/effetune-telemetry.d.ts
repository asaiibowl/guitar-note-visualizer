// The telemetry decoder ships in @effetune/dsp but is not in its package exports;
// vite.config.ts aliases 'effetune-telemetry' to node_modules/@effetune/dsp/dist/telemetry.js.
declare module 'effetune-telemetry' {
  import type { TelemetryFrame } from '@effetune/dsp';

  export interface TelemetryNode {
    effectId: string;
    effectType: string;
    tapId: number;
  }

  export function decodeTelemetryPacket(
    packet: Uint8Array,
    bytes: number,
    nodesByTap: Map<number, TelemetryNode>,
    initialDropped?: number,
  ): { frames: TelemetryFrame[]; pendingDropped: number };
}
