import { useEffect, useRef, useState, useCallback } from 'react';
import { config } from './config';

interface SocketState {
    isConnected: boolean;
    isConnecting: boolean;
    error: string | null;
}

export function useSocket<T>(
    sessionId: string,
    onMessage?: (data: T) => void
) {
    const [state, setState] = useState<SocketState>({
        isConnected: false,
        isConnecting: true,
        error: null,
    });

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

    const onMessageRef = useRef(onMessage);
    useEffect(() => {
        onMessageRef.current = onMessage;
    }, [onMessage]);

    const connect = useCallback(() => {
        if (!sessionId || sessionId === 'undefined') return;

        const workerUrl = config.workerUrl;
        const isSecure = workerUrl.startsWith('https') || workerUrl.startsWith('wss') || (typeof window !== 'undefined' && window.location.protocol === 'https:');
        const scheme = isSecure ? 'wss' : 'ws';
        const host = workerUrl.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
        const url = `${scheme}://${host}?room=${sessionId}`;

        console.log('Connecting to WebSocket:', url);

        try {
            if (wsRef.current) {
                // Ensure manual close doesn't trigger error storm
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.close();
            }

            const ws = new WebSocket(url);
            wsRef.current = ws;

            setState(prev => ({ ...prev, isConnecting: true, error: null }));

            ws.onopen = () => {
                console.log('WebSocket connected');
                setState({ isConnected: true, isConnecting: false, error: null });
                clearTimeout(reconnectTimeoutRef.current);

                // Ping interval
                const pingInterval = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'PING' }));
                    }
                }, 10000);
                (ws as any).pingInterval = pingInterval;
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (onMessageRef.current) onMessageRef.current(data);
                } catch (e) {
                    // Ignore PONGs or non-json if any
                }
            };

            ws.onclose = (event) => {
                console.log('WebSocket closed:', event.code, event.reason);
                if ((ws as any).pingInterval) clearInterval((ws as any).pingInterval);

                setState(prev => ({ ...prev, isConnected: false, isConnecting: false }));
                wsRef.current = null;

                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = setTimeout(() => {
                    connect();
                }, 3000);
            };

            ws.onerror = (error) => {
                if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) return;
                console.error('WebSocket error:', error);
                setState(prev => prev.error === 'Connection error' ? prev : ({ ...prev, error: 'Connection error' }));
            };

        } catch (e: any) {
            console.error('WebSocket connection failed:', e);
            setState({ isConnected: false, isConnecting: false, error: e.message });
        }
    }, [sessionId]);

    useEffect(() => {
        connect();
        return () => {
            if (wsRef.current) {
                // Clean close on unmount
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.close();
                if ((wsRef.current as any).pingInterval) clearInterval((wsRef.current as any).pingInterval);
            }
            clearTimeout(reconnectTimeoutRef.current);
        };
    }, [connect]);

    const send = useCallback((data: any) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        } else {
            console.warn('Socket not open, cannot send:', data);
        }
    }, []);

    return { ...state, send };
}
