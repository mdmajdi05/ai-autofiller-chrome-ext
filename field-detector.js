// field-detector.js - Advanced field detection with context understanding

class FieldDetector {
  constructor() {
    this.detectionPatterns = this.initializePatterns();
  }

  initializePatterns() {
    return {
      firstname: {
        patterns: ['first name', 'fname', 'given name', 'forename', 'firstname'],
        priority: 10,
        context: ['personal', 'contact', 'billing', 'shipping']
      },
      lastname: {
        patterns: ['last name', 'lname', 'surname', 'family name', 'lastname'],
        priority: 10,
        context: ['personal', 'contact', 'billing', 'shipping']
      },
      fullname: {
        patterns: ['full name', 'your name', 'name', 'fullname', 'display name'],
        priority: 9,
        context: ['personal', 'contact', 'profile', 'account']
      },
      email: {
        patterns: ['email', 'e-mail', 'mail', 'electronic mail', 'email address'],
        priority: 10,
        context: ['contact', 'login', 'signup', 'account']
      },
      phone: {
        patterns: ['phone', 'mobile', 'tel', 'telephone', 'cell', 'contact number', 'phone number'],
        priority: 10,
        context: ['contact', 'personal', 'emergency']
      },
      address: {
        patterns: ['address', 'street', 'street address', 'location', 'residence'],
        priority: 8,
        context: ['shipping', 'billing', 'delivery', 'contact']
      },
      city: {
        patterns: ['city', 'town', 'village', 'municipality', 'city/town'],
        priority: 8,
        context: ['shipping', 'billing', 'location']
      },
      state: {
        patterns: ['state', 'province', 'region', 'county', 'state/province'],
        priority: 8,
        context: ['shipping', 'billing', 'location']
      },
      zip: {
        patterns: ['zip', 'postal', 'pincode', 'post code', 'zip code', 'postal code'],
        priority: 8,
        context: ['shipping', 'billing', 'location']
      },
      country: {
        patterns: ['country', 'nation', 'country/region'],
        priority: 8,
        context: ['shipping', 'billing', 'location']
      },
      company: {
        patterns: ['company', 'organization', 'employer', 'work', 'business'],
        priority: 7,
        context: ['professional', 'work', 'billing']
      },
      website: {
        patterns: ['website', 'url', 'site', 'web site', 'homepage'],
        priority: 6,
        context: ['professional', 'contact']
      },
      otp: {
        patterns: ['otp', 'code', 'verification', 'verify', 'pin', 'token', '2fa', 'mfa', 'authenticator', 'security code'],
        priority: 9,
        context: ['security', 'login', 'verification']
      },
      password: {
        patterns: ['password', 'pass', 'secret', 'passcode'],
        priority: 9,
        context: ['login', 'signup', 'security']
      },
      dob: {
        patterns: ['dob', 'date of birth', 'birth date', 'birthday', 'birth'],
        priority: 7,
        context: ['personal', 'profile']
      }
    };
  }

  detectFieldType(input, formContext = {}) {
    // Gather all possible sources of information
    const sources = this.gatherFieldSources(input, formContext);
    
    // Analyze each source
    let bestMatch = {
      type: 'text',
      confidence: 0,
      label: sources.label || sources.placeholder || '',
      isOptional: this.isOptionalField(input, sources)
    };

    // Check each pattern category
    for (const [fieldType, config] of Object.entries(this.detectionPatterns)) {
      const confidence = this.calculateConfidence(sources, config);
      
      if (confidence > bestMatch.confidence) {
        bestMatch = {
          type: fieldType,
          confidence,
          label: this.cleanLabel(sources.label || sources.placeholder || sources.name || ''),
          isOptional: bestMatch.isOptional,
          otpLength: fieldType === 'otp' ? this.getOtpLength(input) : undefined
        };
      }
    }

    // Special handling for name fields
    if (bestMatch.type === 'fullname') {
      bestMatch.nameType = 'full';
    } else if (bestMatch.type === 'firstname') {
      bestMatch.nameType = 'first';
    } else if (bestMatch.type === 'lastname') {
      bestMatch.nameType = 'last';
    }

    Utils.logger.debug('FieldDetector', 'Field detection result', { input: input.name || input.id, bestMatch });
    return bestMatch;
  }

  gatherFieldSources(input, formContext) {
    const sources = {
      label: this.getFieldLabel(input),
      placeholder: input.placeholder || '',
      name: input.name || '',
      id: input.id || '',
      className: input.className || '',
      ariaLabel: input.getAttribute('aria-label') || '',
      title: input.title || '',
      type: input.type || '',
      required: input.required || false,
      maxLength: input.maxLength,
      pattern: input.pattern || '',
      
      // Context from form
      formTitle: formContext.formTitle || '',
      formAction: formContext.formAction || '',
      pageTitle: document.title || '',
      
      // Surrounding elements
      precedingHeading: this.getPrecedingHeading(input),
      parentText: this.getParentText(input),
      siblingText: this.getSiblingText(input),
      formPurpose: this.detectFormPurpose(formContext)
    };

    return sources;
  }

  getFieldLabel(input) {
    // Try multiple label detection methods
    
    // 1. Explicit label with 'for' attribute
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) return label.textContent.trim();
    }
    
    // 2. Wrapping label
    const parentLabel = input.closest('label');
    if (parentLabel) {
      return parentLabel.textContent.replace(input.value || '', '').trim();
    }
    
    // 3. Label in parent container
    const parent = input.closest('div, fieldset, form, li, td');
    if (parent) {
      // Look for label, span, div that might be a label
      const possibleLabels = parent.querySelectorAll('label, .label, .field-label, span:not(:has(input))');
      for (const label of possibleLabels) {
        const text = label.textContent.trim();
        if (text && text.length < 100) { // Reasonable label length
          return text;
        }
      }
    }
    
    // 4. Previous sibling label
    let prev = input.previousElementSibling;
    while (prev) {
      if (prev.tagName === 'LABEL' || prev.classList.contains('label')) {
        return prev.textContent.trim();
      }
      prev = prev.previousElementSibling;
    }
    
    // 5. Placeholder or name as fallback
    return input.placeholder || input.name || input.id || '';
  }

  getPrecedingHeading(input) {
    // Find the nearest heading above the input
    let element = input;
    while (element && element !== document.body) {
      const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');
      if (headings.length > 0) {
        return headings[headings.length - 1].textContent.trim();
      }
      element = element.parentElement;
    }
    return '';
  }

  getParentText(input) {
    const parent = input.parentElement;
    if (parent) {
      // Clone to avoid modifying the DOM
      const clone = parent.cloneNode(true);
      const inputClone = clone.querySelector('input, select, textarea');
      if (inputClone) inputClone.remove();
      return clone.textContent.replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  getSiblingText(input) {
    const siblings = [];
    let sibling = input.previousElementSibling;
    while (sibling) {
      if (sibling.tagName !== 'INPUT' && sibling.tagName !== 'SELECT' && sibling.tagName !== 'TEXTAREA') {
        siblings.unshift(sibling.textContent.trim());
      }
      sibling = sibling.previousElementSibling;
    }
    return siblings.join(' ');
  }

  detectFormPurpose(formContext) {
    const text = [
      formContext.formTitle || '',
      formContext.formAction || '',
      document.title || '',
      document.querySelector('meta[name="description"]')?.content || ''
    ].join(' ').toLowerCase();

    if (text.includes('login') || text.includes('sign in')) return 'login';
    if (text.includes('signup') || text.includes('register')) return 'signup';
    if (text.includes('checkout') || text.includes('payment')) return 'checkout';
    if (text.includes('contact')) return 'contact';
    if (text.includes('profile') || text.includes('account')) return 'profile';
    
    return 'unknown';
  }

  calculateConfidence(sources, config) {
    let confidence = 0;
    const allText = [
      sources.label,
      sources.placeholder,
      sources.name,
      sources.id,
      sources.className,
      sources.ariaLabel,
      sources.title,
      sources.precedingHeading,
      sources.parentText,
      sources.siblingText,
      sources.formTitle,
      sources.formPurpose
    ].join(' ').toLowerCase();

    // Check each pattern
    for (const pattern of config.patterns) {
      if (allText.includes(pattern.toLowerCase())) {
        confidence += 20;
        
        // Bonus if pattern appears in label or placeholder
        if (sources.label.toLowerCase().includes(pattern)) confidence += 10;
        if (sources.placeholder.toLowerCase().includes(pattern)) confidence += 5;
      }
    }

    // Context matching bonus
    for (const ctx of config.context) {
      if (allText.includes(ctx)) {
        confidence += 5;
      }
    }

    // Type-based confidence
    if (sources.type === 'email' && config.patterns.includes('email')) confidence += 30;
    if (sources.type === 'tel' && config.patterns.includes('phone')) confidence += 30;
    if (sources.pattern && sources.pattern.includes('email') && config.patterns.includes('email')) confidence += 15;

    // Cap at 100
    return Math.min(confidence, 100);
  }

  isOptionalField(input, sources) {
    // Check if field is marked as optional
    if (!input.required) {
      const optionalIndicators = ['optional', '(optional)', 'not required', 'if any'];
      const text = [sources.label, sources.placeholder, sources.parentText].join(' ').toLowerCase();
      
      for (const indicator of optionalIndicators) {
        if (text.includes(indicator)) {
          return true;
        }
      }
      
      // Check for asterisk in label (usually means required)
      if (sources.label.includes('*')) {
        return false;
      }
      
      return true; // Not required by HTML
    }
    
    return false;
  }

  getOtpLength(input) {
    // Determine OTP length from input attributes
    if (input.maxLength && input.maxLength <= 8) {
      return parseInt(input.maxLength);
    }
    
    // Check pattern attribute
    if (input.pattern) {
      const match = input.pattern.match(/\\d{(\d+)}/);
      if (match) {
        return parseInt(match[1]);
      }
    }
    
    // Check placeholder for length hints
    const placeholder = input.placeholder || '';
    const numbers = placeholder.match(/\d+/g);
    if (numbers && numbers[0]) {
      return parseInt(numbers[0]);
    }
    
    return undefined; // Any length
  }

  cleanLabel(label) {
    if (!label) return '';
    
    return label
      .replace(/[^\w\s]/g, ' ') // Replace special chars with space
      .replace(/\s+/g, ' ')      // Collapse multiple spaces
      .replace(/^(please|enter|your|type|input)\s+/i, '') // Remove common prefixes
      .trim();
  }

  // Get form context for better detection
  getFormContext(form) {
    if (!form) return {};
    
    return {
      formTitle: this.getFormTitle(form),
      formAction: form.action || '',
      formMethod: form.method || '',
      formId: form.id || '',
      formClass: form.className || ''
    };
  }

  getFormTitle(form) {
    // Look for heading near form
    const possibleHeadings = form.querySelectorAll('h1, h2, h3, h4, legend, .form-title');
    if (possibleHeadings.length > 0) {
      return possibleHeadings[0].textContent.trim();
    }
    
    // Look for heading above form
    let prev = form.previousElementSibling;
    while (prev) {
      if (/^h[1-6]$/i.test(prev.tagName)) {
        return prev.textContent.trim();
      }
      prev = prev.previousElementSibling;
    }
    
    return '';
  }
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FieldDetector;
}