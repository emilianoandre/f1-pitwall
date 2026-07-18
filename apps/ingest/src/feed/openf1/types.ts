// Wire shapes for OpenF1's MQTT topics — internal to this adapter, not part of
// our domain model (@f1-dash/types), since they describe OpenF1's schema.

export interface Openf1CarData {
  driver_number: number;
  rpm: number;
  speed: number;
  n_gear: number;
  throttle: number;
  brake: number;
  /** F1's native channel-45 code (10/12/14 = open) — see state/parse.ts drsOpen(). */
  drs: number;
  date: string;
}

export interface Openf1Location {
  driver_number: number;
  x: number;
  y: number;
  z: number;
  date: string;
}
