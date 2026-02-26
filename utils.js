// ============================================
// UTILS.JS - Core Utilities
// FIX 1: Utils.logger add kiya (field-detector + ai-manager use karte hain)
// FIX 2: showToast system add kiya (page pe visible debug messages)
// FIX 3: injectContentScript fix — ab sare 4 files inject hote hain
// Baaki sab ORIGINAL code as-is
// ============================================

const Utils = {

  // ─── TOAST SYSTEM ────────────────────────────────────────────
  // Sirf meaningful jagah pe use karo — data pass/fail, AI calls, fill results
  // level: 'debug' | 'info' | 'warn' | 'error' | 'success'
  _toastContainer: null,

  _getToastContainer() {
    if (this._toastContainer && document.body.contains(this._toastContainer)) {
      return this._toastContainer;
    }
    const c = document.createElement('div');
    c.id = '__mfp_toasts__';
    c.style.cssText = `
      position:fixed;top:10px;left:10px;z-index:2147483647;
      display:flex;flex-direction:column;gap:4px;
      max-width:380px;pointer-events:none;
    `;
    if (document.body) document.body.appendChild(c);
    this._toastContainer = c;
    return c;
  },

  showToast(message, level = 'info', duration = 4000) {
    if (typeof document === 'undefined') return; // background mein DOM nahi
    const colors = {
      debug:   { bg: '#1e293b', border: '#475569', icon: '🔍' },
      info:    { bg: '#1e3a8a', border: '#3b82f6', icon: 'ℹ️'  },
      warn:    { bg: '#78350f', border: '#f59e0b', icon: '⚠️'  },
      error:   { bg: '#7f1d1d', border: '#ef4444', icon: '❌'  },
      success: { bg: '#14532d', border: '#22c55e', icon: '✅'  }
    };
    const s = colors[level] || colors.info;
    try {
      const t = document.createElement('div');
      t.style.cssText = `
        background:${s.bg};border:1px solid ${s.border};border-radius:5px;
        padding:5px 10px;font-size:11px;color:#f1f5f9;font-family:monospace;
        opacity:0;transition:opacity 0.2s;word-break:break-all;line-height:1.4;
      `;
      t.textContent = `${s.icon} [MFP] ${message}`;
      this._getToastContainer().appendChild(t);
      requestAnimationFrame(() => { t.style.opacity = '1'; });
      setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 200);
      }, duration);
    } catch(e) {
      console.log(`[MFP-${level}] ${message}`);
    }
  },

  // ─── FIX 1: logger OBJECT ────────────────────────────────────
  // field-detector.js aur ai-manager.js mein Utils.logger.debug/info/warn/error
  // use hota hai — ye pehle exist nahi karta tha
  logger: {
    debug(module, message, data) { Utils.debug(module, message, data); },
    info(module, message, data)  { Utils.info(module, message, data); },
    warn(module, message, data)  { Utils.warn(module, message, data); },
    error(module, message, data) { Utils.error(module, message, data); }
  },

  // ─── ORIGINAL: Generate unique ID ────────────────────────────
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  },

  // ─── ORIGINAL: Safe storage operations ───────────────────────
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

  // ─── ORIGINAL: Safe message sending ──────────────────────────
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

  // ─── ORIGINAL: Get current tab ───────────────────────────────
  async getCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab;
    } catch (error) {
      console.error('Get tab error:', error);
      return null;
    }
  },

  // ─── FIX 3: injectContentScript ──────────────────────────────
  // Pehle sirf content.js inject hota tha
  // Utils/FieldDetector/AIManager missing the → ReferenceError
  // Ab sare 4 files order se inject hote hain
  async injectContentScript(tabId) {
    try {
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['styles.css']
      }).catch(() => {});

      for (const file of ['utils.js', 'field-detector.js', 'ai-manager.js', 'content.js']) {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [file]
        });
      }
      return true;
    } catch (error) {
      console.error('Inject error:', error);
      return false;
    }
  },

  // ─── ORIGINAL: Escape HTML ───────────────────────────────────
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // ─── ORIGINAL: Debounce ──────────────────────────────────────
  debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  },

  // ─── ORIGINAL: Throttle ──────────────────────────────────────
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

  // ─── ORIGINAL: Deep clone ────────────────────────────────────
  clone(obj) { return JSON.parse(JSON.stringify(obj)); },

  // ─── ORIGINAL: Sleep ─────────────────────────────────────────
  sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); },

  // ─── ORIGINAL: Format date ───────────────────────────────────
  formatDate(date) { return new Date(date).toLocaleString(); },

  // ─── ORIGINAL: Time ago ──────────────────────────────────────
  timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    const intervals = {
      year: 31536000, month: 2592000, week: 604800,
      day: 86400, hour: 3600, minute: 60, second: 1
    };
    for (const [unit, sec] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / sec);
      if (interval >= 1) return interval + ' ' + unit + (interval === 1 ? '' : 's') + ' ago';
    }
    return 'just now';
  },

  // ─── ORIGINAL: Format number ─────────────────────────────────
  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  },

  // ─── ORIGINAL: Validators ────────────────────────────────────
  isEmail(str) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str); },
  isPhone(str) { return /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/.test(str); },
  isUrl(str) {
    try { new URL(str); return true; } catch { return false; }
  },

  // ─── ORIGINAL: Extract numbers ───────────────────────────────
  extractNumbers(str) { return str.match(/\d+/g)?.join('') || ''; },

  // ─── ORIGINAL: String similarity (Levenshtein) ───────────────
  similarity(str1, str2) {
    const track = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
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

  // ─── ORIGINAL: Log with levels ───────────────────────────────
  log(level, module, message, data = null) {
    const logEntry = { level, module, message, data, timestamp: new Date().toISOString() };
    const colors = {
      ERROR: 'color: #ef4444; font-weight: bold',
      WARN:  'color: #f59e0b; font-weight: bold',
      INFO:  'color: #3b82f6; font-weight: bold',
      DEBUG: 'color: #10b981; font-weight: bold'
    };
    if (colors[level]) {
      console.log(`%c[${level}] ${module}: ${message}`, colors[level], data || '');
    } else {
      console.log(`[${level}] ${module}: ${message}`, data || '');
    }
    Utils.sendMessage({ action: 'addLog', log: logEntry });
  },

  error(module, message, data) { this.log('ERROR', module, message, data); },
  warn(module, message, data)  { this.log('WARN',  module, message, data); },
  info(module, message, data)  { this.log('INFO',  module, message, data); },
  debug(module, message, data) { this.log('DEBUG', module, message, data); }
};

window.Utils = Utils;