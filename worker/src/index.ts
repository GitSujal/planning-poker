import { applyAction, createInitialSession, generateSessionId, sanitizeSession } from "./logic";
import { SessionState, SessionResponse } from "./types";

export interface Env {
    GAME_ROOM: DurableObjectNamespace;
    ALLOWED_ORIGINS?: string; // Comma-separated list of allowed origins
    RATE_LIMIT_CREATE?: string; // Number of sessions per IP per minute
}

// Rate limiting storage (simple in-memory for now)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, limit: number = 5): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || entry.resetAt < now) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 }); // 1 minute window
        return true;
    }

    if (entry.count >= limit) {
        return false;
    }

    entry.count++;
    return true;
}

function getClientIP(request: Request): string {
    return request.headers.get('CF-Connecting-IP')
        || request.headers.get('X-Forwarded-For')?.split(',')[0]
        || 'unknown';
}

function handleCors(request: Request, env: Env) {
    const origin = request.headers.get('Origin');
    const allowedOrigins = env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [];
    
    // In development or if no origin (not a browser), or if origin is allowed
    const isAllowed = !origin || 
                      allowedOrigins.length === 0 || 
                      allowedOrigins.includes(origin) ||
                      (origin.startsWith('http://localhost') && !env.ALLOWED_ORIGINS);

    if (isAllowed && origin) {
        return {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        };
    }
    return {};
}

export default {
    async fetch(request: Request, env: Env) {
        const url = new URL(request.url);
        const corsHeaders = handleCors(request, env);

        // Handle CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: corsHeaders
            });
        }

        // Create new session endpoint
        if (url.pathname === "/create" && request.method === "POST") {
            // Rate limiting
            const clientIP = getClientIP(request);
            const rateLimit = parseInt(env.RATE_LIMIT_CREATE || '5');

            if (!checkRateLimit(clientIP, rateLimit)) {
                return new Response('Rate limit exceeded. Please try again later.', { 
                    status: 429,
                    headers: corsHeaders
                });
            }

            try {
                const body = await request.json() as { hostName: string; sessionMode: 'open' | 'closed' };

                // Validate input
                if (!body.hostName || typeof body.hostName !== 'string') {
                    return new Response('Invalid host name', { 
                        status: 400,
                        headers: corsHeaders
                    });
                }

                if (body.sessionMode !== 'open' && body.sessionMode !== 'closed') {
                    return new Response('Invalid session mode', { 
                        status: 400,
                        headers: corsHeaders
                    });
                }

                const sessionId = generateSessionId();
                const id = env.GAME_ROOM.idFromName(sessionId);
                const room = env.GAME_ROOM.get(id);

                // Initialize the room via HTTP
                const initResponse = await room.fetch(new Request("https://dummy/init", {
                    method: "POST",
                    body: JSON.stringify({ ...body, sessionId })
                }));

                // Clone the response to add CORS headers
                const response = new Response(initResponse.body, initResponse);
                Object.entries(corsHeaders).forEach(([k, v]) => response.headers.set(k, v));
                return response;
            } catch (error: any) {
                console.error('[Worker] Create session error:', error);
                return new Response(error.message || 'Failed to create session', { 
                    status: 500,
                    headers: corsHeaders
                });
            }
        }

        // WebSocket connection endpoint
        const roomName = url.searchParams.get("room");
        if (!roomName) {
            return new Response("Room ID required", { 
                status: 400,
                headers: corsHeaders
            });
        }

        // Validate session ID format (basic check)
        if (!/^[a-f0-9-]{8,}$/.test(roomName)) {
            return new Response("Invalid room ID format", { 
                status: 400,
                headers: corsHeaders
            });
        }

        const id = env.GAME_ROOM.idFromName(roomName);
        const room = env.GAME_ROOM.get(id);
        const response = await room.fetch(request);

        // Add CORS headers to non-WebSocket responses
        if (response.status !== 101) {
            const corsRes = new Response(response.body, response);
            Object.entries(corsHeaders).forEach(([k, v]) => corsRes.headers.set(k, v));
            return corsRes;
        }

        return response;
    }
};

export class GameRoom {
    private sessionInactivityTimeout = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
    private hibernationTimeout = 60 * 60 * 1000; // 1 hour in ms
    private sessionsMap = new Map<WebSocket, string>();

    constructor(private state: DurableObjectState, private env: Env) { }

    async fetch(request: Request) {
        try {
            const url = new URL(request.url);

            // Session initialization
            if (url.pathname === "/init" && request.method === "POST") {
                const body = await request.json() as { hostName: string; sessionMode: 'open' | 'closed'; sessionId: string };

                const existing = await this.state.storage.get<SessionState>("session");
                if (existing) {
                    return Response.json({
                        session: existing,
                        hostToken: existing.host.hostToken
                    });
                }

                const session = createInitialSession(body.sessionId, body.hostName, body.sessionMode);
                await this.state.storage.put("session", session);

                // Set cleanup alarm for session inactivity
                await this.state.storage.setAlarm(Date.now() + this.hibernationTimeout);

                return Response.json({ session, hostToken: session.host.hostToken });
            }

            // GET session state (for debugging/polling if needed)
            if (request.method === "GET" && url.pathname === "/state") {
                const session = await this.state.storage.get<SessionState>("session");
                if (!session) return new Response("Session not found", { status: 404 });
                return Response.json(session);
            }

            // WebSocket upgrade
            if (request.headers.get("Upgrade") !== "websocket") {
                return new Response("Upgrade Required", { status: 426 });
            }

            // Origin validation for WebSocket connections
            const origin = request.headers.get('Origin');
            const allowedOrigins = this.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [];

            // In development, allow localhost
            const isDev = !this.env.ALLOWED_ORIGINS || allowedOrigins.length === 0;

            if (!isDev && origin && !allowedOrigins.includes(origin)) {
                console.warn('[GameRoom] Blocked WebSocket from unauthorized origin:', origin);
                return new Response('Forbidden', { status: 403 });
            }

            const pair = new WebSocketPair();
            const client = pair[0];
            const server = pair[1];

            try {
                this.state.acceptWebSocket(server);
            } catch (err: any) {
                console.error(`[GameRoom] Failed to accept WebSocket: ${err.message}`);
                return new Response("WebSocket Accept Failed", { status: 500 });
            }

            // Send current session state immediately upon connection
            const session = await this.state.storage.get<SessionState>("session");
            if (session) {
                // Since we just connected, we don't have a name yet
                server.send(JSON.stringify(sanitizeSession(session)));
            }

            // Reset inactivity timer since we have an active connection
            await this.state.storage.setAlarm(Date.now() + this.hibernationTimeout);

            return new Response(null, { status: 101, webSocket: client });

        } catch (e: any) {
            console.error('[GameRoom] Error in fetch:', e);
            return new Response(e.message || "Internal Error", { status: 500 });
        }
    }

    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
        if (typeof message !== "string") return;

        // Reset inactivity timer on any message
        await this.state.storage.setAlarm(Date.now() + this.hibernationTimeout);

        try {
            const action = JSON.parse(message);

            // Ignore ping messages
            if (action.type === 'PING') {
                ws.send(JSON.stringify({ type: 'PONG' }));
                return;
            }

            let session = await this.state.storage.get<SessionState>("session");
            if (!session) {
                ws.send(JSON.stringify({ error: "Session not found" }));
                ws.close(1000, "Session not found");
                return;
            }

            const nextState = applyAction(session, action);
            await this.state.storage.put("session", nextState);

            // Associate name with WebSocket for secure state sanitization
            if (action.type === 'join' && action.name) {
                this.sessionsMap.set(ws, action.name);
            }

            // Broadcast to all connected clients
            this.broadcast(nextState);

        } catch (e: any) {
            console.error('[GameRoom] Error in message:', e);
            ws.send(JSON.stringify({ error: 'Invalid action' }));
        }
    }

    async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
        console.log('[GameRoom] WebSocket closed:', { code, reason, wasClean });
        this.sessionsMap.delete(ws);

        // If no more connections, set shorter cleanup alarm
        const connections = this.state.getWebSockets();
        if (connections.length === 0) {
            await this.state.storage.setAlarm(Date.now() + this.hibernationTimeout);
        }
    }

    async webSocketError(ws: WebSocket, error: any) {
        console.error('[GameRoom] WebSocket error:', error);
        // Don't close - let the client reconnect
    }

    async alarm() {
        const session = await this.state.storage.get<SessionState>("session");

        if (!session) {
            console.log('[GameRoom] Alarm fired but no session - cleaning up');
            await this.terminateSession("Session expired");
            return;
        }

        const connections = this.state.getWebSockets();
        const now = Date.now();
        const lastUpdate = session.updatedAt * 1000; // Convert to ms
        const timeSinceUpdate = now - lastUpdate;

        // If no connections and session inactive for 7 days, delete it
        if (connections.length === 0 && timeSinceUpdate > this.sessionInactivityTimeout) {
            console.log('[GameRoom] Session inactive for 7 days, deleting:', session.sessionId);
            await this.terminateSession("Session expired due to inactivity");
            return;
        }

        // If session is ended, clean up after 1 hour
        if (session.status === 'ended' && timeSinceUpdate > this.hibernationTimeout) {
            console.log('[GameRoom] Ended session cleanup:', session.sessionId);
            await this.terminateSession("Session ended");
            return;
        }

        // Otherwise, set another alarm for later
        if (connections.length > 0) {
            await this.state.storage.setAlarm(now + this.hibernationTimeout);
        } else {
            // No connections - check again in 1 hour
            await this.state.storage.setAlarm(now + this.hibernationTimeout);
        }
    }

    private async terminateSession(reason: string) {
        const sockets = this.state.getWebSockets();
        sockets.forEach(ws => {
            try {
                ws.close(1000, reason);
            } catch (e) {
                console.error('[GameRoom] Error closing WebSocket:', e);
            }
        });
        await this.state.storage.deleteAll();
        console.log('[GameRoom] Session terminated:', reason);
    }

    private broadcast(session: SessionState) {
        this.state.getWebSockets().forEach(ws => {
            try {
                const userName = this.sessionsMap.get(ws);
                const sanitized = sanitizeSession(session, userName);
                ws.send(JSON.stringify(sanitized));
            } catch (e) {
                console.error('[GameRoom] Error broadcasting to client:', e);
            }
        });
    }
}
