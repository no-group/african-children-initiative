/* ================================================================
   PAYSTACK WEBHOOK HANDLER
   POST /api/webhook/paystack

   CRITICAL SECURITY:
   - Uses raw body (set in server.js BEFORE express.json())
   - Verifies HMAC SHA512 signature on EVERY request
   - Processes all events idempotently
   - Never returns error status to Paystack (always 200)
     to prevent Paystack from retrying unnecessarily

   EVENTS HANDLED:
   ✅ charge.success
   ✅ subscription.create
   ✅ subscription.disable
   ✅ subscription.not_renew
   ✅ invoice.create
   ✅ invoice.payment_failed
   ✅ invoice.update
   ✅ customeridentification.success
================================================================ */

'use strict';

const express      = require('express');
const crypto       = require('crypto');

const router       = express.Router();
const Transaction  = require('../models/Transaction');
const Subscription = require('../models/Subscription');
const Plan         = require('../models/Plan');
const logger       = require('../middleware/logger');
const { verifyPaystackSignature } = require('../middleware/security');

/* ================================================================
   WEBHOOK ROUTE
   POST /api/webhook/paystack
   
   NOTE: express.raw() middleware is applied in server.js
   to this route ONLY so we get the raw buffer for signature verify
================================================================ */
router.post('/paystack', async (req, res) => {

  /* ------------------------------------------------------------
     STEP 1: Always acknowledge Paystack immediately (200 OK)
     Paystack expects a quick response. We process async.
     We return 200 even on signature failure to avoid Paystack
     spam-retrying (we log and ignore invalid events instead).
  ------------------------------------------------------------ */
  res.status(200).json({ received: true });

  /* ------------------------------------------------------------
     STEP 2: Verify HMAC SHA512 Signature
     This prevents processing fake/malicious webhook events
  ------------------------------------------------------------ */
  const signature = req.headers['x-paystack-signature'];
  const secretKey = process.env.PAYSTACK_WEBHOOK_SECRET ||
                    process.env.PAYSTACK_SECRET_KEY;
  const rawBody   = req.body; // Buffer (because of express.raw())

  if (!signature) {
    logger.warn('🚨 Webhook received without signature header — ignored');
    return;
  }

  const isValidSignature = verifyPaystackSignature(rawBody, signature, secretKey);

  if (!isValidSignature) {
    logger.warn('🚨 Webhook signature verification FAILED — possible spoofing attempt');
    logger.warn(`   Received signature: ${signature?.substring(0, 20)}...`);
    return; // Do NOT process this event
  }

  /* ------------------------------------------------------------
     STEP 3: Parse the event body
  ------------------------------------------------------------ */
  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch (parseErr) {
    logger.error('❌ Failed to parse webhook body:', parseErr.message);
    return;
  }

  const eventType = event.event;
  const eventData = event.data;

  logger.info(`📨 Webhook received: ${eventType} | ID: ${eventData?.id || 'N/A'}`);

  /* ------------------------------------------------------------
     STEP 4: Route to appropriate handler
  ------------------------------------------------------------ */
  try {
    switch (eventType) {

      /* --------------------------------------------------------
         charge.success
         Fired when any payment (one-time or subscription) succeeds
         This is the PRIMARY event for one-time donations
      -------------------------------------------------------- */
      case 'charge.success':
        await handleChargeSuccess(eventData);
        break;

      /* --------------------------------------------------------
         subscription.create
         Fired when a new subscription is created after first payment
      -------------------------------------------------------- */
      case 'subscription.create':
        await handleSubscriptionCreate(eventData);
        break;

      /* --------------------------------------------------------
         subscription.disable
         Fired when a subscription is cancelled/disabled
      -------------------------------------------------------- */
      case 'subscription.disable':
        await handleSubscriptionDisable(eventData);
        break;

      /* --------------------------------------------------------
         subscription.not_renew
         Fired when a subscriber marks their sub to not renew
      -------------------------------------------------------- */
      case 'subscription.not_renew':
        await handleSubscriptionNotRenew(eventData);
        break;

      /* --------------------------------------------------------
         invoice.create
         Fired when a new invoice is generated for a subscription
         (Before payment is attempted)
      -------------------------------------------------------- */
      case 'invoice.create':
        await handleInvoiceCreate(eventData);
        break;

      /* --------------------------------------------------------
         invoice.update
         Fired when invoice status changes
      -------------------------------------------------------- */
      case 'invoice.update':
        await handleInvoiceUpdate(eventData);
        break;

      /* --------------------------------------------------------
         invoice.payment_failed
         Fired when a recurring charge fails
      -------------------------------------------------------- */
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(eventData);
        break;

      /* --------------------------------------------------------
         customeridentification.success
         Fired when customer identity verification succeeds
      -------------------------------------------------------- */
      case 'customeridentification.success':
        logger.info(`👤 Customer identified: ${eventData?.customer?.email}`);
        break;

      /* --------------------------------------------------------
         Default: Log unhandled events for visibility
      -------------------------------------------------------- */
      default:
        logger.info(`📋 Unhandled webhook event: ${eventType} — logged only`);
        break;
    }

  } catch (handlerError) {
    /* ----------------------------------------------------------
       Log errors but DON'T re-throw
       We already sent 200 OK to Paystack
       Errors here are internal processing issues
    ---------------------------------------------------------- */
    logger.error(`❌ Webhook handler error for ${eventType}:`, {
      message: handlerError.message,
      stack:   handlerError.stack,
      event:   eventType,
    });
  }
});

/* ================================================================
   HANDLER: charge.success
   Handles both one-time and initial subscription payments
================================================================ */
async function handleChargeSuccess(data) {
  const reference = data?.reference;

  if (!reference) {
    logger.warn('charge.success received without reference — skipping');
    return;
  }

  logger.info(`💚 charge.success — Ref: ${reference} | Amount: ₦${data.amount / 100} | Email: ${data.customer?.email}`);

  /* ----------------------------------------------------------
     Idempotency check — skip if already processed
  ---------------------------------------------------------- */
  const existingTx = await Transaction.findByReference(reference);

  if (existingTx?.webhook_confirmed) {
    logger.info(`♻️  charge.success already processed for ref: ${reference} — skipping`);
    return;
  }

  if (existingTx) {
    /* --------------------------------------------------------
       Update existing transaction
    -------------------------------------------------------- */
    existingTx.status              = 'success';
    existingTx.verified            = true;
    existingTx.verified_at         = new Date();
    existingTx.webhook_confirmed   = true;
    existingTx.webhook_received_at = new Date();
    existingTx.paystack_id         = data.id;
    existingTx.channel             = data.channel;
    existingTx.gateway_response    = data.gateway_response;
    existingTx.customer_code       = data.customer?.customer_code;
    existingTx.paid_at             = data.paid_at
      ? new Date(data.paid_at)
      : new Date();

    // Save reusable authorization
    if (data.authorization?.reusable) {
      existingTx.authorization = {
        authorization_code: data.authorization.authorization_code,
        card_type:          data.authorization.card_type,
        last4:              data.authorization.last4,
        exp_month:          data.authorization.exp_month,
        exp_year:           data.authorization.exp_year,
        bin:                data.authorization.bin,
        bank:               data.authorization.bank,
        channel:            data.authorization.channel,
        signature:          data.authorization.signature,
        reusable:           true,
        country_code:       data.authorization.country_code,
      };
    }

    await existingTx.save();
    logger.info(`✅ Transaction updated via webhook: ${reference}`);

  } else {
    /* --------------------------------------------------------
       Transaction not found in DB (edge case)
       Create it from webhook data
    -------------------------------------------------------- */
    logger.warn(`⚠️  charge.success for unknown ref: ${reference} — creating from webhook`);

    const newTx = new Transaction({
      reference:             data.reference,
      paystack_id:           data.id,
      email:                 data.customer?.email || 'webhook@paystack.com',
      amount:                data.amount,
      currency:              data.currency || 'NGN',
      channel:               data.channel,
      gateway_response:      data.gateway_response,
      mode:                  data.plan ? 'subscription' : 'one-time',
      plan_code:             data.plan?.plan_code || null,
      status:                'success',
      verified:              true,
      verified_at:           new Date(),
      webhook_confirmed:     true,
      webhook_received_at:   new Date(),
      customer_code:         data.customer?.customer_code,
      paid_at:               data.paid_at ? new Date(data.paid_at) : new Date(),
      ip_address:            'webhook',
    });

    if (data.authorization?.reusable) {
      newTx.authorization = data.authorization;
    }

    await newTx.save();
    logger.info(`✅ New transaction created from webhook: ${reference}`);
  }

  /* ----------------------------------------------------------
     Update plan statistics
  ---------------------------------------------------------- */
  if (data.plan?.plan_code) {
    try {
      const plan = await Plan.findByPlanCode(data.plan.plan_code);
      if (plan) {
        await plan.recordPayment(data.amount);
      }
    } catch (planErr) {
      logger.warn('Could not update plan stats:', planErr.message);
    }
  }
}

/* ================================================================
   HANDLER: subscription.create
   Fired after first successful payment on a plan
================================================================ */
async function handleSubscriptionCreate(data) {
  const subscriptionCode = data?.subscription_code;
  const customerEmail    = data?.customer?.email;
  const planCode         = data?.plan?.plan_code;

  if (!subscriptionCode || !customerEmail) {
    logger.warn('subscription.create missing required fields — skipping');
    return;
  }

  logger.info(`🔔 subscription.create — Code: ${subscriptionCode} | Email: ${customerEmail} | Plan: ${planCode}`);

  /* ----------------------------------------------------------
     Idempotency — skip if already exists
  ---------------------------------------------------------- */
  const existing = await Subscription.findByCode(subscriptionCode);
  if (existing) {
    logger.info(`♻️  Subscription already exists: ${subscriptionCode} — updating status to active`);
    existing.status = 'active';
    await existing.save();
    return;
  }

  /* ----------------------------------------------------------
     Get plan details for denormalization
  ---------------------------------------------------------- */
  let planName = data.plan?.name || '';
  let planInterval = data.plan?.interval || 'monthly';

  if (!planName && planCode) {
    try {
      const planDoc = await Plan.findByPlanCode(planCode);
      if (planDoc) {
        planName     = planDoc.name;
        planInterval = planDoc.interval;
        // Update subscriber count
        await planDoc.addSubscriber();
      }
    } catch (planErr) {
      logger.warn('Could not fetch plan for subscription:', planErr.message);
    }
  }

  /* ----------------------------------------------------------
     Create subscription record
  ---------------------------------------------------------- */
  const subscription = new Subscription({
    subscription_code:                data.subscription_code,
    email_token:                      data.email_token,
    customer_email:                   customerEmail.toLowerCase(),
    customer_code:                    data.customer?.customer_code,
    plan_code:                        planCode,
    plan_name:                        planName,
    amount:                           data.amount,
    interval:                         planInterval,
    status:                           'active',
    authorization_code:               data.authorization?.authorization_code,
    next_payment_date:                data.next_payment_date
      ? new Date(data.next_payment_date)
      : null,
    start_date:                       new Date(),
    successful_payments:              1,
    total_paid:                       data.amount,
    last_payment_date:                new Date(),
    initial_transaction_reference:    data.reference,
    invoice_limit:                    data.invoice_limit || null,
    created_via_webhook:              true,
    paystack_raw_data:                data,
  });

  // Add first payment to history
  subscription.transaction_history.push({
    reference: data.reference || `sub-init-${Date.now()}`,
    amount:    data.amount,
    status:    'success',
    paid_at:   new Date(),
  });

  await subscription.save();
  logger.info(`✅ Subscription created: ${subscriptionCode} for ${customerEmail}`);
}

/* ================================================================
   HANDLER: subscription.disable
   Fired when a subscription is disabled/cancelled
================================================================ */
async function handleSubscriptionDisable(data) {
  const subscriptionCode = data?.subscription_code || data?.code;

  if (!subscriptionCode) {
    logger.warn('subscription.disable received without code — skipping');
    return;
  }

  logger.info(`🚫 subscription.disable — Code: ${subscriptionCode}`);

  try {
    const subscription = await Subscription.findByCode(subscriptionCode);

    if (subscription) {
      await subscription.disable();
      logger.info(`✅ Subscription disabled in DB: ${subscriptionCode}`);

      // Update plan subscriber count
      if (subscription.plan_code) {
        const plan = await Plan.findByPlanCode(subscription.plan_code);
        if (plan) await plan.removeSubscriber();
      }
    } else {
      logger.warn(`⚠️  Subscription not found in DB for disable: ${subscriptionCode}`);
    }
  } catch (err) {
    logger.error('subscription.disable handler error:', err.message);
  }
}

/* ================================================================
   HANDLER: subscription.not_renew
   Donor has marked subscription to not renew
================================================================ */
async function handleSubscriptionNotRenew(data) {
  const subscriptionCode = data?.subscription_code || data?.code;

  if (!subscriptionCode) return;

  logger.info(`🔔 subscription.not_renew — Code: ${subscriptionCode}`);

  try {
    const subscription = await Subscription.findByCode(subscriptionCode);

    if (subscription) {
      subscription.status = 'non-renewing';
      await subscription.save();
      logger.info(`✅ Subscription marked non-renewing: ${subscriptionCode}`);
    }
  } catch (err) {
    logger.error('subscription.not_renew handler error:', err.message);
  }
}

/* ================================================================
   HANDLER: invoice.create
   Fired when Paystack generates a new invoice for renewal
================================================================ */
async function handleInvoiceCreate(data) {
  const subscriptionCode = data?.subscription?.subscription_code;
  const customerEmail    = data?.customer?.email;

  logger.info(`🧾 invoice.create — Sub: ${subscriptionCode} | Email: ${customerEmail} | Amount: ₦${data?.amount / 100}`);

  /* ----------------------------------------------------------
     Update next payment date in our DB
  ---------------------------------------------------------- */
  if (subscriptionCode) {
    try {
      const subscription = await Subscription.findByCode(subscriptionCode);
      if (subscription && data?.next_payment_date) {
        await subscription.updateNextPaymentDate(data.next_payment_date);
        logger.info(`📅 Next payment date updated: ${subscriptionCode}`);
      }
    } catch (err) {
      logger.warn('invoice.create — Could not update next payment date:', err.message);
    }
  }
}

/* ================================================================
   HANDLER: invoice.update
   Fired when invoice is paid (recurring payment success)
================================================================ */
async function handleInvoiceUpdate(data) {
  const subscriptionCode = data?.subscription?.subscription_code;
  const invoiceStatus    = data?.status; // 'success' | 'failed' | 'pending'
  const reference        = data?.transaction?.reference;
  const amount           = data?.amount;

  logger.info(`📄 invoice.update — Sub: ${subscriptionCode} | Status: ${invoiceStatus} | Ref: ${reference}`);

  if (!subscriptionCode) return;

  try {
    const subscription = await Subscription.findByCode(subscriptionCode);

    if (!subscription) {
      logger.warn(`⚠️  Subscription not found for invoice.update: ${subscriptionCode}`);
      return;
    }

    if (invoiceStatus === 'success') {
      await subscription.recordSuccessfulPayment(
        reference || `invoice-${Date.now()}`,
        amount || subscription.amount,
        new Date()
      );

      // Update next payment date
      if (data?.next_payment_date) {
        await subscription.updateNextPaymentDate(data.next_payment_date);
      }

      logger.info(`✅ Recurring payment recorded: ${subscriptionCode} — ₦${amount / 100}`);
    }

  } catch (err) {
    logger.error('invoice.update handler error:', err.message);
  }
}

/* ================================================================
   HANDLER: invoice.payment_failed
   Fired when a recurring charge fails
================================================================ */
async function handleInvoicePaymentFailed(data) {
  const subscriptionCode = data?.subscription?.subscription_code;
  const customerEmail    = data?.customer?.email;
  const amount           = data?.amount;
  const reference        = data?.reference || `failed-${Date.now()}`;

  logger.warn(`⚠️  invoice.payment_failed — Sub: ${subscriptionCode} | Email: ${customerEmail} | Amount: ₦${amount / 100}`);

  if (!subscriptionCode) return;

  try {
    const subscription = await Subscription.findByCode(subscriptionCode);

    if (subscription) {
      await subscription.recordFailedPayment(reference, amount || subscription.amount);
      logger.warn(`⚠️  Subscription marked as attention: ${subscriptionCode}`);
    }

  } catch (err) {
    logger.error('invoice.payment_failed handler error:', err.message);
  }

  /* ----------------------------------------------------------
     NOTE: Paystack will automatically retry failed payments
     according to your retry rules in the dashboard.
     You can also send a custom notification email here
     using your email service (Nodemailer, SendGrid, etc.)
  ---------------------------------------------------------- */
}

module.exports = router;
