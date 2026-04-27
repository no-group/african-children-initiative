/* ================================================================
   SUBSCRIPTIONS ROUTES
   GET  /api/subscriptions/email/:email   — Get donor's subscriptions
   GET  /api/subscriptions/:code          — Get single subscription
   POST /api/subscriptions/cancel         — Cancel a subscription
   GET  /api/subscriptions/:code/manage   — Get Paystack manage link
================================================================ */

'use strict';

const express = require('express');
const axios   = require('axios');
const { body, param, validationResult } = require('express-validator');

const router       = express.Router();
const Subscription = require('../models/Subscription');
const logger       = require('../middleware/logger');
const { sendSuccess, sendError } = require('../middleware/security');

/* ================================================================
   PAYSTACK AXIOS INSTANCE
================================================================ */
const paystack = axios.create({
  baseURL: process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co',
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

/* ================================================================
   HELPER
================================================================ */
function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation failed', 400, {
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  return null;
}

/* ================================================================
   ROUTE 1: GET /api/subscriptions/email/:email
   Get all subscriptions for a donor
================================================================ */
router.get(
  '/email/:email',
  [
    param('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
  ],
  async (req, res) => {
    const validationErr = handleValidationErrors(req, res);
    if (validationErr) return;

    const { email } = req.params;

    try {
      const subscriptions = await Subscription.findByEmail(email);

      return sendSuccess(
        res,
        {
          email,
          count:         subscriptions.length,
          subscriptions,
        },
        'Subscriptions fetched successfully'
      );

    } catch (error) {
      logger.error('Get subscriptions by email error:', error.message);
      return sendError(res, 'Could not fetch subscriptions.', 500);
    }
  }
);

/* ================================================================
   ROUTE 2: GET /api/subscriptions/:code
   Get a single subscription by subscription code
================================================================ */
router.get(
  '/:code',
  [
    param('code')
      .isString()
      .trim()
      .withMessage('Subscription code is required'),
  ],
  async (req, res) => {
    const validationErr = handleValidationErrors(req, res);
    if (validationErr) return;

    const { code } = req.params;

    try {
      /* ----------------------------------------------------------
         1. Check local DB first
      ---------------------------------------------------------- */
      let subscription = await Subscription.findByCode(code);

      if (subscription) {
        return sendSuccess(res, { subscription }, 'Subscription fetched');
      }

      /* ----------------------------------------------------------
         2. Fallback to Paystack API
      ---------------------------------------------------------- */
      logger.info(`🔍 Fetching subscription from Paystack: ${code}`);

      const paystackRes = await paystack.get(`/subscription/${encodeURIComponent(code)}`);

      if (!paystackRes.data?.status) {
        return sendError(res, 'Subscription not found.', 404);
      }

      const pSub = paystackRes.data.data;

      return sendSuccess(
        res,
        {
          subscription: {
            subscription_code: pSub.subscription_code,
            customer_email:    pSub.customer?.email,
            plan_code:         pSub.plan?.plan_code,
            plan_name:         pSub.plan?.name,
            amount:            pSub.amount,
            interval:          pSub.plan?.interval,
            status:            pSub.status,
            next_payment_date: pSub.next_payment_date,
            source:            'paystack_live',
          },
        },
        'Subscription fetched from Paystack'
      );

    } catch (error) {
      logger.error('Get subscription error:', {
        message: error.message,
        code,
      });

      if (error.response?.status === 404) {
        return sendError(res, 'Subscription not found.', 404);
      }

      return sendError(res, 'Could not fetch subscription.', 500);
    }
  }
);

/* ================================================================
   ROUTE 3: POST /api/subscriptions/cancel
   Cancel a subscription
   
   Requires:
   - subscription_code: from Paystack
   - email_token: sent to donor's email by Paystack
   - email: donor's email (verification)
================================================================ */
router.post(
  '/cancel',
  [
    body('subscription_code')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Subscription code is required'),

    body('email_token')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Email token is required (check your email from Paystack)'),

    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid donor email is required'),
  ],
  async (req, res) => {
    const validationErr = handleValidationErrors(req, res);
    if (validationErr) return;

    const { subscription_code, email_token, email } = req.body;

    logger.info(`🚫 Cancel subscription request — Code: ${subscription_code} | Email: ${email}`);

    try {
      /* ----------------------------------------------------------
         1. Verify subscription exists and belongs to this email
      ---------------------------------------------------------- */
      const subscription = await Subscription.findByCode(subscription_code);

      if (subscription && subscription.customer_email !== email.toLowerCase()) {
        logger.warn(`🚨 Cancel attempt mismatch — Code: ${subscription_code} | Email: ${email}`);
        return sendError(
          res,
          'Email does not match the subscription owner.',
          403
        );
      }

      /* ----------------------------------------------------------
         2. Call Paystack to disable subscription
      ---------------------------------------------------------- */
      logger.info(`📡 Calling Paystack disable subscription — Code: ${subscription_code}`);

      const paystackRes = await paystack.post('/subscription/disable', {
        code:  subscription_code,
        token: email_token,
      });

      if (!paystackRes.data?.status) {
        return sendError(
          res,
          paystackRes.data?.message || 'Failed to cancel subscription on Paystack.',
          502
        );
      }

      /* ----------------------------------------------------------
         3. Update local database
      ---------------------------------------------------------- */
      if (subscription) {
        await subscription.cancel();
        logger.info(`✅ Subscription cancelled in DB: ${subscription_code}`);
      }

      return sendSuccess(
        res,
        {
          subscription_code,
          status:       'cancelled',
          cancelled_at: new Date().toISOString(),
        },
        'Subscription cancelled successfully. No more charges will be made.'
      );

    } catch (error) {
      logger.error('Cancel subscription error:', {
        message:  error.message,
        response: error.response?.data,
        subscription_code,
      });

      if (error.response?.status === 400) {
        return sendError(
          res,
          error.response.data?.message || 'Invalid subscription code or email token.',
          400
        );
      }

      return sendError(
        res,
        'Could not cancel subscription. Please try again or contact support.',
        500
      );
    }
  }
);

/* ================================================================
   ROUTE 4: POST /api/subscriptions/enable
   Re-enable a previously disabled subscription
================================================================ */
router.post(
  '/enable',
  [
    body('subscription_code')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Subscription code is required'),

    body('email_token')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Email token is required'),
  ],
  async (req, res) => {
    const validationErr = handleValidationErrors(req, res);
    if (validationErr) return;

    const { subscription_code, email_token } = req.body;

    try {
      const paystackRes = await paystack.post('/subscription/enable', {
        code:  subscription_code,
        token: email_token,
      });

      if (!paystackRes.data?.status) {
        return sendError(
          res,
          paystackRes.data?.message || 'Failed to enable subscription.',
          502
        );
      }

      // Update local DB
      const subscription = await Subscription.findByCode(subscription_code);
      if (subscription) {
        subscription.status = 'active';
        await subscription.save();
      }

      return sendSuccess(
        res,
        { subscription_code, status: 'active' },
        'Subscription re-enabled successfully'
      );

    } catch (error) {
      logger.error('Enable subscription error:', error.message);
      return sendError(res, 'Could not enable subscription.', 500);
    }
  }
);

/* ================================================================
   ROUTE 5: GET /api/subscriptions/:code/manage
   Get subscription management link (Paystack hosted page)
================================================================ */
router.get(
  '/:code/manage',
  [
    param('code').isString().trim().notEmpty(),
  ],
  async (req, res) => {
    const { code } = req.params;

    try {
      const paystackRes = await paystack.get(
        `/subscription/${encodeURIComponent(code)}`
      );

      if (!paystackRes.data?.status) {
        return sendError(res, 'Subscription not found.', 404);
      }

      const pSub = paystackRes.data.data;

      return sendSuccess(
        res,
        {
          subscription_code: code,
          manage_url: `https://paystack.com/manage/subscriptions/${pSub.email_token}`,
          email_token: pSub.email_token,
        },
        'Manage link generated'
      );

    } catch (error) {
      logger.error('Get manage link error:', error.message);
      return sendError(res, 'Could not generate manage link.', 500);
    }
  }
);

module.exports = router;
