// ============================================
// OPTIONS.JS - Settings Page Logic
// ============================================

let currentSettings = {};
let currentProfiles = [];
let activeProfileId = null;
let currentApiKeys = {};

document.addEventListener('DOMContentLoaded', async () => {
  await loadAllData();
  setupTabs();
  setupEventListeners();
  renderProfiles();
  renderApiKeys();
  renderSettings();
});

async function loadAllData() {
  currentSettings = await Utils.sendMessage({ action: 'getSettings' }) || {};
  
  const profileData = await Utils.sendMessage({ action: 'getProfiles' }) || { profiles: [], activeProfileId: null };
  currentProfiles = profileData.profiles || [];
  activeProfileId = profileData.activeProfileId;
  
  currentApiKeys = await Utils.sendMessage({ action: 'getApiKeys' }) || {};
}

function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  const contents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(`${tabId}-tab`).classList.add('active');
    });
  });
}

function setupEventListeners() {
  // Create profile
  document.getElementById('createProfileBtn').addEventListener('click', () => {
    createNewProfile();
  });
  
  // Save profile
  document.getElementById('saveProfileBtn').addEventListener('click', () => {
    saveCurrentProfile();
  });
  
  // Cancel edit
  document.getElementById('cancelEditBtn').addEventListener('click', () => {
    document.getElementById('profileEditor').style.display = 'none';
  });
  
  // Delete profile
  document.getElementById('deleteProfileBtn').addEventListener('click', () => {
    deleteCurrentProfile();
  });
  
  // Duplicate profile
  document.getElementById('duplicateProfileBtn').addEventListener('click', () => {
    duplicateCurrentProfile();
  });
  
  // Add field
  document.getElementById('addFieldBtn').addEventListener('click', () => {
    addFieldToEditor();
  });
  
  // Template buttons
  document.querySelectorAll('.template-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      addTemplateField(btn.dataset.type);
    });
  });
  
  // Test all keys
  document.getElementById('testAllKeysBtn').addEventListener('click', () => {
    testAllApiKeys();
  });
  
  // Save patterns
  document.getElementById('savePatternsBtn').addEventListener('click', () => {
    saveDetectionPatterns();
  });
  
  // Clear logs
  document.getElementById('clearLogsBtn').addEventListener('click', () => {
    clearLogs();
  });
  
  // Export data
  document.getElementById('exportDataBtn').addEventListener('click', () => {
    exportAllData();
  });
  
  // Import data
  document.getElementById('importDataBtn').addEventListener('click', () => {
    importData();
  });
  
  // Reset data
  document.getElementById('resetDataBtn').addEventListener('click', () => {
    resetToDefault();
  });
  
  // Settings changes
  document.getElementById('defaultProvider').addEventListener('change', saveSettings);
  document.getElementById('rotationStrategy').addEventListener('change', saveSettings);
  document.getElementById('confidenceThreshold').addEventListener('input', updateThreshold);
  document.getElementById('clipboardTimeLimit').addEventListener('change', saveSettings);
  
  document.querySelectorAll('#settings-tab input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', saveSettings);
  });
}

function renderProfiles() {
  const grid = document.getElementById('profilesGrid');
  
  if (currentProfiles.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>No Profiles Yet</h3>
        <p>Create your first profile to get started</p>
        <button class="btn btn-primary" onclick="createNewProfile()">
          Create Profile
        </button>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = currentProfiles.map(profile => `
    <div class="profile-card ${profile.id === activeProfileId ? 'active' : ''}">
      <div class="profile-card-header">
        <h3>${Utils.escapeHtml(profile.name)}</h3>
        ${profile.id === activeProfileId ? '<span class="active-badge">Active</span>' : ''}
      </div>
      
      <div class="profile-card-stats">
        <div class="stat">
          <span class="stat-value">${profile.fields?.length || 0}</span>
          <span class="stat-label">fields</span>
        </div>
        <div class="stat">
          <span class="stat-value">${formatDate(profile.updatedAt)}</span>
          <span class="stat-label">updated</span>
        </div>
      </div>
      
      <div class="profile-card-actions">
        <button class="btn btn-small" onclick="editProfile('${profile.id}')">Edit</button>
        <button class="btn btn-small" onclick="setActiveProfile('${profile.id}')">Activate</button>
        <button class="btn btn-small" onclick="duplicateProfile('${profile.id}')">Copy</button>
        <button class="btn btn-small btn-danger" onclick="deleteProfile('${profile.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function formatDate(date) {
  if (!date) return 'Never';
  return new Date(date).toLocaleDateString();
}

function createNewProfile() {
  const newProfile = {
    id: Utils.generateId(),
    name: 'New Profile',
    fields: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  currentProfiles.push(newProfile);
  saveProfiles();
  editProfile(newProfile.id);
}

function editProfile(profileId) {
  const profile = currentProfiles.find(p => p.id === profileId);
  if (!profile) return;
  
  document.getElementById('profileEditor').style.display = 'block';
  document.getElementById('editorTitle').textContent = `Edit Profile: ${profile.name}`;
  document.getElementById('profileName').value = profile.name;
  
  // Show delete button
  const deleteBtn = document.getElementById('deleteProfileBtn');
  const duplicateBtn = document.getElementById('duplicateProfileBtn');
  deleteBtn.style.display = 'inline-flex';
  duplicateBtn.style.display = 'inline-flex';
  deleteBtn.setAttribute('data-profile-id', profileId);
  duplicateBtn.setAttribute('data-profile-id', profileId);
  
  renderFields(profile.fields || []);
}

function renderFields(fields) {
  const container = document.getElementById('fieldsContainer');
  
  if (fields.length === 0) {
    container.innerHTML = '<div class="empty-fields">No fields added yet. Use quick add or add custom field.</div>';
    return;
  }
  
  container.innerHTML = fields.map(field => `
    <div class="field-item" data-field-id="${field.id}">
      <div class="field-header">
        <div>
          <span class="field-type-badge">${field.type}</span>
          <strong>${Utils.escapeHtml(field.label || '')}</strong>
        </div>
        <button class="btn btn-icon" onclick="removeField('${field.id}')">✕</button>
      </div>
      
      <div class="field-details">
        <div class="field-input">
          <label>Label</label>
          <input type="text" value="${Utils.escapeHtml(field.label || '')}" 
                 onchange="updateField('${field.id}', 'label', this.value)">
        </div>
        
        <div class="field-input">
          <label>Value</label>
          <input type="text" value="${Utils.escapeHtml(field.value || '')}" 
                 onchange="updateField('${field.id}', 'value', this.value)">
        </div>
        
        <div class="field-input">
          <label>Type</label>
          <select onchange="updateField('${field.id}', 'type', this.value)">
            <option value="text" ${field.type === 'text' ? 'selected' : ''}>Text</option>
            <option value="firstname" ${field.type === 'firstname' ? 'selected' : ''}>First Name</option>
            <option value="lastname" ${field.type === 'lastname' ? 'selected' : ''}>Last Name</option>
            <option value="fullname" ${field.type === 'fullname' ? 'selected' : ''}>Full Name</option>
            <option value="email" ${field.type === 'email' ? 'selected' : ''}>Email</option>
            <option value="phone" ${field.type === 'phone' ? 'selected' : ''}>Phone</option>
            <option value="address" ${field.type === 'address' ? 'selected' : ''}>Address</option>
            <option value="city" ${field.type === 'city' ? 'selected' : ''}>City</option>
            <option value="state" ${field.type === 'state' ? 'selected' : ''}>State</option>
            <option value="zip" ${field.type === 'zip' ? 'selected' : ''}>ZIP</option>
            <option value="country" ${field.type === 'country' ? 'selected' : ''}>Country</option>
            <option value="company" ${field.type === 'company' ? 'selected' : ''}>Company</option>
            <option value="website" ${field.type === 'website' ? 'selected' : ''}>Website</option>
            <option value="dob" ${field.type === 'dob' ? 'selected' : ''}>DOB</option>
            <option value="otp" ${field.type === 'otp' ? 'selected' : ''}>OTP</option>
          </select>
        </div>
      </div>
    </div>
  `).join('');
}

function addFieldToEditor() {
  const container = document.getElementById('fieldsContainer');
  const profileId = document.getElementById('deleteProfileBtn').dataset.profileId;
  const profile = currentProfiles.find(p => p.id === profileId);
  
  if (!profile) return;
  
  if (!profile.fields) profile.fields = [];
  
  profile.fields.push({
    id: Utils.generateId(),
    type: 'text',
    label: '',
    value: ''
  });
  
  renderFields(profile.fields);
}

function addTemplateField(type) {
  const profileId = document.getElementById('deleteProfileBtn').dataset.profileId;
  const profile = currentProfiles.find(p => p.id === profileId);
  
  if (!profile) return;
  
  const templates = {
    firstname: { type: 'firstname', label: 'First Name', value: '' },
    lastname: { type: 'lastname', label: 'Last Name', value: '' },
    fullname: { type: 'fullname', label: 'Full Name', value: '' },
    email: { type: 'email', label: 'Email', value: '' },
    phone: { type: 'phone', label: 'Phone', value: '' },
    address: { type: 'address', label: 'Address', value: '' },
    city: { type: 'city', label: 'City', value: '' },
    state: { type: 'state', label: 'State', value: '' },
    zip: { type: 'zip', label: 'ZIP Code', value: '' },
    country: { type: 'country', label: 'Country', value: '' },
    company: { type: 'company', label: 'Company', value: '' },
    website: { type: 'website', label: 'Website', value: '' },
    dob: { type: 'dob', label: 'Date of Birth', value: '' },
    otp: { type: 'otp', label: 'OTP Code', value: '' }
  };
  
  const template = templates[type];
  if (template) {
    if (!profile.fields) profile.fields = [];
    
    profile.fields.push({
      id: Utils.generateId(),
      ...template
    });
    
    renderFields(profile.fields);
  }
}

function updateField(fieldId, prop, value) {
  const profileId = document.getElementById('deleteProfileBtn').dataset.profileId;
  const profile = currentProfiles.find(p => p.id === profileId);
  
  if (!profile) return;
  
  const field = profile.fields.find(f => f.id === fieldId);
  if (field) {
    field[prop] = value;
    profile.updatedAt = new Date().toISOString();
  }
}

function removeField(fieldId) {
  const profileId = document.getElementById('deleteProfileBtn').dataset.profileId;
  const profile = currentProfiles.find(p => p.id === profileId);
  
  if (!profile) return;
  
  profile.fields = profile.fields.filter(f => f.id !== fieldId);
  profile.updatedAt = new Date().toISOString();
  
  renderFields(profile.fields);
}

async function saveCurrentProfile() {
  const profileId = document.getElementById('deleteProfileBtn').dataset.profileId;
  const profile = currentProfiles.find(p => p.id === profileId);
  
  if (!profile) return;
  
  profile.name = document.getElementById('profileName').value;
  profile.updatedAt = new Date().toISOString();
  
  await saveProfiles();
  
  document.getElementById('profileEditor').style.display = 'none';
  renderProfiles();
  
  showNotification('Profile saved successfully!', 'success');
}

async function deleteCurrentProfile() {
  const profileId = document.getElementById('deleteProfileBtn').dataset.profileId;
  
  if (!confirm('Are you sure you want to delete this profile?')) return;
  
  currentProfiles = currentProfiles.filter(p => p.id !== profileId);
  
  if (activeProfileId === profileId) {
    activeProfileId = currentProfiles[0]?.id || null;
  }
  
  await saveProfiles();
  
  document.getElementById('profileEditor').style.display = 'none';
  renderProfiles();
  
  showNotification('Profile deleted', 'info');
}

async function duplicateCurrentProfile() {
  const profileId = document.getElementById('deleteProfileBtn').dataset.profileId;
  const profile = currentProfiles.find(p => p.id === profileId);
  
  if (!profile) return;
  
  const duplicate = {
    ...Utils.clone(profile),
    id: Utils.generateId(),
    name: `${profile.name} (Copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  currentProfiles.push(duplicate);
  await saveProfiles();
  
  editProfile(duplicate.id);
  renderProfiles();
  
  showNotification('Profile duplicated', 'success');
}

async function setActiveProfile(profileId) {
  activeProfileId = profileId;
  await saveProfiles();
  renderProfiles();
  
  showNotification('Profile activated', 'success');
}

async function deleteProfile(profileId) {
  if (!confirm('Are you sure you want to delete this profile?')) return;
  
  currentProfiles = currentProfiles.filter(p => p.id !== profileId);
  
  if (activeProfileId === profileId) {
    activeProfileId = currentProfiles[0]?.id || null;
  }
  
  await saveProfiles();
  renderProfiles();
  
  showNotification('Profile deleted', 'info');
}

async function duplicateProfile(profileId) {
  const profile = currentProfiles.find(p => p.id === profileId);
  if (!profile) return;
  
  const duplicate = {
    ...Utils.clone(profile),
    id: Utils.generateId(),
    name: `${profile.name} (Copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  currentProfiles.push(duplicate);
  await saveProfiles();
  renderProfiles();
  
  showNotification('Profile duplicated', 'success');
}

async function saveProfiles() {
  await Utils.sendMessage({
    action: 'saveProfiles',
    profiles: currentProfiles,
    activeProfileId
  });
}

function renderApiKeys() {
  const providers = ['openai', 'gemini', 'claude', 'grok'];
  
  providers.forEach(provider => {
    const keys = currentApiKeys[provider] || [];
    const textarea = document.getElementById(`${provider}-keys-input`);
    const badge = document.getElementById(`${provider}-badge`);
    const count = document.getElementById(`${provider}-count`);
    
    if (textarea) {
      textarea.value = keys.join('\n');
    }
    
    if (badge) {
      badge.textContent = `${keys.length} keys`;
    }
    
    if (count) {
      count.textContent = `${keys.length} keys`;
    }
    
    // Add change listener
    if (textarea) {
      textarea.addEventListener('input', Utils.debounce(() => {
        saveProviderKeys(provider);
      }, 500));
    }
  });
  
  // Load key status
  loadKeyStatus();
}

async function saveProviderKeys(provider) {
  const textarea = document.getElementById(`${provider}-keys-input`);
  if (!textarea) return;
  
  const keys = textarea.value
    .split('\n')
    .map(k => k.trim())
    .filter(k => k.length > 0);
  
  if (!currentApiKeys[provider]) currentApiKeys[provider] = [];
  currentApiKeys[provider] = keys;
  
  await Utils.sendMessage({
    action: 'saveApiKeys',
    apiKeys: currentApiKeys
  });
  
  // Update badge
  const badge = document.getElementById(`${provider}-badge`);
  const count = document.getElementById(`${provider}-count`);
  if (badge) badge.textContent = `${keys.length} keys`;
  if (count) count.textContent = `${keys.length} keys`;
}

async function testProvider(provider) {
  const textarea = document.getElementById(`${provider}-keys-input`);
  if (!textarea) return;
  
  const keys = textarea.value
    .split('\n')
    .map(k => k.trim())
    .filter(k => k.length > 0);
  
  showNotification(`Testing ${keys.length} keys for ${provider}...`, 'info');
  
  let working = 0;
  let failed = 0;
  
  for (const key of keys) {
    const result = await Utils.sendMessage({
      action: 'testApiKey',
      provider,
      key
    });
    
    if (result?.valid) {
      working++;
    } else {
      failed++;
    }
    
    // Update status
    await Utils.sendMessage({
      action: 'updateKeyStatus',
      status: {
        [key.substring(0, 10) + '...']: {
          provider,
          valid: result?.valid || false,
          lastTested: new Date().toISOString(),
          error: result?.error
        }
      }
    });
  }
  
  showNotification(`${provider}: ${working} working, ${failed} failed`, working > 0 ? 'success' : 'error');
  loadKeyStatus();
}

async function testAllApiKeys() {
  showNotification('Testing all API keys...', 'info');
  
  const providers = ['openai', 'gemini', 'claude', 'grok'];
  
  for (const provider of providers) {
    await testProvider(provider);
  }
  
  showNotification('All keys tested!', 'success');
}

function clearProvider(provider) {
  const textarea = document.getElementById(`${provider}-keys-input`);
  if (textarea) {
    textarea.value = '';
    saveProviderKeys(provider);
  }
}

function toggleProvider(provider) {
  const container = document.getElementById(`${provider}-keys`);
  if (container) {
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
  }
}

async function loadKeyStatus() {
  const status = await Utils.sendMessage({ action: 'getKeyStatus' }) || {};
  const container = document.getElementById('keyStatus');
  
  if (Object.keys(status).length === 0) {
    container.innerHTML = '<div class="empty-state">No keys tested yet</div>';
    return;
  }
  
  container.innerHTML = Object.entries(status).map(([key, data]) => `
    <div class="key-status-item ${data.valid ? 'valid' : 'invalid'}">
      <div class="key-info">
        <span class="key-preview">${key}</span>
        <span class="key-provider">${data.provider}</span>
      </div>
      <div class="key-meta">
        <span class="key-status-badge ${data.valid ? 'success' : 'error'}">
          ${data.valid ? '✓ Valid' : '✗ Invalid'}
        </span>
        <span class="key-time">${data.lastTested ? new Date(data.lastTested).toLocaleTimeString() : ''}</span>
      </div>
      ${data.error ? `<div class="key-error">${data.error}</div>` : ''}
    </div>
  `).join('');
}

function renderSettings() {
  document.getElementById('autoFillOnLoad').checked = currentSettings.autoFillOnLoad ?? true;
  document.getElementById('respectUserEdits').checked = currentSettings.respectUserEdits ?? true;
  document.getElementById('fillOptionalFields').checked = currentSettings.fillOptionalFields ?? false;
  document.getElementById('clipboardMonitor').checked = currentSettings.clipboardMonitor ?? true;
  document.getElementById('autoFillOtp').checked = currentSettings.autoFillOtp ?? true;
  
  document.getElementById('defaultProvider').value = currentSettings.defaultProvider || 'openai';
  document.getElementById('rotationStrategy').value = currentSettings.rotationStrategy || 'failover';
  document.getElementById('clipboardTimeLimit').value = currentSettings.clipboardTimeLimit || '5';
  
  const threshold = currentSettings.confidenceThreshold || 70;
  document.getElementById('confidenceThreshold').value = threshold;
  document.getElementById('thresholdDisplay').textContent = threshold + '%';
}

function updateThreshold(e) {
  const value = e.target.value;
  document.getElementById('thresholdDisplay').textContent = value + '%';
  saveSettings();
}

async function saveSettings() {
  currentSettings = {
    autoFillOnLoad: document.getElementById('autoFillOnLoad').checked,
    respectUserEdits: document.getElementById('respectUserEdits').checked,
    fillOptionalFields: document.getElementById('fillOptionalFields').checked,
    clipboardMonitor: document.getElementById('clipboardMonitor').checked,
    autoFillOtp: document.getElementById('autoFillOtp').checked,
    defaultProvider: document.getElementById('defaultProvider').value,
    rotationStrategy: document.getElementById('rotationStrategy').value,
    clipboardTimeLimit: document.getElementById('clipboardTimeLimit').value,
    confidenceThreshold: parseInt(document.getElementById('confidenceThreshold').value)
  };
  
  await Utils.sendMessage({
    action: 'saveSettings',
    settings: currentSettings
  });
  
  showNotification('Settings saved', 'success');
}

async function saveDetectionPatterns() {
  const patterns = document.getElementById('detectionPatterns').value;
  await Utils.storage.set('detectionPatterns', patterns);
  showNotification('Patterns saved', 'success');
}

async function clearLogs() {
  await Utils.storage.set('logs', []);
  document.getElementById('logsContainer').innerHTML = '<div class="empty-state">Logs cleared</div>';
  showNotification('Logs cleared', 'info');
}

async function exportAllData() {
  const data = {
    settings: currentSettings,
    profiles: currentProfiles,
    activeProfileId,
    apiKeys: currentApiKeys,
    exportDate: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `magic-fill-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  
  showNotification('Data exported!', 'success');
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    const text = await file.text();
    
    try {
      const data = JSON.parse(text);
      
      if (data.settings) await Utils.sendMessage({ action: 'saveSettings', settings: data.settings });
      if (data.profiles) await Utils.sendMessage({ action: 'saveProfiles', profiles: data.profiles, activeProfileId: data.activeProfileId });
      if (data.apiKeys) await Utils.sendMessage({ action: 'saveApiKeys', apiKeys: data.apiKeys });
      
      showNotification('Data imported successfully!', 'success');
      setTimeout(() => location.reload(), 1500);
    } catch (error) {
      showNotification('Invalid backup file', 'error');
    }
  };
  
  input.click();
}

async function resetToDefault() {
  if (!confirm('Are you sure? This will delete all your data.')) return;
  
  await chrome.storage.local.clear();
  showNotification('Reset complete. Reloading...', 'info');
  setTimeout(() => location.reload(), 1500);
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    z-index: 1000;
    animation: slideIn 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Global functions
window.editProfile = editProfile;
window.setActiveProfile = setActiveProfile;
window.duplicateProfile = duplicateProfile;
window.deleteProfile = deleteProfile;
window.updateField = updateField;
window.removeField = removeField;
window.toggleProvider = toggleProvider;
window.testProvider = testProvider;
window.clearProvider = clearProvider;