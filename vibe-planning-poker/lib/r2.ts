import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { config } from './config';
import { SessionState } from './types';

const inMemoryStore = new Map<string, SessionState>();

function getClient() {
  if (!config.r2.bucket || !config.r2.accountId || !config.r2.accessKeyId || !config.r2.secretAccessKey) {
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2.accessKeyId,
      secretAccessKey: config.r2.secretAccessKey
    }
  });
}

const client = getClient();

const sessionKey = (sessionId: string) => `sessions/${sessionId}.json`;

export async function getSession(sessionId: string): Promise<SessionState | null> {
  if (!client) {
    return inMemoryStore.get(sessionId) ?? null;
  }
  try {
    const res = await client.send(new GetObjectCommand({
      Bucket: config.r2.bucket,
      Key: sessionKey(sessionId)
    }));
    const body = await res.Body?.transformToString();
    return body ? (JSON.parse(body) as SessionState) : null;
  } catch (err) {
    return null;
  }
}

export async function putSession(sessionId: string, session: SessionState) {
  if (!client) {
    inMemoryStore.set(sessionId, session);
    return;
  }
  await client.send(new PutObjectCommand({
    Bucket: config.r2.bucket,
    Key: sessionKey(sessionId),
    Body: JSON.stringify(session),
    ContentType: 'application/json'
  }));
}

export async function createSessionObject(session: SessionState) {
  if (!client) {
    inMemoryStore.set(session.sessionId, session);
    return;
  }
  await client.send(new PutObjectCommand({
    Bucket: config.r2.bucket,
    Key: sessionKey(session.sessionId),
    Body: JSON.stringify(session),
    ContentType: 'application/json'
  }));
}

export async function sessionExists(sessionId: string) {
  if (!client) {
    return inMemoryStore.has(sessionId);
  }
  try {
    await client.send(new HeadObjectCommand({
      Bucket: config.r2.bucket,
      Key: sessionKey(sessionId)
    }));
    return true;
  } catch {
    return false;
  }
}
