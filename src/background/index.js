chrome.runtime.onInstalled.addListener(() => {
  console.log('Q4Magic Sales Coach installed.');
  
  // Register rules to strip Origin and Referer headers to bypass CORS
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [
      {
        id: 1,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'origin', operation: 'remove' },
            { header: 'referer', operation: 'remove' }
          ]
        },
        condition: {
          urlFilter: '|https://devapi.360pipe.com/*',
          resourceTypes: ['xmlhttprequest']
        }
      }
    ]
  });
});

// simple proxy for fetch to bypass CORS
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'FETCH_PROXY') {
    const { url, method, data, headers } = request;
    fetch(url, {
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: method !== 'GET' ? JSON.stringify(data) : undefined
    })
      .then(async response => {
        const text = await response.text();
        try {
          const json = JSON.parse(text);
          sendResponse({ success: response.ok, data: json, status: response.status });
        } catch (e) {
          sendResponse({ success: response.ok, data: text, status: response.status, isText: true });
        }
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // async
  }
  
  if (request.type === 'GET_API_KEY') {
    chrome.storage.local.get(['openai_api_key'], (result) => {
      sendResponse({ key: result.openai_api_key });
    });
    return true; // Keep channel open for async response
  }
});
