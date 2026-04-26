/* ================================================================
   AFRICAN CHILDREN INITIATIVE — MAIN SERVER
   Node.js + Express Backend
   Version: 2.0 | 2026 Standards

   ✅ FILL IN REQUIRED:
   All credentials go in your .env file — see .env.example
================================================================ */

'use strict';

/* ================================================================
   1. MODULE IMPORTS
================================================================ */
const express        = require('express');
const mongoose       = require('mongoose');
const cors           = require('cors');
const helmet         = require('helmet');
const morgan         = require('morgan');
const compression    = require('compression');
const rateLimit      = require('express-rate-limit');
const mongoSanitize  = require('express-mongo-sanitize');
const path           = require('path');
const crypto         = require('crypto');
require('dotenv').config();

/* ================================================================
   2. INTERNAL IMPORTS
================================================================ */
const logger             = require('./middleware/logger');
const { validateEnv }    = require('./middleware/security');

// Route handlers
const plansRouter        = require('./routes/plans');
const transactionsRouter = require('./routes/transactions');
const subscriptionsRouter = require('./routes/subscriptions');
const webhookRouter      = require('./routes/webhook');

/* ================================================================
   3. ENVIRONMENT VALIDATION
================================================================ */
// Validate required environment variables on startup
validateEnv([
  'PAYSTACK_SECRET_KEY',
  'PAYSTACK_PUBLIC_KEY',
  'MONGODB_URI',
]);

/* ================================================================
   4. EXPRESS APP INITIALIZATION
================================================================ */
const app = express();

/* ================================================================
   5. TRUST PROXY (Required for Render, Railway, Heroku)
================================================================ */
app.set('trust proxy', 1);

/* ================================================================
   6. SECURITY MIDDLEWARE
================================================================ */

// Helmet — sets secure HTTP headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API-only server
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Always allow localhost variants for development
const devOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:3000',
  'null', // For file:// protocol (opening HTML directly)
];

const allAllowedOrigins = [...new Set([...allowedOrigins, ...devOrigins])];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);

    if (
      allAllowedOrigins.includes(origin) ||
      process.env.NODE_ENV === 'development'
    ) {
      return callback(null, true);
    }

    logger.warn(`CORS blocked request from origin: ${origin}`);
    return callback(new Error(`CORS: Origin ${origin} not allowed.`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400, // Cache preflight for 24 hours
}));

/* ================================================================
   7. WEBHOOK RAW BODY MIDDLEWARE
   CRITICAL: Must be before express.json() for webhook route
   Paystack HMAC verification requires the raw body buffer
================================================================ */
app.use('/api/webhook/paystack', express.raw({ type: 'application/json' }));

/* ================================================================
   8. BODY PARSING MIDDLEWARE
================================================================ */
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

/* ================================================================
   9. SANITIZATION MIDDLEWARE
================================================================ */
// Prevent MongoDB injection via request body/params
app.use(mongoSanitize());

/* ================================================================
   10. COMPRESSION
================================================================ */
app.use(compression());

/* ================================================================
   11. LOGGING MIDDLEWARE
================================================================ */
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  // Production — combined format logs to winston
  app.use(morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
  }));
}

/* ================================================================
   12. RATE LIMITING
================================================================ */
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '15') * 60 * 1000;
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX || '20');

// General API rate limit
const generalLimiter = rateLimit({
  windowMs,
  max: maxRequests * 5, // More lenient for general routes
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limit for payment initialization
const paymentLimiter = rateLimit({
  windowMs,
  max: maxRequests,
  message: {
    success: false,
    message: 'Too many payment attempts. Please wait 15 minutes before trying again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests from limit count
  skipSuccessfulRequests: false,
});

// Apply general limiter to all routes
app.use('/api/', generalLimiter);

// Apply strict limiter to payment initialization
app.use('/api/initialize-transaction', paymentLimiter);

/* ================================================================
   13. ROUTES
================================================================ */

// Health check endpoint (no auth, no rate limit)
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🌍 African Children Initiative API is running',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// API health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: `${Math.floor(process.uptime())}s`,
    memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
    timestamp: new Date().toISOString(),
  });
});

// Payment routes
app.use('/api', transactionsRouter);     // /api/initialize-transaction, /api/verify/:ref
app.use('/api/plans', plansRouter);      // /api/plans (GET, POST)
app.use('/api/subscriptions', subscriptionsRouter); // /api/subscriptions/*
app.use('/api/webhook', webhookRouter);  // /api/webhook/paystack

/* ================================================================
   14. 404 HANDLER
================================================================ */
app.use('*', (req, res) => {
  logger.warn(`404 — Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
    hint: 'Check the API documentation for valid endpoints.',
  });
});

/* ================================================================
   15. GLOBAL ERROR HANDLER
================================================================ */
app.use((err, req, res, next) => {
  // Log the full error
  logger.error('Unhandled error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  // CORS error
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({
      success: false,
      message: 'CORS policy violation. Request origin not allowed.',
    });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: Object.values(err.errors).map(e => e.message),
    });
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format.',
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'An internal server error occurred. Please try again.'
      : err.message,
  });
});

/* ================================================================
   16. DATABASE CONNECTION
================================================================ */
async function connectDatabase() {
  const mongoURI = process.env.MONGODB_URI;

  if (!mongoURI) {
    logger.error('❌ MONGODB_URI is not set in .env file');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 10000, // 10s timeout
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    });

    logger.info('✅ MongoDB connected successfully');
    logger.info(`📊 Database: ${mongoose.connection.name}`);

  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

// Handle MongoDB connection events
mongoose.connection.on('disconnected', () => {
  logger.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  logger.info('✅ MongoDB reconnected');
});

/* ================================================================
   17. SERVER STARTUP
================================================================ */
async function startServer() {
  try {
    // Connect to database first
    await connectDatabase();

    const PORT = parseInt(process.env.PORT || '5000', 10);

    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info('═══════════════════════════════════════════');
      logger.info('🌍 African Children Initiative API');
      logger.info('═══════════════════════════════════════════');
      logger.info(`✅ Server running on port ${PORT}`);
      logger.info(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`💳 Paystack mode: ${
        process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_live') ? '🟢 LIVE' : '🟡 TEST'
      }`);
      logger.info(`📡 Health check: http://localhost:${PORT}/api/health`);
      logger.info('═══════════════════════════════════════════');
    });

    /* ============================================================
       18. GRACEFUL SHUTDOWN HANDLERS
    ============================================================ */
    const gracefulShutdown = async (signal) => {
      logger.info(`\n⚠️  ${signal} received. Shutting down gracefully...`);

      // Stop accepting new connections
      server.close(async () => {
        logger.info('🔌 HTTP server closed');

        try {
          await mongoose.connection.close();
          logger.info('🔌 MongoDB connection closed');
          logger.info('✅ Graceful shutdown complete');
          process.exit(0);
        } catch (err) {
          logger.error('❌ Error during shutdown:', err);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('❌ Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Promise Rejection:', {
        reason: reason?.message || reason,
        promise,
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Boot the server
startServer();

/* ================================================================
   END OF server.js
================================================================ */
