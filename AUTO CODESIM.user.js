// ==UserScript==
// @name         Auto Codesim (Improved - Minimal Info Display)
// @namespace    http://tampermonkey.net/
// @version      2.9.1
// @description  Lấy OTP codesim.net. Tự động chọn TK số dư cao nhất. Hiển thị SĐT/OTP (click text để copy). Thông báo chi tiết. Nút Lấy Số luôn sẵn sàng sau khi thành công. Góc dưới phải, Glass UI Sáng, Draggable.
// @author       Matthew M.
// @match        *://automusic.win/*
// @match        *://*.automusic.win/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @connect      apisim.codesim.net
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';
    // --- Constants ---
    const API_BASE_URL = "https://apisim.codesim.net";
    const POLLING_INTERVAL_DEFAULT = 4500; // Milliseconds for general polling (not used currently)
    const POLLING_INTERVAL_PENDING = 4100; // Milliseconds for polling when OTP is pending
    const TARGET_SERVICES = ["YouTube", "Gmail"]; // Services to filter for
    const DEFAULT_SERVICE_NAME = "YouTube"; // Default service to select if available
    const DEFAULT_NETWORK_NAME = "VIETTEL"; // Default network to select if available
    const ACCOUNTS = {
        "bassteam": "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJiYXNzdGVhbSIsImp0aSI6IjIyNzA2IiwiaWF0IjoxNzAwNzg0NzYxLCJleHAiOjE3NjI5OTI3NjF9.Y-EdhWVLhyo2A-KOfoNNDzUMt4Ht0yzSa9dtMkL1EJTlJ4BtAcjlYqD2BNIYpU95m5B7NFxJtDlHpHHAKpmGzw",
        "sang88": "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJzYW5nODgiLCJqdGkiOiIxMzM4MCIsImlhdCI6MTcwMDc4NDc4NiwiZXhwIjoxNzYyOTkyNzg2fQ.ucsVc3AGnV3OOIuZR10fciFD1vU4a32lXLLOXIV9nyxDvTJmqvzGbXNlx7UaHap2Zyw4j8838Fr1B_xytrE7Wg"
        // Add more accounts here: "AccountName": "API_Key"
    };
    const LAST_SELECTED_ACCOUNT_KEY = 'codesim_last_selected_account_v4'; // Keep consistent if structure is same
    const MINIMIZED_STATE_KEY = 'codesim_minimized_state_v4'; // Keep consistent if structure is same
    const DEFAULT_POSITION = { top: 'auto', bottom: '20px', left: 'auto', right: '20px' };
    const ICON_MINIMIZE = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    const ICON_MAXIMIZE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
    // Copy icon SVG removed as it's no longer displayed on hover by default

    // --- State Variables ---
    let services = []; // Full list from API
    let filteredServices = []; // Services matching TARGET_SERVICES
    let networks = []; // Full list from API
    let currentOtpId = null; // ID for the current OTP request
    let currentSimId = null; // ID for the current SIM request (for cancellation)
    let currentPhoneNumber = null; // Currently retrieved phone number
    let currentOtpCode = null; // Currently retrieved OTP code
    let pollingTimeoutId = null; // ID for the setTimeout used for polling OTP
    let accountBalances = {}; // Cache for account balances { accountName: balance | null }
    let selectedAccountName = null; // Currently selected account name
    let currentApiKey = null; // API key for the selected account
    let isMinimized = GM_getValue(MINIMIZED_STATE_KEY, false); // UI minimized state
    let isFetchingOtp = false; // Flag to prevent spamming get OTP button

    // --- Core Functions ---

    /**
     * Copies text to the clipboard using GM_setClipboard.
     * Shows a status message on success or failure, including the copied text.
     * @param {string | null} text The text to copy.
     * @param {string} successMessagePrefix Prefix for the success message.
     */
    function copyToClipboard(text, successMessagePrefix = "Đã copy:") {
        if (!text || typeof text !== 'string' || text.trim() === '' || text === 'Đang chờ yêu cầu' || text === 'Đang chờ...' || text === 'Đang lấy số...') {
            console.log('[CodeSim] Invalid copy text:', text);
            return;
        }
        try {
            GM_setClipboard(text);
            // --- CHANGE: Display includes the actual copied text ---
            showStatus(`${successMessagePrefix} ${text}`, false); // Show success, not error
            console.log(`[CodeSim] Copied: ${text}`);
        } catch (err) {
            console.error('[CodeSim] Copy error:', err);
            showStatus('Lỗi sao chép!', true);
        }
    }

    /**
     * Makes an API request using GM_xmlhttpRequest.
     * Handles common API response structure and errors.
     * @param {string} method HTTP method ('GET', 'POST', etc.)
     * @param {string} endpoint API endpoint (e.g., '/sim/get_sim')
     * @param {object} params Query parameters.
     * @param {function} callback Success callback, receives `data` part of the response.
     * @param {function} onError Error callback, receives error message string.
     * @param {string|null} specificApiKey Optional API key to use instead of the current one.
     */
    function apiRequest(method, endpoint, params = {}, callback, onError, specificApiKey = null) {
        const keyToUse = specificApiKey || currentApiKey;
        if (!keyToUse && endpoint !== '/yourself/information-by-api-key') { // Allow balance check without selected key initially
            const errorMsg = "Chưa chọn tài khoản!";
            if (onError) onError(errorMsg);
            else showStatus(errorMsg, true);
            console.error("[CodeSim] API Error:", errorMsg);
            return;
        }

        const requestParams = { ...params }; // Clone params
        if (keyToUse) {
            requestParams.api_key = keyToUse; // Add API key if available
        }

        const url = new URL(`${API_BASE_URL}${endpoint}`);
        if (method.toUpperCase() === 'GET') {
             Object.keys(requestParams).forEach(key => {
                 if (requestParams[key] !== undefined && requestParams[key] !== null && requestParams[key] !== '') {
                     url.searchParams.append(key, requestParams[key]);
                 }
             });
        }

        const accountLabel = selectedAccountName || (specificApiKey ? 'BalanceCheck' : 'NoAccount');
        console.log(`[CodeSim ${accountLabel}] Req: ${method} ${url.toString()}`);

        GM_xmlhttpRequest({
            method: method.toUpperCase(),
            url: url.toString(),
            timeout: 15000,
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            onload: function(response) {
                console.log(`[CodeSim ${accountLabel}] Res Status: ${response.status}`);
                try {
                    const json = JSON.parse(response.responseText);
                    if (json.status === 200) {
                        if (callback) callback(json.data);
                    } else {
                        const errMsg = json.message || `Lỗi API (${json.status})`;
                        console.error(`[CodeSim ${accountLabel}] API Error: ${errMsg}`, json);
                        if (onError) onError(errMsg);
                        else showStatus(`Lỗi API: ${errMsg}`, true);
                    }
                } catch (e) {
                    console.error(`[CodeSim ${accountLabel}] JSON Parse Error:`, e, "Response Text:", response.responseText);
                    const errorMsg = "Lỗi xử lý phản hồi API.";
                    if (onError) onError(errorMsg);
                    else showStatus(errorMsg, true);
                }
            },
            onerror: function(response) {
                console.error(`[CodeSim ${accountLabel}] Network/Request Error:`, response);
                const errorMsg = "Lỗi mạng hoặc yêu cầu API.";
                if (onError) onError(errorMsg);
                else showStatus(errorMsg, true);
            },
            ontimeout: function() {
                console.error(`[CodeSim ${accountLabel}] Request Timeout`);
                const errorMsg = "Yêu cầu API bị timeout.";
                if (onError) onError(errorMsg);
                else showStatus(errorMsg, true);
            }
        });
    }

    /**
     * Updates the status message display area.
     * @param {string} message The message to display.
     * @param {boolean} isError If true, style as an error.
     * @param {boolean} isLoading If true, style as loading (used for specific states).
     */
    function showStatus(message, isError = false, isLoading = false) {
        const statusEl = document.getElementById('codesim-status');
        if (statusEl) {
            if (isLoading && message === 'Đang chờ mã OTP...' && statusEl.classList.contains('loading-otp')) {
                 return; // Avoid flickering if already showing OTP wait status
            }
            statusEl.textContent = message;
            statusEl.className = 'status-message'; // Reset classes
            if (isError) {
                statusEl.classList.add('error');
            } else if (isLoading) {
                 if (message === 'Đang chờ mã OTP...') {
                     statusEl.classList.add('loading-otp');
                 } else {
                     statusEl.classList.add('loading'); // General loading
                 }
            } else {
                 statusEl.classList.add('success');
            }
            // Avoid logging repetitive OTP waiting messages
            if (!isLoading || message !== 'Đang chờ mã OTP...') {
                console.log(`[CodeSim Status] ${message}`);
            }
        } else {
            console.warn("[CodeSim] Status element missing.");
        }
    }

    /**
     * Updates the main balance display below the account dropdown.
     */
    function updateMainBalanceDisplay() {
        const balanceEl = document.getElementById('codesim-balance-main');
        if (!balanceEl) return;
        if (selectedAccountName && accountBalances[selectedAccountName] !== undefined) {
            if (accountBalances[selectedAccountName] === null) { // Error fetching balance
                balanceEl.textContent = `Số dư (${selectedAccountName}): Lỗi`;
                balanceEl.style.color = 'var(--danger-color)';
            } else {
                balanceEl.textContent = `Số dư (${selectedAccountName}): ${accountBalances[selectedAccountName].toLocaleString('vi-VN')}đ`;
                balanceEl.style.color = 'var(--success-color)';
            }
        } else {
            balanceEl.textContent = 'Số dư: Chọn tài khoản...';
            balanceEl.style.color = 'var(--text-color-dim)'; // Dim color when no account selected
        }
    }

    /**
     * Toggles the minimized state of the UI.
     * Resets position to default when minimizing.
     */
    function toggleMinimize() {
        isMinimized = !isMinimized;
        const container = document.getElementById('codesim-container');
        const minimizeBtn = document.getElementById('codesim-minimize-btn');
        if (container && minimizeBtn) {
            container.classList.toggle('codesim-minimized', isMinimized);
            minimizeBtn.innerHTML = isMinimized ? ICON_MAXIMIZE : ICON_MINIMIZE;
            minimizeBtn.title = isMinimized ? 'Phóng to' : 'Thu nhỏ';
            if (isMinimized) {
                container.style.top = DEFAULT_POSITION.top;
                container.style.bottom = DEFAULT_POSITION.bottom;
                container.style.left = DEFAULT_POSITION.left;
                container.style.right = DEFAULT_POSITION.right;
                console.log('[CodeSim] Minimized. Reset position to default.');
            } else {
                 console.log('[CodeSim] Maximized.');
            }
            GM_setValue(MINIMIZED_STATE_KEY, isMinimized);
        } else {
             console.warn("[CodeSim] Container or Minimize button not found during toggle.");
        }
    }

    /**
     * Creates the main UI elements and appends them to the body.
     */
    function createUI() {
        console.log("[CodeSim] Creating UI (v2.9.1 - Minimal Info Display)...");

        // --- Main Container ---
        const container = document.createElement('div');
        container.id = 'codesim-container';
        if (isMinimized) { container.classList.add('codesim-minimized'); }
        container.style.top = DEFAULT_POSITION.top;
        container.style.bottom = DEFAULT_POSITION.bottom;
        container.style.left = DEFAULT_POSITION.left;
        container.style.right = DEFAULT_POSITION.right;
        try {
            if (!document.body) { console.error("[CodeSim] Body not ready!"); setTimeout(createUI, 100); return; }
            document.body.appendChild(container);
            console.log("[CodeSim] Container appended.");
        } catch (e) { console.error("[CodeSim] Failed to append container!", e); return; }

        // --- Header ---
        const header = document.createElement('div');
        header.id = 'codesim-header';
        header.style.cursor = 'move';
        const title = document.createElement('h3');
        title.textContent = 'Auto Codesim';
        header.appendChild(title);
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'codesim-controls';
        const minimizeButton = document.createElement('button');
        minimizeButton.id = 'codesim-minimize-btn';
        minimizeButton.className = 'control-button minimize svg-button';
        minimizeButton.innerHTML = isMinimized ? ICON_MAXIMIZE : ICON_MINIMIZE;
        minimizeButton.title = isMinimized ? 'Phóng to' : 'Thu nhỏ';
        minimizeButton.onclick = toggleMinimize;
        controlsDiv.appendChild(minimizeButton);
        const closeButton = document.createElement('button');
        closeButton.id = 'codesim-close-btn';
        closeButton.className = 'control-button close';
        closeButton.innerHTML = '×';
        closeButton.title = 'Đóng';
        closeButton.onclick = (e) => { e.stopPropagation(); container.style.display = 'none'; };
        controlsDiv.appendChild(closeButton);
        header.appendChild(controlsDiv);
        container.appendChild(header);

        // --- Content Area ---
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'codesim-content';
        container.appendChild(contentWrapper);

        try {
            // Account Selection
            const accountGroup = document.createElement('div');
            accountGroup.className = 'form-group';
            const accountLabel = document.createElement('label'); accountLabel.textContent = 'Tài khoản:'; accountLabel.htmlFor = 'codesim-account-select';
            const accountSelect = document.createElement('select'); accountSelect.id = 'codesim-account-select'; accountSelect.innerHTML = '<option value="">-- Đang tải TK --</option>'; accountSelect.onchange = handleAccountChange;
            accountGroup.appendChild(accountLabel); accountGroup.appendChild(accountSelect); contentWrapper.appendChild(accountGroup);

            // Balance Display (Main)
            const balanceDisplay = document.createElement('div'); balanceDisplay.id = 'codesim-balance-main'; contentWrapper.appendChild(balanceDisplay);

            // Service Selection
            const serviceGroup = document.createElement('div'); serviceGroup.className = 'form-group';
            const serviceLabel = document.createElement('label'); serviceLabel.textContent = 'Dịch vụ:'; serviceLabel.htmlFor = 'codesim-service-select';
            const serviceSelect = document.createElement('select'); serviceSelect.id = 'codesim-service-select'; serviceSelect.innerHTML = '<option value="">-- Chọn dịch vụ --</option>'; serviceSelect.onchange = checkAndEnableOtpButton;
            serviceGroup.appendChild(serviceLabel); serviceGroup.appendChild(serviceSelect); contentWrapper.appendChild(serviceGroup);

            // Network Selection
            const networkGroup = document.createElement('div'); networkGroup.className = 'form-group';
            const networkLabel = document.createElement('label'); networkLabel.textContent = 'Nhà mạng:'; networkLabel.htmlFor = 'codesim-network-select';
            const networkSelect = document.createElement('select'); networkSelect.id = 'codesim-network-select'; networkSelect.innerHTML = '<option value="">-- Mặc định --</option>';
            networkGroup.appendChild(networkLabel); networkGroup.appendChild(networkSelect); contentWrapper.appendChild(networkGroup);

            // Phone Prefix Input (Optional)
            const prefixGroup = document.createElement('div'); prefixGroup.className = 'form-group';
            const phonePrefixLabel = document.createElement('label'); phonePrefixLabel.textContent = 'Đầu số (Tùy chọn):'; phonePrefixLabel.htmlFor = 'codesim-phone-prefix';
            const phonePrefixInput = document.createElement('input'); phonePrefixInput.type = 'text'; phonePrefixInput.id = 'codesim-phone-prefix'; phonePrefixInput.placeholder = 'VD: 098,034,...';
            prefixGroup.appendChild(phonePrefixLabel); prefixGroup.appendChild(phonePrefixInput); contentWrapper.appendChild(prefixGroup);

            // --- Separator for Info Display ---
            const infoSeparator = document.createElement('div');
            infoSeparator.id = 'codesim-info-separator'; // Add ID for styling
            contentWrapper.appendChild(infoSeparator); // Add separator to main content

            // --- Phone Number Display (inside separator) ---
            const phoneDisplayGroup = document.createElement('div'); phoneDisplayGroup.className = 'info-display-group';
            const phoneDisplay = document.createElement('div'); phoneDisplay.id = 'codesim-phone-display'; phoneDisplay.className = 'info-display clickable'; // Keep clickable class for cursor
            phoneDisplay.innerHTML = `Số điện thoại: <span>Đang chờ yêu cầu</span>`;
            phoneDisplay.title = 'Click để copy số điện thoại'; // Tooltip still useful
            phoneDisplay.onclick = () => { if (currentPhoneNumber) { copyToClipboard(currentPhoneNumber, 'Đã copy SĐT:'); } };
            phoneDisplayGroup.appendChild(phoneDisplay);
            infoSeparator.appendChild(phoneDisplayGroup); // Append to separator

            // --- OTP Code Display (inside separator) ---
            const otpDisplayGroup = document.createElement('div'); otpDisplayGroup.className = 'info-display-group';
            const otpDisplay = document.createElement('div'); otpDisplay.id = 'codesim-otp-display'; otpDisplay.className = 'info-display clickable'; // Keep clickable class for cursor
            otpDisplay.innerHTML = `OTP: <span>Đang chờ yêu cầu</span>`;
            otpDisplay.title = 'Click để copy mã OTP'; // Tooltip still useful
            otpDisplay.onclick = () => { if (currentOtpCode) { copyToClipboard(currentOtpCode, 'Đã copy OTP:'); } };
            otpDisplayGroup.appendChild(otpDisplay);
            infoSeparator.appendChild(otpDisplayGroup); // Append to separator

            // Action Buttons
            const buttonGroup = document.createElement('div'); buttonGroup.className = 'button-group';
            const getOtpButton = document.createElement('button'); getOtpButton.id = 'codesim-get-otp'; getOtpButton.className = 'button primary'; getOtpButton.textContent = 'Lấy số mới'; getOtpButton.onclick = handleGetOtpClick; getOtpButton.disabled = true; // Initially disabled
            buttonGroup.appendChild(getOtpButton);
            const cancelButton = document.createElement('button'); cancelButton.id = 'codesim-cancel'; cancelButton.className = 'button danger'; cancelButton.textContent = 'Hủy Yêu Cầu'; cancelButton.style.display = 'none'; cancelButton.onclick = handleCancelClick;
            buttonGroup.appendChild(cancelButton);
            contentWrapper.appendChild(buttonGroup); // Buttons after separator

            // Status Message Area
            const statusDisplay = document.createElement('div'); statusDisplay.id = 'codesim-status'; statusDisplay.className = 'status-message';
            contentWrapper.appendChild(statusDisplay); // Status at the very bottom

        } catch (uiError) {
            console.error("[CodeSim] Error creating inner UI elements!", uiError);
            showStatus("Lỗi nghiêm trọng khi tạo giao diện!", true);
            return;
        }

        // Apply styles and behaviors
        addStyles();
        makeDraggable(container, header);

        // Initial data fetch
        console.log("[CodeSim] Fetching initial account data...");
        fetchInitialAccountData(); // This will now automatically select the best account
    }

    /**
     * Adds the necessary CSS styles for the UI using GM_addStyle.
     * **MODIFIED:** Styles for info-display changed to remove border/button look.
     */
    function addStyles() {
        GM_addStyle(`
            /* Dark Mode Glass UI Variables */
            :root {
                /* Backgrounds */
                --bg-color: rgba(30, 30, 40, 0.75);
                --input-bg: rgba(50, 50, 60, 0.6);
                --button-bg: rgba(70, 70, 80, 0.6);
                --button-hover-bg: rgba(90, 90, 100, 0.7);
                --button-active-bg: rgba(60, 60, 70, 0.8);
                --button-primary-bg: rgba(13, 110, 253, 0.6);
                --button-primary-hover-bg: rgba(41, 130, 255, 0.7);
                --button-danger-bg: rgba(220, 53, 69, 0.6);
                --button-danger-hover-bg: rgba(230, 76, 92, 0.7);

                /* Status & Info Backgrounds */
                --success-bg: rgba(40, 167, 69, 0.3);
                --error-bg: rgba(220, 53, 69, 0.3);
                --loading-bg: rgba(108, 117, 125, 0.3);
                /* --info-bg: rgba(80, 80, 90, 0.4); REMOVED Default info bg */
                /* --info-display-bg: rgba(65, 65, 75, 0.5); REMOVED - Now transparent */
                /* --info-display-hover-bg: rgba(85, 85, 95, 0.65); REMOVED - No bg change on hover */
                --loading-otp-bg: rgba(40, 167, 69, 0.4); /* Specific green for 'Waiting for OTP' */

                /* Effects & Borders */
                --blur-intensity: 8px;
                --border-color: rgba(255, 255, 255, 0.1);
                --input-border: rgba(255, 255, 255, 0.15);
                --input-focus-border: var(--primary-color);
                --shadow-color: rgba(0, 0, 0, 0.4);
                --border-radius: 8px;
                /* --info-display-border: rgba(255, 255, 255, 0.12); REMOVED - No border */
                --separator-border-color: rgba(255, 255, 255, 0.15); /* Color for the separator line */

                /* Text & Accent Colors */
                --text-color: #f0f0f0;
                --text-color-dim: #a0a0a0;
                --text-color-strong: #ffffff;
                --title-color: #64b5f6;
                --primary-color: #64b5f6;
                --danger-color: #ef5350;
                --success-color: #66bb6a;
                --info-display-text: #e0e0e0;
                --info-display-label: #b0b0b0; /* Label color for SĐT/OTP */
            }

            /* --- General Styles --- */
            #codesim-container {
                position: fixed; width: 300px; background-color: var(--bg-color); border: 1px solid var(--border-color); border-radius: var(--border-radius); z-index: 99999; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 14px; box-shadow: 0 8px 32px 0 var(--shadow-color); color: var(--text-color); overflow: hidden; backdrop-filter: blur(var(--blur-intensity)); -webkit-backdrop-filter: blur(var(--blur-intensity)); transition: height 0.3s ease, opacity 0.3s ease, background-color 0.3s ease; height: auto; opacity: 1;
            }
            #codesim-container.codesim-minimized { height: 50px; opacity: 0.9; background-color: color-mix(in srgb, var(--bg-color) 80%, black 10%); }
            #codesim-container.codesim-minimized .codesim-content { display: none; }
            #codesim-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; border-bottom: 1px solid var(--border-color); background-color: color-mix(in srgb, var(--bg-color) 50%, black 5%); height: 50px; box-sizing: border-box; }
            #codesim-header h3 { margin: 0; font-size: 16px; color: var(--title-color); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-grow: 1; padding-right: 10px; }
            .codesim-controls { display: flex; align-items: center; flex-shrink: 0; gap: 8px; }
            .control-button { background: none; border: none; color: var(--text-color-dim); cursor: pointer; font-size: 22px; padding: 0 5px; line-height: 1; transition: color 0.2s ease, transform 0.2s ease; display: inline-flex; align-items: center; justify-content: center; margin-left: 0; }
            .control-button.svg-button { font-size: inherit; padding: 3px; }
            .control-button svg { width: 1em; height: 1em; vertical-align: middle; }
            .control-button:hover { color: var(--text-color); transform: scale(1.1); }
            .control-button.close:hover { color: var(--danger-color); }
            .control-button.minimize:hover { color: var(--primary-color); }
            .codesim-content { padding: 15px; }
            .form-group { margin-bottom: 15px; }
            #codesim-container label { display: block; margin-bottom: 6px; font-weight: 500; color: var(--text-color-dim); font-size: 13px; }
            #codesim-container select, #codesim-container input[type="text"] { width: 100%; padding: 10px 12px; border: 1px solid var(--input-border); border-radius: 6px; font-size: 14px; box-sizing: border-box; background-color: var(--input-bg); color: var(--text-color); transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.3s ease; appearance: none; -webkit-appearance: none; -moz-appearance: none; }
            #codesim-container select { background-image: url('data:image/svg+xml;charset=US-ASCII,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${encodeURIComponent(getComputedStyle(document.documentElement).getPropertyValue('--text-color-dim').trim() || '#a0a0a0')}" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>'); background-repeat: no-repeat; background-position: right 10px center; background-size: 16px 12px; padding-right: 30px; }
            #codesim-container select:focus, #codesim-container input[type="text"]:focus { border-color: var(--input-focus-border); outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 30%, transparent); background-color: color-mix(in srgb, var(--input-bg) 90%, black 5%); }
            .button-group { display: flex; gap: 10px; margin-top: 18px; margin-bottom: 10px; }
            #codesim-container button.button { flex-grow: 1; border: none; padding: 10px 15px; text-align: center; text-decoration: none; font-size: 14px; border-radius: 6px; cursor: pointer; transition: background-color 0.2s ease, transform 0.1s ease, box-shadow 0.2s ease; font-weight: 600; color: var(--text-color-strong); background-color: var(--button-bg); box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            #codesim-container button.button:hover:not(:disabled) { box-shadow: 0 4px 8px rgba(0,0,0,0.15); transform: translateY(-1px); }
            #codesim-container button.button:active:not(:disabled) { transform: translateY(0px); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
            #codesim-container button.primary { background-color: var(--button-primary-bg); color: #fff; }
            #codesim-container button.primary:hover:not(:disabled) { background-color: var(--button-primary-hover-bg); }
            #codesim-container button.primary:active:not(:disabled) { background-color: color-mix(in srgb, var(--button-primary-bg) 80%, black 5%); }
            #codesim-container button.danger { background-color: var(--button-danger-bg); color: #fff; }
            #codesim-container button.danger:hover:not(:disabled) { background-color: var(--button-danger-hover-bg); }
            #codesim-container button.danger:active:not(:disabled) { background-color: color-mix(in srgb, var(--button-danger-bg) 80%, black 5%); }
            #codesim-container button.button:disabled { background-color: rgba(90, 90, 100, 0.4); color: var(--text-color-dim); cursor: not-allowed; box-shadow: none; transform: none; opacity: 0.6; }

            /* --- Info Separator Styles --- */
            #codesim-info-separator {
                margin-top: 15px; /* Space above the separator */
                padding-top: 15px; /* Space below the separator line */
                border-top: 1px solid var(--separator-border-color); /* The separator line */
            }

            /* --- Info Display Styles (SĐT/OTP) - MODIFIED --- */
            .info-display-group { margin-bottom: 8px; } /* Spacing between SĐT and OTP */
            .info-display {
                background-color: transparent; /* MODIFIED: Removed background */
                color: var(--info-display-label); /* Use label color for prefix */
                padding: 2px 0; /* MODIFIED: Minimal padding */
                border: none; /* MODIFIED: Removed border */
                border-radius: 0; /* MODIFIED: No border radius needed */
                font-size: 14px;
                transition: none; /* MODIFIED: Removed transition for background/border */
                word-wrap: break-word;
            }
            .info-display span {
                font-weight: 600;
                margin-left: 5px;
                color: var(--info-display-text); /* Use regular info text for value */
            }
            .info-display.clickable {
                 cursor: pointer; /* Keep pointer cursor */
            }
            .info-display.clickable:hover {
                 /* MODIFIED: No background or border change on hover */
                 color: var(--primary-color); /* Optional: Highlight text color on hover */
            }
            .info-display.clickable:hover span {
                 color: var(--primary-color); /* Optional: Highlight text color on hover */
            }
            /* MODIFIED: Removed the ::after rule for copy icon on hover */


            /* Status Messages */
            .status-message { margin-top: 15px; font-weight: 500; padding: 10px 12px; border-radius: 6px; text-align: center; min-height: 1.5em; border: 1px solid var(--border-color); font-size: 13px; transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease; background-color: var(--info-bg, rgba(80, 80, 90, 0.4)); /* Added fallback info-bg */ color: var(--text-color); }
            .status-message.success { background-color: var(--success-bg); color: var(--success-color); border-color: color-mix(in srgb, var(--success-color) 40%, transparent); }
            .status-message.error { background-color: var(--error-bg); color: var(--danger-color); border-color: color-mix(in srgb, var(--danger-color) 40%, transparent); }
            .status-message.loading { background-color: var(--loading-bg); color: var(--text-color-dim); border-color: color-mix(in srgb, var(--text-color-dim) 40%, transparent); }
            .status-message.loading-otp { background-color: var(--loading-otp-bg); color: var(--success-color); border-color: color-mix(in srgb, var(--success-color) 40%, transparent); }

            /* Balance Display */
            #codesim-balance-main { text-align: right; font-size: 13px; color: var(--text-color-dim); margin-bottom: 12px; margin-top: -8px; font-weight: 500; height: 1.2em; }
            #codesim-balance-main[style*="var(--success-color)"] { color: var(--success-color) !important; }
            #codesim-balance-main[style*="var(--danger-color)"] { color: var(--danger-color) !important; }
        `);

        // Dynamic update for select arrow color (fallback)
        try {
            const selectStyle = Array.from(document.styleSheets).flatMap(sheet => Array.from(sheet.cssRules || [])).find(rule => rule.selectorText === '#codesim-container select');
            if (selectStyle) {
                 const dimColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color-dim').trim() || '#a0a0a0';
                 const svgUrl = `url('data:image/svg+xml;charset=US-ASCII,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${encodeURIComponent(dimColor)}" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>')`;
                 if (selectStyle.style.backgroundImage !== svgUrl) { selectStyle.style.backgroundImage = svgUrl; console.log("[CodeSim] Dynamically updated select arrow color."); }
            }
        } catch (e) { console.warn("[CodeSim] Could not dynamically update select arrow color.", e); }
    }

    /**
     * Makes an element draggable by its handle.
     * @param {HTMLElement} elmnt The element to make draggable.
     * @param {HTMLElement} dragHandle The element that acts as the drag handle.
     */
    function makeDraggable(elmnt, dragHandle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const dragMouseDown = (e) => {
            if (e.target.closest('button, select, input, .clickable')) { return; } // Don't drag if clicking interactive elements including clickable info
            e = e || window.event; e.preventDefault();
            pos3 = e.clientX; pos4 = e.clientY;
            document.onmouseup = closeDragElement; document.onmousemove = elementDrag;
        };
        const elementDrag = (e) => {
            e = e || window.event; e.preventDefault();
            pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
            pos3 = e.clientX; pos4 = e.clientY;
            let newTop = elmnt.offsetTop - pos2; let newLeft = elmnt.offsetLeft - pos1;
            const buffer = 10; // Prevent dragging completely off-screen
            newTop = Math.max(buffer, Math.min(newTop, window.innerHeight - elmnt.offsetHeight - buffer));
            newLeft = Math.max(buffer, Math.min(newLeft, window.innerWidth - elmnt.offsetWidth - buffer));
            elmnt.style.top = newTop + "px"; elmnt.style.left = newLeft + "px";
            elmnt.style.bottom = "auto"; elmnt.style.right = "auto";
        };
        const closeDragElement = () => { document.onmouseup = null; document.onmousemove = null; };
        if (dragHandle) { dragHandle.onmousedown = dragMouseDown; } else { elmnt.onmousedown = dragMouseDown; }
    }

    // --- Data Fetching and Handling ---

    /**
     * Fetches initial account balances and populates the account dropdown.
     * Selects the account with the highest balance automatically.
     */
    function fetchInitialAccountData() {
        showStatus("Đang tải thông tin tài khoản...", false, true);
        const accountNames = Object.keys(ACCOUNTS);
        accountBalances = {}; // Reset balances
        const balancePromises = accountNames.map(name => {
            return new Promise((resolve) => {
                const apiKey = ACCOUNTS[name];
                apiRequest('GET', '/yourself/information-by-api-key', {},
                    (data) => resolve({ name: name, balance: data.balance }),
                    (errorMsg) => { console.error(`[CodeSim] Lỗi lấy số dư ${name}: ${errorMsg}`); resolve({ name: name, balance: null, error: errorMsg }); },
                    apiKey // Pass the specific API key
                );
            });
        });

        Promise.allSettled(balancePromises).then(results => {
            console.log("[CodeSim] Balance fetch results:", results);
            let highestBalance = -Infinity;
            let accountWithHighestBalance = null;
            const accountSelect = document.getElementById('codesim-account-select');
            if (!accountSelect) { console.error("[CodeSim] Account select not found!"); showStatus("Lỗi UI.", true); return; }

            accountSelect.innerHTML = ''; // Clear existing options

            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    const { name, balance, error } = result.value;
                    accountBalances[name] = balance; // Store balance (or null on error)

                    const option = document.createElement('option');
                    option.value = name;
                    let displayText = name;
                    if (balance !== null) {
                        displayText += ` (${balance.toLocaleString('vi-VN')}đ)`;
                        if (balance > highestBalance) {
                            highestBalance = balance;
                            accountWithHighestBalance = name;
                        }
                    } else {
                        displayText += ` (Lỗi: ${error || 'N/A'})`;
                    }
                    option.textContent = displayText;
                    accountSelect.appendChild(option);
                } else {
                    console.error("[CodeSim] Balance promise rejected:", result.reason);
                }
            });

            let accountToSelect = accountWithHighestBalance;

            if (!accountToSelect && accountNames.length > 0) {
                accountToSelect = accountNames[0];
                console.warn("[CodeSim] No valid balances found, selecting first account as fallback.");
            }

            if (accountToSelect) {
                console.log(`[CodeSim] Automatically selecting account with highest balance: ${accountToSelect} (${highestBalance > -Infinity ? highestBalance.toLocaleString('vi-VN') + 'đ' : 'N/A'})`);
                accountSelect.value = accountToSelect;
                try { handleAccountChangeLogic(accountToSelect); }
                catch(e) { console.error("[CodeSim] Error initial handleAccountChangeLogic:", e); showStatus("Lỗi khởi tạo tài khoản.", true); }
            } else {
                showStatus("Không tải được tài khoản hoặc không có tài khoản nào!", true);
                updateMainBalanceDisplay();
                checkAndEnableOtpButton();
                 if (accountSelect.options.length === 0) {
                     accountSelect.innerHTML = '<option value="">-- Không có TK --</option>';
                 }
            }
        }).catch(error => {
            console.error("[CodeSim] Error processing balance promises:", error);
            showStatus("Lỗi tải dữ liệu tài khoản!", true);
        });
    }

    /**
     * Handles the change event of the account selection dropdown.
     */
    function handleAccountChange() {
        const accountSelect = document.getElementById('codesim-account-select');
        if (!accountSelect) return;
        const newAccountName = accountSelect.value;
        console.log(`[CodeSim] Account changed to: ${newAccountName}`);
        try {
            handleAccountChangeLogic(newAccountName);
        } catch (e) {
            console.error("[CodeSim] Error handleAccountChange:", e);
            showStatus("Lỗi chuyển tài khoản.", true);
        }
    }

    /**
     * Core logic when the selected account changes.
     */
    function handleAccountChangeLogic(newAccountName) {
        if (!newAccountName || !ACCOUNTS[newAccountName]) {
            console.warn(`[CodeSim] Invalid account selected: ${newAccountName}`);
            selectedAccountName = null;
            currentApiKey = null;
            updateMainBalanceDisplay();
            resetOtpState(true);
            showStatus("Tài khoản không hợp lệ.", true);
            checkAndEnableOtpButton();
            const serviceSelect = document.getElementById('codesim-service-select');
            const networkSelect = document.getElementById('codesim-network-select');
            if(serviceSelect) serviceSelect.innerHTML = '<option value="">-- Chọn TK --</option>';
            if(networkSelect) networkSelect.innerHTML = '<option value="">-- Chọn TK --</option>';
            return;
        }

        if (currentOtpId || isFetchingOtp) {
            console.log("[CodeSim] Cancelling active request/polling on account change.");
            clearTimeout(pollingTimeoutId); pollingTimeoutId = null;
            resetOtpState(true); // Full UI reset needed when switching
        }

        selectedAccountName = newAccountName;
        currentApiKey = ACCOUNTS[selectedAccountName];
        GM_setValue(LAST_SELECTED_ACCOUNT_KEY, selectedAccountName);

        console.log(`[CodeSim] State updated for account: ${selectedAccountName}`);
        showStatus(`Đã chọn tài khoản: ${selectedAccountName}. Đang tải...`, false, true);
        updateMainBalanceDisplay();
        resetOtpState(false); // Reset OTP fields, keep selections
        fetchServicesAndNetworks();
    }


    /**
     * Fetches the list of services and networks available for the current API key.
     */
    function fetchServicesAndNetworks() {
        if (!selectedAccountName || !currentApiKey) {
            console.warn("[CodeSim] fetchServicesAndNetworks called without a selected account.");
            showStatus("Chọn tài khoản hợp lệ.", true);
            checkAndEnableOtpButton();
            return;
        }
        showStatus(`Đang tải DV/NM cho ${selectedAccountName}...`, false, true);
        const getOtpButton = document.getElementById('codesim-get-otp');
        if(getOtpButton) getOtpButton.disabled = true;

        const serviceSelect = document.getElementById('codesim-service-select');
        const networkSelect = document.getElementById('codesim-network-select');
        if (!serviceSelect || !networkSelect) {
            console.error("[CodeSim] Select elements not found!");
            showStatus("Lỗi UI.", true); return;
        }

        filteredServices = [];
        networks = [];
        serviceSelect.innerHTML = '<option value="">-- Đang tải DV --</option>';
        networkSelect.innerHTML = '<option value="">-- Đang tải NM --</option>';

        const servicePromise = new Promise((resolve, reject) => {
            apiRequest('GET', '/service/get_service_by_api_key', {}, (data) => {
                try {
                    services = data || [];
                    filteredServices = services.filter(service =>
                        TARGET_SERVICES.includes(service.name) &&
                        (service.status === undefined || service.status === 1)
                    );

                    serviceSelect.innerHTML = '';
                    if (filteredServices.length === 0) {
                        serviceSelect.innerHTML = `<option value="">-- Không có DV (${TARGET_SERVICES.join('/')}) --</option>`;
                        reject(`Không tìm thấy dịch vụ phù hợp.`);
                        return;
                    }

                    let defaultServiceSelected = false;
                    filteredServices.sort((a, b) => a.name.localeCompare(b.name));

                    filteredServices.forEach(service => {
                        const option = document.createElement('option');
                        option.value = service.id;
                        option.textContent = `${service.name} (${service.price.toLocaleString('vi-VN')}đ)`;
                        serviceSelect.appendChild(option);
                        if (service.name === DEFAULT_SERVICE_NAME) {
                            option.selected = true;
                            defaultServiceSelected = true;
                        }
                    });

                    if (!defaultServiceSelected && serviceSelect.options.length > 0) {
                        serviceSelect.options[0].selected = true;
                    }
                    resolve();
                } catch (e) {
                    console.error("[CodeSim] Error processing services:", e);
                    serviceSelect.innerHTML = '<option value="">-- Lỗi xử lý DV --</option>';
                    reject("Lỗi xử lý dịch vụ.");
                }
            }, (errorMsg) => {
                serviceSelect.innerHTML = '<option value="">-- Lỗi tải DV --</option>';
                reject(`Lỗi tải dịch vụ: ${errorMsg}`);
            });
        });

        const networkPromise = new Promise((resolve) => {
            apiRequest('GET', '/network/get-network-by-api-key', {}, (data) => {
                try {
                    networks = data || [];
                    networkSelect.innerHTML = '<option value="">-- Mặc định (Tất cả) --</option>';
                    let defaultNetworkSelected = false;
                    networks.forEach(network => {
                        if (network.status === 1) {
                            const option = document.createElement('option');
                            option.value = network.id;
                            option.textContent = network.name;
                            networkSelect.appendChild(option);
                            if (network.name === DEFAULT_NETWORK_NAME) {
                                option.selected = true;
                                defaultNetworkSelected = true;
                            }
                        }
                    });
                    resolve();
                } catch (e) {
                    console.error("[CodeSim] Error processing networks:", e);
                    networkSelect.innerHTML = '<option value="">-- Lỗi xử lý NM --</option>';
                    resolve();
                }
            }, (errorMsg) => {
                networkSelect.innerHTML = '<option value="">-- Lỗi tải NM --</option>';
                console.warn(`[CodeSim] Lỗi tải nhà mạng: ${errorMsg}. Proceeding without network filter.`);
                resolve();
            });
        });

        Promise.all([servicePromise, networkPromise]).then(() => {
            showStatus(`Sẵn sàng cho tài khoản ${selectedAccountName}.`, false);
            checkAndEnableOtpButton();
        }).catch(error => {
            showStatus(error, true);
            checkAndEnableOtpButton();
        });
    }


    // --- OTP Workflow Functions ---

    /**
     * Handles the click event of the "Lấy số mới" button.
     */
    function handleGetOtpClick() {
        if (isFetchingOtp) {
            console.warn("[CodeSim] Already fetching OTP, click ignored.");
            return;
        }
        if (currentOtpId) {
            console.warn("[CodeSim] OTP request already active, click ignored. Cancel first.");
             showStatus("Đang chờ OTP hoặc Hủy yêu cầu trước.", true);
            return;
        }

        const serviceSelect = document.getElementById('codesim-service-select');
        const networkSelect = document.getElementById('codesim-network-select');
        const phonePrefixInput = document.getElementById('codesim-phone-prefix');
        const getOtpButton = document.getElementById('codesim-get-otp');
        const cancelButton = document.getElementById('codesim-cancel');
        const phoneDisplay = document.getElementById('codesim-phone-display');
        const otpDisplay = document.getElementById('codesim-otp-display');

        if (!serviceSelect || !networkSelect || !phonePrefixInput || !getOtpButton || !cancelButton || !phoneDisplay || !otpDisplay) {
            console.error("[CodeSim] UI element missing for Get OTP!");
            showStatus("Lỗi UI!", true); return;
        }

        const serviceId = serviceSelect.value;
        const networkId = networkSelect.value;
        const prefix = phonePrefixInput.value.trim();

        if (!serviceId) {
            showStatus("Vui lòng chọn dịch vụ.", true); return;
        }
        if (!selectedAccountName || !currentApiKey) {
            showStatus("Vui lòng chọn tài khoản hợp lệ.", true); return;
        }

        isFetchingOtp = true;
        getOtpButton.disabled = true;
        cancelButton.style.display = 'inline-block';
        cancelButton.disabled = false;
        showStatus("Đang gửi yêu cầu lấy số...", false, true);

        phoneDisplay.innerHTML = `Số điện thoại: <span>Đang lấy...</span>`;
        otpDisplay.innerHTML = `OTP: <span>---</span>`;
        currentPhoneNumber = null;
        currentOtpCode = null;

        const params = {
            service_id: serviceId,
            network_id: networkId || undefined,
            phone: prefix || undefined
        };

        apiRequest('GET', '/sim/get_sim', params, (data) => {
            isFetchingOtp = false;
            if (!data || !data.otpId || !data.simId || !data.phone) {
                console.error("[CodeSim] Invalid data from /sim/get_sim:", data);
                showStatus("Lỗi: Dữ liệu SĐT không hợp lệ.", true);
                resetOtpState(false);
                return;
            }

            currentOtpId = data.otpId;
            currentSimId = data.simId;
            currentPhoneNumber = data.phone;
            currentOtpCode = null;

            console.log(`[CodeSim] Số đã nhận: ${currentPhoneNumber} (OTP ID: ${currentOtpId}, SIM ID: ${currentSimId})`);

            phoneDisplay.innerHTML = `Số điện thoại: <span>${currentPhoneNumber}</span>`;
            otpDisplay.innerHTML = `OTP: <span>Đang chờ...</span>`;
            showStatus('Đang chờ mã OTP...', false, true);

            copyToClipboard(currentPhoneNumber, "Đã tự động copy SĐT:"); // Detailed notification

            clearTimeout(pollingTimeoutId);
            pollingTimeoutId = setTimeout(checkOtpStatus, POLLING_INTERVAL_PENDING);

            fetchBalanceForCurrentAccount();
            checkAndEnableOtpButton(); // Button remains disabled due to currentOtpId

        }, (errorMsg) => {
            isFetchingOtp = false;
            console.error(`[CodeSim] Lỗi lấy số: ${errorMsg}`);
            if (errorMsg && typeof errorMsg === 'string') {
                if (errorMsg.includes("hủy phiên")) {
                    showStatus(`Lỗi lấy số: ${errorMsg}. Thử hủy trên web Codesim.`, true);
                } else if (errorMsg.includes("số dư")) {
                    showStatus(`Lỗi lấy số: ${errorMsg}. Kiểm tra số dư.`, true);
                } else {
                    showStatus(`Lỗi lấy số: ${errorMsg}`, true);
                }
            } else {
                showStatus('Lỗi không xác định khi lấy số.', true);
            }
            resetOtpState(false); // Reset UI, keeps selections, enables button
        });
    }


    /**
     * Periodically checks the status of the current OTP request.
     */
    function checkOtpStatus() {
        if (!currentOtpId) {
            console.warn("[CodeSim] checkOtpStatus called without an active OtpId.");
            resetOtpState(false);
            return;
        }

        console.log(`[CodeSim] Checking OTP status for ID: ${currentOtpId}`);
        const statusEl = document.getElementById('codesim-status');
        if (statusEl && !statusEl.classList.contains('error') && !statusEl.classList.contains('success')) {
            showStatus('Đang chờ mã OTP...', false, true);
        }

        const params = { otp_id: currentOtpId };
        const otpDisplay = document.getElementById('codesim-otp-display');
        const getOtpButton = document.getElementById('codesim-get-otp');
        const cancelButton = document.getElementById('codesim-cancel');

        apiRequest('GET', '/otp/get_otp_by_phone_api_key', params, (data) => {
            const otpCode = data ? data.code : null;
            const content = data ? data.content : null;

            console.log(`[CodeSim] OTP Check Response: Code=${otpCode}, Content=${content}`);

            if (otpCode && typeof otpCode === 'string' && otpCode.trim() !== "" && otpCode !== "null") {
                currentOtpCode = otpCode.trim();
                console.log(`[CodeSim] OTP Received: ${currentOtpCode}. SMS: ${content}`);

                if (otpDisplay) {
                    otpDisplay.innerHTML = `OTP: <span>${currentOtpCode}</span>`;
                }
                showStatus(`Đã nhận OTP! Sẵn sàng lấy số tiếp theo.`, false);
                copyToClipboard(currentOtpCode, "Đã tự động copy OTP:"); // Detailed notification

                clearTimeout(pollingTimeoutId); pollingTimeoutId = null;
                currentOtpId = null; // Mark OTP request as complete
                currentSimId = null;
                isFetchingOtp = false;

                if (cancelButton) cancelButton.style.display = 'none';

                checkAndEnableOtpButton(); // Enable button as currentOtpId is now null

            } else {
                console.log("[CodeSim] OTP not yet available. Polling again.");
                showStatus('Đang chờ mã OTP...', false, true);
                clearTimeout(pollingTimeoutId);
                pollingTimeoutId = setTimeout(checkOtpStatus, POLLING_INTERVAL_PENDING);
            }
        }, (errorMsg) => {
            console.error(`[CodeSim] Lỗi kiểm tra OTP: ${errorMsg}`);
            if (errorMsg && typeof errorMsg === 'string' &&
                (errorMsg.includes("Hết hạn") || errorMsg.includes("hủy") || errorMsg.includes("timeout") || errorMsg.includes("không tồn tại"))) {
                showStatus(`Lỗi OTP: ${errorMsg}. Yêu cầu đã kết thúc.`, true);
                resetOtpState(false); // Reset state completely on fatal OTP error
            } else {
                console.warn(`[CodeSim] Lỗi tạm thời khi kiểm tra OTP (${errorMsg}). Sẽ thử lại.`);
                showStatus('Đang chờ mã OTP... (Lỗi tạm thời)', false, true);
                clearTimeout(pollingTimeoutId);
                pollingTimeoutId = setTimeout(checkOtpStatus, POLLING_INTERVAL_PENDING);
            }
        });
    }

    /**
     * Handles the click event of the "Hủy Yêu Cầu" button.
     */
    function handleCancelClick() {
        if (!currentSimId && !currentOtpId) {
            showStatus("Không có yêu cầu đang hoạt động để hủy.", true);
            resetOtpState(false);
            return;
        }

        const idToCancel = currentSimId || currentOtpId;
        const endpoint = currentSimId ? `/sim/cancel_api_key/${currentSimId}` : `/otp/cancel_api_key/${currentOtpId}`;
        const idType = currentSimId ? "SIM ID" : "OTP ID";

        console.log(`[CodeSim] Attempting to cancel request with ${idType}: ${idToCancel}`);
        showStatus("Đang hủy yêu cầu...", false, true);
        const cancelButton = document.getElementById('codesim-cancel');
        if(cancelButton) cancelButton.disabled = true;

        const params = {};

        apiRequest('GET', endpoint, params, (data) => {
            showStatus("Yêu cầu đã được hủy thành công.", false);
            console.log("[CodeSim] Cancellation successful response.", data);
            clearTimeout(pollingTimeoutId); pollingTimeoutId = null;
            resetOtpState(false); // Reset state, enable Get OTP button
            fetchBalanceForCurrentAccount();
        }, (errorMsg) => {
            showStatus(`Lỗi hủy: ${errorMsg}. Thử reset trạng thái.`, true);
            console.error(`[CodeSim] Lỗi hủy ${idType} ${idToCancel}: ${errorMsg}`);
            clearTimeout(pollingTimeoutId); pollingTimeoutId = null;
            resetOtpState(false); // Reset state anyway
            if(cancelButton) cancelButton.disabled = false; // Re-enable maybe? resetOtpState should handle it
        });
    }


    // --- UI State Management ---

    /**
     * Resets the state related to an ongoing OTP request.
     * Enables the "Lấy số mới" button unless a full UI reset is needed.
     * @param {boolean} resetAccountRelatedUI If true, also clears service/network dropdowns etc.
     */
    function resetOtpState(resetAccountRelatedUI = false) {
        console.log(`[CodeSim] Resetting state. Full UI Reset: ${resetAccountRelatedUI}`);

        clearTimeout(pollingTimeoutId); pollingTimeoutId = null;
        currentOtpId = null;
        currentSimId = null;
        isFetchingOtp = false;

        if (!resetAccountRelatedUI) {
            currentPhoneNumber = null;
            currentOtpCode = null;
            const phoneDisplay = document.getElementById('codesim-phone-display');
            const otpDisplay = document.getElementById('codesim-otp-display');
            if (phoneDisplay) phoneDisplay.innerHTML = `Số điện thoại: <span>Đang chờ yêu cầu</span>`;
            if (otpDisplay) otpDisplay.innerHTML = `OTP: <span>Đang chờ yêu cầu</span>`;
        }

        const getOtpButton = document.getElementById('codesim-get-otp');
        const cancelButton = document.getElementById('codesim-cancel');
        // const phonePrefixInput = document.getElementById('codesim-phone-prefix'); // Keep prefix
        const statusDisplay = document.getElementById('codesim-status');

        if (cancelButton) {
            cancelButton.style.display = 'none';
            cancelButton.disabled = false;
        }

        // Clear non-error/loading status messages if not doing full reset
        if (statusDisplay && !resetAccountRelatedUI && !statusDisplay.classList.contains('error') && !statusDisplay.classList.contains('loading') && !statusDisplay.classList.contains('loading-otp')) {
             statusDisplay.textContent = ''; // Clear transient success messages like 'cancelled'
             statusDisplay.className = 'status-message';
        } else if (resetAccountRelatedUI && statusDisplay) {
            // Clear status completely on full reset
             statusDisplay.textContent = '';
             statusDisplay.className = 'status-message';
        }


        if (resetAccountRelatedUI) {
            const serviceSelect = document.getElementById('codesim-service-select');
            const networkSelect = document.getElementById('codesim-network-select');
            if (serviceSelect) serviceSelect.innerHTML = '<option value="">-- Chọn tài khoản --</option>';
            if (networkSelect) networkSelect.innerHTML = '<option value="">-- Chọn tài khoản --</option>';
            if (getOtpButton) getOtpButton.disabled = true;
        } else {
            checkAndEnableOtpButton(); // Re-evaluate button state
        }
    }

    /**
     * Checks conditions and enables/disables the "Lấy số mới" button.
     * Button is enabled if account and service are selected AND no OTP request is active AND not currently fetching.
     */
    function checkAndEnableOtpButton() {
        const getOtpButton = document.getElementById('codesim-get-otp');
        const serviceSelect = document.getElementById('codesim-service-select');

        if (getOtpButton && serviceSelect) {
            const isAccountSelected = !!selectedAccountName;
            const isServiceSelected = !!serviceSelect.value;
            const shouldBeEnabled = isAccountSelected && isServiceSelected && !currentOtpId && !isFetchingOtp;
            getOtpButton.disabled = !shouldBeEnabled;
            // console.log(`[CodeSim] Button State Check: Account=${isAccountSelected}, Service=${isServiceSelected}, OtpActive=${!!currentOtpId}, Fetching=${isFetchingOtp} => Enabled=${shouldBeEnabled}`);
        } else if (getOtpButton) {
            getOtpButton.disabled = true;
        }
    }

    /**
     * Fetches the balance specifically for the currently selected account.
     */
    function fetchBalanceForCurrentAccount() {
        if (!selectedAccountName || !currentApiKey) {
            console.warn("[CodeSim] fetchBalanceForCurrentAccount called without selected account.");
            return;
        }
        console.log(`[CodeSim] Refreshing balance for: ${selectedAccountName}`);
        apiRequest('GET', '/yourself/information-by-api-key', {}, (data) => {
            const newBalance = data.balance;
            accountBalances[selectedAccountName] = newBalance;
            updateMainBalanceDisplay();
            updateAccountDropdownBalance(selectedAccountName, newBalance);
        }, (errorMsg) => {
            console.error(`[CodeSim] Lỗi refresh balance for ${selectedAccountName}: ${errorMsg}`);
            accountBalances[selectedAccountName] = null;
            updateMainBalanceDisplay();
            updateAccountDropdownBalance(selectedAccountName, null, errorMsg);
        });
    }

    /**
     * Updates the text content of a specific account's option in the dropdown.
     * @param {string} accountName The name of the account to update.
     * @param {number|null} balance The new balance, or null if error.
     * @param {string|null} error Optional error message if balance is null.
     */
    function updateAccountDropdownBalance(accountName, balance, error = null) {
        const accountSelect = document.getElementById('codesim-account-select');
        if (!accountSelect) return;
        const option = accountSelect.querySelector(`option[value="${accountName}"]`);
        if (option) {
            let displayText = accountName;
            if (balance !== null) {
                displayText += ` (${balance.toLocaleString('vi-VN')}đ)`;
            } else {
                displayText += ` (Lỗi: ${error || 'N/A'})`;
            }
            option.textContent = displayText;
        }
    }

    // --- Initialization ---
    function initializeScript() {
        console.log("[CodeSim] Initializing Script v2.9.1...");
        if (document.readyState === 'loading') { // Handle cases where script runs before DOMContentLoaded
             console.log("[CodeSim] Document loading, waiting for DOMContentLoaded.");
             window.addEventListener('DOMContentLoaded', createUI);
        } else { // DOM is already ready
             console.log("[CodeSim] DOM ready, creating UI.");
             createUI();
        }
    }

    // Start the script
    initializeScript();

})();
