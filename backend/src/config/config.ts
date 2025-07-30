import { z } from 'zod';

// Environment variables schema
const configSchema = z.object({
  // Server configuration
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database configuration
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/transcript_db'),
  
  // API configuration
  API_NINJAS_KEY: z.string().min(1, 'API key is required'),
  API_NINJAS_BASE_URL: z.string().default('https://api.api-ninjas.com/v1'),
  
  // CORS configuration
  FRONTEND_URL: z.string().default('http://localhost:3002'),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE_PATH: z.string().default('./logs/app.log'),
  
  // Redis (optional)
  REDIS_URL: z.string().optional(),
});

// Use the real API key directly for now
const API_KEY = '+t69rRk12riBxRuAks5IXg==DHao67VBXP6iMzXA';

// Parse and validate environment variables
const env = configSchema.parse({
  ...process.env,
  API_NINJAS_KEY: API_KEY,
});

export const config = {
  // Server
  port: parseInt(env.PORT, 10),
  nodeEnv: env.NODE_ENV,
  
  // Database
  databaseUrl: env.DATABASE_URL,
  
  // API
  apiNinjas: {
    key: env.API_NINJAS_KEY,
    baseUrl: env.API_NINJAS_BASE_URL,
    isDemo: env.API_NINJAS_KEY === 'demo_key_for_development',
  },
  
  // CORS
  frontendUrl: env.FRONTEND_URL,
  
  // Rate limiting
  rateLimitWindowMs: parseInt(env.RATE_LIMIT_WINDOW_MS, 10),
  rateLimitMaxRequests: parseInt(env.RATE_LIMIT_MAX_REQUESTS, 10),
  
  // Logging
  logLevel: env.LOG_LEVEL,
  logFilePath: env.LOG_FILE_PATH,
  
  // Redis
  redisUrl: env.REDIS_URL,
  
  // Quarter calculation settings
  quarters: {
    lookbackQuarters: 4,
    defaultQuarterLength: 3, // months
  },
  
  // API limits
  api: {
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 30000,
    maxConcurrentRequests: 5,
  },
  
  // Search settings
  search: {
    maxResultsPerPage: 50,
    defaultResultsPerPage: 20,
    maxQueryLength: 1000,
    highlightWordLimit: 200,
  },
} as const;

export type Config = typeof config; 