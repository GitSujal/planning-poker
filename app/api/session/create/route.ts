import { NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function POST(request: Request) {
  const body = await request.json();
  const { hostName } = body;
  if (!hostName) return NextResponse.json({ error: 'Host name required' }, { status: 400 });

  try {
    const workerRes = await fetch(`${config.workerUrl}/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!workerRes.ok) throw new Error("Worker failed to create session");
    const data = await workerRes.json();

    // Worker returns { session: { sessionId: '...' }, hostToken: '...' }
    // We need to ensure sessionId is at the top level for the frontend
    const sessionId = data.session?.sessionId;

    if (!sessionId) {
      throw new Error("Invalid response from worker: missing sessionId");
    }

    const joinUrl = `${config.baseUrl || ''}/session/${sessionId}`;
    return NextResponse.json({ ...data, sessionId, joinUrl });
  } catch (e: any) {
    console.error("Failed to create session:", e);
    return NextResponse.json({ error: e.message || "Failed to create session" }, { status: 500 });
  }
}
