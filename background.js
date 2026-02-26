// ============================================
// BACKGROUND.JS - Service Worker
// FIX: commands handler mein sare 4 files inject karta hai
// Baaki sab ORIGINAL as-is
// ============================================

const DEFAULT_SETTINGS = {
  isEnabled: true,
  aiModeEnabled: false,
  defaultProvider: 'openai',
  rotationStrategy: 'failover',
  confidenceThreshold: 70,
  respectUserEdits: true,
  fillOptionalFields: false,
  clipboardTimeLimit: 5,
  theme: 'dark'
};

const DEFAULT_PROFILE = {
  id: 'default-' + Date.now(),
  name: 'Personal Profile',
  fields: [
    { type: 'firstname', value: 'John', label: 'First Name' },
    { type: 'lastname', value: 'Doe', label: 'Last Name' },
    { type: 'fullname', value: 'John Doe', label: 'Full Name' },
    { type: 'email', value: 'john.doe@example.com', label: 'Email' },
    { type: 'phone', value: '+1 (555) 123-4567', label: 'Phone' },
    { type: 'address', value: '123 Main St', label: 'Address' },
    { type: 'city', value: 'New York', label: 'City' },
    { type: 'state', value: 'NY', label: 'State' },
    { type: 'zip', value: '10001', label: 'ZIP Code' },
    { type: 'country', value: 'USA', label: 'Country' },
    { type: 'company', value: 'Tech Corp', label: 'Company' },
    { type: 'website', value: 'https://example.com', label: 'Website' }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

// ORIGINAL — initialize on install
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Magic Fill Pro installed:', details.reason);
  if (details.reason === 'install') {
    await initializeStorage();
  }
});

async function initializeStorage() {
  const storage = {
    settings: DEFAULT_SETTINGS,
    profiles: [DEFAULT_PROFILE],
    activeProfileId: DEFAULT_PROFILE.id,
    apiKeys: {
      openai: [],
      gemini: [],
      claude: [],
      grok: [],
      deepseek: [],
      mistral: []
    },
    keyStatus: {},
    usageStats: {},
    clipboardHistory: [],
    logs: []
  };
  await chrome.storage.local.set(storage);
  console.log('Storage initialized');
}

// ORIGINAL — Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse);
  return true;
});

async function handleMessage(request, sender) {
  try {
    switch (request.action) {

      case 'getSettings':
        const settings = await chrome.storage.local.get('settings');
        return settings.settings || DEFAULT_SETTINGS;

      case 'saveSettings':
        await chrome.storage.local.set({ settings: request.settings });
        return { success: true };

      case 'getProfiles':
        const profiles = await chrome.storage.local.get(['profiles', 'activeProfileId']);
        return {
          profiles: profiles.profiles || [],
          activeProfileId: profiles.activeProfileId || null
        };

      case 'saveProfiles':
        await chrome.storage.local.set({
          profiles: request.profiles,
          activeProfileId: request.activeProfileId
        });
        return { success: true };

      case 'getApiKeys':
        const apiKeys = await chrome.storage.local.get('apiKeys');
        return apiKeys.apiKeys || {};

      case 'saveApiKeys':
        await chrome.storage.local.set({ apiKeys: request.apiKeys });
        return { success: true };

      case 'testApiKey':
        return await testApiKey(request.provider, request.key);

      case 'getKeyStatus':
        const keyStatus = await chrome.storage.local.get('keyStatus');
        return keyStatus.keyStatus || {};

      case 'updateKeyStatus':
        const current = await chrome.storage.local.get('keyStatus');
        const updated = { ...(current.keyStatus || {}), ...request.status };
        await chrome.storage.local.set({ keyStatus: updated });
        return { success: true };

      case 'getUsageStats':
        const usage = await chrome.storage.local.get('usageStats');
        return usage.usageStats || {};

      case 'updateUsage':
        await updateUsage(request);
        return { success: true };

      case 'getClipboardHistory':
        const history = await chrome.storage.local.get('clipboardHistory');
        return history.clipboardHistory || [];

      case 'saveClipboardHistory':
        await chrome.storage.local.set({ clipboardHistory: request.history });
        return { success: true };

      case 'getLogs':
        const logs = await chrome.storage.local.get('logs');
        return logs.logs || [];

      case 'addLog':
        await addLog(request.log);
        return { success: true };

      default:
        return { success: false, error: 'Unknown action' };
    }
  } catch (error) {
    console.error('Background error:', error);
    return { success: false, error: error.message };
  }
}

// ORIGINAL — testApiKey
async function testApiKey(provider, key) {
  const tests = {
    openai: async () => {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      return res.ok;
    },
    gemini: async () => {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      return res.ok;
    },
    claude: async () => {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
      });
      return res.ok;
    },
    grok: async () => {
      const res = await fetch('https://api.x.ai/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      return res.ok;
    },
    deepseek: async () => {
      const res = await fetch('https://api.deepseek.com/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      return res.ok;
    },
    mistral: async () => {
      const res = await fetch('https://api.mistral.ai/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      return res.ok;
    }
  };

  try {
    if (tests[provider]) {
      const isValid = await tests[provider]();
      return { success: true, valid: isValid };
    }
    return { success: false, error: 'Unknown provider' };
  } catch (error) {
    return { success: false, valid: false, error: error.message };
  }
}

// ORIGINAL — updateUsage
async function updateUsage(request) {
  const { provider, key, tokens, success } = request;
  const stats = await chrome.storage.local.get('usageStats');
  const usage = stats.usageStats || {};

  if (!usage[provider]) usage[provider] = {};
  if (!usage[provider][key]) {
    usage[provider][key] = { tokens: 0, calls: 0, errors: 0, firstUsed: new Date().toISOString() };
  }

  usage[provider][key].tokens += tokens || 0;
  usage[provider][key].calls += 1;
  if (!success) usage[provider][key].errors += 1;
  usage[provider][key].lastUsed = new Date().toISOString();

  await chrome.storage.local.set({ usageStats: usage });
}

// ORIGINAL — addLog
async function addLog(log) {
  const logs = await chrome.storage.local.get('logs');
  const allLogs = logs.logs || [];
  allLogs.unshift({ ...log, timestamp: new Date().toISOString() });
  if (allLogs.length > 100) allLogs.pop();
  await chrome.storage.local.set({ logs: allLogs });
}

// FIX: commands handler — ab sare 4 files inject karta hai
chrome.commands.onCommand.addListener(async (command, tab) => {
  switch (command) {
    case 'trigger-fill':
      try {
        // Pehle existing content script ko message bhejo
        await chrome.tabs.sendMessage(tab.id, { action: 'triggerFill' });
      } catch (error) {
        // Content script nahi hai — inject karo (sare files order mein)
        console.log('Content script nahi mila, inject kar raha...', error);
        try {
          await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['styles.css'] }).catch(() => {});
          for (const file of ['utils.js', 'field-detector.js', 'ai-manager.js', 'content.js']) {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [file] });
          }
          await new Promise(r => setTimeout(r, 500));
          await chrome.tabs.sendMessage(tab.id, { action: 'triggerFill' });
        } catch (injectError) {
          console.error('Inject failed:', injectError);
        }
      }
      break;

    case 'open-settings':
      chrome.runtime.openOptionsPage();
      break;
  }
});