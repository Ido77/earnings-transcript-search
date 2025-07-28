import winston from 'winston';
import { config } from './config';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

// Create transports
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
    format: config.nodeEnv === 'production' ? logFormat : consoleFormat,
  }),
];

// File transport for production
if (config.nodeEnv === 'production') {
  transports.push(
    new winston.transports.File({
      filename: config.logFilePath,
      level: config.logLevel,
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: config.logLevel,
  format: logFormat,
  defaultMeta: {
    service: 'transcript-search-api',
    environment: config.nodeEnv,
  },
  transports,
  exitOnError: false,
});

// Add request ID support
export const addRequestId = (requestId: string): winston.Logger => {
  return logger.child({ requestId });
};

// Log application startup
logger.info('Logger initialized', {
  level: config.logLevel,
  nodeEnv: config.nodeEnv,
  transports: transports.map(t => t.constructor.name),
}); 