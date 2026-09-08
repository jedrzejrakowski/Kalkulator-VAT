import type { Powertrain } from './types';

/**
 * Limity wartości samochodu osobowego obowiązujące od 1 stycznia 2026 r.
 * (art. 23 ust. 1 pkt 4 ustawy o PIT, art. 16 ust. 1 pkt 4 ustawy o CIT).
 */
export const VEHICLE_LIMITS: Record<Powertrain, number> = {
  emissionHigh: 100_000,
  emissionLow: 150_000,
  zeroEmission: 225_000,
};

/** Limit stosowany do składek na dobrowolne ubezpieczenia majątkowe (AC, GAP). */
export const DEFAULT_AC_LIMIT = 150_000;

export const POWERTRAIN_LABELS: Record<Powertrain, string> = {
  emissionHigh: 'Spalinowy — emisja CO₂ od 50 g/km',
  emissionLow: 'Niskoemisyjny — emisja CO₂ poniżej 50 g/km',
  zeroEmission: 'Elektryczny lub wodorowy',
};

export function statutoryLimit(powertrain: Powertrain): number {
  return VEHICLE_LIMITS[powertrain];
}

/** Proporcja, w jakiej limit pozostaje do wartości pojazdu; nigdy powyżej 1. */
export function limitRatio(limit: number, vehicleValue: number): number {
  if (vehicleValue <= 0) return 1;
  return Math.min(1, limit / vehicleValue);
}
