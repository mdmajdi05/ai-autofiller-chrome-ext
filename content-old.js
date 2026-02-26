// content.js - Enhanced Magic Fill Content Script

class MagicFillExtension {
  constructor() {
    this.settings = {};
    this.profiles = [];
    this.activeProfile = null;
    this.clipboardHistory = [];
    this.currentClipboardData = null;
    this.isEnabled = false;
    this.aiMode = false;
    this.monitoringClipboard = false;
    this.lastUrl = window.location.href;
    this.pageObserver = null;
    this.clipboardInterval = null;
    this.initialized = false;
    this.fieldDetector = new FieldDetector();
    this.aiManager = null;
    this.filledFields = new Set(); // Track filled fields to avoid duplicates
    this.userEditedFields = new Set(); // Track user-edited fields
    
    this.init();
  }

  async init() {
    if (this.initialized) return;
    
    try {
      await this.loadSettings();
      await this.loadProfiles();
      await this.loadClipboardHistory();
      
      // Initialize AI Manager if needed
      if (this.settings.aiModeEnabled) {
        this.aiManager = new AIManager();
      }
      
      if (this.settings.isEnabled) {
        this.startClipboardMonitoring();
        this.setupPageMonitoring();
        this.setupFieldObservers();
        this.setupUserInteractionTracking();
        
        // Initial fill after a short delay
        setTimeout(() => this.smartFillAllFields(), 1000);
        setTimeout(() => this.smartFillAllFields(), 3000); // Second pass for dynamic fields
      }
      
      this.addVisualFeedback();
      this.injectStyles();
      this.initialized = true;
      
      Utils.logger.info('MagicFill', 'Extension initialized successfully', {
        profile: this.activeProfile?.name,
        aiMode: this.aiMode,
        fieldCount: this.activeProfile?.fields?.length || 0
      });
    } catch (error) {
      Utils.logger.error('MagicFill', 'Initialization error', error);
    }
  }

  async loadSettings() {
    try {
      const response = await Utils.sendMessage({ action: 'getSettings' });
      const defaults = {
        isEnabled: true,
        clipboardAutoFill: true,
        instantFill: true,
        respectUserEdits: true,
        fillOptionalFields: false,
        smartOtpDetection: true,
        clipboardTimeLimit: 5,
        aiModeEnabled: false
      };
      // merge defaults to ensure missing keys are filled
      this.settings = Object.assign({}, defaults, response || {});
      this.isEnabled = this.settings.isEnabled;
      this.aiMode = this.settings.aiModeEnabled;
    } catch (error) {
      Utils.logger.error('MagicFill', 'Error loading settings', error);
      this.settings = this.getDefaultSettings();
    }
  }

  getDefaultSettings() {
    return {
      isEnabled: true,
      clipboardAutoFill: true,
      instantFill: true,
      respectUserEdits: true,
      fillOptionalFields: false,
      smartOtpDetection: true,
      clipboardTimeLimit: 5,
      aiModeEnabled: false
    };
  }

  async loadProfiles() {
    try {
      const response = await Utils.sendMessage({ action: 'getProfiles' });
      this.profiles = response?.profiles || [];
      this.activeProfile = this.profiles.find(p => p.id === response?.activeProfileId);
      
      // Create default profile if none exists
      if (this.profiles.length === 0) {
        await this.createDefaultProfile();
      }
    } catch (error) {
      Utils.logger.error('MagicFill', 'Error loading profiles', error);
      this.profiles = [];
      this.activeProfile = null;
    }
  }

  async createDefaultProfile() {
    const defaultProfile = {
      id: Utils.generateId(),
      name: 'Default Profile',
      fields: [
        { type: 'firstname', value: 'Md Khaleeque', label: 'First Name' },
        { type: 'lastname', value: 'Akhtar', label: 'Last Name' },
        { type: 'fullname', value: 'Md Khaleeque Akhtar', label: 'Full Name' },
        { type: 'email', value: 'khaleeque@example.com', label: 'Email' },
        { type: 'phone', value: '+1234567890', label: 'Phone' },
        { type: 'address', value: '123 Main Street', label: 'Address' },
        { type: 'city', value: 'New York', label: 'City' },
        { type: 'state', value: 'NY', label: 'State' },
        { type: 'zip', value: '10001', label: 'ZIP Code' },
        { type: 'country', value: 'USA', label: 'Country' },
        { type: 'company', value: 'Tech Corp', label: 'Company' },
        { type: 'website', value: 'https://example.com', label: 'Website' },
        { type: 'dob', value: '1990-01-01', label: 'Date of Birth' }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.profiles = [defaultProfile];
    this.activeProfile = defaultProfile;

    await Utils.sendMessage({
      action: 'saveProfiles',
      profiles: this.profiles,
      activeProfileId: defaultProfile.id
    });
  }

  async loadClipboardHistory() {
    try {
      const response = await Utils.sendMessage({ action: 'getClipboardHistory' });
      this.clipboardHistory = response || [];
    } catch (error) {
      Utils.logger.error('MagicFill', 'Error loading clipboard history', error);
      this.clipboardHistory = [];
    }
  }

  // SMART FIELD FILLING LOGIC
  async smartFillAllFields() {
    if (!this.isEnabled || !this.settings.isEnabled) return;
    
    // determine profile to use
    const profile = this.activeProfile || this.profiles[0] || null;
    Utils.logger.info('MagicFill', 'Starting smart fill process', {
      active: !!this.activeProfile,
      profileName: profile?.name || null,
      profileFieldCount: profile?.fields?.length || 0
    });
    
    const inputs = this.getAllFillableInputs();
    let filledCount = 0;
    
    for (const input of inputs) {
      // Skip if already filled and user edits respected
      if (this.shouldSkipField(input)) continue;
      
      const fieldInfo = this.fieldDetector.detectFieldType(input, this.getFormContext(input.form));
      const value = await this.getSmartValueForField(fieldInfo, input);
      
      if (value) {
        this.fillField(input, value, fieldInfo);
        filledCount++;
      }
    }
    
    Utils.logger.info('MagicFill', `Smart fill complete: ${filledCount} fields filled`);
  }

  getAllFillableInputs() {
    return document.querySelectorAll(`
      input[type="text"], 
      input[type="email"], 
      input[type="number"], 
      input[type="tel"], 
      input[type="password"], 
      input[type="url"], 
      input[type="search"],
      input:not([type]),
      textarea,
      select
    `);
  }

  shouldSkipField(input) {
    // Skip if disabled or readonly
    if (input.disabled || input.readOnly) return true;
    
    // Skip if already has value and respect user edits
    if (this.settings.respectUserEdits && input.value.trim()) {
      if (this.userEditedFields.has(input) || input.dataset.magicFill === 'user-edited') {
        return true;
      }
    }
    
    // Skip if we already filled this field in this session
    if (this.filledFields.has(input)) return true;
    
    return false;
  }

  getFormContext(form) {
    if (!form) return {};
    
    return {
      formTitle: this.getFormTitle(form),
      formAction: form.action,
      formMethod: form.method,
      formId: form.id
    };
  }

  getFormTitle(form) {
    // Look for heading in form
    const heading = form.querySelector('h1, h2, h3, h4, h5, h6, legend, .form-title');
    if (heading) return heading.textContent;
    
    // Look for heading above form
    let prev = form.previousElementSibling;
    while (prev) {
      if (/^h[1-6]$/i.test(prev.tagName)) {
        return prev.textContent;
      }
      prev = prev.previousElementSibling;
    }
    
    return '';
  }

  async getSmartValueForField(fieldInfo, input) {
    Utils.logger.debug('MagicFill', `Getting value for ${fieldInfo.type} field`, { fieldInfo });
    
    let value = null;
    
    // 1. Try profile data first
    if (this.activeProfile && this.activeProfile.fields) {
      value = this.getProfileValue(fieldInfo);
      if (value) {
        Utils.logger.debug('MagicFill', 'Found value in profile', { value });
        return value;
      }
    }
    
    // 2. Try clipboard data for OTP/verification fields
    if (fieldInfo.type === 'otp' || fieldInfo.type === 'code') {
      value = this.getClipboardValue(fieldInfo);
      if (value) {
        Utils.logger.debug('MagicFill', 'Found value in clipboard', { value });
        return value;
      }
    }
    
    // 3. Try AI if enabled
    if (this.aiMode && this.aiManager) {
      try {
        value = await this.aiManager.getBestValue(fieldInfo, this.activeProfile, fieldInfo.type);
        if (value) {
          Utils.logger.debug('MagicFill', 'Got AI generated value', { value });
          // Track AI-filled field stat
          let aiStats = await Utils.storage.get('aiStats') || { aiFilledFields: 0 };
          aiStats.aiFilledFields = (aiStats.aiFilledFields || 0) + 1;
          await Utils.storage.set('aiStats', aiStats);
          return value;
        } else {
          Utils.logger.debug('MagicFill', 'AI returned no value, will try other fallbacks');
        }
      } catch (error) {
        Utils.logger.error('MagicFill', 'AI generation failed', error);
      }
    }
    
    // 4. For name fields, try intelligent name splitting
    if (fieldInfo.type === 'firstname' || fieldInfo.type === 'lastname') {
      value = this.getNamePart(fieldInfo.type);
      if (value) return value;
    }
    
    // 5. Generate smart defaults based on field type
    value = this.generateSmartDefault(fieldInfo);
    if (value) return value;
    
    return null;
  }

  getProfileValue(fieldInfo) {
    if (!this.activeProfile || !this.activeProfile.fields) return null;
    
    const fields = this.activeProfile.fields;
    
    // Direct type match
    const directMatch = fields.find(f => f.type === fieldInfo.type);
    if (directMatch && directMatch.value) return directMatch.value;
    
    // For name fields, try intelligent matching
    if (fieldInfo.type === 'firstname' || fieldInfo.type === 'lastname' || fieldInfo.type === 'fullname') {
      return this.getIntelligentNameValue(fieldInfo.type);
    }
    
    // Try label-based matching
    if (fieldInfo.label) {
      const labelMatch = fields.find(f => 
        f.label && this.areLabelsSimilar(f.label, fieldInfo.label)
      );
      if (labelMatch && labelMatch.value) return labelMatch.value;
    }
    
    return null;
  }

  getIntelligentNameValue(requestedType) {
    const profile = this.activeProfile;
    if (!profile || !profile.fields) return null;
    
    // Find name parts in profile
    const firstNameField = profile.fields.find(f => f.type === 'firstname');
    const lastNameField = profile.fields.find(f => f.type === 'lastname');
    const fullNameField = profile.fields.find(f => f.type === 'fullname');
    
    const firstName = firstNameField?.value || '';
    const lastName = lastNameField?.value || '';
    const fullName = fullNameField?.value || `${firstName} ${lastName}`.trim();
    
    switch (requestedType) {
      case 'firstname':
        return firstName || fullName.split(' ')[0] || null;
      case 'lastname':
        return lastName || fullName.split(' ').slice(1).join(' ') || null;
      case 'fullname':
        return fullName || `${firstName} ${lastName}`.trim() || null;
      default:
        return null;
    }
  }

  getNamePart(part) {
    return this.getIntelligentNameValue(part);
  }

  getClipboardValue(fieldInfo) {
    if (!this.clipboardHistory || this.clipboardHistory.length === 0) return null;
    
    const timeLimit = this.settings.clipboardTimeLimit * 60 * 1000;
    const now = Date.now();
    
    // Get recent clipboard items
    const recent = this.clipboardHistory.filter(item => 
      now - new Date(item.timestamp).getTime() <= timeLimit
    );
    
    // For OTP fields, try to find matching length
    if (fieldInfo.type === 'otp' && fieldInfo.otpLength) {
      for (const item of recent) {
        const numbers = item.value.match(/\d+/g);
        if (numbers) {
          const match = numbers.find(num => num.length === fieldInfo.otpLength);
          if (match) return match;
        }
      }
    }
    
    // For email fields
    if (fieldInfo.type === 'email') {
      const emailItem = recent.find(item => item.type === 'email' || item.value.includes('@'));
      if (emailItem) return emailItem.value;
    }
    
    // For phone fields
    if (fieldInfo.type === 'tel' || fieldInfo.type === 'phone') {
      const phoneItem = recent.find(item => 
        item.type === 'number' || /^[\d\+\-\(\)\s]+$/.test(item.value)
      );
      if (phoneItem) return phoneItem.value;
    }
    
    return null;
  }

  async generateSmartDefault(fieldInfo) {
    // Provide simple defaults when no other source yields a value.
    // Previously we skipped defaults if aiMode was active; that prevented
    // fallback when AI returned null. Always return defaults regardless of AI
    // mode so users still get something sensible.
    const defaults = {
      email: 'user@example.com',
      phone: '+1234567890',
      address: '123 Main Street',
      city: 'New York',
      state: 'NY',
      zip: '10001',
      country: 'USA',
      company: 'Acme Inc',
      website: 'https://example.com',
      dob: '1990-01-01',
      firstname: 'John',
      lastname: 'Doe',
      fullname: 'John Doe'
    };
    return defaults[fieldInfo.type] || null;
  }

  areLabelsSimilar(label1, label2) {
    const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalize(label1) === normalize(label2) ||
           normalize(label1).includes(normalize(label2)) ||
           normalize(label2).includes(normalize(label1));
  }

  fillField(input, value, fieldInfo) {
    if (!input || !value) return;
    
    try {
      // Set the value
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      ).set;
      nativeInputValueSetter.call(input, value);
      
      // Trigger events
      ['input', 'change', 'blur'].forEach(eventType => {
        input.dispatchEvent(new Event(eventType, { bubbles: true }));
      });
      
      // Mark as filled
      this.filledFields.add(input);
      input.dataset.magicFill = 'filled';
      
      // Add visual feedback
      this.highlightField(input, fieldInfo.type);
      
      // Track for undo
      this.trackFieldFill(input, value);
      
      Utils.logger.debug('MagicFill', 'Field filled successfully', {
        type: fieldInfo.type,
        value: value.substring(0, 20)
      });
    } catch (error) {
      Utils.logger.error('MagicFill', 'Error filling field', error);
    }
  }

  highlightField(input, type) {
    input.classList.add('magic-fill-highlight');
    
    // Remove highlight after animation
    setTimeout(() => {
      input.classList.remove('magic-fill-highlight');
    }, 2000);
  }

  trackFieldFill(input, value) {
    // Store fill history for possible undo
    if (!window.magicFillHistory) {
      window.magicFillHistory = [];
    }
    
    window.magicFillHistory.push({
      input,
      oldValue: input.dataset.magicFillOriginal || '',
      newValue: value,
      timestamp: Date.now(),
      fieldType: input.type
    });
    
    // Keep only last 50 fills
    if (window.magicFillHistory.length > 50) {
      window.magicFillHistory.shift();
    }
  }

  setupUserInteractionTracking() {
    // Track when user manually edits a field
    document.addEventListener('input', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        if (e.target.dataset.magicFill === 'filled') {
          this.userEditedFields.add(e.target);
          e.target.dataset.magicFill = 'user-edited';
          
          Utils.logger.debug('MagicFill', 'User edited a filled field', {
            field: e.target.name || e.target.id
          });
        }
      }
    });
  }

  setupFieldObservers() {
    // Watch for dynamically added fields
    const observer = new MutationObserver((mutations) => {
      let hasNewFields = false;
      
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            if (node.matches?.('input, select, textarea')) {
              hasNewFields = true;
            } else if (node.querySelectorAll) {
              const inputs = node.querySelectorAll('input, select, textarea');
              if (inputs.length > 0) hasNewFields = true;
            }
          }
        });
      });
      
      if (hasNewFields) {
        setTimeout(() => this.smartFillAllFields(), 500);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  startClipboardMonitoring() {
    if (this.monitoringClipboard) return;
    
    this.monitoringClipboard = true;
    
    // Check clipboard periodically
    this.clipboardInterval = setInterval(() => {
      this.checkClipboard();
    }, 3000);
    
    // Also check on focus
    window.addEventListener('focus', () => {
      setTimeout(() => this.checkClipboard(), 100);
    });
  }

  async checkClipboard() {
    try {
      if (!document.hasFocus()) return;
      
      const response = await Utils.sendMessage({ action: 'getClipboardText' });
      if (!response || !response.text) return;
      
      const text = response.text.trim();
      if (!text || text === this.currentClipboardData?.value) return;
      
      const clipboardData = this.analyzeClipboardContent(text);
      this.currentClipboardData = clipboardData;
      
      // Add to history
      this.clipboardHistory.unshift(clipboardData);
      this.clipboardHistory = this.clipboardHistory.slice(0, 20);
      
      // Save to storage
      await Utils.sendMessage({
        action: 'saveClipboardHistory',
        history: this.clipboardHistory
      });
      
      // Trigger auto-fill for OTP fields if smart detection enabled
      if (this.settings.smartOtpDetection && clipboardData.type === 'otp') {
        this.fillOtpFields(clipboardData.value);
      }
    } catch (error) {
      // Silent fail - clipboard access not available
    }
  }

  analyzeClipboardContent(text) {
    const trimmed = text.trim();
    const isNumeric = /^\d+$/.test(trimmed);
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    const isPhone = /^[\+\d\-\s\(\)]{7,}$/.test(trimmed);
    
    // OTP detection
    const otpResult = this.detectOtp(trimmed);
    
    let type = 'text';
    let confidence = 0.5;
    
    if (otpResult.isOtp) {
      type = 'otp';
      confidence = otpResult.confidence;
    } else if (isEmail) {
      type = 'email';
      confidence = 0.9;
    } else if (isPhone) {
      type = 'phone';
      confidence = 0.8;
    } else if (isNumeric) {
      type = 'number';
      confidence = 0.7;
    }
    
    return {
      value: trimmed,
      type,
      timestamp: new Date().toISOString(),
      length: trimmed.length,
      isNumeric,
      confidence,
      otpLength: otpResult.length
    };
  }

  detectOtp(text) {
    const numbers = text.match(/\d+/g) || [];
    const allNumbers = numbers.join('');
    
    // Common OTP keywords
    const otpKeywords = ['otp', 'code', 'verify', 'verification', 'pin', 'token', '2fa', 'mfa'];
    const hasKeywords = otpKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    );
    
    // Check for common OTP lengths
    const commonLengths = [4, 5, 6, 8];
    const isCommonLength = commonLengths.includes(allNumbers.length);
    
    let confidence = 0;
    if (hasKeywords) confidence += 0.4;
    if (isCommonLength) confidence += 0.3;
    if (/^\d+$/.test(text.trim())) confidence += 0.3;
    
    return {
      isOtp: confidence >= 0.5,
      length: allNumbers.length,
      confidence,
      extractedNumbers: numbers,
      hasMultipleNumbers: numbers.length > 1
    };
  }

  fillOtpFields(otpValue) {
    // Find all OTP/code fields and fill them
    const otpFields = document.querySelectorAll('input[type="text"], input:not([type])');
    
    otpFields.forEach(input => {
      if (input.value) return; // Skip already filled
      
      const fieldInfo = this.fieldDetector.detectFieldType(input);
      if (fieldInfo.type === 'otp') {
        this.fillField(input, otpValue, fieldInfo);
      }
    });
  }

  setupPageMonitoring() {
    // Monitor URL changes for SPA navigation
    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        setTimeout(() => this.smartFillAllFields(), 1000);
      }
    }, 1000);
  }

  injectStyles() {
    if (document.getElementById('magic-fill-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'magic-fill-styles';
    style.textContent = `
      @keyframes magicFillPulse {
        0% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.7); }
        50% { box-shadow: 0 0 0 8px rgba(139, 92, 246, 0.3); }
        100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
      }
      
      .magic-fill-highlight {
        animation: magicFillPulse 1.5s ease-in-out !important;
        border-color: #8b5cf6 !important;
        transition: all 0.3s ease;
      }
      
      input[data-magic-fill="filled"] {
        border-color: #10b981 !important;
        background-color: rgba(16, 185, 129, 0.05) !important;
      }
      
      input[data-magic-fill="user-edited"] {
        border-color: #f59e0b !important;
      }
      
      .magic-fill-tooltip {
        position: absolute;
        background: #1f2937;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 10000;
        pointer-events: none;
        animation: fadeIn 0.2s ease;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    
    document.head.appendChild(style);
  }

  addVisualFeedback() {
    // Add visual feedback on hover for filled fields
    document.addEventListener('mouseover', (e) => {
      if (e.target.dataset?.magicFill === 'filled') {
        this.showTooltip(e.target, 'Filled by Magic Fill');
      }
    });
  }

  showTooltip(element, message) {
    const tooltip = document.createElement('div');
    tooltip.className = 'magic-fill-tooltip';
    tooltip.textContent = message;
    tooltip.style.top = element.getBoundingClientRect().top - 25 + window.scrollY + 'px';
    tooltip.style.left = element.getBoundingClientRect().left + window.scrollX + 'px';
    
    document.body.appendChild(tooltip);
    
    setTimeout(() => {
      tooltip.remove();
    }, 2000);
  }

  destroy() {
    if (this.pageObserver) {
      this.pageObserver.disconnect();
      this.pageObserver = null;
    }
    if (this.clipboardInterval) {
      clearInterval(this.clipboardInterval);
      this.clipboardInterval = null;
    }
    this.monitoringClipboard = false;
    this.initialized = false;
  }

  async reload() {
    this.destroy();
    this.initialized = false;
    await this.init();
  }
}

// Initialize the extension
let magicFillInstance = null;

// Handle messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handleMessage = async () => {
    try {
      switch (request.action) {
        case 'ping':
          return { success: true, active: !!magicFillInstance };
          
        case 'triggerFill':
          if (magicFillInstance) {
            await magicFillInstance.smartFillAllFields();
          }
          return { success: true };
          
        case 'reload':
          if (magicFillInstance) {
            await magicFillInstance.reload();
          } else {
            magicFillInstance = new MagicFillExtension();
          }
          return { success: true };
          
        case 'getStatus':
          return {
            active: !!magicFillInstance,
            aiMode: magicFillInstance?.aiMode || false,
            profile: magicFillInstance?.activeProfile?.name || null
          };
          
        default:
          return { success: false, error: 'Unknown action' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  handleMessage().then(sendResponse);
  return true;
});

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    magicFillInstance = new MagicFillExtension();
  });
} else {
  magicFillInstance = new MagicFillExtension();
}