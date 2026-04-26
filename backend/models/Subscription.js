/* ================================================================
   SUBSCRIPTION MODEL
   Tracks recurring donor subscriptions
   Created/updated by Paystack webhook events

   Lifecycle:
   1. Donor completes initial payment → subscription.create webhook
   2. Each renewal → invoice.payment_success webhook
   3. Cancellation → subscription.disable webhook
   4. Failed renewal → invoice.payment_failed webhook
================================================================ */

'use strict';

const mongoose = require('mongoose');

/* ================================================================
   SUBSCRIPTION SCHEMA
================================================================ */
const SubscriptionSchema = new mongoose.Schema(
  {
    /* ------------------------------------------------------------
       CORE IDENTIFIERS
    ------------------------------------------------------------ */

    // Paystack subscription code (e.g. SUB_xxxxxxxxx)
    subscription_code: {
      type:     String,
      required: [true, 'Subscription code is required'],
      unique:   true,
      trim:     true,
      index:    true,
    },

    // Paystack email token (required for cancel/manage operations)
    // This is sent to the donor's email by Paystack
    email_token: {
      type:    String,
      default: null,
      trim:    true,
      select:  false, // Don't return by default
    },

    /* ------------------------------------------------------------
       DONOR INFORMATION
    ------------------------------------------------------------ */

    // Subscriber email
    customer_email: {
      type:      String,
      required:  [true, 'Customer email is required'],
      lowercase: true,
      trim:      true,
      index:     true,
      match: [
        /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/,
        'Please provide a valid email address',
      ],
    },

    // Paystack customer code
    customer_code: {
      type:    String,
      default: null,
      trim:    true,
      index:   true,
    },

    // Donor name (from initial transaction metadata)
    donor_name: {
      type:    String,
      default: 'Anonymous',
      trim:    true,
    },

    /* ------------------------------------------------------------
       PLAN DETAILS
    ------------------------------------------------------------ */

    // Paystack plan code this subscription is on
    plan_code: {
      type:     String,
      required: [true, 'Plan code is required'],
      trim:     true,
      index:    true,
    },

    // Plan name (denormalized for fast display)
    plan_name: {
      type:    String,
      default: '',
      trim:    true,
    },

    // Amount in kobo
    amount: {
      type:    Number,
      default: 0,
      min:     0,
    },

    // Billing interval
    interval: {
      type:    String,
      default: 'monthly',
      enum:    ['daily', 'weekly', 'monthly', 'quarterly', 'biannually', 'annually'],
    },

    /* ------------------------------------------------------------
       SUBSCRIPTION STATUS
    ------------------------------------------------------------ */

    // Current subscription status
    status: {
      type:    String,
      required: true,
      enum:    [
        'active',       // Subscription is running normally
        'inactive',     // Subscription was disabled/cancelled
        'attention',    // Payment failed, needs attention
        'completed',    // Invoice limit reached (plan fully paid)
        'cancelled',    // Explicitly cancelled by donor
        'non-renewing', // Will not renew (cancellation scheduled)
      ],
      default: 'active',
      index:   true,
    },

    /* ------------------------------------------------------------
       BILLING INFORMATION
    ------------------------------------------------------------ */

    // Stored authorization for future charges
    authorization_code: {
      type:    String,
      default: null,
      trim:    true,
      select:  false, // Sensitive — don't return by default
    },

    // Next scheduled payment date
    next_payment_date: {
      type:    Date,
      default: null,
      index:   true,
    },

    // Date subscription started
    start_date: {
      type:    Date,
      default: Date.now,
    },

    // Date subscription was cancelled (if applicable)
    cancelled_at: {
      type:    Date,
      default: null,
    },

    // Date subscription was disabled on Paystack
    disabled_at: {
      type:    Date,
      default: null,
    },

    /* ------------------------------------------------------------
       PAYMENT HISTORY SUMMARY
    ------------------------------------------------------------ */

    // Number of successful payments made
    successful_payments: {
      type:    Number,
      default: 0,
      min:     0,
    },

    // Number of failed payment attempts
    failed_payments: {
      type:    Number,
      default: 0,
      min:     0,
    },

    // Total amount collected from this subscription (kobo)
    total_paid: {
      type:    Number,
      default: 0,
      min:     0,
    },

    // Last successful payment date
    last_payment_date: {
      type:    Date,
      default: null,
    },

    // Last failed payment date
    last_failed_date: {
      type:    Date,
      default: null,
    },

    // Invoice limit (max payments, null = unlimited)
    invoice_limit: {
      type:    Number,
      default: null,
      min:     1,
    },

    /* ------------------------------------------------------------
       LINKED RECORDS
    ------------------------------------------------------------ */

    // Reference to the initial transaction that created this subscription
    initial_transaction_reference: {
      type:    String,
      default: null,
      trim:    true,
    },

    // Array of all transaction references (payments on this sub)
    transaction_history: [
      {
        reference:  { type: String, trim: true },
        amount:     { type: Number },
        status:     { type: String, enum: ['success', 'failed'] },
        paid_at:    { type: Date },
      },
    ],

    /* ------------------------------------------------------------
       AUDIT FIELDS
    ------------------------------------------------------------ */

    // IP address when subscription was created
    ip_address: {
      type:    String,
      default: null,
    },

    // Whether this subscription was created via webhook (true)
    // or via direct API call (false)
    created_via_webhook: {
      type:    Boolean,
      default: false,
    },

    // Raw Paystack subscription object (for debugging)
    paystack_raw_data: {
      type:   mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },

    // Internal notes
    notes: {
      type:    String,
      default: '',
      trim:    true,
    },
  },
  {
    timestamps:  true,
    collection:  'subscriptions',
    toJSON: {
      virtuals: true,
      transform: function(doc, ret) {
        delete ret.__v;
        delete ret.authorization_code;
        delete ret.email_token;
        delete ret.paystack_raw_data;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

/* ================================================================
   VIRTUAL FIELDS
================================================================ */

// Amount in NGN
SubscriptionSchema.virtual('amount_ngn').get(function () {
  return this.amount / 100;
});

// Total paid in NGN
SubscriptionSchema.virtual('total_paid_ngn').get(function () {
  return this.total_paid / 100;
});

// Is subscription active?
SubscriptionSchema.virtual('is_active').get(function () {
  return this.status === 'active';
});

// Needs attention?
SubscriptionSchema.virtual('needs_attention').get(function () {
  return this.status === 'attention';
});

// Human-readable status
SubscriptionSchema.virtual('status_display').get(function () {
  const map = {
    active:        '✅ Active',
    inactive:      '⭕ Inactive',
    attention:     '⚠️ Needs Attention',
    completed:     '🏁 Completed',
    cancelled:     '❌ Cancelled',
    'non-renewing': '🔔 Non-Renewing',
  };
  return map[this.status] || this.status;
});

// Days until next payment
SubscriptionSchema.virtual('days_until_next_payment').get(function () {
  if (!this.next_payment_date) return null;
  const diffMs = new Date(this.next_payment_date) - new Date();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
});

/* ================================================================
   INDEXES
================================================================ */
SubscriptionSchema.index({ customer_email: 1, status: 1 });
SubscriptionSchema.index({ plan_code: 1, status: 1 });
SubscriptionSchema.index({ next_payment_date: 1, status: 1 });
SubscriptionSchema.index({ subscription_code: 1, customer_email: 1 });

/* ================================================================
   STATIC METHODS
================================================================ */

/**
 * Find subscription by subscription code
 * @param {string} subscriptionCode
 * @returns {Promise<Subscription>}
 */
SubscriptionSchema.statics.findByCode = function (subscriptionCode) {
  return this.findOne({ subscription_code: subscriptionCode.trim() });
};

/**
 * Get all subscriptions for a donor
 * @param {string} email
 * @returns {Promise<Subscription[]>}
 */
SubscriptionSchema.statics.findByEmail = function (email) {
  return this.find({ customer_email: email.toLowerCase().trim() })
    .sort({ createdAt: -1 });
};

/**
 * Get count of active subscribers
 * @returns {Promise<number>}
 */
SubscriptionSchema.statics.getActiveCount = function () {
  return this.countDocuments({ status: 'active' });
};

/**
 * Get subscriptions due for renewal in the next N days
 * @param {number} days
 * @returns {Promise<Subscription[]>}
 */
SubscriptionSchema.statics.getDueForRenewal = function (days = 3) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return this.find({
    status:            'active',
    next_payment_date: { $lte: futureDate },
  }).sort({ next_payment_date: 1 });
};

/**
 * Get total monthly recurring revenue (in kobo)
 * @returns {Promise<number>}
 */
SubscriptionSchema.statics.getMonthlyRecurringRevenue = async function () {
  // Only count monthly subscriptions for simplicity
  const result = await this.aggregate([
    { $match: { status: 'active', interval: 'monthly' } },
    { $group: { _id: null, mrr: { $sum: '$amount' } } },
  ]);
  return result.length > 0 ? result[0].mrr : 0;
};

/* ================================================================
   INSTANCE METHODS
================================================================ */

/**
 * Record a successful payment on this subscription
 * @param {string} reference
 * @param {number} amountKobo
 * @param {Date} paidAt
 */
SubscriptionSchema.methods.recordSuccessfulPayment = async function (
  reference,
  amountKobo,
  paidAt = new Date()
) {
  this.successful_payments += 1;
  this.total_paid          += amountKobo;
  this.last_payment_date   = paidAt;
  this.status              = 'active';

  // Add to transaction history
  this.transaction_history.push({
    reference,
    amount:  amountKobo,
    status:  'success',
    paid_at: paidAt,
  });

  // Keep transaction history at max 50 entries
  if (this.transaction_history.length > 50) {
    this.transaction_history = this.transaction_history.slice(-50);
  }

  // Check if invoice limit reached
  if (this.invoice_limit && this.successful_payments >= this.invoice_limit) {
    this.status = 'completed';
  }

  return this.save();
};

/**
 * Record a failed payment attempt
 * @param {string} reference
 * @param {number} amountKobo
 */
SubscriptionSchema.methods.recordFailedPayment = async function (
  reference,
  amountKobo
) {
  this.failed_payments   += 1;
  this.last_failed_date  = new Date();
  this.status            = 'attention';

  this.transaction_history.push({
    reference,
    amount:  amountKobo,
    status:  'failed',
    paid_at: new Date(),
  });

  return this.save();
};

/**
 * Cancel this subscription
 */
SubscriptionSchema.methods.cancel = async function () {
  this.status       = 'cancelled';
  this.cancelled_at = new Date();
  return this.save();
};

/**
 * Disable this subscription (from Paystack webhook)
 */
SubscriptionSchema.methods.disable = async function () {
  this.status      = 'inactive';
  this.disabled_at = new Date();
  return this.save();
};

/**
 * Update next payment date
 * @param {Date|string} nextDate
 */
SubscriptionSchema.methods.updateNextPaymentDate = async function (nextDate) {
  this.next_payment_date = new Date(nextDate);
  return this.save();
};

/* ================================================================
   PRE-SAVE HOOK
================================================================ */
SubscriptionSchema.pre('save', function (next) {
  // Normalize email
  if (this.customer_email) {
    this.customer_email = this.customer_email.toLowerCase().trim();
  }

  // Set cancelled_at when status changes to cancelled
  if (this.isModified('status') && this.status === 'cancelled' && !this.cancelled_at) {
    this.cancelled_at = new Date();
  }

  next();
});

/* ================================================================
   POST-SAVE HOOK — Logging
================================================================ */
SubscriptionSchema.post('save', function (doc) {
  const logger = require('../middleware/logger');
  logger.info(`📋 Subscription saved: ${doc.subscription_code} | Status: ${doc.status} | Email: ${doc.customer_email}`);
});

/* ================================================================
   MODEL EXPORT
================================================================ */
const Subscription = mongoose.model('Subscription', SubscriptionSchema);
module.exports = Subscription;
