/* ================================================================
   WINSTON LOGGER MIDDLEWARE
   Centralized logging for the ACI backend
================================================================ */

'use strict';

const { createLogger, format, transports } = require('winston');
const path = require('path');

const { combine, timestamp, printf, colorize, errors, json } = format;

/* ================================================================
   CUSTOM LOG FORMAT
================================================================ */

// Human-readable format for development
const devFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`;
  if (stack) log += `\n${stack}`;
  if (Object.keys(meta).length > 0) {
    log += `\n${JSON.stringify(meta, null, 2)}`;
  }
  return log;
});

// Production format (JSON for log aggregators)
const prodFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  json()
);

/* ================================================================
   LOGGER INSTANCE
================================================================ */
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production'
    ? prodFormat
    : combine(
        colorize({ all: true }),
        timestamp({ format: 'HH:mm:ss' }),
        errors({ stack: true }),
        devFormat
      ),
  transports: [
    new transports.Console(),
  ],
  exitOnError: false,
});

// Add file transport if configured
if (process.env.LOG_TO_FILE === 'true') {
  logger.add(new transports.File({
    filename: path.join(__dirname, '../../logs/error.log'),
    level: 'error',
    maxsize: 5 * 1024 * 1024,  // 5MB
    maxFiles: 5,
  }));
  logger.add(new transports.File({
    filename: path.join(__dirname, '../../logs/combined.log'),
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
  }));
}

module.exports = logger;
