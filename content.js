// ============================================
// CONTENT.JS - Main Content Script
//
// FIX 1: AIManager initialization add kiya
//         Pehle: this.aiManager kabhi set nahi hota tha
//         Ab: init() mein await AIManager.create() call hota hai
//
// FIX 2: getValueForField() mein AI fallback add kiya
//         Pehle: profile nahi mila → null return
//         Ab: profile → AI fallback → default values
//
// FIX 3: fillField() mein React/Vue compatibility fix
//         Pehle: native setter baad mein, events incomplete
//         Ab: pehle native setter, phir proper event sequence
//
// Baaki sab ORIGINAL — scanAndFill, detectField, setupObservers,
// showTooltip, showToast, showProgress, reload — sab intact
// ============================================

class MagicFillPro {
  constructor() {
    this.settings = null;
    this.profiles = [];
    this.activeProfile = null;
    this.apiKeys = {};
    this.initialized = false;
    this.filledFields = new Set();
    this.userEditedFields = new Set();
    this.fieldDetectionCache = new Map();
    this.clipboardData = null;
    this.aiManager = null; // FIX 1: property declare kiya
    this.fieldDetector = new FieldDetector();

    this.init();
  }

  async init() {
    try {
      Utils.showToast('MagicFillPro init shuru...', 'info', 2000);
      Utils.info('Content', 'Initializing Magic Fill Pro...');

      await this.loadData();
      this.setupObservers();
      this.injectUI();

      // FIX 1: AIManager initialize karo agar AI mode ON hai
      if (this.settings?.aiModeEnabled) {
        try {
          Utils.showToast('AIManager initialize ho raha...', 'info', 2000);
          this.aiManager = await AIManager.create();
        } catch (e) {
          Utils.showToast(`AIManager init FAIL: ${e.message}`, 'error');
          Utils.error('Content', 'AIManager init failed', e);
        }
      }

      if (this.settings?.isEnabled) {
        setTimeout(() => this.scanAndFill(), 1500);
        setTimeout(() => this.scanAndFill(), 3000);
      }

      this.initialized = true;
      Utils.showToast('MagicFillPro ready ✓', 'success', 3000);
      Utils.info('Content', 'Ready');
    } catch (error) {
      Utils.showToast(`Init FAIL: ${error.message}`, 'error');
      Utils.error('Content', 'Init failed', error);
    }
  }

  async loadData() {
    this.settings = await Utils.sendMessage({ action: 'getSettings' }) || {
      isEnabled: true,
      aiModeEnabled: false,
      confidenceThreshold: 70,
      respectUserEdits: true,
      fillOptionalFields: false
    };

    const profileData = await Utils.sendMessage({ action: 'getProfiles' }) || { profiles: [], activeProfileId: null };
    this.profiles = profileData.profiles || [];
    this.activeProfile = this.profiles.find(p => p.id === profileData.activeProfileId);

    this.apiKeys = await Utils.sendMessage({ action: 'getApiKeys' }) || {};

    // Toast: profile loaded ya nahi
    if (this.activeProfile) {
      Utils.showToast(`Profile loaded: "${this.activeProfile.name}" (${this.activeProfile.fields?.length || 0} fields)`, 'success', 3000);
    } else {
      Utils.showToast('⚠ Active profile nahi mila! Settings mein set karo.', 'warn', 5000);
    }

    Utils.debug('Content', 'Data loaded', {
      settings: this.settings,
      profile: this.activeProfile?.name
    });
  }

  // ORIGINAL setupObservers
  setupObservers() {
    const observer = new MutationObserver(Utils.debounce(() => {
      this.scanAndFill();
    }, 500));

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    document.addEventListener('input', (e) => {
      if (e.target.matches('input, textarea, select')) {
        this.userEditedFields.add(e.target);
        e.target.classList.add('magic-fill-user-edited');
        const key = this.getFieldKey(e.target);
        this.fieldDetectionCache.delete(key);
      }
    });

    document.addEventListener('mouseover', (e) => {
      if (e.target.matches('input, textarea, select') && e.target.classList.contains('magic-fill-filled')) {
        this.showTooltip(e.target, 'Filled by Magic Fill');
      }
    });

    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        Utils.showToast(`URL change detect: ${url.slice(0, 50)}`, 'info', 2000);
        setTimeout(() => this.scanAndFill(), 1000);
      }
    }).observe(document, { subtree: true, childList: true });
  }

  // ORIGINAL injectUI
  injectUI() {
    if (!document.getElementById('magic-fill-float-btn')) {
      const btn = document.createElement('div');
      btn.id = 'magic-fill-float-btn';
      btn.innerHTML = '⚡';
      btn.title = 'Magic Fill - Auto Fill';
      btn.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; width: 50px; height: 50px;
        background: #8b5cf6; color: white; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 24px; cursor: pointer; z-index: 10000;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: all 0.3s ease;
      `;
      btn.onmouseover = () => { btn.style.transform = 'scale(1.1)'; };
      btn.onmouseout = () => { btn.style.transform = 'scale(1)'; };
      btn.onclick = () => this.scanAndFill();
      document.body.appendChild(btn);
    }
  }

  // ORIGINAL getFieldKey
  getFieldKey(input) {
    return `${input.tagName}-${input.name}-${input.id}-${input.className}`;
  }

  // ORIGINAL scanAndFill
  async scanAndFill() {
    if (!this.settings?.isEnabled) {
      Utils.showToast('Extension disabled — fill skip', 'warn', 2000);
      return;
    }
    if (!this.activeProfile) {
      Utils.showToast('⚠ Koi active profile nahi! Fill nahi hogi.', 'error', 5000);
      return;
    }

    const inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([disabled]), ' +
      'textarea:not([disabled]), select:not([disabled])'
    );

    Utils.debug('Content', `Found ${inputs.length} fields`);
    Utils.showToast(`${inputs.length} fields mile — fill shuru...`, 'info', 2000);

    let filled = 0;

    for (const input of inputs) {
      if (await this.tryFillField(input)) filled++;
    }

    if (filled > 0) {
      this.showToast(`Filled ${filled} field${filled > 1 ? 's' : ''}`, 'success');
      Utils.showToast(`Fill complete: ${filled}/${inputs.length} fields ✓`, 'success', 4000);
    } else {
      Utils.showToast('0 fields fill hue — check profile ya threshold', 'warn', 4000);
    }
  }

  // ORIGINAL tryFillField — async bana diya AI ke liye
  async tryFillField(input) {
    if (this.filledFields.has(input)) return false;

    if (this.settings.respectUserEdits) {
      if (this.userEditedFields.has(input)) return false;
      if (input.value && input.value.trim()) return false;
    }

    const fieldInfo = this.detectField(input);

    if (fieldInfo.confidence < (this.settings.confidenceThreshold || 70)) {
      Utils.debug('Content', `Low confidence for ${fieldInfo.type}: ${fieldInfo.confidence}%`);
      return false;
    }

    if (fieldInfo.isOptional && !this.settings.fillOptionalFields) return false;

    // FIX 2: getValueForField ab async hai (AI call ke liye)
    const value = await this.getValueForField(fieldInfo);

    if (value) {
      this.fillField(input, value, fieldInfo);
      return true;
    }

    return false;
  }

  // ORIGINAL detectField
  detectField(input) {
    const key = this.getFieldKey(input);
    if (this.fieldDetectionCache.has(key)) return this.fieldDetectionCache.get(key);

    const info = {
      element: input,
      type: 'text',
      label: '',
      placeholder: input.placeholder || '',
      name: input.name || '',
      id: input.id || '',
      className: input.className || '',
      isOptional: !input.required,
      confidence: 0,
      maxLength: input.maxLength,
      pattern: input.pattern || ''
    };

    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) info.label = label.textContent.trim();
    }
    if (!info.label) {
      const parent = input.closest('div, fieldset, li, td');
      if (parent) {
        const label = parent.querySelector('label, .label, .field-label');
        if (label) info.label = label.textContent.trim();
      }
    }
    if (!info.label) {
      let prev = input.previousElementSibling;
      while (prev) {
        if (prev.tagName === 'LABEL' || prev.classList.contains('label')) {
          info.label = prev.textContent.trim();
          break;
        }
        prev = prev.previousElementSibling;
      }
    }

    const surrounding = [];
    let parent = input.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      if (parent.textContent) surrounding.push(parent.textContent.trim());
      parent = parent.parentElement;
    }

    const allText = [info.label, info.placeholder, info.name, info.id, info.className, ...surrounding].join(' ').toLowerCase();

    const patterns = {
      firstname:  { keywords: ['first name', 'fname', 'given name', 'forename', 'first'], weight: 10 },
      lastname:   { keywords: ['last name', 'lname', 'surname', 'family name', 'last'], weight: 10 },
      fullname:   { keywords: ['full name', 'your name', 'name', 'fullname'], weight: 9 },
      email:      { keywords: ['email', 'e-mail', 'mail', 'electronic mail'], weight: 10 },
      phone:      { keywords: ['phone', 'mobile', 'tel', 'telephone', 'cell', 'contact'], weight: 9 },
      address:    { keywords: ['address', 'street', 'location', 'residence'], weight: 8 },
      city:       { keywords: ['city', 'town', 'village', 'municipality'], weight: 8 },
      state:      { keywords: ['state', 'province', 'region', 'county'], weight: 8 },
      zip:        { keywords: ['zip', 'postal', 'pincode', 'post code'], weight: 8 },
      country:    { keywords: ['country', 'nation'], weight: 8 },
      company:    { keywords: ['company', 'organization', 'employer', 'business'], weight: 7 },
      website:    { keywords: ['website', 'url', 'site', 'web'], weight: 7 },
      otp:        { keywords: ['otp', 'code', 'verification', 'verify', 'pin', 'token', '2fa'], weight: 9 },
      password:   { keywords: ['password', 'pass', 'secret'], weight: 9 },
      dob:        { keywords: ['dob', 'date of birth', 'birth', 'birthday'], weight: 8 }
    };

    let maxConfidence = 0;
    let detectedType = 'text';

    for (const [type, config] of Object.entries(patterns)) {
      let confidence = 0;
      for (const keyword of config.keywords) {
        if (allText.includes(keyword)) {
          confidence += config.weight;
          if (info.label.toLowerCase().includes(keyword)) confidence += 5;
          if (info.placeholder.toLowerCase().includes(keyword)) confidence += 3;
        }
      }
      if (type === 'email' && input.type === 'email') confidence += 20;
      if (type === 'phone' && input.type === 'tel') confidence += 20;
      if (type === 'otp' && input.type === 'text' && input.maxLength <= 8) confidence += 15;
      if (type === 'password' && input.type === 'password') confidence += 30;

      if (confidence > maxConfidence) {
        maxConfidence = confidence;
        detectedType = type;
      }
    }

    info.type = detectedType;
    info.confidence = Math.min(maxConfidence, 100);

    this.fieldDetectionCache.set(key, info);
    Utils.debug('Content', `Detected: ${info.type} (${info.confidence}%)`, info);
    return info;
  }

  // FIX 2: getValueForField ab async hai + AI fallback add kiya
  // Flow: Profile direct match → Name intelligence → AI fallback → Default values
  async getValueForField(fieldInfo) {
    if (!this.activeProfile) return null;

    const profile = this.activeProfile;
    const fields = profile.fields || [];

    // 1. Profile direct match
    const direct = fields.find(f => f.type === fieldInfo.type);
    if (direct?.value) {
      Utils.showToast(`Profile value: "${direct.value.slice(0,25)}" for ${fieldInfo.type}`, 'success', 2500);
      return direct.value;
    }

    // 2. Name intelligence — ORIGINAL
    if (fieldInfo.type === 'firstname') {
      const full = fields.find(f => f.type === 'fullname')?.value;
      if (full) return full.split(' ')[0];
      const first = fields.find(f => f.type === 'firstname')?.value;
      if (first) return first;
    }
    if (fieldInfo.type === 'lastname') {
      const full = fields.find(f => f.type === 'fullname')?.value;
      if (full) { const parts = full.split(' '); return parts.length > 1 ? parts.slice(1).join(' ') : ''; }
      const last = fields.find(f => f.type === 'lastname')?.value;
      if (last) return last;
    }
    if (fieldInfo.type === 'fullname') {
      const first = fields.find(f => f.type === 'firstname')?.value;
      const last = fields.find(f => f.type === 'lastname')?.value;
      if (first && last) return `${first} ${last}`;
      const full = fields.find(f => f.type === 'fullname')?.value;
      if (full) return full;
    }

    // 3. Label match — ORIGINAL
    if (fieldInfo.label) {
      const labelMatch = fields.find(f =>
        f.label && f.label.toLowerCase() === fieldInfo.label.toLowerCase()
      );
      if (labelMatch?.value) return labelMatch.value;
    }

    // FIX 2: AI fallback agar enabled hai aur AIManager ready hai
    if (this.settings?.aiModeEnabled && this.aiManager) {
      try {
        Utils.showToast(`Profile mein "${fieldInfo.type}" nahi mila — AI se try kar raha...`, 'info', 3000);
        const aiValue = await this.aiManager.getBestValue(fieldInfo, profile, fieldInfo.type);
        if (aiValue) {
          // AI filled fields ko track karo — ORIGINAL from content-old.js
          const aiStats = await Utils.storage.get('aiStats') || { aiFilledFields: 0 };
          aiStats.aiFilledFields = (aiStats.aiFilledFields || 0) + 1;
          await Utils.storage.set('aiStats', aiStats);
          return aiValue;
        }
      } catch (error) {
        Utils.logger.error('Content', 'AI fallback failed', error);
      }
    }

    // 4. Default values — ORIGINAL
    const defaults = {
      email: 'user@example.com',
      phone: '+1 (555) 123-4567',
      address: '123 Main Street',
      city: 'New York',
      state: 'NY',
      zip: '10001',
      country: 'USA',
      company: 'Acme Inc',
      website: 'https://example.com',
      dob: '1990-01-01'
    };

    return defaults[fieldInfo.type] || null;
  }

  // FIX 3: fillField — React/Vue compatibility proper kiya
  // Pehle: input.value set → events fire → phir native setter (order galat)
  // Ab: pehle native setter (React ke liye), phir full event sequence
  fillField(input, value, fieldInfo) {
    try {
      // Store original — ORIGINAL
      const originalValue = input.value;

      // FIX 3a: Native setter pehle — React 16+ ke liye zaroori
      // React apna synthetic event system use karta hai
      // Agar seedha input.value = x karo toh React ko pata nahi chalta
      const nativeSetter =
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

      if (nativeSetter) {
        nativeSetter.call(input, value);
      } else {
        input.value = value;
      }

      // FIX 3b: Proper event sequence — React, Vue, Angular sab ke liye
      input.dispatchEvent(new Event('focus', { bubbles: true }));
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        data: value,
        inputType: 'insertText'
      }));
      input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));

      // Mark as filled — ORIGINAL
      this.filledFields.add(input);
      input.classList.add('magic-fill-filled');
      input.setAttribute('data-magic-fill', 'filled');

      // Highlight — ORIGINAL
      input.classList.add('magic-fill-highlight');
      setTimeout(() => input.classList.remove('magic-fill-highlight'), 2000);

      Utils.debug('Content', `Filled ${fieldInfo.type} with: ${value.substring(0, 20)}`);
      Utils.showToast(`✓ Filled: ${fieldInfo.type} = "${value.slice(0, 25)}"`, 'success', 2500);
      return true;
    } catch (error) {
      Utils.error('Content', 'Fill failed', error);
      Utils.showToast(`Fill FAIL (${fieldInfo.type}): ${error.message}`, 'error');
      return false;
    }
  }

  // ORIGINAL showTooltip
  showTooltip(element, message) {
    const tooltip = document.createElement('div');
    tooltip.className = 'magic-fill-tooltip';
    tooltip.textContent = message;
    const rect = element.getBoundingClientRect();
    tooltip.style.top = rect.top - 30 + window.scrollY + 'px';
    tooltip.style.left = rect.left + rect.width / 2 + window.scrollX + 'px';
    tooltip.style.transform = 'translateX(-50%)';
    document.body.appendChild(tooltip);
    setTimeout(() => tooltip.remove(), 2000);
  }

  // ORIGINAL showToast (page ke bottom-right)
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `magic-fill-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'magic-fill-slide-in 0.3s reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ORIGINAL showProgress
  showProgress() {
    const progress = document.createElement('div');
    progress.className = 'magic-fill-progress';
    document.body.appendChild(progress);
    setTimeout(() => progress.remove(), 2000);
  }

  // ORIGINAL reload
  async reload() {
    Utils.info('Content', 'Reloading...');
    Utils.showToast('MagicFillPro reload ho raha...', 'info', 2000);
    this.filledFields.clear();
    this.fieldDetectionCache.clear();
    this.aiManager = null;
    await this.loadData();

    // AIManager reinit agar needed
    if (this.settings?.aiModeEnabled) {
      try {
        this.aiManager = await AIManager.create();
      } catch(e) {
        Utils.showToast(`Reload: AIManager init fail — ${e.message}`, 'error');
      }
    }
    this.scanAndFill();
  }
}

// ─── INITIALIZE ────────────────────────────────────────────────
let instance = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    instance = new MagicFillPro();
  });
} else {
  instance = new MagicFillPro();
}

// ─── MESSAGE LISTENER — ORIGINAL ──────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'triggerFill' && instance) {
    instance.scanAndFill().then ? instance.scanAndFill().then(() => sendResponse({ success: true })) : sendResponse({ success: true });
  }
  if (request.action === 'reload' && instance) {
    instance.reload().then(() => sendResponse({ success: true }));
  }
  if (request.action === 'getStatus' && instance) {
    sendResponse({
      initialized: instance.initialized,
      profile: instance.activeProfile?.name,
      filled: instance.filledFields.size
    });
  }
  return true;
});