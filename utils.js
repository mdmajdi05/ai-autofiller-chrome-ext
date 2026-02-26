// ============================================
// UTILS.JS - Core Utilities
// ============================================

const Utils = {
  // Generate unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  },

  // Safe storage operations
  storage: {
    async get(key) {
      try {
        const result = await chrome.storage.local.get(key);
        return result[key];
      } catch (error) {
        console.error('Storage get error:', error);
        return null;
      }
    },

    async set(key, value) {
      try {
        await chrome.storage.local.set({ [key]: value });
        return true;
      } catch (error) {
        console.error('Storage set error:', error);
        return false;
      }
    },

    async syncGet(key) {
      try {
        const result = await chrome.storage.sync.get(key);
        return result[key];
      } catch (error) {
        console.error('Sync get error:', error);
        return null;
      }
    },

    async syncSet(key, value) {
      try {
        await chrome.storage.sync.set({ [key]: value });
        return true;
      } catch (error) {
        console.error('Sync set error:', error);
        return false;
      }
    }
  },

  // Safe message sending
  async sendMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('Message error:', chrome.runtime.lastError);
            resolve(null);
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        console.error('Send message error:', error);
        resolve(null);
      }
    });
  },

  // Get current tab
  async getCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab;
    } catch (error) {
      console.error('Get tab error:', error);
      return null;
    }
  },

  // Inject content script
  async injectContentScript(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      return true;
    } catch (error) {
      console.error('Inject error:', error);
      return false;
    }
  },

  // Escape HTML
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // Debounce
  debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  },

  // Throttle
  throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  // Deep clone
  clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  // Sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // Format date
  formatDate(date) {
    return new Date(date).toLocaleString();
  },

  // Format time ago
  timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60,
      second: 1
    };
    
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / secondsInUnit);
      if (interval >= 1) {
        return interval + ' ' + unit + (interval === 1 ? '' : 's') + ' ago';
      }
    }
    
    return 'just now';
  },

  // Format number
  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  },

  // Validate email
  isEmail(str) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  },

  // Validate phone
  isPhone(str) {
    return /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/.test(str);
  },

  // Validate URL
  isUrl(str) {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  },

  // Extract numbers from string
  extractNumbers(str) {
    return str.match(/\d+/g)?.join('') || '';
  },

  // Calculate string similarity (Levenshtein)
  similarity(str1, str2) {
    const track = Array(str2.length + 1).fill(null).map(() =>
      Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i += 1) track[0][i] = i;
    for (let j = 0; j <= str2.length; j += 1) track[j][0] = j;
    
    for (let j = 1; j <= str2.length; j += 1) {
      for (let i = 1; i <= str1.length; i += 1) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        track[j][i] = Math.min(
          track[j][i - 1] + 1,
          track[j - 1][i] + 1,
          track[j - 1][i - 1] + indicator
        );
      }
    }
    
    const distance = track[str2.length][str1.length];
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1 : 1 - distance / maxLength;
  },

  // Log with levels
  log(level, module, message, data = null) {
    const logEntry = {
      level,
      module,
      message,
      data,
      timestamp: new Date().toISOString()
    };
    
    // Console output
    const colors = {
      ERROR: 'color: #ef4444; font-weight: bold',
      WARN: 'color: #f59e0b; font-weight: bold',
      INFO: 'color: #3b82f6; font-weight: bold',
      DEBUG: 'color: #10b981; font-weight: bold'
    };
    
    if (colors[level]) {
      console.log(`%c[${level}] ${module}: ${message}`, colors[level], data || '');
    } else {
      console.log(`[${level}] ${module}: ${message}`, data || '');
    }
    
    // Store in background
    Utils.sendMessage({
      action: 'addLog',
      log: logEntry
    });
  },

  error(module, message, data) { this.log('ERROR', module, message, data); },
  warn(module, message, data) { this.log('WARN', module, message, data); },
  info(module, message, data) { this.log('INFO', module, message, data); },
  debug(module, message, data) { this.log('DEBUG', module, message, data); }
};

// Make available globally
window.Utils = Utils;