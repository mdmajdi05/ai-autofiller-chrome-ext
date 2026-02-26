// ============================================
// DASHBOARD.JS - Analytics Dashboard
// ============================================

let refreshInterval;
let usageChart = null;

document.addEventListener('DOMContentLoaded', () => {
  loadDashboardData();
  startAutoRefresh();
  setupEventListeners();
});

function setupEventListeners() {
  // Export data button
  const exportBtn = document.getElementById('exportDataBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportAllData);
  }
  
  // Clear logs button
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', clearAllLogs);
  }
  
  // Test all keys button
  const testKeysBtn = document.getElementById('testAllKeysBtn');
  if (testKeysBtn) {
    testKeysBtn.addEventListener('click', testAllApiKeys);
  }
  
  // Date range selector
  const dateRange = document.getElementById('dateRange');
  if (dateRange) {
    dateRange.addEventListener('change', () => {
      loadDashboardData();
    });
  }
}

function startAutoRefresh() {
  refreshInterval = setInterval(loadDashboardData, 30000); // Every 30 seconds
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
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
  // Count total keys
  let totalKeys = 0;
  let keysByProvider = {};
  
  for (const provider in apiKeys) {
    if (Array.isArray(apiKeys[provider])) {
      totalKeys += apiKeys[provider].length;
      keysByProvider[provider] = apiKeys[provider].length;
    }
  }
  
  // Count working/failed keys
  let working = 0;
  let failed = 0;
  let rateLimited = 0;
  let expired = 0;
  
  for (const key in keyStatus) {
    if (keyStatus[key]?.valid) {
      working++;
    } else {
      failed++;
      if (keyStatus[key]?.error?.includes('rate')) rateLimited++;
      if (keyStatus[key]?.error?.includes('expired')) expired++;
      if (keyStatus[key]?.error?.includes('invalid')) expired++;
    }
  }
  
  // Count total calls and tokens
  let totalCalls = 0;
  let totalTokens = 0;
  let todayCalls = 0;
  let todayTokens = 0;
  let weekCalls = 0;
  let weekTokens = 0;
  
  const todayStr = new Date().toDateString();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  for (const provider in usageStats) {
    for (const key in usageStats[provider]) {
      const data = usageStats[provider][key];
      totalCalls += data.calls || 0;
      totalTokens += data.tokens || 0;
      
      if (data.lastUsed) {
        const lastUsedDate = new Date(data.lastUsed);
        
        if (lastUsedDate.toDateString() === todayStr) {
          todayCalls += data.calls || 0;
          todayTokens += data.tokens || 0;
        }
        
        if (lastUsedDate >= weekAgo) {
          weekCalls += data.calls || 0;
          weekTokens += data.tokens || 0;
        }
      }
    }
  }
  
  // Calculate success rate
  const successRate = totalCalls > 0 
    ? Math.round(((totalCalls - (rateLimited + expired)) / totalCalls) * 100) 
    : 100;
  
  // Update UI elements
  document.getElementById('totalKeys').textContent = totalKeys;
  document.getElementById('workingKeys').textContent = working;
  document.getElementById('failedKeys').textContent = failed;
  document.getElementById('totalCalls').textContent = formatNumber(totalCalls);
  document.getElementById('totalTokens').textContent = formatTokens(totalTokens);
  document.getElementById('todayCalls').textContent = formatNumber(todayCalls);
  document.getElementById('todayTokens').textContent = formatTokens(todayTokens);
  document.getElementById('weekCalls').textContent = formatNumber(weekCalls);
  document.getElementById('weekTokens').textContent = formatTokens(weekTokens);
  document.getElementById('successRate').textContent = successRate + '%';
  document.getElementById('activeProfiles').textContent = profiles?.profiles?.length || 0;
  
  // Update provider stats
  let providerHtml = '';
  for (const [provider, count] of Object.entries(keysByProvider)) {
    const providerWorking = Object.values(keyStatus).filter(k => 
      k.provider === provider && k.valid
    ).length;
    
    const percent = count > 0 ? Math.round((providerWorking / count) * 100) : 0;
    const statusClass = percent > 70 ? 'good' : percent > 30 ? 'warning' : 'bad';
    
    providerHtml += `
      <div class="provider-stat-item">
        <div class="provider-stat-header">
          <span class="provider-name">${getProviderIcon(provider)} ${provider.toUpperCase()}</span>
          <span class="provider-count ${statusClass}">${providerWorking}/${count} keys</span>
        </div>
        <div class="provider-progress">
          <div class="progress-bar ${statusClass}" style="width: ${percent}%"></div>
        </div>
        <div class="provider-stats-footer">
          <span>Working: ${providerWorking}</span>
          <span>Success: ${percent}%</span>
        </div>
      </div>
    `;
  }
  
  const providerStats = document.getElementById('providerStats');
  if (providerStats) {
    providerStats.innerHTML = providerHtml || '<div class="no-data">No providers configured</div>';
  }
}

function getProviderIcon(provider) {
  const icons = {
    openai: '🤖',
    gemini: '🔮',
    claude: '🦜',
    grok: '🚀',
    deepseek: '🌊',
    mistral: '🌫️'
  };
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
    tbody.innerHTML = '<tr><td colspan="8" class="empty-message">No API keys configured</td></tr>';
    return;
  }
  
  let html = '';
  
  // Sort by last used (most recent first)
  const sortedKeys = Object.entries(keyStatus).sort((a, b) => {
    const timeA = new Date(a[1].lastTested || 0).getTime();
    const timeB = new Date(b[1].lastTested || 0).getTime();
    return timeB - timeA;
  });
  
  for (const [keyPreview, data] of sortedKeys) {
    // Find usage for this key
    let usage = 0;
    let tokens = 0;
    let lastUsed = 'Never';
    let errorCount = 0;
    let avgResponseTime = 0;
    
    if (data.provider && usageStats[data.provider]) {
      for (const [actualKey, keyData] of Object.entries(usageStats[data.provider])) {
        if (actualKey.includes(keyPreview.replace('...', '')) || 
            keyPreview.includes(actualKey.substring(0, 10))) {
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
    const statusText = data.valid ? 'Active' : 'Invalid';
    const errorRate = usage > 0 ? Math.round((errorCount / usage) * 100) : 0;
    
    // Determine health badge
    let healthBadge = '';
    if (data.valid) {
      if (errorRate > 20) {
        healthBadge = '<span class="badge-warning">⚠️ High Errors</span>';
      } else if (avgResponseTime > 5000) {
        healthBadge = '<span class="badge-warning">🐢 Slow</span>';
      } else {
        healthBadge = '<span class="badge-success">✅ Healthy</span>';
      }
    } else {
      healthBadge = '<span class="badge-error">❌ Dead</span>';
    }
    
    html += `
      <tr class="${data.valid ? 'valid-row' : 'invalid-row'}">
        <td>
          <span class="provider-badge ${data.provider}">${getProviderIcon(data.provider)} ${data.provider}</span>
        </td>
        <td>
          <code class="key-preview">${keyPreview}</code>
          <button class="btn-copy" onclick="copyToClipboard('${keyPreview}')" title="Copy key">📋</button>
        </td>
        <td>
          <span class="status-indicator ${healthClass}"></span>
          <span class="status-text ${data.valid ? 'success' : 'error'}">${statusText}</span>
          ${data.error ? `<span class="error-tooltip" title="${data.error}">⚠️</span>` : ''}
        </td>
        <td>${healthBadge}</td>
        <td class="number-cell">${formatNumber(usage)}</td>
        <td class="number-cell">${formatTokens(tokens)}</td>
        <td class="number-cell ${errorRate > 20 ? 'error-text' : ''}">${errorRate}%</td>
        <td class="number-cell">${avgResponseTime ? avgResponseTime + 'ms' : '-'}</td>
        <td class="date-cell">${lastUsed}</td>
        <td class="action-cell">
          <button class="btn-icon-small" onclick="testSingleKey('${data.provider}', '${keyPreview}')" title="Test key">🔄</button>
          <button class="btn-icon-small" onclick="deleteKey('${data.provider}', '${keyPreview}')" title="Delete key">🗑️</button>
        </td>
      </tr>
    `;
  }
  
  tbody.innerHTML = html;
}

function updateActivityTable(logs) {
  const tbody = document.getElementById('activityBody');
  
  if (!tbody) return;
  
  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-message">No activity yet</td></tr>';
    return;
  }
  
  let html = '';
  
  logs.slice(0, 100).forEach(log => {
    const statusClass = log.level === 'ERROR' ? 'badge-error' : 
                       log.level === 'WARN' ? 'badge-warning' : 'badge-success';
    
    const statusIcon = log.level === 'ERROR' ? '❌' : 
                      log.level === 'WARN' ? '⚠️' : '✅';
    
    // Format time
    const logTime = new Date(log.timestamp);
    const timeStr = logTime.toLocaleTimeString();
    const dateStr = logTime.toLocaleDateString();
    
    // Truncate long messages
    const message = log.message.length > 100 
      ? log.message.substring(0, 100) + '...' 
      : log.message;
    
    html += `
      <tr>
        <td class="time-cell">${timeStr}<br><span class="date-small">${dateStr}</span></td>
        <td>
          <span class="module-badge ${log.module?.toLowerCase()}">${log.module || 'System'}</span>
        </td>
        <td class="message-cell" title="${log.message}">${message}</td>
        <td>
          <span class="badge ${statusClass}">
            ${statusIcon} ${log.level}
          </span>
        </td>
        <td class="action-cell">
          ${log.data ? `<button class="btn-icon-small" onclick='showData("${encodeURIComponent(JSON.stringify(log.data))}")' title="View details">👁️</button>` : ''}
        </td>
        <td class="action-cell">
          ${log.level === 'ERROR' ? `<button class="btn-icon-small" onclick="retryOperation('${log.message}')" title="Retry">↻</button>` : ''}
        </td>
        <td class="action-cell">
          <button class="btn-icon-small" onclick="copyLog('${log.message}')" title="Copy log">📋</button>
        </td>
      </tr>
    `;
  });
  
  tbody.innerHTML = html;
}

function showData(encodedData) {
  try {
    const data = JSON.parse(decodeURIComponent(encodedData));
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Log Details</h3>
          <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
        </div>
        <div class="modal-body">
          <pre>${JSON.stringify(data, null, 2)}</pre>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="copyToClipboard('${JSON.stringify(data)}')">Copy</button>
          <button class="btn btn-primary" onclick="this.closest('.modal').remove()">Close</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  } catch (error) {
    alert('Error displaying data');
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Failed to copy', 'error');
  });
}

function copyLog(message) {
  copyToClipboard(message);
}

function retryOperation(message) {
  showToast('Retrying operation...', 'info');
  // Implement retry logic here
}

async function testSingleKey(provider, keyPreview) {
  showToast(`Testing ${provider} key...`, 'info');
  
  // Find actual key
  const apiKeys = await Utils.sendMessage({ action: 'getApiKeys' });
  const keys = apiKeys[provider] || [];
  
  for (const key of keys) {
    if (key.includes(keyPreview.replace('...', '')) || 
        keyPreview.includes(key.substring(0, 10))) {
      
      const result = await Utils.sendMessage({
        action: 'testApiKey',
        provider,
        key
      });
      
      if (result?.valid) {
        showToast('Key is valid!', 'success');
      } else {
        showToast('Key is invalid', 'error');
      }
      
      // Update status
      await Utils.sendMessage({
        action: 'updateKeyStatus',
        status: {
          [keyPreview]: {
            provider,
            valid: result?.valid || false,
            lastTested: new Date().toISOString(),
            error: result?.error
          }
        }
      });
      
      loadDashboardData();
      break;
    }
  }
}

async function deleteKey(provider, keyPreview) {
  if (!confirm(`Are you sure you want to delete this ${provider} key?`)) return;
  
  const apiKeys = await Utils.sendMessage({ action: 'getApiKeys' });
  const keys = apiKeys[provider] || [];
  
  // Filter out the key
  apiKeys[provider] = keys.filter(key => 
    !key.includes(keyPreview.replace('...', '')) && 
    !keyPreview.includes(key.substring(0, 10))
  );
  
  await Utils.sendMessage({
    action: 'saveApiKeys',
    apiKeys
  });
  
  // Also remove from key status
  const keyStatus = await Utils.sendMessage({ action: 'getKeyStatus' });
  delete keyStatus[keyPreview];
  
  await Utils.sendMessage({
    action: 'updateKeyStatus',
    status: keyStatus
  });
  
  showToast('Key deleted', 'success');
  loadDashboardData();
}

async function testAllApiKeys() {
  showToast('Testing all API keys...', 'info');
  
  const apiKeys = await Utils.sendMessage({ action: 'getApiKeys' });
  const providers = Object.keys(apiKeys);
  
  let total = 0;
  let working = 0;
  
  for (const provider of providers) {
    const keys = apiKeys[provider] || [];
    
    for (const key of keys) {
      total++;
      const result = await Utils.sendMessage({
        action: 'testApiKey',
        provider,
        key
      });
      
      if (result?.valid) working++;
      
      // Update status
      const keyPreview = key.substring(0, 10) + '...';
      await Utils.sendMessage({
        action: 'updateKeyStatus',
        status: {
          [keyPreview]: {
            provider,
            valid: result?.valid || false,
            lastTested: new Date().toISOString(),
            error: result?.error
          }
        }
      });
    }
  }
  
  showToast(`Test complete: ${working}/${total} keys working`, 'success');
  loadDashboardData();
}

async function exportAllData() {
  const [apiKeys, keyStatus, usageStats, logs, settings, profiles] = await Promise.all([
    Utils.sendMessage({ action: 'getApiKeys' }),
    Utils.sendMessage({ action: 'getKeyStatus' }),
    Utils.sendMessage({ action: 'getUsageStats' }),
    Utils.sendMessage({ action: 'getLogs' }),
    Utils.sendMessage({ action: 'getSettings' }),
    Utils.sendMessage({ action: 'getProfiles' })
  ]);
  
  const exportData = {
    exportDate: new Date().toISOString(),
    version: '3.0.0',
    stats: {
      totalKeys: Object.values(apiKeys).flat().length,
      workingKeys: Object.values(keyStatus).filter(k => k.valid).length,
      totalCalls: Object.values(usageStats).reduce((sum, p) => 
        sum + Object.values(p).reduce((s, k) => s + (k.calls || 0), 0), 0
      )
    },
    data: {
      apiKeys,
      keyStatus,
      usageStats,
      logs: logs.slice(0, 1000),
      settings,
      profiles
    }
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `magic-fill-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  
  showToast('Data exported successfully!', 'success');
}

async function clearAllLogs() {
  if (!confirm('Are you sure you want to clear all logs?')) return;
  
  await Utils.sendMessage({
    action: 'addLog',
    log: { level: 'INFO', module: 'Dashboard', message: 'Logs cleared by user' }
  });
  
  // Clear logs in storage
  await chrome.storage.local.set({ logs: [] });
  
  showToast('Logs cleared', 'success');
  loadDashboardData();
}

function updateUsageChart(usageStats) {
  const canvas = document.getElementById('usageChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  // Get last 7 days
  const days = [];
  const today = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }
  
  // Aggregate data by day
  const openaiData = new Array(7).fill(0);
  const geminiData = new Array(7).fill(0);
  const claudeData = new Array(7).fill(0);
  const grokData = new Array(7).fill(0);
  
  for (const provider in usageStats) {
    for (const key in usageStats[provider]) {
      const keyData = usageStats[provider][key];
      if (keyData.lastUsed) {
        const date = new Date(keyData.lastUsed).toDateString();
        const dayIndex = days.findIndex(d => {
          const chartDate = new Date(d + ', ' + new Date().getFullYear()).toDateString();
          return chartDate === date;
        });
        
        if (dayIndex >= 0) {
          const calls = keyData.calls || 0;
          switch(provider) {
            case 'openai': openaiData[dayIndex] += calls; break;
            case 'gemini': geminiData[dayIndex] += calls; break;
            case 'claude': claudeData[dayIndex] += calls; break;
            case 'grok': grokData[dayIndex] += calls; break;
          }
        }
      }
    }
  }
  
  // Destroy existing chart
  if (window.usageChartInstance) {
    window.usageChartInstance.destroy();
  }
  
  // Create new chart
  window.usageChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        {
          label: 'OpenAI',
          data: openaiData,
          backgroundColor: '#10b981',
          borderRadius: 6,
          barPercentage: 0.8
        },
        {
          label: 'Gemini',
          data: geminiData,
          backgroundColor: '#8b5cf6',
          borderRadius: 6,
          barPercentage: 0.8
        },
        {
          label: 'Claude',
          data: claudeData,
          backgroundColor: '#f59e0b',
          borderRadius: 6,
          barPercentage: 0.8
        },
        {
          label: 'Grok',
          data: grokData,
          backgroundColor: '#ef4444',
          borderRadius: 6,
          barPercentage: 0.8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            boxWidth: 8
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${formatNumber(context.raw)} calls`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0,0,0,0.05)'
          },
          ticks: {
            callback: function(value) {
              return formatNumber(value);
            }
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      }
    }
  });
}

function updateProviderSummary(apiKeys, keyStatus, usageStats) {
  const container = document.getElementById('providerSummary');
  if (!container) return;
  
  const providers = ['openai', 'gemini', 'claude', 'grok'];
  let html = '<div class="provider-summary-grid">';
  
  for (const provider of providers) {
    const keys = apiKeys[provider] || [];
    const working = Object.values(keyStatus).filter(k => 
      k.provider === provider && k.valid
    ).length;
    
    // Calculate total usage for this provider
    let totalCalls = 0;
    let totalTokens = 0;
    let errorCount = 0;
    
    if (usageStats[provider]) {
      for (const key in usageStats[provider]) {
        totalCalls += usageStats[provider][key].calls || 0;
        totalTokens += usageStats[provider][key].tokens || 0;
        errorCount += usageStats[provider][key].errors || 0;
      }
    }
    
    const healthPercent = keys.length > 0 ? Math.round((working / keys.length) * 100) : 0;
    const errorRate = totalCalls > 0 ? Math.round((errorCount / totalCalls) * 100) : 0;
    
    let healthClass = 'bad';
    let healthText = 'Inactive';
    
    if (healthPercent > 70 && errorRate < 10) {
      healthClass = 'good';
      healthText = 'Healthy';
    } else if (healthPercent > 30) {
      healthClass = 'warning';
      healthText = 'Degraded';
    } else if (healthPercent > 0) {
      healthClass = 'warning';
      healthText = 'Poor';
    } else {
      healthClass = 'bad';
      healthText = 'Dead';
    }
    
    html += `
      <div class="provider-summary-card ${healthClass}">
        <div class="provider-summary-header">
          <span class="provider-icon">${getProviderIcon(provider)}</span>
          <h4>${provider.charAt(0).toUpperCase() + provider.slice(1)}</h4>
          <span class="provider-health-badge ${healthClass}">${healthText}</span>
        </div>
        
        <div class="provider-summary-stats">
          <div class="summary-stat">
            <span class="stat-label">Keys</span>
            <span class="stat-value">${working}/${keys.length}</span>
          </div>
          <div class="summary-stat">
            <span class="stat-label">Calls</span>
            <span class="stat-value">${formatNumber(totalCalls)}</span>
          </div>
          <div class="summary-stat">
            <span class="stat-label">Tokens</span>
            <span class="stat-value">${formatTokens(totalTokens)}</span>
          </div>
          <div class="summary-stat">
            <span class="stat-label">Errors</span>
            <span class="stat-value ${errorRate > 20 ? 'error-text' : ''}">${errorRate}%</span>
          </div>
        </div>
        
        <div class="provider-progress-container">
          <div class="progress-label">
            <span>Health</span>
            <span>${healthPercent}%</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill ${healthClass}" style="width: ${healthPercent}%"></div>
          </div>
        </div>
        
        <div class="provider-actions">
          <button class="btn-small" onclick="testProviderKeys('${provider}')">Test All</button>
          <button class="btn-small" onclick="configureProvider('${provider}')">Configure</button>
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  container.innerHTML = html;
}

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
        <div class="activity-icon">
          ${log.level === 'ERROR' ? '❌' : log.level === 'WARN' ? '⚠️' : '✅'}
        </div>
        <div class="activity-content">
          <div class="activity-message">${log.message}</div>
          <div class="activity-meta">
            <span class="activity-module">${log.module || 'System'}</span>
            <span class="activity-time">${timeAgo}</span>
          </div>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
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
}

async function testProviderKeys(provider) {
  showToast(`Testing all ${provider} keys...`, 'info');
  
  const apiKeys = await Utils.sendMessage({ action: 'getApiKeys' });
  const keys = apiKeys[provider] || [];
  
  let working = 0;
  
  for (const key of keys) {
    const result = await Utils.sendMessage({
      action: 'testApiKey',
      provider,
      key
    });
    
    if (result?.valid) working++;
    
    const keyPreview = key.substring(0, 10) + '...';
    await Utils.sendMessage({
      action: 'updateKeyStatus',
      status: {
        [keyPreview]: {
          provider,
          valid: result?.valid || false,
          lastTested: new Date().toISOString(),
          error: result?.error
        }
      }
    });
  }
  
  showToast(`${provider}: ${working}/${keys.length} keys working`, 'success');
  loadDashboardData();
}

function configureProvider(provider) {
  // Open options page with provider tab
  chrome.runtime.openOptionsPage();
}

function showLoading(show) {
  const loader = document.getElementById('loadingOverlay');
  if (loader) {
    loader.style.display = show ? 'flex' : 'none';
  }
}

function showError(message) {
  showToast(message, 'error');
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  stopAutoRefresh();
});

// Manual refresh function
window.refreshData = function() {
  loadDashboardData();
};