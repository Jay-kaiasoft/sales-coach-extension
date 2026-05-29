/**
 * Content Script for Q4Magic Sales Coach
 */

const DETECTION_PATTERNS = {
  MEET: 'meet.google.com',
  TEAMS: 'teams.cloud.microsoft',
  TEAMS_LIVE: 'teams.live.com',
  WEBEX: 'webex.com'
};

let currentPlatform = null;
let sidebarRoot = null;
let lastCaptionText = "";
let lastBufferTime = Date.now();
let meetingWasActive = false;

// --- PLATFORM & MEETING DETECTION ---
function detectPlatform() {
  const host = window.location.hostname;
  if (host.includes(DETECTION_PATTERNS.MEET)) return 'MEET';
  if (host.includes(DETECTION_PATTERNS.TEAMS) || host.includes(DETECTION_PATTERNS.TEAMS_LIVE)) return 'TEAMS';
  if (host.includes(DETECTION_PATTERNS.WEBEX)) return 'WEBEX';
  return null;
}

function isMeetingPage() {
  const path = window.location.pathname;
  const platform = detectPlatform();

  if (platform === 'MEET') {
    // Regex for meeting code like abc-defg-hij
    const isCode = /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(path);
    if (!isCode) return false;

    // Check if we are in the lobby.
    // Standard lobby selectors, plus checks for buttons with "Join now", "Ask to join" or localized equivalents
    const isLobby = !!(
      document.querySelector('[jsname="Q8S7wb"]') || 
      document.querySelector('[jsname="j97Atc"]') ||
      Array.from(document.querySelectorAll('button, div[role="button"]')).some(el => {
        const text = (el.innerText || "").toLowerCase();
        const ariaLabel = (el.getAttribute('aria-label') || "").toLowerCase();
        return text.includes("join now") || text.includes("ask to join") ||
               ariaLabel.includes("join now") || ariaLabel.includes("ask to join");
      })
    );

    // Check if we see meeting controls or buttons that indicate we are in an active meeting
    const isInMeeting = !!(
      document.querySelector('[jsname="CQm7mc"]') || // Leave button jsname fallback
      document.querySelector('[data-meeting-title]') ||
      document.querySelector('button[aria-label*="Leave"], button[aria-label*="leave"]') ||
      document.querySelector('[aria-label*="chat"], [aria-label*="Chat"]') ||
      document.querySelector('[aria-label*="people"], [aria-label*="People"]') ||
      document.querySelector('[aria-label*="everyone"], [aria-label*="everyone"]') ||
      document.querySelector('button[aria-label*="microphone"], button[aria-label*="Microphone"]') ||
      document.querySelector('button[aria-label*="camera"], button[aria-label*="Camera"]')
    );

    return isCode && isInMeeting && !isLobby;
  }

  if (platform === 'TEAMS') {
    const isMeetingPath = path.includes('meetup-join') || path.includes('/modern-stage/') || path.includes('/v2/meet/') || path.includes('/meet/');
    if (isMeetingPath) return true;

    // Fallback: if we are on '/v2/', check if an active call is running (Leave button is present)
    return !!findLeaveButton();
  }
  if (platform === 'WEBEX') {
    return path.includes('/meet/') || path.includes('/join/');
  }
  return false;
}

// --- SIDEBAR INJECTION & CLEANUP ---
let shouldNeverShowAgain = false;

// --- SIDEBAR INJECTION & CLEANUP ---
function injectSidebar() {
  if (shouldNeverShowAgain || document.getElementById('q4magic-coach-root')) return;

  const container = document.createElement('div');
  container.id = 'q4magic-coach-root';
  // ... (rest of style)
  container.style.position = 'fixed';
  container.style.right = '0';
  container.style.top = '0';
  container.style.width = '450px';
  container.style.height = '100vh';
  container.style.zIndex = '999999';
  container.style.backgroundColor = 'white';
  container.style.boxShadow = '-2px 0 10px rgba(0,0,0,0.1)';
  container.style.transition = 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
  container.style.overflow = 'hidden';

  const shadow = container.attachShadow({ mode: 'open' });
  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('index.html');
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';
  shadow.appendChild(iframe);

  document.body.appendChild(container);
  sidebarRoot = iframe;

  // Listen for messages from the iframe
  window.addEventListener('message', (event) => {
    if (event.data.type === 'SET_COLLAPSED') {
      container.style.width = event.data.collapsed ? '48px' : '450px';
    } else if (event.data.type === 'CLOSE_SIDEBAR') {
      console.log("[Q4Magic] Manual close requested. Removing sidebar permanently.");
      shouldNeverShowAgain = true;
      removeSidebar();
      stopScraping();
    } else if (event.data.type === 'SHOW_REG_MODAL') {
      showGlobalRegModal(event.data.email);
    }
  });
}

function showGlobalRegModal(email) {
  if (document.getElementById('q4magic-global-modal')) return;

  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'q4magic-global-modal';
  Object.assign(modalOverlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '1000000',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    animation: 'q4magicFadeIn 0.3s ease-out'
  });

  const modalContent = document.createElement('div');
  Object.assign(modalContent.style, {
    backgroundColor: 'white',
    borderRadius: '24px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    maxWidth: '400px',
    width: '100%',
    padding: '32px',
    border: '1px solid #f1f5f9',
    textAlign: 'center',
    animation: 'q4magicSlideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
  });

  // Create Keyframes
  const styleSheet = document.createElement("style");
  styleSheet.innerText = `
    @keyframes q4magicFadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes q4magicSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  `;
  document.head.appendChild(styleSheet);

  modalContent.innerHTML = `
    <div style="width: 64px; height: 64px; background-color: #fef2f2; border-radius: 9999px; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
      <svg style="width: 32px; height: 32px; color: #ef4444;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
    </div>
    <h3 style="font-size: 18px; font-weight: 900; color: #0f172a; margin-bottom: 8px; text-transform: uppercase; letter-spacing: -0.025em; font-family: sans-serif;">Email Not Registered</h3>
    <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 32px; font-family: sans-serif;">
      The email <span style="font-weight: 700; color: #0f172a;">${email}</span> is not currently registered with <span style="font-weight: 700; color: #0f172a;">360Pipe</span>.
      <br><br>
      Please note that recorded meeting data will not be synchronized to the 360Pipe platform.
    </p>
    <button id="q4magic-modal-close" style="width: 100%; padding: 16px; background-color: #0f172a; color: white; border-radius: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; border: none; cursor: pointer; transition: all 0.2s; font-family: sans-serif;">
      OK
    </button>
  `;

  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);

  document.getElementById('q4magic-modal-close').onclick = () => {
    modalOverlay.remove();
  };
}

function removeSidebar() {
  const existing = document.getElementById('q4magic-coach-root');
  if (existing) {
    existing.remove();
    sidebarRoot = null;
  }
}

// --- ROBUST DETECTION HELPERS ---
function findCCButton() {
  if (currentPlatform === 'MEET') {
    const byJsName = document.querySelector('button[jsname="IBm91c"]');
    if (byJsName) return byJsName;
    const buttons = document.querySelectorAll('button[aria-label]');
    for (const btn of buttons) {
      const label = (btn.getAttribute('aria-label') || "").toLowerCase();
      if (label.includes('caption') || label.includes('subtitle') || label.includes('closed caption')) {
        return btn;
      }
    }
  } else if (currentPlatform === 'TEAMS') {
    const buttons = document.querySelectorAll('button[aria-label]');
    for (const btn of buttons) {
      const label = (btn.getAttribute('aria-label') || "").toLowerCase();
      if (label.includes('caption') || label.includes('subtitle') || label.includes('closed caption') || label.includes('turn on live captions')) {
        return btn;
      }
    }
  }
  return null;
}

function findCaptionText() {
  if (currentPlatform === 'MEET') {
    const preciseSelectors = [
      '[aria-label="Captions"] .ygicle',
      '.ygicle.VbkSUe',
      '.ygicle',
      '.VbkSUe'
    ];
    const preciseNodes = document.querySelectorAll(preciseSelectors.join(', '));
    if (preciseNodes.length > 0) {
      return Array.from(preciseNodes).map(n => n.innerText).join(" ");
    }
  } else if (currentPlatform === 'TEAMS') {
    const preciseSelectors = [
      '[data-tid="closed-caption-text"]',
      '[data-tid*="closed-caption-text"]',
      '.closed-caption-text'
    ];
    const preciseNodes = document.querySelectorAll(preciseSelectors.join(', '));
    if (preciseNodes.length > 0) {
      return Array.from(preciseNodes).map(n => n.innerText).join(" ");
    }
  }
  return "";
}

// --- CAPTION SCRAPING ---
let scrapingObserver = null;

function startScraping() {
  if (scrapingObserver) return;
  currentPlatform = detectPlatform();
  if (!currentPlatform) return;

  scrapingObserver = new MutationObserver(() => {
    let newText = "";
    if (currentPlatform === 'MEET' || currentPlatform === 'TEAMS') {
      newText = findCaptionText();
    }
    if (newText && newText !== lastCaptionText) {
      processCaptions(newText);
      lastCaptionText = newText;
    }
  });
  scrapingObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function stopScraping() {
  if (scrapingObserver) {
    scrapingObserver.disconnect();
    scrapingObserver = null;
  }
}

function checkCaptionsStatus() {
  let ccActive = false;
  if (lastCaptionText && (Date.now() - lastBufferTime < 8000)) {
    ccActive = true;
  }
  if (!ccActive) {
    if (currentPlatform === 'MEET') {
      const ccButton = findCCButton();
      const ccRegion = document.querySelector('[aria-label="Captions"], .vNKgIf, .UDinHf');
      ccActive = (ccButton && ccButton.getAttribute('aria-pressed') === 'true') || !!ccRegion;
    } else if (currentPlatform === 'TEAMS') {
      const ccButton = findCCButton();
      const ccRegion = document.querySelector('[data-tid="closed-caption-renderer-wrapper"], [data-tid="closed-caption-v2-virtual-list-content"]');
      ccActive = (ccButton && (ccButton.getAttribute('aria-pressed') === 'true' || ccButton.getAttribute('aria-checked') === 'true')) || !!ccRegion;
    }
  }
  if (sidebarRoot && sidebarRoot.contentWindow) {
    sidebarRoot.contentWindow.postMessage({ type: 'CC_STATUS', active: ccActive }, '*');
  }
}

function processCaptions(text) {
  const now = Date.now();
  const isSentenceEnd = /[.!?]$/.test(text.trim());
  const timeDiff = now - lastBufferTime;
  if (isSentenceEnd || timeDiff > 10000) {
    const chunk = text.trim();
    if (chunk) {
      sendToSidebar(chunk);
      lastBufferTime = now;
    }
  }
}

function sendToSidebar(text) {
  if (sidebarRoot && sidebarRoot.contentWindow) {
    sidebarRoot.contentWindow.postMessage({ type: 'NEW_CAPTION', text }, '*');
  }
}

// --- MAIN CONTROLLER ---
function findLeaveButton() {
  if (currentPlatform === 'MEET') {
    // Red "Leave call" button in Google Meet (with translations support)
    const buttons = Array.from(document.querySelectorAll('button'));
    const leaveBtn = buttons.find(btn => {
      const label = (btn.getAttribute('aria-label') || "").toLowerCase();
      return label.includes('leave') || label.includes('quitter') || label.includes('salir') || label.includes('hang up');
    });
    if (leaveBtn) return leaveBtn;
    return document.querySelector('button[aria-label="Leave call"], [jsname="CQm7mc"]');
  } else if (currentPlatform === 'TEAMS') {
    // Leave button in Teams: usually has aria-label containing "leave" or "hang up" or id "hangup-button"
    const leaveBtn = document.querySelector('button[aria-label*="Leave"], button[aria-label*="leave"], button[id*="hangup"], button[data-tid*="hangup"]');
    if (leaveBtn) return leaveBtn;
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const label = (btn.getAttribute('aria-label') || "").toLowerCase();
      if (label.includes('leave') || label.includes('hang up') || label.includes('hangup')) {
        return btn;
      }
    }
  }
  return null;
}

function handleMeetingEnd() {
  if (meetingWasActive && sidebarRoot && sidebarRoot.contentWindow) {
    console.log("[Q4Magic] Meeting ended detected. Sending signal to sidebar.");
    sidebarRoot.contentWindow.postMessage({ type: 'MEETING_END' }, '*');
    meetingWasActive = false; // Prevent duplicate signals
  }
}

// Listen for tab close/refresh
window.addEventListener('beforeunload', handleMeetingEnd);

// Add listener to Leave button
function attachLeaveListener() {
  const leaveBtn = findLeaveButton();
  if (leaveBtn && !leaveBtn.dataset.q4magicListener) {
    leaveBtn.addEventListener('click', handleMeetingEnd);
    leaveBtn.dataset.q4magicListener = 'true';
  }
}

function monitorMeetingState() {
  if (shouldNeverShowAgain) return;

  currentPlatform = detectPlatform();
  const inMeeting = isMeetingPage();

  // Send meeting end signal when transitioning from true to false
  if (meetingWasActive && !inMeeting) {
    handleMeetingEnd();
  }

  if (inMeeting) {
    meetingWasActive = true;
    injectSidebar();
    startScraping();
    attachLeaveListener();

    // Send meeting code to sidebar
    const meetingCode = window.location.pathname.substring(1);
    if (sidebarRoot && sidebarRoot.contentWindow) {
      sidebarRoot.contentWindow.postMessage({ type: 'SET_MEETING_CODE', meetingCode }, '*');
    }
  } else {
    // DO NOT auto-remove anymore. The user will click "Submit" or "Close" in the sidebar.
    // The summary stays visible on the "You left" page.
  }
}

setInterval(monitorMeetingState, 2000);
setInterval(checkCaptionsStatus, 3000);
monitorMeetingState();
