/* ================================================================
   AFRICAN CHILDREN INITIATIVE — FRONTEND APPLICATION
   Version: 2.0 | 2026 Standards
   
   ✅ FILL IN REQUIRED:
   - Line ~30: PAYSTACK_PUBLIC_KEY — your Paystack public key
   - Line ~31: API_BASE_URL — your backend URL when deployed
================================================================ */

'use strict';

/* ================================================================
   1. CONFIGURATION
================================================================ */
const CONFIG = {
  // ✅ FILL IN: Replace with your actual Paystack PUBLIC key
  // TEST key starts with: pk_test_xxxxxxxxxxxx
  // LIVE key starts with: pk_live_xxxxxxxxxxxx
  PAYSTACK_PUBLIC_KEY: 'pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',

  // ✅ FILL IN: Your backend API base URL
  // Local development: 'http://localhost:5000'
  // Production (Render): 'https://your-app-name.onrender.com'
  // Production (Railway): 'https://your-app-name.up.railway.app'
  API_BASE_URL: 'http://localhost:5000',

  // Polling configuration
  POLL_INTERVAL_MS: 4000,
  MAX_POLL_ATTEMPTS: 10,

  // Minimum donation amount in NGN
  MIN_AMOUNT_ONETIME: 500,
  MIN_AMOUNT_SUBSCRIPTION: 1000,

  // Organization name
  ORG_NAME: 'African Children Initiative',

  // Currency
  CURRENCY: 'NGN',
};

/* ================================================================
   2. APPLICATION STATE
================================================================ */
const STATE = {
  currentMode: 'one-time',       // 'one-time' | 'subscription'
  selectedAmount: 5000,           // in NGN
  selectedPlanCode: null,         // Paystack plan code
  selectedPlanData: null,         // Full plan object
  currentReference: null,         // Active payment reference
  pollTimer: null,                // Polling interval
  pollCount: 0,                   // Number of poll attempts
  isProcessing: false,            // Prevent double submissions
  plans: [],                      // Fetched subscription plans
  donorEmail: '',
  donorName: '',
  donorMessage: '',
};

/* ================================================================
   3. DOM ELEMENT REFERENCES
================================================================ */
const DOM = {
  // Navigation
  navbar:           () => document.getElementById('navbar'),
  hamburger:        () => document.getElementById('hamburger'),
  navLinks:         () => document.getElementById('navLinks'),

  // Hero stats
  statNumbers:      () => document.querySelectorAll('.stat-number'),
  impactNumbers:    () => document.querySelectorAll('.impact-number'),

  // Mode Toggle
  oneTimeBtn:       () => document.getElementById('oneTimeBtn'),
  recurringBtn:     () => document.getElementById('recurringBtn'),

  // Banners & Sections
  recurringBanner:  () => document.getElementById('recurringBanner'),
  presetSection:    () => document.getElementById('presetSection'),
  plansSection:     () => document.getElementById('plansSection'),
  plansGrid:        () => document.getElementById('plansGrid'),
  amountGroup:      () => document.getElementById('amountGroup'),
  recurringConsent: () => document.getElementById('recurringConsent'),

  // Form Elements
  donationForm:     () => document.getElementById('donationForm'),
  donationAmount:   () => document.getElementById('donationAmount'),
  donorEmail:       () => document.getElementById('donorEmail'),
  donorName:        () => document.getElementById('donorName'),
  donorMessage:     () => document.getElementById('donorMessage'),
  consentCheck:     () => document.getElementById('consentCheck'),
  charCount:        () => document.getElementById('charCount'),

  // Preset Buttons
  presetBtns:       () => document.querySelectorAll('.preset-btn'),

  // Validation
  amountError:      () => document.getElementById('amountError'),
  emailError:       () => document.getElementById('emailError'),
  emailValidIcon:   () => document.getElementById('emailValidIcon'),
  amountHint:       () => document.getElementById('amountHint'),
  consentError:     () => document.getElementById('consentError'),

  // Summary
  summaryAmount:    () => document.getElementById('summaryAmount'),
  summaryImpact:    () => document.getElementById('summaryImpact'),

  // Donate Button
  donateBtn:        () => document.getElementById('donateBtn'),
  btnContent:       () => document.getElementById('btnContent'),
  btnText:          () => document.getElementById('btnText'),
  btnLoader:        () => document.getElementById('btnLoader'),

  // Card States
  formState:        () => document.getElementById('formState'),
  processingState:  () => document.getElementById('processingState'),
  successState:     () => document.getElementById('successState'),
  failedState:      () => document.getElementById('failedState'),

  // Processing State
  pollCount:        () => document.getElementById('pollCount'),
  pollingStatus:    () => document.getElementById('pollingStatus'),

  // Success State
  successTitle:     () => document.getElementById('successTitle'),
  successMessage:   () => document.getElementById('successMessage'),
  successRef:       () => document.getElementById('successRef'),
  successAmount:    () => document.getElementById('successAmount'),
  successEmail:     () => document.getElementById('successEmail'),
  successPlanRow:   () => document.getElementById('successPlanRow'),
  successPlan:      () => document.getElementById('successPlan'),
  successNextRow:   () => document.getElementById('successNextRow'),
  successNext:      () => document.getElementById('successNext'),
  impactMessage:    () => document.getElementById('impactMessage'),
  impactText:       () => document.getElementById('impactText'),

  // Share Buttons
  shareTwitter:     () => document.getElementById('shareTwitter'),
  shareWhatsapp:    () => document.getElementById('shareWhatsapp'),
  shareFacebook:    () => document.getElementById('shareFacebook'),

  // Failed State
  failedMessage:    () => document.getElementById('failedMessage'),
  retryBtn:         () => document.getElementById('retryBtn'),
  changePmBtn:      () => document.getElementById('changePmBtn'),

  // Done/Again Button
  donateAgainBtn:   () => document.getElementById('donateAgainBtn'),

  // Side Panel
  calcAmount:       () => document.getElementById('calcAmount'),
  impactList:       () => document.getElementById('impactList'),

  // Scroll / UI
  backToTop:        () => document.getElementById('backToTop'),
  toastContainer:   () => document.getElementById('toastContainer'),
  cookieBanner:     () => document.getElementById('cookieBanner'),
  cookieAccept:     () => document.getElementById('cookieAccept'),
  cookieDecline:    () => document.getElementById('cookieDecline'),
  footerYear:       () => document.getElementById('footerYear'),

  // Stories Slider
  storiesTrack:     () => document.getElementById('storiesTrack'),
  prevStory:        () => document.getElementById('prevStory'),
  nextStory:        () => document.getElementById('nextStory'),
  sliderDots:       () => document.querySelectorAll('.dot'),

  // Progress Bars
  progressFills:    () => document.querySelectorAll('.progress-fill'),
  breakdownFills:   () => document.querySelectorAll('.breakdown-fill'),

  // Hero Particles
  heroParticles:    () => document.getElementById('heroParticles'),

  // Hero slide
  heroSlides:       () => document.querySelectorAll('.hero-slide'),
};

/* ================================================================
   4. UTILITY FUNCTIONS
================================================================ */

/**
 * Format number as Nigerian Naira currency string
 * @param {number} amount - Amount in NGN
 * @returns {string} Formatted string e.g. "₦5,000.00"
 */
function formatNGN(amount) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format large numbers with commas and optional suffix
 * @param {number} num
 * @returns {string}
 */
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M+';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'K+';
  }
  return num.toLocaleString() + '+';
}

/**
 * Generate a unique payment reference
 * Format: ACI-{timestamp}-{random5chars}
 * @returns {string}
 */
function generateReference() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `ACI-${timestamp}-${random}`;
}

/**
 * Validate email address format
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim());
}

/**
 * Convert NGN amount to kobo (smallest Paystack unit)
 * @param {number} amountNGN
 * @returns {number}
 */
function toKobo(amountNGN) {
  return Math.round(amountNGN * 100);
}

/**
 * Convert kobo to NGN
 * @param {number} kobo
 * @returns {number}
 */
function fromKobo(kobo) {
  return kobo / 100;
}

/**
 * Capitalize first letter of a string
 * @param {string} str
 * @returns {string}
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Format interval for display
 * @param {string} interval - daily|weekly|monthly|quarterly|annually
 * @returns {string}
 */
function formatInterval(interval) {
  const map = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Every 3 Months',
    annually: 'Annually (Yearly)',
    biannually: 'Twice a Year',
  };
  return map[interval] || capitalize(interval);
}

/**
 * Calculate next billing date from interval
 * @param {string} interval
 * @returns {string} Formatted date string
 */
function getNextBillingDate(interval) {
  const now = new Date();
  switch (interval) {
    case 'daily':     now.setDate(now.getDate() + 1); break;
    case 'weekly':    now.setDate(now.getDate() + 7); break;
    case 'monthly':   now.setMonth(now.getMonth() + 1); break;
    case 'quarterly': now.setMonth(now.getMonth() + 3); break;
    case 'annually':  now.setFullYear(now.getFullYear() + 1); break;
    default:          now.setMonth(now.getMonth() + 1); break;
  }
  return now.toLocaleDateString('en-NG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Sanitize user input to prevent XSS
 * @param {string} str
 * @returns {string}
 */
function sanitize(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/**
 * Get impact description based on amount
 * @param {number} amount - NGN
 * @returns {object} { summary, items }
 */
function getImpactData(amount) {
  if (amount >= 50000) {
    return {
      summary: `Your donation can fund a full scholarship for one child!`,
      items: [
        { icon: 'fa-graduation-cap', text: `Pays for <strong>1 full scholarship</strong>` },
        { icon: 'fa-utensils', text: `Feeds <strong>${Math.floor(amount / 500)} children</strong> for a day` },
        { icon: 'fa-book', text: `Provides <strong>${Math.floor(amount / 1000)} full book sets</strong>` },
      ],
    };
  }
  if (amount >= 10000) {
    return {
      summary: `Your donation sponsors a child's full school term!`,
      items: [
        { icon: 'fa-school', text: `Sponsors <strong>1 term</strong> of school fees` },
        { icon: 'fa-utensils', text: `Feeds <strong>${Math.floor(amount / 500)} children</strong> for a day` },
        { icon: 'fa-pills', text: `Buys <strong>${Math.floor(amount / 2500)} malaria treatment kits</strong>` },
      ],
    };
  }
  if (amount >= 5000) {
    return {
      summary: `Your donation provides a monthly food pack for 1 child!`,
      items: [
        { icon: 'fa-utensils', text: `Feeds <strong>${Math.floor(amount / 500)} children</strong> for a day` },
        { icon: 'fa-book', text: `Provides <strong>${Math.floor(amount / 1000)} exercise book sets</strong>` },
        { icon: 'fa-pills', text: `Buys <strong>${Math.floor(amount / 2500)} malaria kits</strong>` },
      ],
    };
  }
  if (amount >= 2500) {
    return {
      summary: `Your donation buys school supplies for a child!`,
      items: [
        { icon: 'fa-pencil', text: `Provides <strong>a full stationery kit</strong>` },
        { icon: 'fa-utensils', text: `Feeds <strong>${Math.floor(amount / 500)} children</strong> for a day` },
        { icon: 'fa-tshirt', text: `Contributes to <strong>a school uniform</strong>` },
      ],
    };
  }
  return {
    summary: `Every ₦500 provides a meal for a child — thank you!`,
    items: [
      { icon: 'fa-utensils', text: `Feeds <strong>${Math.floor(amount / 500)} child${amount >= 1000 ? 'ren' : ''}</strong> for a day` },
      { icon: 'fa-pencil', text: `Buys <strong>${Math.floor(amount / 200)} pencils</strong> for students` },
      { icon: 'fa-heart', text: `Makes a <strong>real difference</strong> in Africa` },
    ],
  };
}

/* ================================================================
   5. TOAST NOTIFICATION SYSTEM
================================================================ */

/**
 * Show a toast notification
 * @param {object} options
 * @param {string} options.type - 'success' | 'error' | 'info' | 'warning'
 * @param {string} options.title
 * @param {string} options.message
 * @param {number} [options.duration=5000] - Auto-dismiss duration in ms
 */
function showToast({ type = 'info', title, message, duration = 5000 }) {
  const container = DOM.toastContainer();
  if (!container) return;

  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    info: 'fa-circle-info',
    warning: 'fa-triangle-exclamation',
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon"><i class="fas ${icons[type] || icons.info}"></i></div>
    <div class="toast-body">
      <div class="toast-title">${sanitize(title)}</div>
      ${message ? `<div class="toast-msg">${sanitize(message)}</div>` : ''}
    </div>
    <button class="toast-close" aria-label="Close notification">
      <i class="fas fa-xmark"></i>
    </button>
  `;

  // Close button handler
  toast.querySelector('.toast-close').addEventListener('click', () => {
    dismissToast(toast);
  });

  container.appendChild(toast);

  // Auto-dismiss
  if (duration > 0) {
    setTimeout(() => dismissToast(toast), duration);
  }

  return toast;
}

/**
 * Dismiss a toast with animation
 * @param {HTMLElement} toast
 */
function dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('removing');
  toast.addEventListener('animationend', () => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  });
}

/* ================================================================
   6. CARD STATE MANAGEMENT
================================================================ */

/**
 * Show a specific state panel in the donation card
 * @param {'form'|'processing'|'success'|'failed'} stateName
 */
function showState(stateName) {
  const states = {
    form:       DOM.formState(),
    processing: DOM.processingState(),
    success:    DOM.successState(),
    failed:     DOM.failedState(),
  };

  Object.entries(states).forEach(([name, el]) => {
    if (!el) return;
    if (name === stateName) {
      el.style.display = 'flex';
      el.style.flexDirection = 'column';
      // Smooth scroll to donation card
      el.closest('.donation-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      el.style.display = 'none';
    }
  });
}

/* ================================================================
   7. MODE TOGGLE LOGIC
================================================================ */

/**
 * Handle toggle between One-Time and Subscription modes
 * @param {'one-time'|'subscription'} mode
 */
function switchMode(mode) {
  STATE.currentMode = mode;

  const oneTimeBtn  = DOM.oneTimeBtn();
  const recurringBtn = DOM.recurringBtn();
  const recurringBanner = DOM.recurringBanner();
  const presetSection = DOM.presetSection();
  const plansSection = DOM.plansSection();
  const amountGroup = DOM.amountGroup();
  const recurringConsent = DOM.recurringConsent();

  if (mode === 'one-time') {
    // Update button styles
    oneTimeBtn?.classList.add('active');
    recurringBtn?.classList.remove('active');

    // Show/hide sections
    if (recurringBanner) recurringBanner.style.display = 'none';
    if (presetSection)   presetSection.style.display = 'block';
    if (plansSection)    plansSection.style.display = 'none';
    if (amountGroup)     amountGroup.style.display = 'block';
    if (recurringConsent) recurringConsent.style.display = 'none';

    // Update hint
    const hint = DOM.amountHint();
    if (hint) hint.textContent = `Minimum donation: ${formatNGN(CONFIG.MIN_AMOUNT_ONETIME)}`;

    // Update button text
    updateDonateButton();

    // Reset plan selection
    STATE.selectedPlanCode = null;
    STATE.selectedPlanData = null;

  } else {
    // Subscription Mode
    oneTimeBtn?.classList.remove('active');
    recurringBtn?.classList.add('active');

    // Show/hide sections
    if (recurringBanner) recurringBanner.style.display = 'flex';
    if (presetSection)   presetSection.style.display = 'none';
    if (plansSection)    plansSection.style.display = 'block';
    if (amountGroup)     amountGroup.style.display = 'none';
    if (recurringConsent) recurringConsent.style.display = 'block';

    // Fetch plans if not already loaded
    if (STATE.plans.length === 0) {
      fetchPlans();
    }

    // Update button
    updateDonateButton();
  }

  // Clear validation errors
  clearAllErrors();
}

/* ================================================================
   8. PLANS FETCHING & RENDERING
================================================================ */

/**
 * Fetch available subscription plans from backend
 */
async function fetchPlans() {
  const grid = DOM.plansGrid();
  if (!grid) return;

  // Show loading
  grid.innerHTML = `
    <div class="plans-loading">
      <div class="spinner"></div>
      <span>Loading plans...</span>
    </div>
  `;

  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/plans`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    const data = await response.json();

    if (!data.plans || data.plans.length === 0) {
      // Render fallback hardcoded plans if backend has none
      renderFallbackPlans();
      return;
    }

    STATE.plans = data.plans;
    renderPlans(STATE.plans);

  } catch (error) {
    console.error('Failed to fetch plans:', error);
    // Use fallback plans so UI doesn't break
    renderFallbackPlans();
  }
}

/**
 * Fallback hardcoded plans (shown if backend is unavailable)
 * These match what you'll create in your Paystack dashboard
 * ✅ FILL IN: Replace plan_codes with your actual Paystack plan codes
 */
function renderFallbackPlans() {
  const fallbackPlans = [
    {
      plan_code: 'PLN_xxxxxxxxxx1', // ✅ FILL IN: Your Paystack plan code
      name: 'Seed Supporter',
      amount: 100000,               // in kobo = ₦1,000
      interval: 'monthly',
      description: 'Feed a child for a week every month',
    },
    {
      plan_code: 'PLN_xxxxxxxxxx2', // ✅ FILL IN: Your Paystack plan code
      name: 'Growth Champion',
      amount: 250000,               // in kobo = ₦2,500
      interval: 'monthly',
      description: 'Provide school supplies to a child monthly',
    },
    {
      plan_code: 'PLN_xxxxxxxxxx3', // ✅ FILL IN: Your Paystack plan code
      name: 'Hope Builder',
      amount: 500000,               // in kobo = ₦5,000
      interval: 'monthly',
      description: 'Full monthly food pack for one child',
    },
    {
      plan_code: 'PLN_xxxxxxxxxx4', // ✅ FILL IN: Your Paystack plan code
      name: 'Future Maker',
      amount: 1000000,              // in kobo = ₦10,000
      interval: 'monthly',
      description: 'Sponsor a term of school fees monthly',
    },
  ];

  STATE.plans = fallbackPlans;
  renderPlans(fallbackPlans);

  showToast({
    type: 'info',
    title: 'Plans Loaded',
    message: 'Showing available monthly giving plans.',
    duration: 4000,
  });
}

/**
 * Render plan cards in the plans grid
 * @param {Array} plans
 */
function renderPlans(plans) {
  const grid = DOM.plansGrid();
  if (!grid) return;

  grid.innerHTML = plans.map((plan) => {
    const amountNGN = fromKobo(plan.amount);
    return `
      <div 
        class="plan-card" 
        data-plan-code="${sanitize(plan.plan_code)}"
        data-plan-amount="${plan.amount}"
        data-plan-interval="${sanitize(plan.interval)}"
        data-plan-name="${sanitize(plan.name)}"
        role="button"
        tabindex="0"
        aria-label="Select ${plan.name} plan at ${formatNGN(amountNGN)} ${plan.interval}"
      >
        <div class="plan-amount">${formatNGN(amountNGN)}</div>
        <div class="plan-interval">/ ${formatInterval(plan.interval)}</div>
        <div class="plan-name">${sanitize(plan.name)}</div>
        <div class="plan-description">${sanitize(plan.description || '')}</div>
      </div>
    `;
  }).join('');

  // Attach click events to plan cards
  grid.querySelectorAll('.plan-card').forEach((card) => {
    card.addEventListener('click', () => selectPlan(card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectPlan(card);
      }
    });
  });

  // Auto-select first plan
  const firstCard = grid.querySelector('.plan-card');
  if (firstCard) selectPlan(firstCard);
}

/**
 * Handle plan card selection
 * @param {HTMLElement} card
 */
function selectPlan(card) {
  // Deselect all
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));

  // Select this card
  card.classList.add('selected');

  // Update state
  STATE.selectedPlanCode   = card.dataset.planCode;
  STATE.selectedPlanData   = {
    plan_code: card.dataset.planCode,
    amount:    parseInt(card.dataset.planAmount),
    interval:  card.dataset.planInterval,
    name:      card.dataset.planName,
  };

  const amountNGN = fromKobo(parseInt(card.dataset.planAmount));
  STATE.selectedAmount = amountNGN;

  // Update summary and button
  updateDonationSummary(amountNGN);
  updateDonateButton();
  updateImpactCalculator(amountNGN);

  // Update hint
  const hint = DOM.amountHint();
  if (hint) {
    hint.textContent = `Charged ${formatInterval(card.dataset.planInterval).toLowerCase()} — cancel anytime`;
  }
}

/* ================================================================
   9. PRESET AMOUNT BUTTONS
================================================================ */

/**
 * Initialize preset amount buttons
 */
function initPresetButtons() {
  DOM.presetBtns().forEach((btn) => {
    btn.addEventListener('click', () => {
      const amount = parseInt(btn.dataset.amount);

      // Deselect all presets
      DOM.presetBtns().forEach(b => b.classList.remove('active'));

      if (amount === 0) {
        // Custom amount — focus the input
        btn.classList.add('active');
        const input = DOM.donationAmount();
        if (input) {
          input.value = '';
          input.focus();
          STATE.selectedAmount = 0;
        }
      } else {
        // Set preset amount
        btn.classList.add('active');
        const input = DOM.donationAmount();
        if (input) input.value = amount;
        STATE.selectedAmount = amount;
        updateDonationSummary(amount);
        updateDonateButton();
        updateImpactCalculator(amount);
      }
    });
  });
}

/* ================================================================
   10. DONATION SUMMARY & BUTTON UPDATES
================================================================ */

/**
 * Update the donation summary card
 * @param {number} amountNGN
 */
function updateDonationSummary(amountNGN) {
  const summaryAmount = DOM.summaryAmount();
  const summaryImpact = DOM.summaryImpact();

  if (summaryAmount) {
    summaryAmount.textContent = formatNGN(amountNGN || 0);
  }

  if (summaryImpact) {
    const impact = getImpactData(amountNGN);
    summaryImpact.textContent = impact.summary;
  }
}

/**
 * Update donate button text based on mode and amount
 */
function updateDonateButton() {
  const btnText = DOM.btnText();
  if (!btnText) return;

  if (STATE.currentMode === 'one-time') {
    const amount = STATE.selectedAmount || 0;
    btnText.textContent = amount > 0
      ? `Donate ${formatNGN(amount)} Now`
      : 'Donate Now';
  } else {
    if (STATE.selectedPlanData) {
      const amount = fromKobo(STATE.selectedPlanData.amount);
      btnText.textContent = `Give ${formatNGN(amount)} / Month`;
    } else {
      btnText.textContent = 'Subscribe Now';
    }
  }
}

/**
 * Update the impact calculator in the side panel
 * @param {number} amountNGN
 */
function updateImpactCalculator(amountNGN) {
  const calcAmount = DOM.calcAmount();
  const impactList = DOM.impactList();

  if (calcAmount) {
    calcAmount.textContent = formatNGN(amountNGN);
  }

  if (impactList) {
    const data = getImpactData(amountNGN);
    impactList.innerHTML = data.items.map(item => `
      <li>
        <i class="fas ${item.icon}"></i>
        ${item.text}
      </li>
    `).join('');
  }
}

/* ================================================================
   11. FORM VALIDATION
================================================================ */

/**
 * Validate the full donation form
 * @returns {boolean} isValid
 */
function validateForm() {
  let isValid = true;

  clearAllErrors();

  // 1. Validate Amount (One-Time mode)
  if (STATE.currentMode === 'one-time') {
    const amountVal = parseFloat(DOM.donationAmount()?.value || '0');

    if (!amountVal || isNaN(amountVal)) {
      showError('amountError', 'Please enter a donation amount.');
      isValid = false;
    } else if (amountVal < CONFIG.MIN_AMOUNT_ONETIME) {
      showError('amountError', `Minimum donation is ${formatNGN(CONFIG.MIN_AMOUNT_ONETIME)}.`);
      isValid = false;
    } else if (amountVal > 10000000) {
      showError('amountError', 'Maximum single donation is ₦10,000,000. Please contact us for larger gifts.');
      isValid = false;
    } else {
      STATE.selectedAmount = amountVal;
    }
  }

  // 2. Validate Plan (Subscription mode)
  if (STATE.currentMode === 'subscription') {
    if (!STATE.selectedPlanCode) {
      showToast({
        type: 'warning',
        title: 'No Plan Selected',
        message: 'Please select a monthly giving plan before proceeding.',
      });
      isValid = false;
    }
  }

  // 3. Validate Email
  const emailVal = DOM.donorEmail()?.value?.trim() || '';
  if (!emailVal) {
    showError('emailError', 'Email address is required to send your receipt.');
    isValid = false;
  } else if (!isValidEmail(emailVal)) {
    showError('emailError', 'Please enter a valid email address.');
    isValid = false;
  } else {
    STATE.donorEmail = emailVal;
  }

  // 4. Validate Consent (Subscription mode only)
  if (STATE.currentMode === 'subscription') {
    const consentChecked = DOM.consentCheck()?.checked;
    if (!consentChecked) {
      showError('consentError', 'Please check the box to authorize recurring charges.');
      isValid = false;
    }
  }

  return isValid;
}

/**
 * Show a field-level error message
 * @param {string} errorId - DOM id of error element
 * @param {string} message
 */
function showError(errorId, message) {
  const el = document.getElementById(errorId);
  if (el) {
    el.innerHTML = `<i class="fas fa-circle-exclamation"></i> ${message}`;
    el.style.display = 'flex';
  }
}

/**
 * Clear all validation error messages
 */
function clearAllErrors() {
  ['amountError', 'emailError', 'consentError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = '';
      el.style.display = 'none';
    }
  });

  // Remove invalid classes
  DOM.donationAmount()?.classList.remove('invalid', 'valid');
  DOM.donorEmail()?.classList.remove('invalid', 'valid');
}

/* ================================================================
   12. REAL-TIME INPUT VALIDATION
================================================================ */

/**
 * Attach real-time validation listeners to form inputs
 */
function initRealTimeValidation() {
  // Email validation
  const emailInput = DOM.donorEmail();
  const emailValidIcon = DOM.emailValidIcon();

  if (emailInput) {
    emailInput.addEventListener('input', () => {
      const val = emailInput.value.trim();
      const errorEl = DOM.emailError();

      if (val.length === 0) {
        emailInput.classList.remove('valid', 'invalid');
        if (emailValidIcon) emailValidIcon.innerHTML = '';
        if (errorEl) { errorEl.textContent = ''; errorEl.style.display = 'none'; }
        return;
      }

      if (isValidEmail(val)) {
        emailInput.classList.add('valid');
        emailInput.classList.remove('invalid');
        if (emailValidIcon) {
          emailValidIcon.innerHTML = '<i class="fas fa-circle-check" style="color: #10b981;"></i>';
        }
        if (errorEl) { errorEl.textContent = ''; errorEl.style.display = 'none'; }
      } else {
        emailInput.classList.add('invalid');
        emailInput.classList.remove('valid');
        if (emailValidIcon) {
          emailValidIcon.innerHTML = '<i class="fas fa-circle-xmark" style="color: #ef4444;"></i>';
        }
      }
    });
  }

  // Amount input — live update of summary and button
  const amountInput = DOM.donationAmount();
  if (amountInput) {
    amountInput.addEventListener('input', () => {
      const val = parseFloat(amountInput.value) || 0;
      STATE.selectedAmount = val;
      updateDonationSummary(val);
      updateDonateButton();
      updateImpactCalculator(val);

      // Deselect presets if typing custom
      DOM.presetBtns().forEach(b => {
        const btnAmt = parseInt(b.dataset.amount);
        if (btnAmt !== val) b.classList.remove('active');
        else b.classList.add('active');
      });

      // Clear error on input
      const errorEl = DOM.amountError();
      if (errorEl && val >= CONFIG.MIN_AMOUNT_ONETIME) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
        amountInput.classList.remove('invalid');
      }
    });
  }

  // Textarea character count
  const messageInput = DOM.donorMessage();
  const charCountEl = DOM.charCount();
  if (messageInput && charCountEl) {
    messageInput.addEventListener('input', () => {
      const len = messageInput.value.length;
      charCountEl.textContent = len;
      if (len > 180) charCountEl.style.color = '#f59e0b';
      else if (len > 195) charCountEl.style.color = '#ef4444';
      else charCountEl.style.color = '';
    });
  }
}

/* ================================================================
   13. PAYSTACK PAYMENT INITIALIZATION
================================================================ */

/**
 * Initialize and launch Paystack payment popup
 */
async function initPaystackPayment() {
  if (STATE.isProcessing) {
    showToast({ type: 'warning', title: 'Already Processing', message: 'Your payment is being processed.' });
    return;
  }

  // Validate form first
  if (!validateForm()) return;

  STATE.isProcessing = true;
  STATE.donorEmail   = DOM.donorEmail()?.value?.trim() || '';
  STATE.donorName    = DOM.donorName()?.value?.trim()  || '';
  STATE.donorMessage = DOM.donorMessage()?.value?.trim() || '';

  // Show button loading state
  setButtonLoading(true);

  try {
    // Generate unique reference
    const reference = generateReference();
    STATE.currentReference = reference;

    // Prepare payload for backend
    const payload = {
      email:     STATE.donorEmail,
      amount:    STATE.currentMode === 'one-time'
                   ? toKobo(STATE.selectedAmount)
                   : STATE.selectedPlanData?.amount,
      mode:      STATE.currentMode,
      plan_code: STATE.currentMode === 'subscription'
                   ? STATE.selectedPlanCode
                   : undefined,
      reference: reference,
      metadata: {
        name:       STATE.donorName,
        message:    STATE.donorMessage,
        custom_fields: [
          {
            display_name: 'Donor Name',
            variable_name: 'donor_name',
            value: STATE.donorName || 'Anonymous',
          },
          {
            display_name: 'Donation Type',
            variable_name: 'donation_type',
            value: STATE.currentMode === 'one-time' ? 'One-Time Gift' : 'Monthly Recurring',
          },
          {
            display_name: 'Dedication Message',
            variable_name: 'message',
            value: STATE.donorMessage || 'N/A',
          },
          {
            display_name: 'Platform',
            variable_name: 'platform',
            value: 'ACI Web Fundraiser',
          },
        ],
      },
    };

    // Initialize transaction on backend
    const initResponse = await fetch(`${CONFIG.API_BASE_URL}/api/initialize-transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!initResponse.ok) {
      const errData = await initResponse.json().catch(() => ({}));
      throw new Error(errData.message || `Server error: ${initResponse.status}`);
    }

    const initData = await initResponse.json();

    // Reset button — Paystack popup will handle UI
    setButtonLoading(false);

    // Launch Paystack inline popup
    launchPaystackPopup({
      reference:   initData.reference || reference,
      email:       STATE.donorEmail,
      amount:      payload.amount,
      planCode:    STATE.selectedPlanCode,
      metadata:    payload.metadata,
    });

  } catch (error) {
    console.error('Payment initialization error:', error);
    setButtonLoading(false);
    STATE.isProcessing = false;

    showToast({
      type: 'error',
      title: 'Connection Error',
      message: error.message || 'Could not connect to payment server. Please try again.',
      duration: 6000,
    });
  }
}

/**
 * Launch Paystack Inline popup
 * @param {object} options
 */
function launchPaystackPopup({ reference, email, amount, planCode, metadata }) {
  // Build Paystack configuration
  const paystackConfig = {
    key:       CONFIG.PAYSTACK_PUBLIC_KEY,
    email:     email,
    amount:    amount,
    currency:  CONFIG.CURRENCY,
    ref:       reference,
    metadata:  metadata,
    label:     CONFIG.ORG_NAME,

    // ✅ Subscription: pass plan code
    ...(planCode && STATE.currentMode === 'subscription' ? { plan: planCode } : {}),

    // Channels allowed
    channels: ['card', 'bank', 'ussd', 'bank_transfer', 'mobile_money'],

    // Callback on successful popup payment
    callback: function(response) {
      console.log('Paystack callback:', response);
      handlePaystackCallback(response);
    },

    // Called when user closes the popup without paying
    onClose: function() {
      console.log('Paystack popup closed by user');
      handlePaystackClose();
    },
  };

  // Initialize Paystack
  try {
    const handler = PaystackPop.setup(paystackConfig);
    handler.openIframe();
  } catch (e) {
    console.error('Paystack popup error:', e);
    STATE.isProcessing = false;
    showToast({
      type: 'error',
      title: 'Payment Error',
      message: 'Could not open payment window. Please check your connection and try again.',
    });
  }
}

/**
 * Handle Paystack payment callback (popup closed after payment attempt)
 * @param {object} response - Paystack response object
 */
function handlePaystackCallback(response) {
  console.log('Payment callback received:', response);

  // Show processing state
  showState('processing');
  STATE.pollCount = 0;

  // Update poll counter display
  const pollCountEl = DOM.pollCount();
  if (pollCountEl) pollCountEl.textContent = '0';

  // Start polling for verification
  startPolling(response.reference || STATE.currentReference);
}

/**
 * Handle Paystack popup closed without payment
 */
function handlePaystackClose() {
  STATE.isProcessing = false;
  setButtonLoading(false);

  showToast({
    type: 'info',
    title: 'Payment Cancelled',
    message: 'No charges were made. You can try again anytime.',
    duration: 4000,
  });
}

/* ================================================================
   14. PAYMENT VERIFICATION & POLLING
================================================================ */

/**
 * Start polling the backend to verify payment
 * @param {string} reference
 */
function startPolling(reference) {
  // Clear any existing poll timer
  if (STATE.pollTimer) {
    clearInterval(STATE.pollTimer);
    STATE.pollTimer = null;
  }

  STATE.pollCount = 0;

  // Poll immediately once
  verifyPayment(reference);

  // Then poll every N seconds
  STATE.pollTimer = setInterval(() => {
    STATE.pollCount++;

    const pollCountEl = DOM.pollCount();
    if (pollCountEl) pollCountEl.textContent = STATE.pollCount;

    if (STATE.pollCount >= CONFIG.MAX_POLL_ATTEMPTS) {
      stopPolling();
      showState('failed');
      STATE.isProcessing = false;

      const failedMsg = DOM.failedMessage();
      if (failedMsg) {
        failedMsg.textContent =
          'Verification timed out. If money was deducted, please contact us with your reference: ' + reference;
      }

      showToast({
        type: 'warning',
        title: 'Verification Timeout',
        message: `Reference: ${reference}. Contact support if you were charged.`,
        duration: 10000,
      });
      return;
    }

    verifyPayment(reference);
  }, CONFIG.POLL_INTERVAL_MS);
}

/**
 * Stop the polling interval
 */
function stopPolling() {
  if (STATE.pollTimer) {
    clearInterval(STATE.pollTimer);
    STATE.pollTimer = null;
  }
}

/**
 * Verify payment with backend
 * @param {string} reference
 */
async function verifyPayment(reference) {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/verify/${reference}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      // Server error — keep polling
      console.warn(`Verify returned ${response.status}, continuing to poll...`);
      return;
    }

    const data = await response.json();
    console.log('Verification response:', data);

    const status = data.status || data.data?.status;

    if (status === 'success') {
      stopPolling();
      STATE.isProcessing = false;
      handlePaymentSuccess(data);

    } else if (status === 'failed' || status === 'abandoned') {
      stopPolling();
      STATE.isProcessing = false;
      handlePaymentFailed(data);

    } else {
      // Status is 'pending' or unknown — keep polling
      console.log(`Payment status: ${status} — continuing to poll...`);
      updatePollingStatus(`Status: ${status || 'pending'}...`);
    }

  } catch (error) {
    console.error('Verification error:', error);
    // Network error — keep polling, don't stop
    updatePollingStatus('Network error — retrying...');
  }
}

/**
 * Update the polling status text
 * @param {string} message
 */
function updatePollingStatus(message) {
  const el = DOM.pollingStatus();
  if (el) {
    el.innerHTML = `${message} (<span id="pollCount">${STATE.pollCount}</span> attempts)`;
  }
}

/* ================================================================
   15. PAYMENT SUCCESS HANDLER
================================================================ */

/**
 * Handle a confirmed successful payment
 * @param {object} data - Verification response from backend
 */
function handlePaymentSuccess(data) {
  const txData = data.data || data;
  const isSubscription = STATE.currentMode === 'subscription';

  // Update success UI
  const titleEl     = DOM.successTitle();
  const messageEl   = DOM.successMessage();
  const refEl       = DOM.successRef();
  const amountEl    = DOM.successAmount();
  const emailEl     = DOM.successEmail();
  const planRowEl   = DOM.successPlanRow();
  const planEl      = DOM.successPlan();
  const nextRowEl   = DOM.successNextRow();
  const nextEl      = DOM.successNext();
  const impactTextEl = DOM.impactText();

  // Title
  if (titleEl) {
    titleEl.textContent = isSubscription
      ? '🎉 Monthly Giving Activated!'
      : '🎉 Thank You! Donation Successful!';
  }

  // Message
  if (messageEl) {
    messageEl.textContent = isSubscription
      ? `Welcome to our family of Monthly Heroes! Your recurring donation is now active.`
      : `You've just changed a child's life. A receipt has been sent to your email.`;
  }

  // Reference
  if (refEl) {
    refEl.textContent = txData.reference || STATE.currentReference || '—';
  }

  // Amount
  const amountKobo = txData.amount || toKobo(STATE.selectedAmount);
  const amountNGN  = fromKobo(amountKobo);
  if (amountEl) {
    amountEl.textContent = formatNGN(amountNGN);
  }

  // Email
  if (emailEl) {
    emailEl.textContent = txData.customer?.email || STATE.donorEmail || '—';
  }

  // Subscription details
  if (isSubscription && STATE.selectedPlanData) {
    if (planRowEl) planRowEl.style.display = 'flex';
    if (planEl) {
      planEl.textContent = `${STATE.selectedPlanData.name} — ${formatInterval(STATE.selectedPlanData.interval)}`;
    }

    if (nextRowEl) nextRowEl.style.display = 'flex';
    if (nextEl) {
      nextEl.textContent = getNextBillingDate(STATE.selectedPlanData.interval);
    }
  } else {
    if (planRowEl) planRowEl.style.display = 'none';
    if (nextRowEl) nextRowEl.style.display = 'none';
  }

  // Impact message
  if (impactTextEl) {
    const impact = getImpactData(amountNGN);
    impactTextEl.textContent = impact.summary;
  }

  // Show success state
  showState('success');

  // Confetti effect
  triggerConfetti();

  // Toast
  showToast({
    type: 'success',
    title: isSubscription ? 'Subscription Active!' : 'Donation Confirmed!',
    message: isSubscription
      ? `You're now a Monthly Hero! Thank you.`
      : `${formatNGN(amountNGN)} received. A receipt has been sent to your email.`,
    duration: 8000,
  });

  // Add to recent donors list (simulated)
  addRecentDonor(STATE.donorName, amountNGN);
}

/* ================================================================
   16. PAYMENT FAILED HANDLER
================================================================ */

/**
 * Handle a failed payment
 * @param {object} data - Response data
 */
function handlePaymentFailed(data) {
  const failedMsg = DOM.failedMessage();

  const gatewayResponse = data.data?.gateway_response || 'Payment was not completed.';

  if (failedMsg) {
    failedMsg.textContent = `${gatewayResponse} No money was deducted from your account.`;
  }

  showState('failed');

  showToast({
    type: 'error',
    title: 'Payment Failed',
    message: gatewayResponse,
    duration: 6000,
  });
}

/* ================================================================
   17. CONFETTI EFFECT
================================================================ */

/**
 * Trigger a simple CSS confetti animation
 */
function triggerConfetti() {
  const colors = ['#f97316', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'];
  const container = document.body;

  for (let i = 0; i < 60; i++) {
    const confetto = document.createElement('div');
    confetto.style.cssText = `
      position: fixed;
      top: -10px;
      left: ${Math.random() * 100}vw;
      width: ${Math.random() * 10 + 6}px;
      height: ${Math.random() * 10 + 6}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      z-index: 9999;
      pointer-events: none;
      animation: confettiFall ${Math.random() * 2 + 2}s ease-in forwards;
      animation-delay: ${Math.random() * 1.5}s;
      transform: rotate(${Math.random() * 360}deg);
    `;
    container.appendChild(confetto);

    // Remove after animation
    confetto.addEventListener('animationend', () => {
      if (confetto.parentNode) confetto.parentNode.removeChild(confetto);
    });
  }

  // Inject confetti keyframes if not already present
  if (!document.getElementById('confettiStyles')) {
    const style = document.createElement('style');
    style.id = 'confettiStyles';
    style.textContent = `
      @keyframes confettiFall {
        0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
        100% { transform: translateY(100vh) rotate(${Math.random() * 720}deg); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

/* ================================================================
   18. SOCIAL SHARING
================================================================ */

/**
 * Initialize social share buttons
 */
function initShareButtons() {
  const twitterBtn   = DOM.shareTwitter();
  const whatsappBtn  = DOM.shareWhatsapp();
  const facebookBtn  = DOM.shareFacebook();

  const shareText = encodeURIComponent(
    `I just donated to the African Children Initiative! 🌍❤️ Every child deserves a bright future. Join me in changing lives:`
  );
  // ✅ FILL IN: Replace with your actual website URL
  const shareURL = encodeURIComponent('https://your-aci-website.com');

  if (twitterBtn) {
    twitterBtn.addEventListener('click', () => {
      window.open(
        `https://twitter.com/intent/tweet?text=${shareText}&url=${shareURL}`,
        '_blank',
        'width=600,height=400'
      );
    });
  }

  if (whatsappBtn) {
    whatsappBtn.addEventListener('click', () => {
      window.open(
        `https://wa.me/?text=${shareText}%20${shareURL}`,
        '_blank'
      );
    });
  }

  if (facebookBtn) {
    facebookBtn.addEventListener('click', () => {
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${shareURL}`,
        '_blank',
        'width=600,height=400'
      );
    });
  }
}

/* ================================================================
   19. RECENT DONORS SIMULATION
================================================================ */

/**
 * Add a new entry to the recent donors list (simulated)
 * @param {string} name
 * @param {number} amountNGN
 */
function addRecentDonor(name, amountNGN) {
  const donorsList = document.getElementById('recentDonors');
  if (!donorsList) return;

  const displayName = name
    ? `${name.split(' ')[0]} ${name.split(' ')[1]?.[0] || ''}.`.trim()
    : 'Anonymous';

  const initial = displayName.charAt(0).toUpperCase();

  const donorItem = document.createElement('div');
  donorItem.className = 'donor-item';
  donorItem.style.animation = 'fadeInDown 0.4s ease';
  donorItem.innerHTML = `
    <div class="donor-avatar" style="background: linear-gradient(135deg, #10b981, #059669);">
      ${sanitize(initial)}
    </div>
    <div class="donor-info">
      <span class="donor-name">${sanitize(displayName)}</span>
      <span class="donor-amount">${formatNGN(amountNGN)}</span>
    </div>
    <span class="donor-time">Just now</span>
  `;

  // Insert at top
  donorsList.insertBefore(donorItem, donorsList.firstChild);

  // Remove last item if too many
  const items = donorsList.querySelectorAll('.donor-item');
  if (items.length > 5) {
    donorsList.removeChild(items[items.length - 1]);
  }
}

/* ================================================================
   20. BUTTON LOADING STATE
================================================================ */

/**
 * Toggle donate button loading state
 * @param {boolean} loading
 */
function setButtonLoading(loading) {
  const btn       = DOM.donateBtn();
  const content   = DOM.btnContent();
  const loader    = DOM.btnLoader();

  if (!btn) return;

  if (loading) {
    btn.disabled = true;
    if (content) content.style.display = 'none';
    if (loader)  loader.style.display  = 'flex';
  } else {
    btn.disabled = false;
    if (content) content.style.display = 'flex';
    if (loader)  loader.style.display  = 'none';
  }
}

/* ================================================================
   21. "RESET" / DONATE AGAIN FLOW
================================================================ */

/**
 * Reset the donation card back to the initial form state
 */
function resetToForm() {
  stopPolling();
  STATE.isProcessing     = false;
  STATE.currentReference = null;
  STATE.pollCount        = 0;

  // Reset form fields
  const form = DOM.donationForm();
  if (form) form.reset();

  // Reset to one-time mode
  switchMode('one-time');

  // Reset preset buttons — select ₦5,000 by default
  DOM.presetBtns().forEach(btn => {
    btn.classList.remove('active');
    if (parseInt(btn.dataset.amount) === 5000) {
      btn.classList.add('active');
    }
  });

  // Reset amount input
  const amountInput = DOM.donationAmount();
  if (amountInput) amountInput.value = 5000;
  STATE.selectedAmount = 5000;

  // Reset summary & button
  updateDonationSummary(5000);
  updateDonateButton();
  updateImpactCalculator(5000);

  // Reset button state
  setButtonLoading(false);

  // Clear errors
  clearAllErrors();

  // Show form
  showState('form');

  // Scroll to form
  document.getElementById('donationCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ================================================================
   22. NAVIGATION
================================================================ */

/**
 * Initialize navigation scroll behavior and mobile menu
 */
function initNavigation() {
  const navbar    = DOM.navbar();
  const hamburger = DOM.hamburger();
  const navLinks  = DOM.navLinks();

  // Scroll effect
  window.addEventListener('scroll', () => {
    if (navbar) {
      if (window.scrollY > 60) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }

    // Back to top button
    const backToTop = DOM.backToTop();
    if (backToTop) {
      if (window.scrollY > 400) {
        backToTop.classList.add('visible');
      } else {
        backToTop.classList.remove('visible');
      }
    }
  }, { passive: true });

  // Mobile hamburger
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      navLinks.classList.toggle('open');
      document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
    });

    // Close nav on link click
    navLinks.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navLinks.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  // Back to top
  const backToTopBtn = DOM.backToTop();
  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Footer year
  const yearEl = DOM.footerYear();
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

/* ================================================================
   23. HERO BACKGROUND SLIDESHOW
================================================================ */

/**
 * Initialize hero background image slideshow
 */
function initHeroSlideshow() {
  const slides = DOM.heroSlides();
  if (!slides || slides.length === 0) return;

  let currentSlide = 0;

  setInterval(() => {
    slides[currentSlide].classList.remove('active');
    currentSlide = (currentSlide + 1) % slides.length;
    slides[currentSlide].classList.add('active');
  }, 6000); // Change every 6 seconds
}

/* ================================================================
   24. HERO PARTICLES
================================================================ */

/**
 * Generate floating particles in the hero section
 */
function initHeroParticles() {
  const container = DOM.heroParticles();
  if (!container) return;

  const particleCount = 25;

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';

    const size  = Math.random() * 4 + 2;
    const posX  = Math.random() * 100;
    const delay = Math.random() * 15;
    const duration = Math.random() * 10 + 8;

    particle.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${posX}%;
      bottom: -${size}px;
      animation-duration: ${duration}s;
      animation-delay: ${delay}s;
      opacity: ${Math.random() * 0.6 + 0.1};
      background: ${Math.random() > 0.5 ? '#f97316' : '#f59e0b'};
    `;

    container.appendChild(particle);
  }
}

/* ================================================================
   25. COUNTER ANIMATIONS
================================================================ */

/**
 * Animate a number counter from 0 to target
 * @param {HTMLElement} el
 * @param {number} target
 * @param {number} duration - ms
 */
function animateCounter(el, target, duration = 2000) {
  if (!el) return;

  const start     = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed  = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.floor(eased * target);

    el.textContent = formatNumber(value).replace('+', '').replace('M', '').replace('K', '');
    
    // Add suffix
    if (target >= 1000000) {
      el.textContent = (eased * target / 1000000).toFixed(1).replace(/\.0$/, '') + 'M+';
    } else if (target >= 1000) {
      el.textContent = Math.floor(eased * target / 1000) + 'K+';
    } else {
      el.textContent = Math.floor(eased * target) + '+';
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      // Final value
      if (target >= 1000000) {
        el.textContent = (target / 1000000).toFixed(1).replace(/\.0$/, '') + 'M+';
      } else if (target >= 1000) {
        el.textContent = Math.floor(target / 1000) + 'K+';
      } else {
        el.textContent = target + '+';
      }
    }
  }

  requestAnimationFrame(update);
}

/* ================================================================
   26. INTERSECTION OBSERVER (AOS + Counters + Progress Bars)
================================================================ */

/**
 * Initialize Intersection Observer for scroll animations
 */
function initScrollAnimations() {
  // AOS elements
  const aosElements = document.querySelectorAll('[data-aos]');
  const aosObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('aos-animate');
        aosObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  aosElements.forEach(el => aosObserver.observe(el));

  // Hero stat counters
  const heroStats = document.querySelectorAll('.stat-number[data-target]');
  const heroObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = parseInt(entry.target.dataset.target);
        animateCounter(entry.target, target, 2000);
        heroObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  heroStats.forEach(el => heroObserver.observe(el));

  // Impact stat counters
  const impactStats = document.querySelectorAll('.impact-number[data-target]');
  const impactObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = parseInt(entry.target.dataset.target);
        animateCounter(entry.target, target, 2500);
        impactObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  impactStats.forEach(el => impactObserver.observe(el));

  // Progress bars
  const progressFills = DOM.progressFills();
  const breakdownFills = DOM.breakdownFills();
  const barObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const targetWidth = el.dataset.width || el.style.width;
        el.style.width = '0%';
        setTimeout(() => {
          el.style.width = targetWidth;
        }, 200);
        barObserver.unobserve(el);
      }
    });
  }, { threshold: 0.3 });

  progressFills.forEach(el => {
    // Store target width
    el.dataset.width = el.style.width;
    el.style.width = '0%';
    barObserver.observe(el);
  });

  breakdownFills.forEach(el => {
    el.dataset.width = el.style.width;
    el.style.width = '0%';
    barObserver.observe(el);
  });
}

/* ================================================================
   27. STORIES SLIDER
================================================================ */

/**
 * Initialize the stories/testimonials slider
 */
function initStoriesSlider() {
  const track    = DOM.storiesTrack();
  const prevBtn  = DOM.prevStory();
  const nextBtn  = DOM.nextStory();
  const dots     = DOM.sliderDots();

  if (!track) return;

  let currentIndex = 0;
  const totalSlides = track.children.length;
  let autoSlideTimer = null;

  function goToSlide(index) {
    currentIndex = (index + totalSlides) % totalSlides;
    track.style.transform = `translateX(-${currentIndex * 100}%)`;

    // Update dots
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === currentIndex);
    });
  }

  function startAutoSlide() {
    autoSlideTimer = setInterval(() => {
      goToSlide(currentIndex + 1);
    }, 6000);
  }

  function resetAutoSlide() {
    clearInterval(autoSlideTimer);
    startAutoSlide();
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      goToSlide(currentIndex - 1);
      resetAutoSlide();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      goToSlide(currentIndex + 1);
      resetAutoSlide();
    });
  }

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      goToSlide(index);
      resetAutoSlide();
    });
  });

  // Touch/Swipe support
  let touchStartX = 0;
  let touchEndX   = 0;

  track.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  track.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 50) {
      goToSlide(diff > 0 ? currentIndex + 1 : currentIndex - 1);
      resetAutoSlide();
    }
  }, { passive: true });

  startAutoSlide();
}

/* ================================================================
   28. COOKIE CONSENT
================================================================ */

/**
 * Initialize cookie consent banner
 */
function initCookieConsent() {
  const banner  = DOM.cookieBanner();
  const accept  = DOM.cookieAccept();
  const decline = DOM.cookieDecline();

  if (!banner) return;

  // Show if not already accepted
  if (!localStorage.getItem('aci_cookie_consent')) {
    setTimeout(() => {
      banner.style.display = 'flex';
    }, 2500);
  }

  if (accept) {
    accept.addEventListener('click', () => {
      localStorage.setItem('aci_cookie_consent', 'accepted');
      banner.style.display = 'none';
    });
  }

  if (decline) {
    decline.addEventListener('click', () => {
      localStorage.setItem('aci_cookie_consent', 'declined');
      banner.style.display = 'none';
    });
  }
}

/* ================================================================
   29. FORM SUBMISSION HANDLER
================================================================ */

/**
 * Initialize donation form submit event
 */
function initFormSubmit() {
  const form = DOM.donationForm();
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    initPaystackPayment();
  });
}

/* ================================================================
   30. RETRY & DONE BUTTON HANDLERS
================================================================ */

/**
 * Initialize retry, donate-again, and change payment buttons
 */
function initActionButtons() {
  // Mode toggle buttons
  DOM.oneTimeBtn()?.addEventListener('click', () => switchMode('one-time'));
  DOM.recurringBtn()?.addEventListener('click', () => switchMode('subscription'));

  // Retry button (from failed state)
  DOM.retryBtn()?.addEventListener('click', () => {
    showState('form');
    STATE.isProcessing = false;
  });

  // Change payment method (from failed state)
  DOM.changePmBtn()?.addEventListener('click', () => {
    showState('form');
    STATE.isProcessing = false;
    showToast({
      type: 'info',
      title: 'Try Another Method',
      message: 'Select your preferred payment method when the Paystack window opens.',
      duration: 4000,
    });
  });

  // Donate Again (from success state)
  DOM.donateAgainBtn()?.addEventListener('click', () => {
    resetToForm();
  });
}

/* ================================================================
   31. MAIN INITIALIZATION
================================================================ */

/**
 * Main application bootstrap function
 * Called when DOM is fully loaded
 */
function init() {
  console.log('🌍 African Children Initiative — Initializing...');

  // Core UI
  initNavigation();
  initHeroSlideshow();
  initHeroParticles();
  initScrollAnimations();
  initStoriesSlider();
  initCookieConsent();

  // Donation Form
  initPresetButtons();
  initRealTimeValidation();
  initFormSubmit();
  initActionButtons();
  initShareButtons();

  // Set initial state
  updateDonationSummary(STATE.selectedAmount);
  updateDonateButton();
  updateImpactCalculator(STATE.selectedAmount);
  showState('form');

  // Set default active preset (₦5,000)
  DOM.presetBtns().forEach(btn => {
    if (parseInt(btn.dataset.amount) === 5000) {
      btn.classList.add('active');
    }
  });

  console.log('✅ ACI App initialized successfully');
  console.log(`🔑 Mode: ${CONFIG.PAYSTACK_PUBLIC_KEY.startsWith('pk_live') ? 'LIVE' : 'TEST'}`);
}

/* ================================================================
   32. DOM READY
================================================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* ================================================================
   END OF app.js
================================================================ */
