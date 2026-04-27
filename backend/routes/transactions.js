/* ================================================================
   TRANSACTIONS ROUTES
   POST /api/initialize-transaction
   GET  /api/verify/:reference
   GET  /api/transactions/:email  (admin)
================================================================ */

'use strict';

const express    = require('express');
const axios      = require('axios');
const { body, param, validationResult } = require('express-validator');

const router      = express.Router();
const Transaction = require('../models/Transaction');
const Plan        = require('../models/Plan');
const logger      = require('../middleware/logger');
const {
  getClientIP,
  sendSuccess,
  sendError,
} = require('../middleware/security');

/* ================================================================
   PAYSTACK AXIOS INSTANCE
   Pre-configured with auth header and base URL
================================================================ */
const paystack = axios.create({
  baseURL: process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co',
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds
});

/* ================================================================
   VALIDATION RULES
================================================================ */
const initTransactionValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('A valid email address is required'),

  body('amount')
    .isInt({ min: 50000 })
    .withMessage('Amount must be at least 50000 kobo (₦500)'),

  body('mode')
    .isIn(['one-time', 'subscription'])
    .withMessage('Mode must be either "one-time" or "subscription"'),

  body('plan_code')
    .optional({ nullable: true })
    .isString()
    .trim()
    .withMessage('Plan code must be a string'),

  body('reference')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Reference must be between 5 and 100 characters'),

  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object'),
];

/* ================================================================
   HELPER: Handle validation errors
================================================================ */
function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation failed', 400, {
      errors: errors.array().map(e => ({
        field:   e.path,
        message: e.msg,
      })),
    });
  }
  return null;
}

/* ================================================================
   ROUTE 1: POST /api/initialize-transaction
   Initialize a Paystack payment (one-time or subscription)
================================================================ */
router.post(
  '/initialize-transaction',
  initTransactionValidation,
  async (req, res) => {
    // 1. Validate inputs
    const validationErr = handleValidationErrors(req, res);
    if (validationErr) return;

    const {
      email,
      amount,
      mode,
      plan_code,
      reference,
      metadata = {},
    } = req.body;

    const clientIP    = getClientIP(req);
    const userAgent   = req.headers['user-agent'] || 'unknown';

    logger.info(`💳 New ${mode} payment — Email: ${email} | Amount: ₦${amount / 100} | IP: ${clientIP}`);

    try {
      /* ----------------------------------------------------------
         2. Check for duplicate reference (idempotency)
      ---------------------------------------------------------- */
      if (reference) {
        const existingTx = await Transaction.findByReference(reference);
        if (existingTx) {
          if (existingTx.status === 'success') {
            return sendError(
              res,
              'This payment reference has already been used and completed.',
              409
            );
          }
          // If pending, return existing access_code so frontend can retry
          if (existingTx.status === 'pending' && existingTx.access_code) {
            logger.info(`♻️  Returning existing pending transaction: ${reference}`);
            return sendSuccess(res, {
              reference:    existingTx.reference,
              access_code:  existingTx.access_code,
            }, 'Existing pending transaction returned');
          }
        }
      }

      /* ----------------------------------------------------------
         3. Validate plan for subscription mode
      ---------------------------------------------------------- */
      let planData = null;
      if (mode === 'subscription') {
        if (!plan_code) {
          return sendError(res, 'A plan_code is required for subscription mode.', 400);
        }

        // Verify plan exists in our database
        planData = await Plan.findByPlanCode(plan_code);
        if (!planData) {
          // Try fetching from Paystack directly as fallback
          try {
            const paystackPlanRes = await paystack.get(`/plan/${plan_code}`);
            if (!paystackPlanRes.data?.status) {
              return sendError(res, 'Invalid plan code. Plan not found on Paystack.', 400);
            }
            planData = paystackPlanRes.data.data;
            logger.info(`📋 Plan fetched from Paystack: ${plan_code}`);
          } catch (planErr) {
            return sendError(res, 'Could not verify plan code. Please try again.', 400);
          }
        }

        if (planData.active === false) {
          return sendError(res, 'This donation plan is currently inactive.', 400);
        }
      }

      /* ----------------------------------------------------------
         4. Build Paystack initialize payload
      ---------------------------------------------------------- */
      const txReference = reference || `ACI-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

      const paystackPayload = {
        email,
        amount:    parseInt(amount),
        reference: txReference,
        currency:  process.env.ORG_CURRENCY || 'NGN',
        metadata:  {
          ...metadata,
          cancel_action: process.env.FRONTEND_URL || 'http://localhost:3000',
        },
        channels: ['card', 'bank', 'ussd', 'bank_transfer', 'mobile_money'],
        label:    process.env.ORG_NAME || 'African Children Initiative',
      };

      // Add plan code for subscription
      if (mode === 'subscription' && plan_code) {
        paystackPayload.plan = plan_code;
      }

      /* ----------------------------------------------------------
         5. Call Paystack Initialize API
      ---------------------------------------------------------- */
      logger.info(`📡 Calling Paystack initialize API — Ref: ${txReference}`);

      const paystackRes = await paystack.post('/transaction/initialize', paystackPayload);

      if (!paystackRes.data?.status) {
        logger.error('Paystack initialize failed:', paystackRes.data);
        return sendError(
          res,
          paystackRes.data?.message || 'Payment initialization failed. Please try again.',
          502
        );
      }

      const { reference: confirmedRef, access_code, authorization_url } = paystackRes.data.data;

      /* ----------------------------------------------------------
         6. Save transaction to database
      ---------------------------------------------------------- */
      const transaction = new Transaction({
        reference:   confirmedRef || txReference,
        access_code: access_code,
        email:       email.toLowerCase().trim(),
        donor_name:  metadata?.custom_fields?.find(f => f.variable_name === 'donor_name')?.value || 'Anonymous',
        donor_message: metadata?.custom_fields?.find(f => f.variable_name === 'message')?.value || '',
        amount:      parseInt(amount),
        currency:    process.env.ORG_CURRENCY || 'NGN',
        mode:        mode,
        plan_code:   mode === 'subscription' ? plan_code : null,
        status:      'pending',
        ip_address:  clientIP,
        user_agent:  userAgent.substring(0, 500),
      });

      await transaction.save();
      logger.info(`✅ Transaction saved to DB — Ref: ${confirmedRef || txReference}`);

      /* ----------------------------------------------------------
         7. Return response to frontend
      ---------------------------------------------------------- */
      return sendSuccess(
        res,
        {
          reference:         confirmedRef || txReference,
          access_code:       access_code,
          authorization_url: authorization_url,
        },
        'Transaction initialized successfully',
        201
      );

    } catch (error) {
      logger.error('Initialize transaction error:', {
        message: error.message,
        response: error.response?.data,
        email,
        amount,
        mode,
      });

      // Paystack API error
      if (error.response) {
        const paystackMsg = error.response.data?.message || 'Paystack API error';
        return sendError(res, paystackMsg, error.response.status || 502);
      }

      // Network / timeout
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return sendError(
          res,
          'Payment service is taking too long to respond. Please try again.',
          504
        );
      }

      return sendError(res, 'Payment initialization failed. Please try again.', 500);
    }
  }
);

/* ================================================================
   ROUTE 2: GET /api/verify/:reference
   Verify a Paystack transaction by reference
================================================================ */
router.get(
  '/verify/:reference',
  [
    param('reference')
      .isString()
      .trim()
      .isLength({ min: 5, max: 100 })
      .withMessage('Invalid reference format'),
  ],
  async (req, res) => {
    const validationErr = handleValidationErrors(req, res);
    if (validationErr) return;

    const { reference } = req.params;

    logger.info(`🔍 Verify request — Ref: ${reference}`);

    try {
      /* ----------------------------------------------------------
         1. Check our database first
            If already verified, return stored result
      ---------------------------------------------------------- */
      const existingTx = await Transaction.findByReference(reference);

      if (existingTx?.status === 'success' && existingTx.verified) {
        logger.info(`✅ Returning cached verified transaction: ${reference}`);
        return sendSuccess(res, {
          status:    'success',
          reference: existingTx.reference,
          amount:    existingTx.amount,
          email:     existingTx.email,
          mode:      existingTx.mode,
          plan_code: existingTx.plan_code,
          paid_at:   existingTx.paid_at,
          channel:   existingTx.channel,
          customer: {
            email:         existingTx.email,
            customer_code: existingTx.customer_code,
          },
        }, 'Transaction already verified');
      }

      /* ----------------------------------------------------------
         2. Call Paystack Verify API
      ---------------------------------------------------------- */
      logger.info(`📡 Calling Paystack verify API — Ref: ${reference}`);

      const paystackRes = await paystack.get(`/transaction/verify/${encodeURIComponent(reference)}`);

      if (!paystackRes.data?.status) {
        return sendError(
          res,
          paystackRes.data?.message || 'Could not verify payment.',
          502
        );
      }

      const txData = paystackRes.data.data;
      const paystackStatus = txData.status; // 'success' | 'failed' | 'abandoned' | 'pending'

      logger.info(`📊 Paystack status for ${reference}: ${paystackStatus}`);

      /* ----------------------------------------------------------
         3. Update transaction in database
      ---------------------------------------------------------- */
      if (existingTx) {
        existingTx.verification_attempts += 1;

        if (paystackStatus === 'success') {
          await existingTx.markSuccess(txData);
          logger.info(`✅ Transaction marked SUCCESS: ${reference}`);

        } else if (
          paystackStatus === 'failed' ||
          paystackStatus === 'abandoned'
        ) {
          await existingTx.markFailed(
            txData.gateway_response || 'Transaction failed'
          );
          logger.warn(`❌ Transaction marked FAILED: ${reference}`);

        } else {
          // Still pending
          existingTx.status = 'pending';
          await existingTx.save();
        }

      } else {
        // Transaction not in our DB (edge case — direct Paystack link?)
        // Create it now
        if (paystackStatus === 'success') {
          logger.warn(`⚠️  Transaction ${reference} not in DB — creating from Paystack data`);

          const newTx = new Transaction({
            reference:        txData.reference,
            access_code:      txData.access_code,
            paystack_id:      txData.id,
            email:            txData.customer?.email || 'unknown@unknown.com',
            amount:           txData.amount,
            currency:         txData.currency,
            mode:             txData.plan ? 'subscription' : 'one-time',
            plan_code:        txData.plan?.plan_code || null,
            status:           'success',
            verified:         true,
            verified_at:      new Date(),
            channel:          txData.channel,
            gateway_response: txData.gateway_response,
            customer_code:    txData.customer?.customer_code,
            paid_at:          txData.paid_at ? new Date(txData.paid_at) : new Date(),
            ip_address:       getClientIP(req),
            webhook_confirmed: false,
          });

          if (txData.authorization?.reusable) {
            newTx.authorization = txData.authorization;
          }

          await newTx.save();
        }
      }

      /* ----------------------------------------------------------
         4. Return verification result to frontend
      ---------------------------------------------------------- */
      return sendSuccess(
        res,
        {
          status:           paystackStatus,
          reference:        txData.reference,
          amount:           txData.amount,
          currency:         txData.currency,
          channel:          txData.channel,
          gateway_response: txData.gateway_response,
          paid_at:          txData.paid_at,
          mode:             txData.plan ? 'subscription' : 'one-time',
          plan_code:        txData.plan?.plan_code || null,
          customer: {
            email:         txData.customer?.email,
            customer_code: txData.customer?.customer_code,
          },
        },
        `Payment ${paystackStatus}`
      );

    } catch (error) {
      logger.error('Verify transaction error:', {
        message:  error.message,
        response: error.response?.data,
        reference,
      });

      if (error.response?.status === 400) {
        return sendError(
          res,
          'Transaction reference not found on Paystack.',
          404
        );
      }

      if (error.code === 'ECONNABORTED') {
        return sendError(
          res,
          'Verification service timed out. Please try again.',
          504
        );
      }

      return sendError(res, 'Payment verification failed. Please try again.', 500);
    }
  }
);

/* ================================================================
   ROUTE 3: GET /api/transactions/:email
   Get all transactions for a donor email (admin use)
================================================================ */
router.get(
  '/transactions/:email',
  [
    param('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email required'),
  ],
  async (req, res) => {
    const validationErr = handleValidationErrors(req, res);
    if (validationErr) return;

    const { email } = req.params;

    try {
      const transactions = await Transaction.findByEmail(email);

      return sendSuccess(
        res,
        {
          email,
          count:        transactions.length,
          transactions,
        },
        'Transactions fetched successfully'
      );

    } catch (error) {
      logger.error('Get transactions error:', error.message);
      return sendError(res, 'Could not fetch transactions.', 500);
    }
  }
);

/* ================================================================
   ROUTE 4: GET /api/stats
   Public donation statistics
================================================================ */
router.get('/stats', async (req, res) => {
  try {
    const [totalKobo, countByMode, activeSubscribers] = await Promise.all([
      Transaction.getTotalDonated(),
      Transaction.getCountByMode(),
      require('../models/Subscription').getActiveCount(),
    ]);

    return sendSuccess(res, {
      total_donated_kobo: totalKobo,
      total_donated_ngn:  totalKobo / 100,
      one_time_count:     countByMode['one-time'] || 0,
      subscription_count: countByMode['subscription'] || 0,
      active_subscribers: activeSubscribers,
    }, 'Stats fetched');

  } catch (error) {
    logger.error('Stats error:', error.message);
    return sendError(res, 'Could not fetch stats.', 500);
  }
});

module.exports = router;
