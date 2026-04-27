/* ================================================================
   AFRICAN CHILDREN INITIATIVE
   SIMPLIFIED VERSION — No Backend Required!
   Works with GitHub Pages only.

   ✅ FILL IN:
   Line ~20: Your Paystack PUBLIC key only
   Line ~21: Your website URL
================================================================ */

'use strict';

/* ================================================================
   CONFIGURATION — FILL THESE IN
================================================================ */
const CONFIG = {
  // ✅ FILL IN: Your Paystack PUBLIC key
  // Get it from: https://dashboard.paystack.com/#/settings/developer
  // Test key starts with:  pk_test_29a9fef90b750ef1c90893a0b96f390c23b4e22c
  // Live key starts with:  pk_live_1d48c7981d1abf7396474499a369ab7bef17740a
  PAYSTACK_PUBLIC_KEY: 'pk_live_1d48c7981d1abf7396474499a369ab7bef17740a',

  // ✅ FILL IN: Your website URL (for social sharing)
  SITE_URL: 'https://no-group.github.io/African-Children-Initiative/',

  // Organization details
  ORG_NAME:    'African Children Initiative',
  CURRENCY:    'NGN',
  MIN_AMOUNT:  500,

  // Polling settings
  POLL_INTERVAL_MS:  4000,
  MAX_POLL_ATTEMPTS: 10,
};

/* ================================================================
   PAYSTACK SUBSCRIPTION PLANS
   ✅ FILL IN: Create these plans in your Paystack dashboard first
   Then paste the plan codes below

   HOW TO CREATE PLANS (3 minutes):
   1. Go to https://dashboard.paystack.com
   2. Click Products → Subscriptions → Plans
   3. Click "Create Plan"
   4. Fill in name, amount, interval = Monthly
   5. Save and copy the Plan Code (PLN_xxxxxxxx)
   6. Paste it below
================================================================ */
const DONATION_PLANS = [
  {
    plan_code:   'PLN_xxxxxxxxxx1',  // ✅ FILL IN
    name:        'Seed Supporter',
    amount:      1000,               // ₦1,000
    interval:    'monthly',
    description: 'Feed a child for a week every month',
  },
  {
    plan_code:   'PLN_xxxxxxxxxx2',  // ✅ FILL IN
    name:        'Growth Champion',
    amount:      2500,               // ₦2,500
    interval:    'monthly',
    description: 'Provide school supplies monthly',
  },
  {
    plan_code:   'PLN_xxxxxxxxxx3',  // ✅ FILL IN
    name:        'Hope Builder',
    amount:      5000,               // ₦5,000
    interval:    'monthly',
    description: 'Full monthly food pack for one child',
  },
  {
    plan_code:   'PLN_xxxxxxxxxx4',  // ✅ FILL IN
    name:        'Future Maker',
    amount:      10000,              // ₦10,000
    interval:    'monthly',
    description: 'Sponsor a full term of school fees',
  },
];

/* ================================================================
   APPLICATION STATE
================================================================ */
const STATE = {
  currentMode:       'one-time',
  selectedAmount:    5000,
  selectedPlanCode:  null,
  selectedPlanData:  null,
  currentReference:  null,
  pollTimer:         null,
  pollCount:         0,
  isProcessing:      false,
  donorEmail:        '',
  donorName:         '',
  donorMessage:      '',
};

/* ================================================================
   UTILITY FUNCTIONS
================================================================ */

function formatNGN(amount) {
  return new Intl.NumberFormat('en-NG', {
    style:                 'currency',
    currency:              'NGN',
    minimumFractionDigits: 2,
  }).format(amount);
}

function generateReference() {
  const timestamp = Date.now();
  const random    = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `ACI-${timestamp}-${random}`;
}

function isValidEmail(email) {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}

function toKobo(amount) {
  return Math.round(amount * 100);
}

function fromKobo(kobo) {
  return kobo / 100;
}

function sanitize(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

function formatInterval(interval) {
  const map = {
    daily:      'Daily',
    weekly:     'Weekly',
    monthly:    'Monthly',
    quarterly:  'Every 3 Months',
    annually:   'Annually',
  };
  return map[interval] || interval;
}

function getNextBillingDate(interval) {
  const now = new Date();
  switch (interval) {
    case 'daily':     now.setDate(now.getDate() + 1);        break;
    case 'weekly':    now.setDate(now.getDate() + 7);        break;
    case 'monthly':   now.setMonth(now.getMonth() + 1);      break;
    case 'quarterly': now.setMonth(now.getMonth() + 3);      break;
    case 'annually':  now.setFullYear(now.getFullYear() + 1); break;
    default:          now.setMonth(now.getMonth() + 1);      break;
  }
  return now.toLocaleDateString('en-NG', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  });
}

function getImpactData(amount) {
  if (amount >= 50000) {
    return {
      summary: 'Your donation can fund a full scholarship for one child!',
      items: [
        { icon: 'fa-graduation-cap', text: 'Pays for <strong>1 full scholarship</strong>' },
        { icon: 'fa-utensils',       text: `Feeds <strong>${Math.floor(amount/500)} children</strong> for a day` },
        { icon: 'fa-book',           text: `Provides <strong>${Math.floor(amount/1000)} full book sets</strong>` },
      ],
    };
  }
  if (amount >= 10000) {
    return {
      summary: "Your donation sponsors a child's full school term!",
      items: [
        { icon: 'fa-school',   text: 'Sponsors <strong>1 term</strong> of school fees' },
        { icon: 'fa-utensils', text: `Feeds <strong>${Math.floor(amount/500)} children</strong> for a day` },
        { icon: 'fa-pills',    text: `Buys <strong>${Math.floor(amount/2500)} malaria kits</strong>` },
      ],
    };
  }
  if (amount >= 5000) {
    return {
      summary: 'Your donation provides a monthly food pack for 1 child!',
      items: [
        { icon: 'fa-utensils', text: `Feeds <strong>${Math.floor(amount/500)} children</strong> for a day` },
        { icon: 'fa-book',     text: `Provides <strong>${Math.floor(amount/1000)} exercise book sets</strong>` },
        { icon: 'fa-pills',    text: `Buys <strong>${Math.floor(amount/2500)} malaria kits</strong>` },
      ],
    };
  }
  if (amount >= 2500) {
    return {
      summary: 'Your donation buys school supplies for a child!',
      items: [
        { icon: 'fa-pencil',   text: 'Provides <strong>a full stationery kit</strong>' },
        { icon: 'fa-utensils', text: `Feeds <strong>${Math.floor(amount/500)} children</strong> for a day` },
        { icon: 'fa-tshirt',   text: 'Contributes to <strong>a school uniform</strong>' },
      ],
    };
  }
  return {
    summary: 'Every ₦500 provides a meal for a child — thank you!',
    items: [
      { icon: 'fa-utensils', text: `Feeds <strong>${Math.floor(amount/500)} child${amount>=1000?'ren':''}</strong> for a day` },
      { icon: 'fa-pencil',   text: `Buys <strong>${Math.floor(amount/200)} pencils</strong> for students` },
      { icon: 'fa-heart',    text: 'Makes a <strong>real difference</strong> in Africa' },
    ],
  };
}

/* ================================================================
   TOAST NOTIFICATIONS
================================================================ */
function showToast({ type = 'info', title, message, duration = 5000 }) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = {
    success: 'fa-circle-check',
    error:   'fa-circle-xmark',
    info:    'fa-circle-info',
    warning: 'fa-triangle-exclamation',
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">
      <i class="fas ${icons[type] || icons.info}"></i>
    </div>
    <div class="toast-body">
      <div class="toast-title">${sanitize(title)}</div>
      ${message ? `<div class="toast-msg">${sanitize(message)}</div>` : ''}
    </div>
    <button class="toast-close" aria-label="Close">
      <i class="fas fa-xmark"></i>
    </button>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => {
    dismissToast(toast);
  });

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => dismissToast(toast), duration);
  }
}

function dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('removing');
  toast.addEventListener('animationend', () => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  });
}

/* ================================================================
   CARD STATE MANAGEMENT
================================================================ */
function showState(stateName) {
  const states = {
    form:       document.getElementById('formState'),
    processing: document.getElementById('processingState'),
    success:    document.getElementById('successState'),
    failed:     document.getElementById('failedState'),
  };

  Object.entries(states).forEach(([name, el]) => {
    if (!el) return;
    if (name === stateName) {
      el.style.display        = 'flex';
      el.style.flexDirection  = 'column';
    } else {
      el.style.display = 'none';
    }
  });
}

/* ================================================================
   MODE TOGGLE
================================================================ */
function switchMode(mode) {
  STATE.currentMode = mode;

  const oneTimeBtn      = document.getElementById('oneTimeBtn');
  const recurringBtn    = document.getElementById('recurringBtn');
  const recurringBanner = document.getElementById('recurringBanner');
  const presetSection   = document.getElementById('presetSection');
  const plansSection    = document.getElementById('plansSection');
  const amountGroup     = document.getElementById('amountGroup');
  const recurringConsent = document.getElementById('recurringConsent');

  if (mode === 'one-time') {
    oneTimeBtn?.classList.add('active');
    recurringBtn?.classList.remove('active');
    if (recurringBanner)  recurringBanner.style.display  = 'none';
    if (presetSection)    presetSection.style.display    = 'block';
    if (plansSection)     plansSection.style.display     = 'none';
    if (amountGroup)      amountGroup.style.display      = 'block';
    if (recurringConsent) recurringConsent.style.display = 'none';

    STATE.selectedPlanCode = null;
    STATE.selectedPlanData = null;

  } else {
    oneTimeBtn?.classList.remove('active');
    recurringBtn?.classList.add('active');
    if (recurringBanner)  recurringBanner.style.display  = 'flex';
    if (presetSection)    presetSection.style.display    = 'none';
    if (plansSection)     plansSection.style.display     = 'block';
    if (amountGroup)      amountGroup.style.display      = 'none';
    if (recurringConsent) recurringConsent.style.display = 'block';

    renderPlans();
  }

  clearAllErrors();
  updateDonateButton();
}

/* ================================================================
   PLANS RENDERING (from hardcoded array — no backend needed!)
================================================================ */
function renderPlans() {
  const grid = document.getElementById('plansGrid');
  if (!grid) return;

  grid.innerHTML = DONATION_PLANS.map((plan) => `
    <div
      class="plan-card"
      data-plan-code="${sanitize(plan.plan_code)}"
      data-plan-amount="${toKobo(plan.amount)}"
      data-plan-interval="${sanitize(plan.interval)}"
      data-plan-name="${sanitize(plan.name)}"
      role="button"
      tabindex="0"
      aria-label="Select ${plan.name} plan"
    >
      <div class="plan-amount">${formatNGN(plan.amount)}</div>
      <div class="plan-interval">/ ${formatInterval(plan.interval)}</div>
      <div class="plan-name">${sanitize(plan.name)}</div>
      <div class="plan-description">${sanitize(plan.description)}</div>
    </div>
  `).join('');

  grid.querySelectorAll('.plan-card').forEach((card) => {
    card.addEventListener('click',   () => selectPlan(card));
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

function selectPlan(card) {
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');

  STATE.selectedPlanCode = card.dataset.planCode;
  STATE.selectedPlanData = {
    plan_code: card.dataset.planCode,
    amount:    parseInt(card.dataset.planAmount),
    interval:  card.dataset.planInterval,
    name:      card.dataset.planName,
  };

  const amountNGN = fromKobo(parseInt(card.dataset.planAmount));
  STATE.selectedAmount = amountNGN;

  updateDonationSummary(amountNGN);
  updateDonateButton();
  updateImpactCalculator(amountNGN);
}

/* ================================================================
   PRESET AMOUNT BUTTONS
================================================================ */
function initPresetButtons() {
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const amount = parseInt(btn.dataset.amount);
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));

      if (amount === 0) {
        btn.classList.add('active');
        const input = document.getElementById('donationAmount');
        if (input) { input.value = ''; input.focus(); }
        STATE.selectedAmount = 0;
      } else {
        btn.classList.add('active');
        const input = document.getElementById('donationAmount');
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
   SUMMARY & BUTTON UPDATES
================================================================ */
function updateDonationSummary(amountNGN) {
  const summaryAmount = document.getElementById('summaryAmount');
  const summaryImpact = document.getElementById('summaryImpact');

  if (summaryAmount) summaryAmount.textContent = formatNGN(amountNGN || 0);
  if (summaryImpact) {
    const impact = getImpactData(amountNGN);
    summaryImpact.textContent = impact.summary;
  }
}

function updateDonateButton() {
  const btnText = document.getElementById('btnText');
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

function updateImpactCalculator(amountNGN) {
  const calcAmount = document.getElementById('calcAmount');
  const impactList = document.getElementById('impactList');

  if (calcAmount) calcAmount.textContent = formatNGN(amountNGN);

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
   FORM VALIDATION
================================================================ */
function validateForm() {
  let isValid = true;
  clearAllErrors();

  // Validate amount (one-time)
  if (STATE.currentMode === 'one-time') {
    const amountVal = parseFloat(
      document.getElementById('donationAmount')?.value || '0'
    );

    if (!amountVal || isNaN(amountVal)) {
      showError('amountError', 'Please enter a donation amount.');
      isValid = false;
    } else if (amountVal < CONFIG.MIN_AMOUNT) {
      showError('amountError', `Minimum donation is ${formatNGN(CONFIG.MIN_AMOUNT)}.`);
      isValid = false;
    } else if (amountVal > 10000000) {
      showError('amountError', 'Maximum donation is ₦10,000,000.');
      isValid = false;
    } else {
      STATE.selectedAmount = amountVal;
    }
  }

  // Validate plan (subscription)
  if (STATE.currentMode === 'subscription' && !STATE.selectedPlanCode) {
    showToast({
      type:    'warning',
      title:   'No Plan Selected',
      message: 'Please select a monthly giving plan.',
    });
    isValid = false;
  }

  // Validate plan code is real (not placeholder)
  if (
    STATE.currentMode === 'subscription' &&
    STATE.selectedPlanCode &&
    STATE.selectedPlanCode.includes('xxxxxxxxxx')
  ) {
    showToast({
      type:    'error',
      title:   'Plan Not Configured',
      message: 'Please set up real plan codes from your Paystack dashboard.',
      duration: 8000,
    });
    isValid = false;
  }

  // Validate email
  const emailVal = document.getElementById('donorEmail')?.value?.trim() || '';
  if (!emailVal) {
    showError('emailError', 'Email address is required.');
    isValid = false;
  } else if (!isValidEmail(emailVal)) {
    showError('emailError', 'Please enter a valid email address.');
    isValid = false;
  } else {
    STATE.donorEmail = emailVal;
  }

  // Validate consent (subscription)
  if (STATE.currentMode === 'subscription') {
    const consentChecked = document.getElementById('consentCheck')?.checked;
    if (!consentChecked) {
      showError('consentError', 'Please check the box to authorize recurring charges.');
      isValid = false;
    }
  }

  return isValid;
}

function showError(errorId, message) {
  const el = document.getElementById(errorId);
  if (el) {
    el.innerHTML = `<i class="fas fa-circle-exclamation"></i> ${message}`;
    el.style.display = 'flex';
  }
}

function clearAllErrors() {
  ['amountError', 'emailError', 'consentError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  });
  document.getElementById('donationAmount')?.classList.remove('invalid', 'valid');
  document.getElementById('donorEmail')?.classList.remove('invalid', 'valid');
}

/* ================================================================
   REAL-TIME VALIDATION
================================================================ */
function initRealTimeValidation() {
  const emailInput     = document.getElementById('donorEmail');
  const emailValidIcon = document.getElementById('emailValidIcon');
  const amountInput    = document.getElementById('donationAmount');
  const messageInput   = document.getElementById('donorMessage');
  const charCountEl    = document.getElementById('charCount');

  if (emailInput) {
    emailInput.addEventListener('input', () => {
      const val     = emailInput.value.trim();
      const errorEl = document.getElementById('emailError');

      if (!val) {
        emailInput.classList.remove('valid', 'invalid');
        if (emailValidIcon) emailValidIcon.innerHTML = '';
        return;
      }
      if (isValidEmail(val)) {
        emailInput.classList.add('valid');
        emailInput.classList.remove('invalid');
        if (emailValidIcon) {
          emailValidIcon.innerHTML = '<i class="fas fa-circle-check" style="color:#10b981"></i>';
        }
        if (errorEl) { errorEl.textContent = ''; errorEl.style.display = 'none'; }
      } else {
        emailInput.classList.add('invalid');
        emailInput.classList.remove('valid');
        if (emailValidIcon) {
          emailValidIcon.innerHTML = '<i class="fas fa-circle-xmark" style="color:#ef4444"></i>';
        }
      }
    });
  }

  if (amountInput) {
    amountInput.addEventListener('input', () => {
      const val = parseFloat(amountInput.value) || 0;
      STATE.selectedAmount = val;
      updateDonationSummary(val);
      updateDonateButton();
      updateImpactCalculator(val);

      document.querySelectorAll('.preset-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.amount) === val);
      });

      const errorEl = document.getElementById('amountError');
      if (errorEl && val >= CONFIG.MIN_AMOUNT) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
        amountInput.classList.remove('invalid');
      }
    });
  }

  if (messageInput && charCountEl) {
    messageInput.addEventListener('input', () => {
      charCountEl.textContent = messageInput.value.length;
    });
  }
}

/* ================================================================
   PAYSTACK PAYMENT (DIRECT — NO BACKEND NEEDED)
================================================================ */
function initPaystackPayment() {
  if (STATE.isProcessing) return;
  if (!validateForm()) return;

  STATE.isProcessing = true;
  STATE.donorEmail   = document.getElementById('donorEmail')?.value?.trim() || '';
  STATE.donorName    = document.getElementById('donorName')?.value?.trim()  || '';
  STATE.donorMessage = document.getElementById('donorMessage')?.value?.trim() || '';

  // Warn if public key is still placeholder
  if (CONFIG.PAYSTACK_PUBLIC_KEY.includes('xxxxxxxx')) {
    showToast({
      type:     'error',
      title:    'Setup Required',
      message:  'Please add your Paystack public key to js/app.js line ~20',
      duration: 8000,
    });
    STATE.isProcessing = false;
    return;
  }

  setButtonLoading(true);

  const reference  = generateReference();
  STATE.currentReference = reference;

  const amountKobo = STATE.currentMode === 'one-time'
    ? toKobo(STATE.selectedAmount)
    : STATE.selectedPlanData?.amount;

  // Build Paystack config
  const paystackConfig = {
    key:      CONFIG.PAYSTACK_PUBLIC_KEY,
    email:    STATE.donorEmail,
    amount:   amountKobo,
    currency: CONFIG.CURRENCY,
    ref:      reference,
    label:    CONFIG.ORG_NAME,

    metadata: {
      custom_fields: [
        {
          display_name:  'Donor Name',
          variable_name: 'donor_name',
          value:         STATE.donorName || 'Anonymous',
        },
        {
          display_name:  'Donation Type',
          variable_name: 'donation_type',
          value:         STATE.currentMode === 'one-time'
                           ? 'One-Time Gift'
                           : 'Monthly Recurring',
        },
        {
          display_name:  'Dedication',
          variable_name: 'message',
          value:         STATE.donorMessage || 'N/A',
        },
      ],
    },

    channels: ['card', 'bank', 'ussd', 'bank_transfer', 'mobile_money'],

    // Add plan for subscriptions
    ...(STATE.currentMode === 'subscription' && STATE.selectedPlanCode
      ? { plan: STATE.selectedPlanCode }
      : {}),

    // ✅ Payment successful — Paystack calls this
    callback: function (response) {
      setButtonLoading(false);
      console.log('Paystack callback:', response);

      // For GitHub Pages (no backend), we trust Paystack's callback
      // Paystack only calls callback on genuine success
      if (response.status === 'success' || response.reference) {
        handleDirectSuccess(response);
      } else {
        handleDirectFailed('Payment was not completed.');
      }
    },

    // User closed popup without paying
    onClose: function () {
      setButtonLoading(false);
      STATE.isProcessing = false;
      showToast({
        type:    'info',
        title:   'Payment Cancelled',
        message: 'No charges were made. You can try again anytime.',
      });
    },
  };

  try {
    const handler = PaystackPop.setup(paystackConfig);
    handler.openIframe();
  } catch (e) {
    console.error('Paystack error:', e);
    setButtonLoading(false);
    STATE.isProcessing = false;
    showToast({
      type:    'error',
      title:   'Payment Error',
      message: 'Could not open payment window. Please try again.',
    });
  }
}

/* ================================================================
   DIRECT SUCCESS HANDLER (No backend verification)
   Paystack's callback is only triggered on genuine payment success
   This is safe for GitHub Pages / static hosting
================================================================ */
function handleDirectSuccess(response) {
  STATE.isProcessing = false;
  const isSubscription = STATE.currentMode === 'subscription';

  // Update success UI elements
  const titleEl     = document.getElementById('successTitle');
  const messageEl   = document.getElementById('successMessage');
  const refEl       = document.getElementById('successRef');
  const amountEl    = document.getElementById('successAmount');
  const emailEl     = document.getElementById('successEmail');
  const planRowEl   = document.getElementById('successPlanRow');
  const planEl      = document.getElementById('successPlan');
  const nextRowEl   = document.getElementById('successNextRow');
  const nextEl      = document.getElementById('successNext');
  const impactTextEl = document.getElementById('impactText');

  if (titleEl) {
    titleEl.textContent = isSubscription
      ? '🎉 Monthly Giving Activated!'
      : '🎉 Thank You! Donation Successful!';
  }

  if (messageEl) {
    messageEl.textContent = isSubscription
      ? 'Welcome to our family of Monthly Heroes! A confirmation has been sent to your email.'
      : "You've just changed a child's life! A receipt has been sent to your email.";
  }

  if (refEl)   refEl.textContent   = response.reference || STATE.currentReference || '—';
  if (emailEl) emailEl.textContent = STATE.donorEmail || '—';

  // Amount display
  const amountNGN = STATE.currentMode === 'one-time'
    ? STATE.selectedAmount
    : fromKobo(STATE.selectedPlanData?.amount || 0);

  if (amountEl) amountEl.textContent = formatNGN(amountNGN);

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
    impactTextEl.textContent = getImpactData(amountNGN).summary;
  }

  showState('success');
  triggerConfetti();

  showToast({
    type:    'success',
    title:   isSubscription ? 'Subscription Active! ✅' : 'Donation Confirmed! ✅',
    message: isSubscription
      ? "You're now a Monthly Hero! Thank you."
      : `${formatNGN(amountNGN)} received. Thank you!`,
    duration: 8000,
  });

  addRecentDonor(STATE.donorName, amountNGN);

  // Save to localStorage for donor history (optional)
  saveDonationLocally({
    reference: response.reference || STATE.currentReference,
    amount:    amountNGN,
    email:     STATE.donorEmail,
    mode:      STATE.currentMode,
    date:      new Date().toISOString(),
  });
}

function handleDirectFailed(reason) {
  STATE.isProcessing = false;

  const failedMsg = document.getElementById('failedMessage');
  if (failedMsg) {
    failedMsg.textContent = `${reason || 'Payment was not completed.'} No money was deducted.`;
  }

  showState('failed');

  showToast({
    type:    'error',
    title:   'Payment Failed',
    message: reason || 'Please try again.',
    duration: 6000,
  });
}

/* ================================================================
   LOCAL STORAGE — Save donation record locally
   This gives donors a simple history without a database
================================================================ */
function saveDonationLocally(donation) {
  try {
    const history = JSON.parse(
      localStorage.getItem('aci_donations') || '[]'
    );
    history.unshift(donation);
    // Keep only last 20 donations
    const trimmed = history.slice(0, 20);
    localStorage.setItem('aci_donations', JSON.stringify(trimmed));
  } catch (e) {
    // localStorage might be blocked — silently ignore
    console.warn('Could not save donation locally:', e.message);
  }
}

/* ================================================================
   CONFETTI EFFECT
================================================================ */
function triggerConfetti() {
  const colors = ['#f97316', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'];

  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed;
      top:-10px;
      left:${Math.random() * 100}vw;
      width:${Math.random() * 10 + 6}px;
      height:${Math.random() * 10 + 6}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      z-index:9999;
      pointer-events:none;
      animation:confettiFall ${Math.random() * 2 + 2}s ease-in forwards;
      animation-delay:${Math.random() * 1.5}s;
    `;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  if (!document.getElementById('confettiStyles')) {
    const style = document.createElement('style');
    style.id = 'confettiStyles';
    style.textContent = `
      @keyframes confettiFall {
        0%   { transform: translateY(0) rotate(0deg); opacity:1; }
        100% { transform: translateY(100vh) rotate(720deg); opacity:0; }
      }
    `;
    document.head.appendChild(style);
  }
}

/* ================================================================
   SOCIAL SHARING
================================================================ */
function initShareButtons() {
  const shareText = encodeURIComponent(
    `I just donated to the African Children Initiative! 🌍❤️ Every child deserves a bright future. Join me:`
  );
  const shareURL = encodeURIComponent(CONFIG.SITE_URL);

  document.getElementById('shareTwitter')?.addEventListener('click', () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${shareText}&url=${shareURL}`,
      '_blank', 'width=600,height=400'
    );
  });

  document.getElementById('shareWhatsapp')?.addEventListener('click', () => {
    window.open(`https://wa.me/?text=${shareText}%20${shareURL}`, '_blank');
  });

  document.getElementById('shareFacebook')?.addEventListener('click', () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${shareURL}`,
      '_blank', 'width=600,height=400'
    );
  });
}

/* ================================================================
   RECENT DONORS
================================================================ */
function addRecentDonor(name, amountNGN) {
  const donorsList = document.getElementById('recentDonors');
  if (!donorsList) return;

  const displayName = name
    ? `${name.split(' ')[0]} ${name.split(' ')[1]?.[0] || ''}.`.trim()
    : 'Anonymous';

  const item = document.createElement('div');
  item.className = 'donor-item';
  item.innerHTML = `
    <div class="donor-avatar" style="background:linear-gradient(135deg,#10b981,#059669)">
      ${sanitize(displayName.charAt(0).toUpperCase())}
    </div>
    <div class="donor-info">
      <span class="donor-name">${sanitize(displayName)}</span>
      <span class="donor-amount">${formatNGN(amountNGN)}</span>
    </div>
    <span class="donor-time">Just now</span>
  `;

  donorsList.insertBefore(item, donorsList.firstChild);

  const items = donorsList.querySelectorAll('.donor-item');
  if (items.length > 5) donorsList.removeChild(items[items.length - 1]);
}

/* ================================================================
   BUTTON LOADING STATE
================================================================ */
function setButtonLoading(loading) {
  const btn     = document.getElementById('donateBtn');
  const content = document.getElementById('btnContent');
  const loader  = document.getElementById('btnLoader');

  if (!btn) return;
  btn.disabled = loading;
  if (content) content.style.display = loading ? 'none' : 'flex';
  if (loader)  loader.style.display  = loading ? 'flex' : 'none';
}

/* ================================================================
   RESET FORM
================================================================ */
function resetToForm() {
  STATE.isProcessing     = false;
  STATE.currentReference = null;
  STATE.pollCount        = 0;

  const form = document.getElementById('donationForm');
  if (form) form.reset();

  switchMode('one-time');

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.remove('active');
    if (parseInt(btn.dataset.amount) === 5000) btn.classList.add('active');
  });

  const amountInput = document.getElementById('donationAmount');
  if (amountInput) amountInput.value = 5000;
  STATE.selectedAmount = 5000;

  updateDonationSummary(5000);
  updateDonateButton();
  updateImpactCalculator(5000);
  setButtonLoading(false);
  clearAllErrors();
  showState('form');

  document.getElementById('donationCard')?.scrollIntoView({
    behavior: 'smooth', block: 'start',
  });
}

/* ================================================================
   NAVIGATION
================================================================ */
function initNavigation() {
  const navbar    = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');
  const backToTop = document.getElementById('backToTop');

  window.addEventListener('scroll', () => {
    if (navbar) {
      navbar.classList.toggle('scrolled', window.scrollY > 60);
    }
    if (backToTop) {
      backToTop.classList.toggle('visible', window.scrollY > 400);
    }
  }, { passive: true });

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      navLinks.classList.toggle('open');
      document.body.style.overflow =
        navLinks.classList.contains('open') ? 'hidden' : '';
    });

    navLinks.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navLinks.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  backToTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const yearEl = document.getElementById('footerYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

/* ================================================================
   HERO SLIDESHOW
================================================================ */
function initHeroSlideshow() {
  const slides = document.querySelectorAll('.hero-slide');
  if (!slides.length) return;

  let current = 0;
  setInterval(() => {
    slides[current].classList.remove('active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('active');
  }, 6000);
}

/* ================================================================
   HERO PARTICLES
================================================================ */
function initHeroParticles() {
  const container = document.getElementById('heroParticles');
  if (!container) return;

  for (let i = 0; i < 25; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      width:${Math.random() * 4 + 2}px;
      height:${Math.random() * 4 + 2}px;
      left:${Math.random() * 100}%;
      bottom:-6px;
      animation-duration:${Math.random() * 10 + 8}s;
      animation-delay:${Math.random() * 15}s;
      background:${Math.random() > 0.5 ? '#f97316' : '#f59e0b'};
    `;
    container.appendChild(p);
  }
}

/* ================================================================
   COUNTER ANIMATIONS
================================================================ */
function animateCounter(el, target, duration = 2000) {
  if (!el) return;
  const startTime = performance.now();

  function update(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    const value    = Math.floor(eased * target);

    if (target >= 1000000) {
      el.textContent = (eased * target / 1000000).toFixed(1).replace(/\.0$/, '') + 'M+';
    } else if (target >= 1000) {
      el.textContent = Math.floor(eased * target / 1000) + 'K+';
    } else {
      el.textContent = value + '+';
    }

    if (progress < 1) requestAnimationFrame(update);
    else {
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
   SCROLL ANIMATIONS (AOS + Counters + Progress Bars)
================================================================ */
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('aos-animate');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('[data-aos]').forEach(el => observer.observe(el));

  // Hero counters
  const heroObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        animateCounter(e.target, parseInt(e.target.dataset.target), 2000);
        heroObs.unobserve(e.target);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('.stat-number[data-target]').forEach(el => heroObs.observe(el));

  // Impact counters
  const impactObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        animateCounter(e.target, parseInt(e.target.dataset.target), 2500);
        impactObs.unobserve(e.target);
      }
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('.impact-number[data-target]').forEach(el => impactObs.observe(el));

  // Progress bars
  const barObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const el = e.target;
        const w  = el.dataset.width || el.style.width;
        el.style.width = '0%';
        setTimeout(() => { el.style.width = w; }, 200);
        barObs.unobserve(el);
      }
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('.progress-fill, .breakdown-fill').forEach(el => {
    el.dataset.width = el.style.width;
    el.style.width = '0%';
    barObs.observe(el);
  });
}

/* ================================================================
   STORIES SLIDER
================================================================ */
function initStoriesSlider() {
  const track   = document.getElementById('storiesTrack');
  const prevBtn = document.getElementById('prevStory');
  const nextBtn = document.getElementById('nextStory');
  const dots    = document.querySelectorAll('.dot');

  if (!track) return;

  let current  = 0;
  const total  = track.children.length;
  let autoTimer = null;

  function goTo(index) {
    current = (index + total) % total;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  }

  function startAuto() {
    autoTimer = setInterval(() => goTo(current + 1), 6000);
  }

  function resetAuto() {
    clearInterval(autoTimer);
    startAuto();
  }

  prevBtn?.addEventListener('click', () => { goTo(current - 1); resetAuto(); });
  nextBtn?.addEventListener('click', () => { goTo(current + 1); resetAuto(); });
  dots.forEach((dot, i) => dot.addEventListener('click', () => { goTo(i); resetAuto(); }));

  // Swipe support
  let startX = 0;
  track.addEventListener('touchstart', e => { startX = e.changedTouches[0].screenX; }, { passive: true });
  track.addEventListener('touchend',   e => {
    const diff = startX - e.changedTouches[0].screenX;
    if (Math.abs(diff) > 50) { goTo(diff > 0 ? current + 1 : current - 1); resetAuto(); }
  }, { passive: true });

  startAuto();
}

/* ================================================================
   COOKIE CONSENT
================================================================ */
function initCookieConsent() {
  const banner  = document.getElementById('cookieBanner');
  if (!banner) return;

  if (!localStorage.getItem('aci_cookie_consent')) {
    setTimeout(() => { banner.style.display = 'flex'; }, 2500);
  }

  document.getElementById('cookieAccept')?.addEventListener('click', () => {
    localStorage.setItem('aci_cookie_consent', 'accepted');
    banner.style.display = 'none';
  });

  document.getElementById('cookieDecline')?.addEventListener('click', () => {
    localStorage.setItem('aci_cookie_consent', 'declined');
    banner.style.display = 'none';
  });
}

/* ================================================================
   ACTION BUTTONS
================================================================ */
function initActionButtons() {
  document.getElementById('oneTimeBtn')?.addEventListener('click', () => switchMode('one-time'));
  document.getElementById('recurringBtn')?.addEventListener('click', () => switchMode('subscription'));
  document.getElementById('retryBtn')?.addEventListener('click', () => {
    showState('form');
    STATE.isProcessing = false;
  });
  document.getElementById('changePmBtn')?.addEventListener('click', () => {
    showState('form');
    STATE.isProcessing = false;
  });
  document.getElementById('donateAgainBtn')?.addEventListener('click', resetToForm);
}

/* ================================================================
   FORM SUBMIT
================================================================ */
function initFormSubmit() {
  document.getElementById('donationForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    initPaystackPayment();
  });
}

/* ================================================================
   MAIN INIT
================================================================ */
function init() {
  console.log('🌍 African Children Initiative — Starting...');

  initNavigation();
  initHeroSlideshow();
  initHeroParticles();
  initScrollAnimations();
  initStoriesSlider();
  initCookieConsent();
  initPresetButtons();
  initRealTimeValidation();
  initFormSubmit();
  initActionButtons();
  initShareButtons();

  updateDonationSummary(STATE.selectedAmount);
  updateDonateButton();
  updateImpactCalculator(STATE.selectedAmount);
  showState('form');

  // Set default preset active
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.amount) === 5000);
  });

  console.log('✅ ACI App ready!');
  console.log(`🔑 Paystack mode: ${CONFIG.PAYSTACK_PUBLIC_KEY.startsWith('pk_live') ? '🟢 LIVE' : '🟡 TEST'}`);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
