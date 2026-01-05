export const config = {
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || '',
  workerUrl: process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:8787',
  allowedOrigins: process.env.NEXT_PUBLIC_ALLOWED_ORIGINS || '', // Comma-separated
  isProduction: process.env.NODE_ENV === 'production'
};
