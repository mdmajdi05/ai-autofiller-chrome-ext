// ============================================
// CONTENT.JS - Main Content Script
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
    
    this.init();
  }

  async init() {
    try {
      Utils.info('Content', 'Initializing Magic Fill Pro...');
      
      await this.loadData();
      this.setupObservers();
      this.injectUI();
      
      if (this.settings?.isEnabled) {
        setTimeout(() => this.scanAndFill(), 1500);
        setTimeout(() => this.scanAndFill(), 3000); // Second pass
      }
      
      this.initialized = true;
      Utils.info('Content', 'Ready');
    } catch (error) {
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
    
    Utils.debug('Content', 'Data loaded', {
      settings: this.settings,
      profile: this.activeProfile?.name
    });
  }

  setupObservers() {
    // Watch for DOM changes
    const observer = new MutationObserver(Utils.debounce(() => {
      this.scanAndFill();
    }, 500));
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
    
    // Track user edits
    document.addEventListener('input', (e) => {
      if (e.target.matches('input, textarea, select')) {
        this.userEditedFields.add(e.target);
        e.target.classList.add('magic-fill-user-edited');
        
        // Clear cache for this field
        const key = this.getFieldKey(e.target);
        this.fieldDetectionCache.delete(key);
      }
    });
    
    // Track focus for tooltips
    document.addEventListener('mouseover', (e) => {
      if (e.target.matches('input, textarea, select') && e.target.classList.contains('magic-fill-filled')) {
        this.showTooltip(e.target, 'Filled by Magic Fill');
      }
    });
    
    // Track URL changes (SPA)
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(() => this.scanAndFill(), 1000);
      }
    }).observe(document, { subtree: true, childList: true });
  }

  injectUI() {
    // Add floating button for manual trigger
    if (!document.getElementById('magic-fill-float-btn')) {
      const btn = document.createElement('div');
      btn.id = 'magic-fill-float-btn';
      btn.innerHTML = '⚡';
      btn.title = 'Magic Fill - Auto Fill';
      btn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 50px;
        height: 50px;
        background: #8b5cf6;
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        cursor: pointer;
        z-index: 10000;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        transition: all 0.3s ease;
      `;
      
      btn.onmouseover = () => {
        btn.style.transform = 'scale(1.1)';
        btn.style.boxShadow = '0 6px 8px rgba(0,0,0,0.2)';
      };
      
      btn.onmouseout = () => {
        btn.style.transform = 'scale(1)';
        btn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
      };
      
      btn.onclick = () => this.scanAndFill();
      
      document.body.appendChild(btn);
    }
  }

  getFieldKey(input) {
    return `${input.tagName}-${input.name}-${input.id}-${input.className}`;
  }

  scanAndFill() {
    if (!this.settings?.isEnabled) return;
    
    const inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([disabled]), ' +
      'textarea:not([disabled]), ' +
      'select:not([disabled])'
    );
    
    Utils.debug('Content', `Found ${inputs.length} fields`);
    
    let filled = 0;
    inputs.forEach(input => {
      if (this.tryFillField(input)) filled++;
    });
    
    if (filled > 0) {
      this.showToast(`Filled ${filled} field${filled > 1 ? 's' : ''}`, 'success');
    }
  }

  tryFillField(input) {
    // Skip if already filled
    if (this.filledFields.has(input)) return false;
    
    // Skip if user edited and respect enabled
    if (this.settings.respectUserEdits) {
      if (this.userEditedFields.has(input)) return false;
      if (input.value && input.value.trim()) return false;
    }
    
    // Detect field type
    const fieldInfo = this.detectField(input);
    
    // Check confidence threshold
    if (fieldInfo.confidence < (this.settings.confidenceThreshold || 70)) {
      Utils.debug('Content', `Low confidence for ${fieldInfo.type}: ${fieldInfo.confidence}%`);
      return false;
    }
    
    // Skip optional if disabled
    if (fieldInfo.isOptional && !this.settings.fillOptionalFields) return false;
    
    // Get value
    const value = this.getValueForField(fieldInfo);
    
    if (value) {
      this.fillField(input, value, fieldInfo);
      return true;
    }
    
    return false;
  }

  detectField(input) {
    // Check cache
    const key = this.getFieldKey(input);
    if (this.fieldDetectionCache.has(key)) {
      return this.fieldDetectionCache.get(key);
    }
    
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
    
    // Get label from various sources
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
    
    // Get surrounding text
    const surrounding = [];
    let parent = input.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      if (parent.textContent) {
        surrounding.push(parent.textContent.trim());
      }
      parent = parent.parentElement;
    }
    
    const allText = [
      info.label,
      info.placeholder,
      info.name,
      info.id,
      info.className,
      ...surrounding
    ].join(' ').toLowerCase();
    
    // Field type patterns with weights
    const patterns = {
      firstname: {
        keywords: ['first name', 'fname', 'given name', 'forename', 'first'],
        weight: 10
      },
      lastname: {
        keywords: ['last name', 'lname', 'surname', 'family name', 'last'],
        weight: 10
      },
      fullname: {
        keywords: ['full name', 'your name', 'name', 'fullname'],
        weight: 9
      },
      email: {
        keywords: ['email', 'e-mail', 'mail', 'electronic mail'],
        weight: 10
      },
      phone: {
        keywords: ['phone', 'mobile', 'tel', 'telephone', 'cell', 'contact'],
        weight: 9
      },
      address: {
        keywords: ['address', 'street', 'location', 'residence'],
        weight: 8
      },
      city: {
        keywords: ['city', 'town', 'village', 'municipality'],
        weight: 8
      },
      state: {
        keywords: ['state', 'province', 'region', 'county'],
        weight: 8
      },
      zip: {
        keywords: ['zip', 'postal', 'pincode', 'post code'],
        weight: 8
      },
      country: {
        keywords: ['country', 'nation'],
        weight: 8
      },
      company: {
        keywords: ['company', 'organization', 'employer', 'business'],
        weight: 7
      },
      website: {
        keywords: ['website', 'url', 'site', 'web'],
        weight: 7
      },
      otp: {
        keywords: ['otp', 'code', 'verification', 'verify', 'pin', 'token', '2fa'],
        weight: 9
      },
      password: {
        keywords: ['password', 'pass', 'secret'],
        weight: 9
      },
      dob: {
        keywords: ['dob', 'date of birth', 'birth', 'birthday'],
        weight: 8
      }
    };
    
    // Calculate confidence for each type
    let maxConfidence = 0;
    let detectedType = 'text';
    
    for (const [type, config] of Object.entries(patterns)) {
      let confidence = 0;
      
      for (const keyword of config.keywords) {
        if (allText.includes(keyword)) {
          confidence += config.weight;
          
          // Bonus if keyword appears in label or placeholder
          if (info.label.toLowerCase().includes(keyword)) confidence += 5;
          if (info.placeholder.toLowerCase().includes(keyword)) confidence += 3;
        }
      }
      
      // Type-based confidence
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
    
    // Special handling for name fields
    if (detectedType === 'firstname' || detectedType === 'lastname' || detectedType === 'fullname') {
      if (allText.includes('first') && allText.includes('last')) {
        // Could be either, reduce confidence
        info.confidence = Math.max(60, info.confidence - 10);
      }
    }
    
    // Cache the result
    this.fieldDetectionCache.set(key, info);
    
    Utils.debug('Content', `Detected field: ${info.type} (${info.confidence}%)`, info);
    return info;
  }

  getValueForField(fieldInfo) {
    if (!this.activeProfile) return null;
    
    const profile = this.activeProfile;
    const fields = profile.fields || [];
    
    // Direct match
    const direct = fields.find(f => f.type === fieldInfo.type);
    if (direct?.value) return direct.value;
    
    // Name intelligence
    if (fieldInfo.type === 'firstname') {
      const full = fields.find(f => f.type === 'fullname')?.value;
      if (full) {
        const parts = full.split(' ');
        return parts[0];
      }
      
      const first = fields.find(f => f.type === 'firstname')?.value;
      if (first) return first;
    }
    
    if (fieldInfo.type === 'lastname') {
      const full = fields.find(f => f.type === 'fullname')?.value;
      if (full) {
        const parts = full.split(' ');
        return parts.length > 1 ? parts.slice(1).join(' ') : '';
      }
      
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
    
    // Try label-based matching
    if (fieldInfo.label) {
      const labelMatch = fields.find(f => 
        f.label && f.label.toLowerCase() === fieldInfo.label.toLowerCase()
      );
      if (labelMatch?.value) return labelMatch.value;
    }
    
    // Default values
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

  fillField(input, value, fieldInfo) {
    try {
      // Store original value
      const originalValue = input.value;
      
      // Set value
      input.value = value;
      
      // Trigger events
      ['input', 'change', 'blur', 'focus'].forEach(eventType => {
        input.dispatchEvent(new Event(eventType, { bubbles: true }));
      });
      
      // React specific
      const reactInput = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      
      if (reactInput) {
        reactInput.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      // Mark as filled
      this.filledFields.add(input);
      input.classList.add('magic-fill-filled');
      input.setAttribute('data-magic-fill', 'filled');
      
      // Highlight
      input.classList.add('magic-fill-highlight');
      setTimeout(() => {
        input.classList.remove('magic-fill-highlight');
      }, 2000);
      
      Utils.debug('Content', `Filled ${fieldInfo.type} with:`, value);
      
      return true;
    } catch (error) {
      Utils.error('Content', 'Fill failed', error);
      return false;
    }
  }

  showTooltip(element, message) {
    const tooltip = document.createElement('div');
    tooltip.className = 'magic-fill-tooltip';
    tooltip.textContent = message;
    
    const rect = element.getBoundingClientRect();
    tooltip.style.top = rect.top - 30 + window.scrollY + 'px';
    tooltip.style.left = rect.left + rect.width / 2 + window.scrollX + 'px';
    tooltip.style.transform = 'translateX(-50%)';
    
    document.body.appendChild(tooltip);
    
    setTimeout(() => {
      tooltip.remove();
    }, 2000);
  }

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

  showProgress() {
    const progress = document.createElement('div');
    progress.className = 'magic-fill-progress';
    document.body.appendChild(progress);
    
    setTimeout(() => progress.remove(), 2000);
  }

  async reload() {
    Utils.info('Content', 'Reloading...');
    this.filledFields.clear();
    this.fieldDetectionCache.clear();
    await this.loadData();
    this.scanAndFill();
  }
}

// Initialize
let instance = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    instance = new MagicFillPro();
  });
} else {
  instance = new MagicFillPro();
}

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'triggerFill' && instance) {
    instance.scanAndFill();
    sendResponse({ success: true });
  }
  
  if (request.action === 'reload' && instance) {
    instance.reload();
    sendResponse({ success: true });
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