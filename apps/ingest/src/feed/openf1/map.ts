import type { Openf1CarData, Openf1Location } from "./types.js";

/**
 * Map an OpenF1 car_data record to the same {Channels} shape F1's own
 * CarData.z carries, so transform.ts's carData() reads it unchanged.
 * Channel keys: 0=rpm, 2=speed, 3=gear, 4=throttle, 5=brake, 45=drs.
 */
export function carDataChannels(r: Openf1CarData): { Channels: Record<string, number> } {
  return {
    Channels: {
      "0": r.rpm,
      "2": r.speed,
      "3": r.n_gear,
      "4": r.throttle,
      "5": r.brake,
      "45": r.drs,
    },
  };
}

/**
 * Map an OpenF1 location record to the same {X,Y,Z,Status} shape F1's own
 * Position.z carries. OpenF1 has no status field; "OnTrack" matches
 * transform.ts's trackPosition() fallback for a missing Status.
 */
export function positionEntry(r: Openf1Location): { X: number; Y: number; Z: number; Status: string } {
  return { X: r.x, Y: r.y, Z: r.z, Status: "OnTrack" };
}
