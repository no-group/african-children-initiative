/* ================================================================
   SECURITY MIDDLEWARE
   Environment validation, request helpers
================================================================ */

'use strict';

const logger = require('./logger');

/* ================================================================
   ENVIRONMENT VALIDATION
================================================================ */

/**
 * Validate that required environment variables are set
 * Exits the process if any are missing
 * @param {string[]} requiredVars
 */
function validateEnv(requiredVars) {
  const missing = [];

  requiredVars.forEach((varName) => {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  });

  if (missing.length > 0) {
    logger.error('❌ Missing required environment variables:');
    missing.forEach(v => logger.error(`   - ${v}`));
    logger.error('👉 Copy .env.example to .env and fill in all values.');
    process.exit(1);
  }

  logger.info(`✅ Environment validated (${requiredVars.length} required vars present)`);
}

/* ================================================================
   REQUEST IP HELPER
================================================================ */

/**
 * Get real client IP address (handles proxies)
 * @param {import('express').Request} req
 * @returns {string}
 */
function getClientIP(req) {
  return (
    req.headers['cf-connecting-ip'] ||         // Cloudflare
    req.headers['x-real-ip'] ||                // Nginx proxy
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

/* ================================================================
   PAYSTACK SIGNATURE VERIFIER
================================================================ */

/**
 * Verify Paystack webhook HMAC SHA512 signature
 * @param {Buffer|string} rawBody - The raw request body
 * @param {string} signature - X-Paystack-Signature header value
 * @param {string} secretKey - Your Paystack secret key
 * @returns {boolean}
 */
function verifyPaystackSignature(rawBody, signature, secretKey) {
  if (!rawBody || !signature || !secretKey) return false;

  try {
    const crypto = require('crypto');
    const hash = crypto
      .createHmac('sha512', secretKey)
      .update(rawBody)
      .digest('hex');

    // Use timingSafeEqual to prevent timing attacks
    const sigBuffer  = Buffer.from(signature, 'hex');
    const hashBuffer = Buffer.from(hash, 'hex');

    if (sigBuffer.length !== hashBuffer.length) return false;

    return crypto.timingSafeEqual(sigBuffer, hashBuffer);
  } catch (err) {
    logger.error('Signature verification error:', err.message);
    return false;
  }
}

/* ================================================================
   RESPONSE HELPERS
================================================================ */

/**
 * Send a standardized success response
 * @param {import('express').Response} res
 * @param {object} data
 * @param {string} message
 * @param {number} statusCode
 */
function sendSuccess(res, data = {}, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Send a standardized error response
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} statusCode
 * @param {object} [extra]
 */
function sendError(res, message = 'An error occurred', statusCode = 400, extra = {}) {
  return res.status(statusCode).json({
    success: false,
    message,
    ...extra,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  validateEnv,
  getClientIP,
  verifyPaystackSignature,
  sendSuccess,
  sendError,
};
