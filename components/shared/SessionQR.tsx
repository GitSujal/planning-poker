'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, Check } from 'lucide-react';

interface SessionQRProps {
  sessionId: string;
  compact?: boolean;
}

export function SessionQR({ sessionId, compact = false }: SessionQRProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [joinUrl, setJoinUrl] = useState('');

  useEffect(() => {
    // Set URL on client side only
    setJoinUrl(`${window.location.origin}/session/${sessionId}`);
  }, [sessionId]);

  useEffect(() => {
    if (canvasRef.current && joinUrl) {
      QRCode.toCanvas(
        canvasRef.current,
        joinUrl,
        { width: compact ? 120 : 200, margin: 1 },
        (error) => {
          if (error) console.error('QR error:', error);
        }
      );
    }
  }, [joinUrl, compact]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (compact) {
    return (
      <Card>
        <CardContent className="p-3 flex flex-col items-center gap-2">
          <canvas ref={canvasRef} className="rounded" />
          <Button
            variant="outline"
            size="sm"
            onClick={copyToClipboard}
            className="w-full text-xs"
          >
            {copied ? (
              <>
                <Check className="mr-1 h-3 w-3" /> Copied!
              </>
            ) : (
              <>
                <Copy className="mr-1 h-3 w-3" /> Copy Link
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Join Session</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <canvas ref={canvasRef} className="rounded-lg border border-border" />
        <div className="w-full space-y-2">
          <p className="text-xs text-muted-foreground text-center">
            Scan QR code or copy link:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinUrl}
              readOnly
              className="flex-1 text-xs px-3 py-2 rounded-md border border-input bg-background font-mono truncate"
              onClick={(e) => e.currentTarget.select()}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={copyToClipboard}
              className="shrink-0"
            >
              {copied ? (
                <>
                  <Check className="mr-1 h-4 w-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-4 w-4" /> Copy
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
