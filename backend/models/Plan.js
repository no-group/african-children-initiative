/* ================================================================
   PLAN MODEL
   Stores Paystack subscription plans
   Plans are created via Paystack API and stored locally
   for fast retrieval without hitting Paystack on every request
================================================================ */

'use strict';

const mongoose = require('mongoose');

/* ================================================================
   PLAN SCHEMA
================================================================ */
const PlanSchema = new mongoose.Schema(
  {
    /* ------------------------------------------------------------
       PLAN IDENTIFICATION
    ------------------------------------------------------------ */

    // Plan name (e.g. "Monthly Hero", "Seed Supporter")
    name: {
      type:      String,
      required:  [true, 'Plan name is required'],
      trim:      true,
      maxlength: [100, 'Plan name cannot exceed 100 characters'],
    },

    // Paystack plan code (e.g. PLN_xxxxxxxxx)
    // Set after plan is created via Paystack API
    plan_code: {
      type:    String,
      unique:  true,
      sparse:  true, // Allow multiple null values (before sync)
      trim:    true,
      index:   true,
    },

    // Paystack internal plan ID
    paystack_plan_id: {
      type:    Number,
      default: null,
    },

    /* ------------------------------------------------------------
       PRICING
    ------------------------------------------------------------ */

    // Amount in KOBO (e.g. 100000 = ₦1,000)
    amount: {
      type:     Number,
      required: [true, 'Plan amount is required'],
      min:      [100000, 'Minimum plan amount is ₦1,000 (100000 kobo)'],
    },

    // Currency
    currency: {
      type:    String,
      default: 'NGN',
      enum:    ['NGN', 'GHS', 'ZAR', 'USD', 'KES'],
    },

    /* ------------------------------------------------------------
       BILLING INTERVAL
    ------------------------------------------------------------ */

    // Billing frequency
    interval: {
      type:     String,
      required: [true, 'Plan interval is required'],
      enum:     {
        values:  ['daily', 'weekly', 'monthly', 'quarterly', 'biannually', 'annually'],
        message: 'Interval must be: daily, weekly, monthly, quarterly, biannually, or annually',
      },
      default: 'monthly',
    },

    // Number of billing cycles (null = ongoing/unlimited)
    invoice_limit: {
      type:    Number,
      default: null,
      min:     [1, 'Invoice limit must be at least 1'],
    },

    /* ------------------------------------------------------------
       PLAN DETAILS
    ------------------------------------------------------------ */

    // Short description of what this plan funds
    description: {
      type:      String,
      default:   '',
      trim:      true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },

    // Impact statement (what this donation achieves)
    impact_statement: {
      type:      String,
      default:   '',
      trim:      true,
      maxlength: [200, 'Impact statement cannot exceed 200 characters'],
    },

    // Icon class for display (Font Awesome class)
    icon: {
      type:    String,
      default: 'fa-heart',
      trim:    true,
    },

    // Display color (hex or CSS class name)
    color: {
      type:    String,
      default: '#f97316',
      trim:    true,
    },

    // Whether this plan is featured/highlighted in the UI
    featured: {
      type:    Boolean,
      default: false,
    },

    /* ------------------------------------------------------------
       STATUS & SYNC
    ------------------------------------------------------------ */

    // Whether plan is active and shown to donors
    active: {
      type:    Boolean,
      default: true,
      index:   true,
    },

    // Whether plan has been successfully synced to Paystack
    synced_to_paystack: {
      type:    Boolean,
      default: false,
    },

    // Last time this plan was synced with Paystack
    last_synced_at: {
      type:    Date,
      default: null,
    },

    // Send invoice emails to subscribers
    send_invoices: {
      type:    Boolean,
      default: true,
    },

    // Send SMS notifications to subscribers
    send_sms: {
      type:    Boolean,
      default: false,
    },

    /* ------------------------------------------------------------
       STATISTICS (updated by webhook events)
    ------------------------------------------------------------ */

    // Total number of active subscribers on this plan
    subscriber_count: {
      type:    Number,
      default: 0,
      min:     0,
    },

    // Total amount collected on this plan (in kobo)
    total_collected: {
      type:    Number,
      default: 0,
      min:     0,
    },

    // Display order in UI (lower = shown first)
    display_order: {
      type:    Number,
      default: 0,
    },
  },
  {
    timestamps:  true,
    collection:  'plans',
    toJSON: {
      virtuals: true,
      transform: function(doc, ret) {
        delete ret.__v;
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
PlanSchema.virtual('amount_ngn').get(function () {
  return this.amount / 100;
});

// Formatted amount string
PlanSchema.virtual('amount_display').get(function () {
  return new Intl.NumberFormat('en-NG', {
    style:    'currency',
    currency: 'NGN',
  }).format(this.amount / 100);
});

// Human-readable interval
PlanSchema.virtual('interval_display').get(function () {
  const map = {
    daily:       'Daily',
    weekly:      'Weekly',
    monthly:     'Monthly',
    quarterly:   'Every 3 Months',
    biannually:  'Twice a Year',
    annually:    'Annually',
  };
  return map[this.interval] || this.interval;
});

// Total collected in NGN
PlanSchema.virtual('total_collected_ngn').get(function () {
  return this.total_collected / 100;
});

// Is this a limited plan?
PlanSchema.virtual('is_limited').get(function () {
  return this.invoice_limit !== null && this.invoice_limit > 0;
});

/* ================================================================
   INDEXES
================================================================ */
PlanSchema.index({ active: 1, display_order: 1 });
PlanSchema.index({ interval: 1, active: 1 });

/* ================================================================
   STATIC METHODS
================================================================ */

/**
 * Get all active plans sorted by display order
 * @returns {Promise<Plan[]>}
 */
PlanSchema.statics.getActivePlans = function () {
  return this.find({ active: true })
    .sort({ display_order: 1, amount: 1 })
    .select('-__v');
};

/**
 * Find plan by Paystack plan code
 * @param {string} planCode
 * @returns {Promise<Plan>}
 */
PlanSchema.statics.findByPlanCode = function (planCode) {
  return this.findOne({ plan_code: planCode.trim() });
};

/**
 * Seed default plans if none exist
 * Called on server startup
 * ✅ FILL IN: Customize plan amounts/names to match your Paystack dashboard
 */
PlanSchema.statics.seedDefaultPlans = async function () {
  const count = await this.countDocuments();
  if (count > 0) {
    return; // Plans already exist
  }

  const defaultPlans = [
    {
      name:              'Seed Supporter',
      amount:            100000,      // ₦1,000 in kobo
      interval:          'monthly',
      description:       'Feed a child for a week every month',
      impact_statement:  'Your ₦1,000/month feeds a child for 7 days',
      icon:              'fa-seedling',
      color:             '#10b981',
      display_order:     1,
      featured:          false,
      send_invoices:     true,
    },
    {
      name:              'Growth Champion',
      amount:            250000,      // ₦2,500 in kobo
      interval:          'monthly',
      description:       'Provide school supplies to a child monthly',
      impact_statement:  'Your ₦2,500/month buys a full stationery kit',
      icon:              'fa-book-open',
      color:             '#3b82f6',
      display_order:     2,
      featured:          false,
      send_invoices:     true,
    },
    {
      name:              'Hope Builder',
      amount:            500000,      // ₦5,000 in kobo
      interval:          'monthly',
      description:       'Full monthly food pack for one child',
      impact_statement:  'Your ₦5,000/month provides complete nutrition',
      icon:              'fa-heart',
      color:             '#f97316',
      display_order:     3,
      featured:          true,       // Highlighted as popular
      send_invoices:     true,
    },
    {
      name:              'Future Maker',
      amount:            1000000,     // ₦10,000 in kobo
      interval:          'monthly',
      description:       'Sponsor a child\'s full term school fees monthly',
      impact_statement:  'Your ₦10,000/month pays for a child\'s education',
      icon:              'fa-graduation-cap',
      color:             '#8b5cf6',
      display_order:     4,
      featured:          false,
      send_invoices:     true,
    },
  ];

  try {
    await this.insertMany(defaultPlans);
    const logger = require('../middleware/logger');
    logger.info(`✅ Seeded ${defaultPlans.length} default donation plans`);
  } catch (err) {
    const logger = require('../middleware/logger');
    logger.warn('⚠️  Could not seed default plans:', err.message);
  }
};

/* ================================================================
   INSTANCE METHODS
================================================================ */

/**
 * Update subscriber count and total collected
 * Called when webhook confirms a subscription payment
 * @param {number} amountKobo
 */
PlanSchema.methods.recordPayment = async function (amountKobo) {
  this.total_collected += amountKobo;
  return this.save();
};

/**
 * Increment subscriber count
 */
PlanSchema.methods.addSubscriber = async function () {
  this.subscriber_count += 1;
  return this.save();
};

/**
 * Decrement subscriber count
 */
PlanSchema.methods.removeSubscriber = async function () {
  if (this.subscriber_count > 0) {
    this.subscriber_count -= 1;
  }
  return this.save();
};

/* ================================================================
   PRE-SAVE HOOK
================================================================ */
PlanSchema.pre('save', function (next) {
  // Auto-set last_synced_at when plan_code is set
  if (this.isModified('plan_code') && this.plan_code) {
    this.synced_to_paystack = true;
    this.last_synced_at = new Date();
  }
  next();
});

/* ================================================================
   MODEL EXPORT
================================================================ */
const Plan = mongoose.model('Plan', PlanSchema);
module.exports = Plan;
