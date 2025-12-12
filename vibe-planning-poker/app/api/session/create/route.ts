import { NextResponse } from 'next/server';
import { createInitialSession } from '@/lib/session';
import { createSessionObject } from '@/lib/r2';
import { config } from '@/lib/config';

function randomId() {
  return Math.random().toString(36).substring(2, 8);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { hostName, sessionMode } = body;
  if (!hostName) return NextResponse.json({ error: 'Host name required' }, { status: 400 });

  const sessionId = randomId();
  const session = createInitialSession(sessionId, hostName, sessionMode === 'closed' ? 'closed' : 'open');
  await createSessionObject(session);
  const joinUrl = `${config.baseUrl || ''}/session/${sessionId}`;
  return NextResponse.json({ sessionId, hostToken: session.host.hostToken, joinUrl });
}
