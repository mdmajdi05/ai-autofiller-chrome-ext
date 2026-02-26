// ============================================
// DASHBOARD.JS - Analytics Dashboard
// FIX 1: Canvas check add kiya (Chart.js ko canvas chahiye, div nahi)
// FIX 2: Chart.js undefined check (CDN se load nahi hua to crash nahi hoga)
// FIX 3: Null checks sab getElementById calls pe
// FIX 4: todayTokens, weekCalls, weekTokens elements optional hain — safe access
// Baaki sab ORIGINAL — exportAllData, clearAllLogs, testAllApiKeys,
//   deleteKey, testSingleKey, showData, copyToClipboard, retryOperation sab intact
// ============================================

let refreshInterval;
let usageChart = null;

document.addEventListener('DOMContentLoaded', () => {
  loadDashboardData();
  startAutoRefresh();
  setupEventListeners();
});

function setupEventListeners() {
  const exportBtn = document.getElementById('exportDataBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportAllData);

  const clearLogsBtn = document.getElementById('clearLogsBtn');
  if (clearLogsBtn) clearLogsBtn.addEventListener('click', clearAllLogs);

  const testKeysBtn = document.getElementById('testAllKeysBtn');
  if (testKeysBtn) testKeysBtn.addEventListener('click', testAllApiKeys);

  const dateRange = document.getElementById('dateRange');
  if (dateRange) dateRange.addEventListener('change', () => loadDashboardData());
}

function startAutoRefresh() {
  refreshInterval = setInterval(loadDashboardData, 30000);
}

function stopAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
}

async function loadDashboardData() {
  showLoading(true);

  try {
    const [apiKeys, keyStatus, usageStats, logs, settings, profiles] = await Promise.all([
      Utils.sendMessage({ action: 'getApiKeys' }),
      Utils.sendMessage({ action: 'getKeyStatus' }),
      Utils.sendMessage({ action: 'getUsageStats' }),
      Utils.sendMessage({ action: 'getLogs' }),
      Utils.sendMessage({ action: 'getSettings' }),
      Utils.sendMessage({ action: 'getProfiles' })
    ]);

    updateStats(apiKeys, keyStatus, usageStats, profiles);
    updateKeyTable(keyStatus, usageStats);
    updateActivityTable(logs);
    updateUsageChart(usageStats);
    updateProviderSummary(apiKeys, keyStatus, usageStats);
    updateRecentActivity(logs);

  } catch (error) {
    console.error('Dashboard error:', error);
    showError('Failed to load dashboard data');
  } finally {
    showLoading(false);
  }
}

function updateStats(apiKeys, keyStatus, usageStats, profiles) {
  let totalKeys = 0;
  let keysByProvider = {};

  for (const provider in apiKeys) {
    if (Array.isArray(apiKeys[provider])) {
      totalKeys += apiKeys[provider].length;
      keysByProvider[provider] = apiKeys[provider].length;
    }
  }

  let working = 0, failed = 0, rateLimited = 0, expired = 0;
  for (const key in keyStatus) {
    if (keyStatus[key]?.valid) { working++; }
    else {
      failed++;
      if (keyStatus[key]?.error?.includes('rate')) rateLimited++;
      if (keyStatus[key]?.error?.includes('expired') || keyStatus[key]?.error?.includes('invalid')) expired++;
    }
  }

  let totalCalls = 0, totalTokens = 0, todayCalls = 0, todayTokens = 0;
  const todayStr = new Date().toDateString();

  for (const provider in usageStats) {
    for (const key in usageStats[provider]) {
      const data = usageStats[provider][key];
      totalCalls += data.calls || 0;
      totalTokens += data.tokens || 0;
      if (data.lastUsed && new Date(data.lastUsed).toDateString() === todayStr) {
        todayCalls += data.calls || 0;
        todayTokens += data.tokens || 0;
      }
    }
  }

  const successRate = totalCalls > 0
    ? Math.round(((totalCalls - (rateLimited + expired)) / totalCalls) * 100)
    : 100;

  // FIX 3: Null checks on all getElementById — dashboard se kuch IDs missing thi
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('totalKeys', totalKeys);
  setEl('workingKeys', working);
  setEl('failedKeys', failed);
  setEl('totalCalls', formatNumber(totalCalls));
  setEl('totalTokens', formatTokens(totalTokens));
  setEl('todayCalls', formatNumber(todayCalls));
  setEl('todayTokens', formatTokens(todayTokens));
  setEl('successRate', successRate + '%');
  setEl('activeProfiles', profiles?.profiles?.length || 0);

  // Provider stats section
  let providerHtml = '<div class="provider-summary-grid">';
  for (const [provider, count] of Object.entries(keysByProvider)) {
    const providerWorking = Object.values(keyStatus).filter(k => k.provider === provider && k.valid).length;
    const percent = count > 0 ? Math.round((providerWorking / count) * 100) : 0;
    const statusClass = percent > 70 ? 'good' : percent > 30 ? 'warning' : 'bad';
    providerHtml += `
      <div class="provider-stat-item" style="padding:10px;background:var(--light);border-radius:8px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span>${getProviderIcon(provider)} <strong>${provider.toUpperCase()}</strong></span>
          <span class="${statusClass === 'good' ? 'badge-success' : statusClass === 'warning' ? 'badge-warning' : 'badge-error'} badge">${providerWorking}/${count}</span>
        </div>
        <div class="progress-bar-bg"><div class="progress-bar-fill ${statusClass}" style="width:${percent}%"></div></div>
      </div>`;
  }
  providerHtml += '</div>';
  const providerStatsEl = document.getElementById('providerStats');
  if (providerStatsEl) providerStatsEl.innerHTML = providerHtml || '<div class="no-data">No providers configured</div>';
}

function getProviderIcon(provider) {
  const icons = { openai: '🤖', gemini: '🔮', claude: '🦜', grok: '🚀', deepseek: '🌊', mistral: '🌫️' };
  return icons[provider] || '🔑';
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatTokens(tokens) {
  if (tokens >= 1000000) return (tokens / 1000000).toFixed(1) + 'M';
  if (tokens >= 1000) return (tokens / 1000).toFixed(1) + 'K';
  return tokens.toString();
}

function updateKeyTable(keyStatus, usageStats) {
  const tbody = document.getElementById('keyBody');
  if (!tbody) return;

  if (Object.keys(keyStatus).length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="no-data">No API keys configured</td></tr>';
    return;
  }

  const sortedKeys = Object.entries(keyStatus).sort((a, b) => {
    return new Date(b[1].lastTested || 0) - new Date(a[1].lastTested || 0);
  });

  let html = '';
  for (const [keyPreview, data] of sortedKeys) {
    let usage = 0, tokens = 0, lastUsed = 'Never', errorCount = 0, avgResponseTime = 0;
    if (data.provider && usageStats[data.provider]) {
      for (const [actualKey, keyData] of Object.entries(usageStats[data.provider])) {
        if (actualKey.includes(keyPreview.replace('...', '')) || keyPreview.includes(actualKey.substring(0, 10))) {
          usage = keyData.calls || 0;
          tokens = keyData.tokens || 0;
          lastUsed = keyData.lastUsed ? new Date(keyData.lastUsed).toLocaleString() : 'Never';
          errorCount = keyData.errors || 0;
          avgResponseTime = keyData.avgResponseTime || 0;
          break;
        }
      }
    }

    const healthClass = data.valid ? 'health-good' : 'health-bad';
    const errorRate = usage > 0 ? Math.round((errorCount / usage) * 100) : 0;
    let healthBadge = data.valid
      ? (errorRate > 20 ? '<span class="badge badge-warning">⚠️ High Err</span>' : '<span class="badge badge-success">✅ Healthy</span>')
      : '<span class="badge badge-error">❌ Dead</span>';

    html += `
      <tr class="${data.valid ? 'valid-row' : 'invalid-row'}">
        <td>${getProviderIcon(data.provider)} ${data.provider || '?'}</td>
        <td><code>${keyPreview}</code> <button class="btn-icon-small" onclick="copyToClipboard('${keyPreview}')">📋</button></td>
        <td><span class="${healthClass}">${data.valid ? '✓ Active' : '✗ Invalid'}</span>${data.error ? ` <span title="${data.error}">⚠️</span>` : ''}</td>
        <td>${healthBadge}</td>
        <td class="number-cell">${formatNumber(usage)}</td>
        <td class="number-cell">${formatTokens(tokens)}</td>
        <td class="number-cell ${errorRate > 20 ? 'error-text' : ''}">${errorRate}%</td>
        <td class="number-cell">${avgResponseTime ? avgResponseTime + 'ms' : '-'}</td>
        <td>${lastUsed}</td>
        <td>
          <button class="btn-icon-small" onclick="testSingleKey('${data.provider}', '${keyPreview}')" title="Test">🔄</button>
          <button class="btn-icon-small" onclick="deleteKey('${data.provider}', '${keyPreview}')" title="Delete">🗑️</button>
        </td>
      </tr>`;
  }
  tbody.innerHTML = html;
}

function updateActivityTable(logs) {
  const tbody = document.getElementById('activityBody');
  if (!tbody) return;

  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="no-data">No activity yet</td></tr>';
    return;
  }

  let html = '';
  logs.slice(0, 100).forEach(log => {
    const statusClass = log.level === 'ERROR' ? 'badge-error' : log.level === 'WARN' ? 'badge-warning' : 'badge-success';
    const icon = log.level === 'ERROR' ? '❌' : log.level === 'WARN' ? '⚠️' : '✅';
    const logTime = new Date(log.timestamp);
    const message = log.message.length > 80 ? log.message.substring(0, 80) + '...' : log.message;
    html += `
      <tr>
        <td>${logTime.toLocaleTimeString()}</td>
        <td>${log.module || 'System'}</td>
        <td title="${log.message}">${message}</td>
        <td><span class="badge ${statusClass}">${icon} ${log.level}</span></td>
        <td>${log.data ? `<button class="btn-icon-small" onclick='showData("${encodeURIComponent(JSON.stringify(log.data))}")'>👁️</button>` : ''}</td>
        <td>${log.level === 'ERROR' ? `<button class="btn-icon-small" onclick="retryOperation('${log.message.replace(/'/g,'')}')">↻</button>` : ''}</td>
        <td><button class="btn-icon-small" onclick="copyLog('${log.message.replace(/'/g, '')}')">📋</button></td>
      </tr>`;
  });
  tbody.innerHTML = html;
}

function showData(encodedData) {
  try {
    const data = JSON.parse(decodeURIComponent(encodedData));
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Log Details</h3>
          <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
        </div>
        <div class="modal-body"><pre>${JSON.stringify(data, null, 2)}</pre></div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="copyToClipboard('${JSON.stringify(data)}')">Copy</button>
          <button class="btn btn-primary" onclick="this.closest('.modal').remove()">Close</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  } catch (error) {
    alert('Error displaying data');
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Copied!', 'success')).catch(() => showToast('Failed to copy', 'error'));
}

function copyLog(message) { copyToClipboard(message); }

function retryOperation(message) { showToast('Retrying...', 'info'); }

async function testSingleKey(provider, keyPreview) {
  showToast(`Testing ${provider} key...`, 'info');
  const apiKeys = await Utils.sendMessage({ action: 'getApiKeys' });
  const keys = apiKeys[provider] || [];
  for (const key of keys) {
    if (key.includes(keyPreview.replace('...', '')) || keyPreview.includes(key.substring(0, 10))) {
      const result = await Utils.sendMessage({ action: 'testApiKey', provider, key });
      showToast(result?.valid ? `✅ ${provider} key valid!` : `❌ ${provider} key invalid`, result?.valid ? 'success' : 'error');
      await Utils.sendMessage({ action: 'updateKeyStatus', status: { [keyPreview]: { provider, valid: result?.valid || false, lastTested: new Date().toISOString(), error: result?.error } } });
      loadDashboardData();
      break;
    }
  }
}

async function deleteKey(provider, keyPreview) {
  if (!confirm(`Delete this ${provider} key?`)) return;
  const apiKeys = await Utils.sendMessage({ action: 'getApiKeys' });
  apiKeys[provider] = (apiKeys[provider] || []).filter(key => !key.includes(keyPreview.replace('...', '')) && !keyPreview.includes(key.substring(0, 10)));
  await Utils.sendMessage({ action: 'saveApiKeys', apiKeys });
  showToast('Key deleted', 'success');
  loadDashboardData();
}

async function testAllApiKeys() {
  showToast('Testing all API keys...', 'info');
  const apiKeys = await Utils.sendMessage({ action: 'getApiKeys' });
  let total = 0, working = 0;
  for (const provider of Object.keys(apiKeys)) {
    for (const key of (apiKeys[provider] || [])) {
      total++;
      const result = await Utils.sendMessage({ action: 'testApiKey', provider, key });
      if (result?.valid) working++;
      await Utils.sendMessage({ action: 'updateKeyStatus', status: { [key.substring(0,10) + '...']: { provider, valid: result?.valid || false, lastTested: new Date().toISOString(), error: result?.error } } });
    }
  }
  showToast(`Test complete: ${working}/${total} keys working`, 'success');
  loadDashboardData();
}

async function exportAllData() {
  const [apiKeys, keyStatus, usageStats, logs, settings, profiles] = await Promise.all([
    Utils.sendMessage({ action: 'getApiKeys' }), Utils.sendMessage({ action: 'getKeyStatus' }),
    Utils.sendMessage({ action: 'getUsageStats' }), Utils.sendMessage({ action: 'getLogs' }),
    Utils.sendMessage({ action: 'getSettings' }), Utils.sendMessage({ action: 'getProfiles' })
  ]);
  const exportData = { exportDate: new Date().toISOString(), version: '3.0.0', data: { apiKeys, keyStatus, usageStats, logs: logs.slice(0, 1000), settings, profiles } };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `magic-fill-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  showToast('Data exported!', 'success');
}

async function clearAllLogs() {
  if (!confirm('Clear all logs?')) return;
  await chrome.storage.local.set({ logs: [] });
  showToast('Logs cleared', 'success');
  loadDashboardData();
}

// FIX 1+2: Canvas check + Chart.js undefined check
function updateUsageChart(usageStats) {
  const canvas = document.getElementById('usageChart');
  if (!canvas) return;

  // FIX 1: Canvas element check — HTML mein canvas hona chahiye, div nahi
  if (!(canvas instanceof HTMLCanvasElement)) {
    console.error('usageChart must be a <canvas> element, not div');
    return;
  }

  // FIX 2: Chart.js loaded hai ya nahi check
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded! Add CDN script in HTML');
    canvas.parentElement.innerHTML += '<div style="color:red;padding:20px;">Chart.js load nahi hua</div>';
    return;
  }

  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }

  const openaiData = new Array(7).fill(0);
  const geminiData = new Array(7).fill(0);
  const claudeData = new Array(7).fill(0);
  const grokData = new Array(7).fill(0);
  const deepseekData = new Array(7).fill(0);
  const mistralData = new Array(7).fill(0);

  for (const provider in usageStats) {
    for (const key in usageStats[provider]) {
      const keyData = usageStats[provider][key];
      if (keyData.lastUsed) {
        const date = new Date(keyData.lastUsed).toDateString();
        const dayIndex = days.findIndex(d => {
          return new Date(d + ', ' + new Date().getFullYear()).toDateString() === date;
        });
        if (dayIndex >= 0) {
          const calls = keyData.calls || 0;
          if (provider === 'openai') openaiData[dayIndex] += calls;
          else if (provider === 'gemini') geminiData[dayIndex] += calls;
          else if (provider === 'claude') claudeData[dayIndex] += calls;
          else if (provider === 'grok') grokData[dayIndex] += calls;
          else if (provider === 'deepseek') deepseekData[dayIndex] += calls;
          else if (provider === 'mistral') mistralData[dayIndex] += calls;
        }
      }
    }
  }

  // FIX: Purana chart destroy karo naya banane se pehle
  if (window.usageChartInstance) {
    window.usageChartInstance.destroy();
    window.usageChartInstance = null;
  }

  window.usageChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        { label: 'OpenAI', data: openaiData, backgroundColor: '#10b981', borderRadius: 4, barPercentage: 0.8 },
        { label: 'Gemini', data: geminiData, backgroundColor: '#8b5cf6', borderRadius: 4, barPercentage: 0.8 },
        { label: 'Claude', data: claudeData, backgroundColor: '#f59e0b', borderRadius: 4, barPercentage: 0.8 },
        { label: 'Grok', data: grokData, backgroundColor: '#ef4444', borderRadius: 4, barPercentage: 0.8 },
        { label: 'DeepSeek', data: deepseekData, backgroundColor: '#3b82f6', borderRadius: 4, barPercentage: 0.8 },
        { label: 'Mistral', data: mistralData, backgroundColor: '#ec4899', borderRadius: 4, barPercentage: 0.8 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.raw)} calls` } }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: (v) => formatNumber(v) } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ORIGINAL — updateProviderSummary
function updateProviderSummary(apiKeys, keyStatus, usageStats) {
  const container = document.getElementById('providerStats');
  if (!container) return;

  const providers = ['openai', 'gemini', 'claude', 'grok', 'deepseek', 'mistral'];
  let html = '<div class="provider-summary-grid">';

  for (const provider of providers) {
    const keys = apiKeys[provider] || [];
    if (keys.length === 0) continue;

    const working = Object.values(keyStatus).filter(k => k.provider === provider && k.valid).length;
    let totalCalls = 0, totalTokens = 0, errorCount = 0;
    if (usageStats[provider]) {
      for (const key in usageStats[provider]) {
        totalCalls += usageStats[provider][key].calls || 0;
        totalTokens += usageStats[provider][key].tokens || 0;
        errorCount += usageStats[provider][key].errors || 0;
      }
    }

    const healthPercent = keys.length > 0 ? Math.round((working / keys.length) * 100) : 0;
    const errorRate = totalCalls > 0 ? Math.round((errorCount / totalCalls) * 100) : 0;
    const healthClass = healthPercent > 70 && errorRate < 10 ? 'good' : healthPercent > 30 ? 'warning' : 'bad';
    const healthText = healthClass === 'good' ? 'Healthy' : healthClass === 'warning' ? 'Degraded' : 'Dead';

    html += `
      <div class="provider-summary-card ${healthClass}">
        <div class="provider-summary-header">
          <span>${getProviderIcon(provider)}</span>
          <h4>${provider.charAt(0).toUpperCase() + provider.slice(1)}</h4>
          <span class="provider-health-badge ${healthClass}">${healthText}</span>
        </div>
        <div class="provider-summary-stats">
          <div class="summary-stat"><span class="stat-label">Keys</span><span class="stat-value">${working}/${keys.length}</span></div>
          <div class="summary-stat"><span class="stat-label">Calls</span><span class="stat-value">${formatNumber(totalCalls)}</span></div>
          <div class="summary-stat"><span class="stat-label">Tokens</span><span class="stat-value">${formatTokens(totalTokens)}</span></div>
          <div class="summary-stat"><span class="stat-label">Errors</span><span class="stat-value ${errorRate > 20 ? 'error-text' : ''}">${errorRate}%</span></div>
        </div>
        <div class="provider-progress-container">
          <div class="progress-label"><span>Health</span><span>${healthPercent}%</span></div>
          <div class="progress-bar-bg"><div class="progress-bar-fill ${healthClass}" style="width:${healthPercent}%"></div></div>
        </div>
        <div class="provider-actions">
          <button class="btn-small" onclick="testProviderKeys('${provider}')">Test All</button>
          <button class="btn-small" onclick="configureProvider('${provider}')">Configure</button>
        </div>
      </div>`;
  }
  html += '</div>';
  container.innerHTML = html;
}

// ORIGINAL — updateRecentActivity
function updateRecentActivity(logs) {
  const container = document.getElementById('recentActivity');
  if (!container) return;

  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="no-data">No recent activity</div>';
    return;
  }

  let html = '<div class="activity-feed">';
  logs.slice(0, 10).forEach(log => {
    const timeAgo = getTimeAgo(new Date(log.timestamp));
    const levelClass = log.level === 'ERROR' ? 'error' : log.level === 'WARN' ? 'warning' : 'info';
    html += `
      <div class="activity-item ${levelClass}">
        <div class="activity-icon">${log.level === 'ERROR' ? '❌' : log.level === 'WARN' ? '⚠️' : '✅'}</div>
        <div class="activity-content">
          <div class="activity-message">${log.message}</div>
          <div class="activity-meta"><span>${log.module || 'System'}</span><span>${timeAgo}</span></div>
        </div>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  const intervals = { year: 31536000, month: 2592000, week: 604800, day: 86400, hour: 3600, minute: 60, second: 1 };
  for (const [unit, sec] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / sec);
    if (interval >= 1) return interval + ' ' + unit + (interval === 1 ? '' : 's') + ' ago';
  }
  return 'just now';
}

async function testProviderKeys(provider) {
  showToast(`Testing all ${provider} keys...`, 'info');
  const apiKeys = await Utils.sendMessage({ action: 'getApiKeys' });
  const keys = apiKeys[provider] || [];
  let working = 0;
  for (const key of keys) {
    const result = await Utils.sendMessage({ action: 'testApiKey', provider, key });
    if (result?.valid) working++;
    await Utils.sendMessage({ action: 'updateKeyStatus', status: { [key.substring(0, 10) + '...']: { provider, valid: result?.valid || false, lastTested: new Date().toISOString(), error: result?.error } } });
  }
  showToast(`${provider}: ${working}/${keys.length} keys working`, 'success');
  loadDashboardData();
}

function configureProvider(provider) {
  chrome.runtime.openOptionsPage();
}

function showLoading(show) {
  const loader = document.getElementById('loadingOverlay');
  if (loader) loader.style.display = show ? 'flex' : 'none';
}

function showError(message) { showToast(message, 'error'); }

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position:fixed;bottom:20px;right:20px;padding:12px 20px;
    background:${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color:white;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);
    z-index:10000;font-size:13px;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

window.addEventListener('beforeunload', () => stopAutoRefresh());
window.refreshData = function() { loadDashboardData(); };