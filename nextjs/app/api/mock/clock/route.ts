import { NextResponse } from 'next/server';
import { simNow } from '@/lib/sources';
export const dynamic = 'force-dynamic';
export async function GET() { return NextResponse.json({ now: simNow() }); }
