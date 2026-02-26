// ============================================
// POPUP.JS - Popup Logic
// ORIGINAL FILE — koi bugs nahi the
// Note: Utils.injectContentScript ab 4 files inject karta hai (utils.js mein fix)
// ============================================

let currentSettings = null;
let currentProfiles = [];
let activeProfile = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  setupEventListeners();
  startRealTimeUpdates();
});

async function loadData() {
  try {
    currentSettings = await Utils.sendMessage({ action: 'getSettings' }) || {};
    const profileData = await Utils.sendMessage({ action: 'getProfiles' }) || { profiles: [], activeProfileId: null };
    currentProfiles = profileData.profiles || [];
    activeProfile = currentProfiles.find(p => p.id === profileData.activeProfileId);
    const apiKeys = await Utils.sendMessage({ action: 'getApiKeys' }) || {};
    const usage = await Utils.sendMessage({ action: 'getUsageStats' }) || {};
    updateUI(currentSettings, currentProfiles, activeProfile, apiKeys, usage);
  } catch (error) {
    Utils.error('Popup', 'Load failed', error);
    showError('Failed to load data');
  }
}

function updateUI(settings, profiles, activeProfile, apiKeys, usage) {
  document.getElementById('extensionToggle').checked = settings.isEnabled ?? true;
  document.getElementById('aiToggle').checked = settings.aiModeEnabled ?? false;
  document.getElementById('respectEditsToggle').checked = settings.respectUserEdits ?? true;
  document.getElementById('fillOptionalToggle').checked = settings.fillOptionalFields ?? false;

  const aiBadge = document.getElementById('aiBadge');
  if (settings.aiModeEnabled) { aiBadge.textContent = 'On'; aiBadge.classList.add('active'); }
  else { aiBadge.textContent = 'Off'; aiBadge.classList.remove('active'); }

  const statusIndicator = document.getElementById('statusIndicator');
  if (settings.isEnabled) statusIndicator.classList.add('active');
  else statusIndicator.classList.remove('active');

  const select = document.getElementById('profileSelect');
  select.innerHTML = '<option value="">No Profile</option>';
  profiles.forEach(profile => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    option.selected = profile.id === activeProfile?.id;
    select.appendChild(option);
  });

  const preview = document.getElementById('profilePreview');
  if (activeProfile) {
    const fields = activeProfile.fields || [];
    preview.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span><strong>${activeProfile.name}</strong></span>
        <span>${fields.length} fields</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">
        ${fields.slice(0, 3).map(f => `<span style="background:rgba(139,92,246,0.1);padding:2px 6px;border-radius:4px;">${f.label || f.type}</span>`).join('')}
        ${fields.length > 3 ? `<span>+${fields.length - 3} more</span>` : ''}
      </div>`;
  } else {
    preview.innerHTML = '<span style="color:var(--gray);">No active profile</span>';
  }

  document.getElementById('profileCount').textContent = profiles.length;

  let keyCount = 0;
  Object.values(apiKeys).forEach(p => { if (Array.isArray(p)) keyCount += p.length; });
  document.getElementById('apiCount').textContent = keyCount;

  let todayTokens = 0;
  const todayStr = new Date().toDateString();
  Object.values(usage).forEach(provider => {
    Object.values(provider).forEach(keyData => {
      if (keyData.lastUsed?.startsWith(todayStr)) todayTokens += keyData.tokens || 0;
    });
  });
  document.getElementById('todayUsage').textContent = formatTokens(todayTokens);

  const totalFields = profiles.reduce((sum, p) => sum + (p.fields?.length || 0), 0);
  document.getElementById('fieldsFilled').textContent = totalFields;

  document.getElementById('thresholdSlider').value = settings.confidenceThreshold || 70;
  document.getElementById('thresholdValue').textContent = (settings.confidenceThreshold || 70) + '%';
}

function formatTokens(tokens) {
  if (tokens >= 1000000) return (tokens / 1000000).toFixed(1) + 'M';
  if (tokens >= 1000) return (tokens / 1000).toFixed(1) + 'K';
  return tokens.toString();
}

function showError(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `position:fixed;bottom:16px;left:16px;right:16px;background:var(--error);color:white;padding:12px;border-radius:8px;font-size:13px;text-align:center;z-index:1000;`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function setupEventListeners() {
  document.getElementById('extensionToggle').addEventListener('change', async (e) => {
    const settings = await Utils.sendMessage({ action: 'getSettings' }) || {};
    settings.isEnabled = e.target.checked;
    await Utils.sendMessage({ action: 'saveSettings', settings });
    updateUI(settings, currentProfiles, activeProfile, {}, {});
  });

  document.getElementById('aiToggle').addEventListener('change', async (e) => {
    const settings = await Utils.sendMessage({ action: 'getSettings' }) || {};
    settings.aiModeEnabled = e.target.checked;
    await Utils.sendMessage({ action: 'saveSettings', settings });
    updateUI(settings, currentProfiles, activeProfile, {}, {});
  });

  document.getElementById('respectEditsToggle').addEventListener('change', async (e) => {
    const settings = await Utils.sendMessage({ action: 'getSettings' }) || {};
    settings.respectUserEdits = e.target.checked;
    await Utils.sendMessage({ action: 'saveSettings', settings });
  });

  document.getElementById('fillOptionalToggle').addEventListener('change', async (e) => {
    const settings = await Utils.sendMessage({ action: 'getSettings' }) || {};
    settings.fillOptionalFields = e.target.checked;
    await Utils.sendMessage({ action: 'saveSettings', settings });
  });

  document.getElementById('thresholdSlider').addEventListener('input', async (e) => {
    const value = e.target.value;
    document.getElementById('thresholdValue').textContent = value + '%';
    const settings = await Utils.sendMessage({ action: 'getSettings' }) || {};
    settings.confidenceThreshold = parseInt(value);
    await Utils.sendMessage({ action: 'saveSettings', settings });
  });

  document.getElementById('profileSelect').addEventListener('change', async (e) => {
    const profileId = e.target.value || null;
    const profileData = await Utils.sendMessage({ action: 'getProfiles' }) || { profiles: [] };
    await Utils.sendMessage({ action: 'saveProfiles', profiles: profileData.profiles, activeProfileId: profileId });
    await loadData();
  });

  document.getElementById('fillBtn').addEventListener('click', async () => {
    const btn = document.getElementById('fillBtn');
    btn.classList.add('loading');
    try {
      const tab = await Utils.getCurrentTab();
      if (tab?.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'triggerFill' });
          showSuccess('Fill triggered!');
          setTimeout(() => window.close(), 1000);
        } catch {
          await Utils.injectContentScript(tab.id);
          setTimeout(async () => {
            try {
              await chrome.tabs.sendMessage(tab.id, { action: 'triggerFill' });
              showSuccess('Fill triggered!');
              setTimeout(() => window.close(), 1000);
            } catch(e) { showError('Fill failed after inject'); }
          }, 600);
        }
      }
    } catch (error) {
      showError('Failed to trigger fill');
    } finally {
      btn.classList.remove('loading');
    }
  });

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('loading');
    await loadData();
    btn.classList.remove('loading');
  });

  document.getElementById('manageProfilesBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('dashboardBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  });
}

function showSuccess(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `position:fixed;bottom:16px;left:16px;right:16px;background:var(--secondary);color:white;padding:12px;border-radius:8px;font-size:13px;text-align:center;z-index:1000;`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

function startRealTimeUpdates() {
  setInterval(loadData, 30000);
}