// DelIQ-side receiver for carrier webhooks (sent by `npm run sim` when DELIQ_WEBHOOK_URL is set).
// Replace the body with: normalise -> store event -> run detection for the order.
import { NextResponse } from 'next/server';
export async function POST(req: Request) {
  const evt = await req.json(); // { carrierId, trackingId, event, ts, location, note }
  console.log('carrier event', evt.trackingId, evt.event);
  return NextResponse.json({ ok: true });
}
