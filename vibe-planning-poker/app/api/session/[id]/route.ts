import { NextResponse } from 'next/server';
import { getSession } from '@/lib/r2';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getSession(params.id);
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ session });
}
