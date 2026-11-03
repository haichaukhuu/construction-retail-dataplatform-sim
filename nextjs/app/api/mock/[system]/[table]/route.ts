// GET /api/mock/{erp|wms|tms}/{table}?updated_since=ISO&limit=1000&<column>=<value>
import { NextResponse } from 'next/server';
import { queryTable, TABLES, System } from '@/lib/sources';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ system: string; table: string }> }) {
  const { system, table } = await ctx.params;
  const key = process.env.MOCK_API_KEY;                       // optional; keep it out of the submission
  if (key && req.headers.get('x-api-key') !== key) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(system in TABLES)) return NextResponse.json({ error: 'unknown system' }, { status: 404 });
  try {
    return NextResponse.json(queryTable(system as System, table, new URL(req.url).searchParams));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
// No POST/PUT/DELETE exports: Next returns 405, so source systems stay read-only.
