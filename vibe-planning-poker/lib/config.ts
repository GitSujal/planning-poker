export const config = {
  r2: {
    bucket: process.env.R2_BUCKET_NAME || '',
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || ''
  },
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || ''
};

export const requiredEnvVars = [
  'R2_BUCKET_NAME',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY'
];

export function validateEnv() {
  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  if (missing.length) {
    console.warn(`Missing env vars: ${missing.join(', ')}`);
  }
}
