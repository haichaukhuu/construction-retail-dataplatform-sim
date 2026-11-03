import path from 'node:path';

export const DATA_DIR = process.env.SIM_DATA_DIR ?? path.resolve(process.cwd(), 'data');
export const SCHEMA_DIR = path.resolve(__dirname, '..', 'schema');
export const EXPORT_DIR = path.resolve(process.cwd(), 'exports');

/** Business day being simulated (UTC date). Stockholm = UTC+1 in November. */
export const SIM_DAY = process.env.SIM_DAY ?? '2026-11-05';
export const SEED = Number(process.env.SIM_SEED ?? 2026);
export const WEBHOOK_URL = process.env.DELIQ_WEBHOOK_URL ?? '';

export const TODAY_ORDERS = Number(process.env.SIM_ORDERS ?? 180);
export const HIST_DAYS = 3;
export const HIST_ORDERS_PER_DAY = 90;
export const EXCEPTION_RATE = 0.08;
export const STOPS_PER_ROUTE = 10;

export const DC = { id: 'DC-SE-01', code: 'SE01', name: 'Jönköping DC', city: 'Jönköping' };

export const H = 3_600_000;
export const M = 60_000;
export const iso = (ms: number) => new Date(ms).toISOString();
export const dayStart = (day: string, offsetDays = 0) => Date.parse(`${day}T00:00:00.000Z`) + offsetDays * 24 * H;
/** Simulation starts at 04:00Z (05:00 Stockholm): picking is done, loading is about to begin. */
export const T0 = () => dayStart(SIM_DAY) + 4 * H;
export const DAY_END = () => dayStart(SIM_DAY) + 16 * H + 30 * M;
