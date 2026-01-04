import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { config } from './config';
import { SessionState } from './types';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// File-based fallback for development (works across Next.js API route processes)
const DEV_SESSIONS_DIR = join(process.cwd(), '.tmp-sessions');

function getClient() {
  if (!config.r2.bucket || !config.r2.accountId || !config.r2.accessKeyId || !config.r2.secretAccessKey) {
    console.log('R2 not configured, using file-based fallback for development');
    // Ensure temp directory exists
    if (!existsSync(DEV_SESSIONS_DIR)) {
      mkdirSync(DEV_SESSIONS_DIR, { recursive: true });
    }
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

let client: S3Client | null = null;
try {
  client = getClient();
} catch (e) {
  console.error('Failed to initialize R2 client:', e);
}

const sessionKey = (sessionId: string) => `sessions/${sessionId}.json`;
const sessionFilePath = (sessionId: string) => join(DEV_SESSIONS_DIR, `${sessionId}.json`);

export async function getSession(sessionId: string): Promise<SessionState | null> {
  if (!client) {
    // File-based fallback
    try {
      const filePath = sessionFilePath(sessionId);
      if (existsSync(filePath)) {
        const data = readFileSync(filePath, 'utf-8');
        return JSON.parse(data) as SessionState;
      }
      return null;
    } catch (err) {
      console.error(`Error reading session ${sessionId}:`, err);
      return null;
    }
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
    // File-based fallback
    try {
      const filePath = sessionFilePath(sessionId);
      writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
    } catch (err) {
      console.error(`Error writing session ${sessionId}:`, err);
    }
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
    // File-based fallback
    try {
      const filePath = sessionFilePath(session.sessionId);
      writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
      console.log(`Created session ${session.sessionId} in file: ${filePath}`);
    } catch (err) {
      console.error(`Error creating session ${session.sessionId}:`, err);
    }
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
    // File-based fallback
    return existsSync(sessionFilePath(sessionId));
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
