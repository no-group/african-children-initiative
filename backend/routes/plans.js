/* ================================================================
   PLANS ROUTES
   GET  /api/plans          — List all active plans
   POST /api/plans          — Create a new plan (admin)
   GET  /api/plans/:code    — Get single plan by code
   PUT  /api/plans/:code    — Update plan (admin)
   POST /api/plans/sync     — Sync all plans from Paystack
================================================================ */

'use strict';

const express = require('express');
const axios   = require('axios');
const { body, param, validationResult } = require('express-validator');

const router = express.Router();
const Plan   = require('../models/Plan');
const logger = require('../middleware/logger');
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
   VALIDATION RULES
================================================================ */
const createPlanValidation = [
  body('name')
    .isString()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Plan name must be between 3 and 100 characters'),

  body('amount')
    .isInt({ min: 100000 })
    .withMessage('Amount must be at least 100000 kobo (₦1,000)'),

  body('interval')
    .isIn(['daily', 'weekly', 'monthly', 'quarterly', 'biannually', 'annually'])
    .withMessage('Invalid interval value'),

  body('description')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),

  body('invoice_limit')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage('Invoice limit must be a positive integer'),

  body('send_invoices')
    .optional()
    .isBoolean()
    .withMessage('send_invoices must be boolean'),
];

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
   ROUTE 1: GET /api/plans
   Returns all active plans (used by frontend to populate plan cards)
================================================================ */
router.get('/', async (req, res) => {
  try {
    const plans = await Plan.getActivePlans();

    // If no plans in DB, seed defaults
    if (plans.length === 0) {
      await Plan.seedDefaultPlans();
      const seededPlans = await Plan.getActivePlans();
      return sendSuccess(res, { plans: seededPlans }, 'Plans loaded (seeded defaults)');
    }

    return sendSuccess(res, { plans }, 'Plans fetched successfully');

  } catch (error) {
    logger.error('Get plans error:', error.message);
    return sendError(res, 'Could not fetch plans. Please try again.', 500);
  }
});

/* ================================================================
   ROUTE 2: GET /api/plans/:code
   Get a single plan by Paystack plan code
================================================================ */
router.get(
  '/:code',
  [
    param('code')
      .isString()
      .trim()
      .withMessage('Plan code is required'),
  ],
  async (req, res) => {
    const validationErr = handleValidationErrors(req, res);
    if (validationErr) return;

    try {
      const plan = await Plan.findByPlanCode(req.params.code);

      if (!plan) {
        return sendError(res, 'Plan not found.', 404);
      }

      return sendSuccess(res, { plan }, 'Plan fetched');

    } catch (error) {
      logger.error('Get single plan error:', error.message);
      return sendError(res, 'Could not fetch plan.', 500);
    }
  }
);

/* ================================================================
   ROUTE 3: POST /api/plans
   Create a new subscription plan on Paystack AND save locally
   
   ⚠️  This should be admin-protected in production
   Add an admin auth middleware before deploying publicly
================================================================ */
router.post(
  '/',
  createPlanValidation,
  async (req, res) => {
    const validationErr = handleValidationErrors(req, res);
    if (validationErr) return;

    const {
      name,
      amount,
      interval,
      description    = '',
      invoice_limit  = null,
      send_invoices  = true,
      send_sms       = false,
      impact_statement = '',
      featured       = false,
      display_order  = 0,
      icon           = 'fa-heart',
      color          = '#f97316',
    } = req.body;

    try {
      /* ----------------------------------------------------------
         1. Create plan on Paystack
      ---------------------------------------------------------- */
      logger.info(`📋 Creating Paystack plan: ${name} — ₦${amount / 100}/${interval}`);

      const paystackPayload = {
        name,
        amount:         parseInt(amount),
        interval,
        description,
        currency:       process.env.ORG_CURRENCY || 'NGN',
        send_invoices,
        send_sms,
      };

      // Add invoice limit if specified (limited-cycle plan)
      if (invoice_limit) {
        paystackPayload.invoice_limit = parseInt(invoice_limit);
      }

      const paystackRes = await paystack.post('/plan', paystackPayload);

      if (!paystackRes.data?.status) {
        logger.error('Paystack plan creation failed:', paystackRes.data);
        return sendError(
          res,
          paystackRes.data?.message || 'Failed to create plan on Paystack.',
          502
        );
      }

      const paystackPlan = paystackRes.data.data;
      logger.info(`✅ Paystack plan created — Code: ${paystackPlan.plan_code}`);

      /* ----------------------------------------------------------
         2. Save plan to our database
      ---------------------------------------------------------- */
      const plan = new Plan({
        name,
        plan_code:          paystackPlan.plan_code,
        paystack_plan_id:   paystackPlan.id,
        amount:             parseInt(amount),
        interval,
        description,
        impact_statement,
        featured,
        display_order:      parseInt(display_order),
        icon,
        color,
        active:             true,
        synced_to_paystack: true,
        last_synced_at:     new Date(),
        send_invoices,
        send_sms,
        invoice_limit:      invoice_limit ? parseInt(invoice_limit) : null,
      });

      await plan.save();
      logger.info(`✅ Plan saved to DB — Code: ${paystackPlan.plan_code}`);

      return sendSuccess(
        res,
        { plan },
        `Plan "${name}" created successfully`,
        201
      );

    } catch (error) {
      logger.error('Create plan error:', {
        message:  error.message,
        response: error.response?.data,
      });

      // Handle duplicate plan code
      if (error.code === 11000) {
        return sendError(res, 'A plan with this code already exists.', 409);
      }

      if (error.response) {
        return sendError(
          res,
          error.response.data?.message || 'Paystack API error',
          error.response.status || 502
        );
      }

      return sendError(res, 'Could not create plan. Please try again.', 500);
    }
  }
);

/* ================================================================
   ROUTE 4: PUT /api/plans/:code
   Update a plan's local details (NOT on Paystack — Paystack 
   doesn't allow editing core plan details after creation)
   
   ⚠️  Admin-protected in production
================================================================ */
router.put(
  '/:code',
  [
    param('code').isString().trim(),
    body('description').optional().isString().trim(),
    body('impact_statement').optional().isString().trim(),
    body('featured').optional().isBoolean(),
    body('active').optional().isBoolean(),
    body('display_order').optional().isInt({ min: 0 }),
    body('icon').optional().isString().trim(),
    body('color').optional().isString().trim(),
  ],
  async (req, res) => {
    const validationErr = handleValidationErrors(req, res);
    if (validationErr) return;

    try {
      const plan = await Plan.findByPlanCode(req.params.code);
      if (!plan) {
        return sendError(res, 'Plan not found.', 404);
      }

      // Only update allowed fields
      const allowedUpdates = [
        'description',
        'impact_statement',
        'featured',
        'active',
        'display_order',
        'icon',
        'color',
      ];

      allowedUpdates.forEach(field => {
        if (req.body[field] !== undefined) {
          plan[field] = req.body[field];
        }
      });

      await plan.save();
      logger.info(`✏️  Plan updated: ${req.params.code}`);

      return sendSuccess(res, { plan }, 'Plan updated successfully');

    } catch (error) {
      logger.error('Update plan error:', error.message);
      return sendError(res, 'Could not update plan.', 500);
    }
  }
);

/* ================================================================
   ROUTE 5: POST /api/plans/sync
   Sync all plans from Paystack to local database
   Useful after creating plans directly in Paystack dashboard
   
   ⚠️  Admin-protected in production
================================================================ */
router.post('/sync', async (req, res) => {
  try {
    logger.info('🔄 Syncing plans from Paystack...');

    const paystackRes = await paystack.get('/plan?perPage=50&page=1');

    if (!paystackRes.data?.status) {
      return sendError(res, 'Failed to fetch plans from Paystack.', 502);
    }

    const paystackPlans = paystackRes.data.data;
    let synced = 0;
    let created = 0;

    for (const pPlan of paystackPlans) {
      const existingPlan = await Plan.findByPlanCode(pPlan.plan_code);

      if (existingPlan) {
        // Update sync timestamp
        existingPlan.last_synced_at     = new Date();
        existingPlan.synced_to_paystack = true;
        existingPlan.paystack_plan_id   = pPlan.id;
        await existingPlan.save();
        synced++;
      } else {
        // Create new plan from Paystack data
        const newPlan = new Plan({
          name:               pPlan.name,
          plan_code:          pPlan.plan_code,
          paystack_plan_id:   pPlan.id,
          amount:             pPlan.amount,
          interval:           pPlan.interval,
          description:        pPlan.description || '',
          currency:           pPlan.currency || 'NGN',
          send_invoices:      pPlan.send_invoices,
          send_sms:           pPlan.send_sms,
          active:             true,
          synced_to_paystack: true,
          last_synced_at:     new Date(),
        });
        await newPlan.save();
        created++;
      }
    }

    logger.info(`✅ Sync complete — Updated: ${synced} | Created: ${created}`);

    return sendSuccess(
      res,
      { synced, created, total: paystackPlans.length },
      `Sync complete: ${synced} updated, ${created} created`
    );

  } catch (error) {
    logger.error('Sync plans error:', error.message);
    return sendError(res, 'Could not sync plans from Paystack.', 500);
  }
});

module.exports = router;
