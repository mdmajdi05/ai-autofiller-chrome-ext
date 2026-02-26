// ai-manager.js - Advanced AI Model Manager with Key Rotation

class AIManager {
  constructor() {
    this.models = [];
    this.keyStatus = new Map(); // Tracks health of each key
    this.failedKeys = new Map(); // Cache of failed keys with timestamps
    this.usageStats = new Map(); // Tracks API usage
    this.priorities = new Map(); // Model priorities
    this.initializeModels();
    this.loadKeyStatus();
  }

  async initializeModels() {
    // Load environment variables (in Chrome extension, we load from storage)
    const config = await Utils.storage.get('aiConfig') || {};
    
    // Define all models with their configurations
    this.models = [
      {
        name: 'chatgpt',
        priority: config.chatgptPriority || 1,
        keys: this.loadKeys('chatgpt', config),
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-3.5-turbo',
        headers: (key) => ({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        }),
        body: (prompt) => JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a smart form filler. Provide ONLY the value, no explanations.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 50,
          temperature: 0.3
        }),
        parseResponse: (data) => data.choices?.[0]?.message?.content?.trim()
      },
      {
        name: 'gemini',
        priority: config.geminiPriority || 2,
        keys: this.loadKeys('gemini', config),
        apiUrl: (key) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${key}`,
        headers: () => ({ 'Content-Type': 'application/json' }),
        body: (prompt) => JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            maxOutputTokens: 50,
            temperature: 0.3
          }
        }),
        parseResponse: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      },
      {
        name: 'claude',
        priority: config.claudePriority || 3,
        keys: this.loadKeys('claude', config),
        apiUrl: 'https://api.anthropic.com/v1/messages',
        headers: (key) => ({
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        }),
        body: (prompt) => JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 50,
          messages: [{ role: 'user', content: prompt }]
        }),
        parseResponse: (data) => data.content?.[0]?.text?.trim()
      },
      {
        name: 'deepseek',
        priority: config.deepseekPriority || 4,
        keys: this.loadKeys('deepseek', config),
        apiUrl: 'https://api.deepseek.com/v1/chat/completions',
        headers: (key) => ({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        }),
        body: (prompt) => JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 50
        }),
        parseResponse: (data) => data.choices?.[0]?.message?.content?.trim()
      },
      {
        name: 'mistral',
        priority: config.mistralPriority || 5,
        keys: this.loadKeys('mistral', config),
        apiUrl: 'https://api.mistral.ai/v1/chat/completions',
        headers: (key) => ({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        }),
        body: (prompt) => JSON.stringify({
          model: 'mistral-small',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 50
        }),
        parseResponse: (data) => data.choices?.[0]?.message?.content?.trim()
      }
    ];

    // Sort by priority
    this.models.sort((a, b) => a.priority - b.priority);
  }

  loadKeys(modelName, config) {
    const keys = [];
    // Load up to 20 keys per model
    for (let i = 1; i <= 20; i++) {
      const key = config[`${modelName}Keys_${i}`];
      if (key) keys.push(key);
    }
    return keys;
  }

  async loadKeyStatus() {
    const saved = await Utils.storage.get('keyStatus');
    if (saved) {
      Object.entries(saved).forEach(([key, status]) => {
        this.keyStatus.set(key, status);
      });
    }
  }

  async saveKeyStatus() {
    const statusObj = {};
    this.keyStatus.forEach((value, key) => {
      statusObj[key] = value;
    });
    await Utils.storage.set('keyStatus', statusObj);
  }

  isKeyValid(key) {
    const status = this.keyStatus.get(key);
    if (!status) return true;
    
    // Check if key is permanently banned
    if (status.banned) return false;
    
    // Check cooldown
    if (status.failedAt) {
      const cooldownMinutes = 60; // 1 hour cooldown
      const cooldownMs = cooldownMinutes * 60 * 1000;
      if (Date.now() - status.failedAt < cooldownMs) {
        return false; // Still in cooldown
      }
    }
    
    return true;
  }

  markKeyFailed(key, error) {
    const status = this.keyStatus.get(key) || { failures: 0, banned: false };
    status.failures = (status.failures || 0) + 1;
    status.failedAt = Date.now();
    status.lastError = error.message || String(error);
    
    // Ban key if too many failures
    if (status.failures >= 5) {
      status.banned = true;
      Utils.logger.warn('AIManager', `Key banned due to repeated failures: ${key.substring(0, 10)}...`, { failures: status.failures });
    }
    
    this.keyStatus.set(key, status);
    this.saveKeyStatus();
  }

  markKeySuccess(key) {
    const status = this.keyStatus.get(key) || {};
    status.failures = 0;
    status.failedAt = null;
    status.lastSuccess = Date.now();
    this.keyStatus.set(key, status);
    this.saveKeyStatus();
  }

  async getBestValue(fieldContext, profile, fieldType) {
    Utils.logger.debug('AIManager', `Getting AI value for field: ${fieldType}`, { fieldContext });
    
    // Try each model in priority order
    for (const model of this.models) {
      Utils.logger.debug('AIManager', `Trying model: ${model.name} (priority ${model.priority})`);
      
      // Try each key for this model
      for (const key of model.keys) {
        if (!this.isKeyValid(key)) {
          Utils.logger.debug('AIManager', `Key invalid/in cooldown: ${key.substring(0, 10)}...`);
          continue;
        }

        try {
          const prompt = this.generatePrompt(fieldContext, profile, fieldType);
          const value = await this.callModel(model, key, prompt);
          
          if (value) {
            this.markKeySuccess(key);
            Utils.logger.info('AIManager', `Success with ${model.name}`, { key: key.substring(0, 10) + '...', value });
            return value;
          }
        } catch (error) {
          Utils.logger.error('AIManager', `Failed with ${model.name}`, { error: error.message, key: key.substring(0, 10) + '...' });
          this.markKeyFailed(key, error);
          continue; // Try next key
        }
      }
      
      // If we get here, all keys for this model failed
      Utils.logger.warn('AIManager', `All keys failed for model: ${model.name}`);
    }
    
    Utils.logger.warn('AIManager', 'All models failed, no AI value available');
    return null;
  }

  generatePrompt(fieldContext, profile, fieldType) {
    const context = `
FIELD TYPE: ${fieldType}
FIELD LABEL: ${fieldContext.label || 'unknown'}
FIELD PLACEHOLDER: ${fieldContext.placeholder || 'none'}
FIELD NAME: ${fieldContext.name || 'none'}
SURROUNDING TEXT: ${fieldContext.surroundingText || 'none'}

USER PROFILE:
${JSON.stringify(profile, null, 2)}

TASK: Generate a realistic value for this form field based on the field type and user profile.
If the field type matches profile data, use that. Otherwise, generate appropriate fake data.
Return ONLY the value, no explanations or additional text.`;

    return context;
  }

  async callModel(model, key, prompt) {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('API timeout'));
      }, 5000); // 5 second timeout

      try {
        const url = typeof model.apiUrl === 'function' ? model.apiUrl(key) : model.apiUrl;
        const headers = model.headers(key);
        const body = model.body(prompt);

        const response = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: body
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const value = model.parseResponse(data);
        
        if (value) {
          resolve(value);
        } else {
          reject(new Error('No value in response'));
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async testAllKeys() {
    const results = {
      total: 0,
      working: 0,
      failed: 0,
      details: []
    };

    for (const model of this.models) {
      for (const key of model.keys) {
        results.total++;
        try {
          const testPrompt = 'Return the word "WORKING" if you can read this.';
          const value = await this.callModel(model, key, testPrompt);
          
          if (value && value.toLowerCase().includes('working')) {
            results.working++;
            this.markKeySuccess(key);
            results.details.push({
              model: model.name,
              key: key.substring(0, 10) + '...',
              status: 'working'
            });
          } else {
            throw new Error('Invalid response');
          }
        } catch (error) {
          results.failed++;
          this.markKeyFailed(key, error);
          results.details.push({
            model: model.name,
            key: key.substring(0, 10) + '...',
            status: 'failed',
            error: error.message
          });
        }
      }
    }

    await this.saveKeyStatus();
    return results;
  }

  getKeyStatus() {
    const status = {};
    this.keyStatus.forEach((value, key) => {
      status[key.substring(0, 10) + '...'] = value;
    });
    return status;
  }

  getModelStats() {
    const stats = {};
    this.models.forEach(model => {
      stats[model.name] = {
        totalKeys: model.keys.length,
        workingKeys: model.keys.filter(k => this.isKeyValid(k) && !this.keyStatus.get(k)?.banned).length,
        failedKeys: model.keys.filter(k => !this.isKeyValid(k)).length,
        priority: model.priority
      };
    });
    return stats;
  }
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIManager;
}