import { NextResponse } from 'next/server';
import { applyAction } from '@/lib/session';
import { getSession, putSession } from '@/lib/r2';
import { Action } from '@/lib/types';

const hostActions: Action['type'][] = [
  'add_task',
  'select_task',
  'start_voting',
  'close_voting',
  'reveal',
  'add_time',
  'clear_votes',
  'set_final_estimate',
  'set_role',
  'kick',
  'transfer_host',
  'end_session',
  'approve_join',
  'reject_join'
];

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession(params.id);
  if (!session) return NextResponse.json({ error: 'Missing session' }, { status: 404 });
  const action = (await request.json()) as Action;

  if (hostActions.includes(action.type) && action.hostToken !== session.host.hostToken) {
    return NextResponse.json('Host token required', { status: 403 });
  }

  const updated = applyAction(session, action);
  await putSession(params.id, updated);
  const response: any = { session: updated };
  if (action.type === 'transfer_host') {
    response.hostToken = updated.host.hostToken;
  }
  return NextResponse.json(response);
}
