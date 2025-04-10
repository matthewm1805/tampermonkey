// ==UserScript==
// @name         AUTO CODESIM
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Lấy OTP từ codesim.net
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
    const POLLING_INTERVAL_DEFAULT = 4500;
    const POLLING_INTERVAL_PENDING = 4100;
    const TARGET_SERVICES = ["YouTube", "Gmail"];
    const DEFAULT_SERVICE_NAME = "YouTube";
    const DEFAULT_NETWORK_NAME = "VIETTEL";
    const ACCOUNTS = {
        "bassteam": "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJiYXNzdGVhbSIsImp0aSI6IjIyNzA2IiwiaWF0IjoxNzAwNzg0NzYxLCJleHAiOjE3NjI5OTI3NjF9.Y-EdhWVLhyo2A-KOfoNNDzUMt4Ht0yzSa9dtMkL1EJTlJ4BtAcjlYqD2BNIYpU95m5B7NFxJtDlHpHHAKpmGzw",
        "sang88": "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJzYW5nODgiLCJqdGkiOiIxMzM4MCIsImlhdCI6MTcwMDc4NDc4NiwiZXhwIjoxNzYyOTkyNzg2fQ.ucsVc3AGnV3OOIuZR10fciFD1vU4a32lXLLOXIV9nyxDvTJmqvzGbXNlx7UaHap2Zyw4j8838Fr1B_xytrE7Wg"
    };
    const LAST_SELECTED_ACCOUNT_KEY = 'codesim_last_selected_account_v2';
    const MINIMIZED_STATE_KEY = 'codesim_minimized_state_v2';

    // --- State Variables ---
    let services = [];
    let filteredServices = [];
    let networks = [];
    let currentOtpId = null;
    let currentSimId = null;
    let currentPhoneNumber = null;
    let pollingTimeoutId = null;
    let accountBalances = {};
    let selectedAccountName = null;
    let currentApiKey = null;
    let isMinimized = GM_getValue(MINIMIZED_STATE_KEY, false);

    // --- Helper Function for Copying ---
    function copyToClipboard(text, successMessagePrefix = "Đã copy:") {
        if (!text || typeof text !== 'string' || text.trim() === '' || text === 'N/A' || text === 'Đang chờ...' || text === 'Đang lấy số...') {
            console.log('[CodeSim] Attempted to copy invalid text:', text);
            return;
        }

        try {
            GM_setClipboard(text);
            showStatus(`${successMessagePrefix} ${text}`, false);
            console.log(`[CodeSim] Copied to clipboard: ${text}`);
        } catch (err) {
            console.error('[CodeSim] Lỗi copy vào clipboard:', err);
            showStatus('Lỗi sao chép vào clipboard!', true);
        }
    }

    // --- API Request Function ---
    function apiRequest(method, endpoint, params = {}, callback, onError, specificApiKey = null) {
        const keyToUse = specificApiKey || currentApiKey;
        if (!keyToUse) {
            const errorMsg = "Chưa chọn tài khoản hoặc API Key không hợp lệ!";
            if (onError) onError(errorMsg);
            else showStatus(errorMsg, true);
            console.error("[CodeSim] API Request Error:", errorMsg);
            return;
        }

        params.api_key = keyToUse;
        const url = new URL(`${API_BASE_URL}${endpoint}`);
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                url.searchParams.append(key, params[key]);
            }
        });

        const accountLabel = selectedAccountName || (specificApiKey === ACCOUNTS.bassteam ? 'bassteam' : specificApiKey === ACCOUNTS.sang88 ? 'sang88' : 'Init');
        console.log(`[CodeSim ${accountLabel}] Requesting: ${method} ${url.toString()}`);

        GM_xmlhttpRequest({
            method: method.toUpperCase(),
            url: url.toString(),
            timeout: 15000,
            onload: function(response) {
                console.log(`[CodeSim ${accountLabel}] Response Status: ${response.status}, URL: ${url.toString()}`);
                try {
                    const json = JSON.parse(response.responseText);
                    if (json.status === 200) {
                        if (callback) callback(json.data);
                    } else {
                        const errorMessage = json.message || `Lỗi không xác định từ API (Status: ${json.status})`;
                        console.error(`[CodeSim ${accountLabel}] API Error: ${errorMessage}`, json);
                        if (onError) onError(errorMessage);
                        else showStatus(`Lỗi API: ${errorMessage}`, true);
                    }
                } catch (e) {
                    console.error(`[CodeSim ${accountLabel}] Lỗi parse JSON:`, e, `Response Text: ${response.responseText}`);
                    const errorMsg = "Lỗi xử lý phản hồi từ API.";
                    if (onError) onError(errorMsg);
                    else showStatus(errorMsg, true);
                }
            },
            onerror: function(response) {
                console.error(`[CodeSim ${accountLabel}] Lỗi Request Network:`, response);
                const errorMsg = "Lỗi kết nối mạng đến API Codesim.";
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

    // --- UI Functions ---
    function showStatus(message, isError = false, isLoading = false) {
        const statusEl = document.getElementById('codesim-status');
        if (statusEl) {
            if (isLoading && message === 'Đang chờ OTP...' && statusEl.classList.contains('success')) {
                // Không ghi đè thông báo thành công gần đây
            } else {
                statusEl.textContent = message;
                statusEl.className = 'status-message';
                if (isError) statusEl.classList.add('error');
                else if (isLoading) statusEl.classList.add('loading');
                else statusEl.classList.add('success');
            }

            if (!isLoading || message !== 'Đang chờ OTP...') {
                console.log(`[CodeSim Status] ${message}`);
            }
        } else {
            console.warn("[CodeSim] Status element not found yet.");
        }
    }

    function updateMainBalanceDisplay() {
        const balanceEl = document.getElementById('codesim-balance-main');
        if (!balanceEl) return;
        if (selectedAccountName && accountBalances[selectedAccountName] !== undefined) {
            if (accountBalances[selectedAccountName] === null) {
                balanceEl.textContent = `Số dư (${selectedAccountName}): Lỗi`;
                balanceEl.style.color = 'red';
            } else {
                balanceEl.textContent = `Số dư (${selectedAccountName}): ${accountBalances[selectedAccountName].toLocaleString('vi-VN')}đ`;
                balanceEl.style.color = '#4CAF50';
            }
        } else {
            balanceEl.textContent = 'Số dư: Chọn tài khoản...';
            balanceEl.style.color = '#888';
        }
    }

    function toggleMinimize() {
        isMinimized = !isMinimized;
        const container = document.getElementById('codesim-container');
        const minimizeBtn = document.getElementById('codesim-minimize-btn');
        if (container && minimizeBtn) {
            container.classList.toggle('codesim-minimized', isMinimized);
            minimizeBtn.innerHTML = isMinimized ? '□' : '__';
            minimizeBtn.title = isMinimized ? 'Phóng to' : 'Thu nhỏ';
            GM_setValue(MINIMIZED_STATE_KEY, isMinimized);
        }
    }

    function createUI() {
        console.log("[CodeSim] Creating UI...");
        const container = document.createElement('div');
        container.id = 'codesim-container';
        if (isMinimized) {
            container.classList.add('codesim-minimized');
        }

        try {
            document.body.appendChild(container);
            console.log("[CodeSim] Container appended to body.");
        } catch (e) {
            console.error("[CodeSim] Failed to append container to body!", e);
            return;
        }

        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'codesim-controls';

        const minimizeButton = document.createElement('button');
        minimizeButton.id = 'codesim-minimize-btn';
        minimizeButton.className = 'control-button';
        minimizeButton.innerHTML = isMinimized ? '□' : '__';
        minimizeButton.title = isMinimized ? 'Phóng to' : 'Thu nhỏ';
        minimizeButton.onclick = toggleMinimize;
        controlsDiv.appendChild(minimizeButton);

        const closeButton = document.createElement('button');
        closeButton.id = 'codesim-close-btn';
        closeButton.className = 'control-button close';
        closeButton.innerHTML = '×';
        closeButton.title = 'Đóng';
        closeButton.onclick = () => container.style.display = 'none';
        controlsDiv.appendChild(closeButton);

        container.appendChild(controlsDiv);

        const title = document.createElement('h3');
        title.textContent = 'AUTO CODESIM';
        container.appendChild(title);

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'codesim-content';
        container.appendChild(contentWrapper);

        const accountGroup = document.createElement('div');
        accountGroup.className = 'form-group';
        const accountLabel = document.createElement('label');
        accountLabel.textContent = 'Tài khoản:';
        accountLabel.htmlFor = 'codesim-account-select';
        const accountSelect = document.createElement('select');
        accountSelect.id = 'codesim-account-select';
        accountSelect.innerHTML = '<option value="">-- Đang tải TK --</option>';
        accountSelect.onchange = handleAccountChange;
        accountGroup.appendChild(accountLabel);
        accountGroup.appendChild(accountSelect);
        contentWrapper.appendChild(accountGroup);

        const balanceDisplay = document.createElement('div');
        balanceDisplay.id = 'codesim-balance-main';
        contentWrapper.appendChild(balanceDisplay);

        const serviceGroup = document.createElement('div');
        serviceGroup.className = 'form-group';
        const serviceLabel = document.createElement('label');
        serviceLabel.textContent = 'Dịch vụ:';
        serviceLabel.htmlFor = 'codesim-service-select';
        const serviceSelect = document.createElement('select');
        serviceSelect.id = 'codesim-service-select';
        serviceSelect.innerHTML = '<option value="">-- Chọn dịch vụ --</option>';
        serviceSelect.onchange = checkAndEnableOtpButton;
        serviceGroup.appendChild(serviceLabel);
        serviceGroup.appendChild(serviceSelect);
        contentWrapper.appendChild(serviceGroup);

        const networkGroup = document.createElement('div');
        networkGroup.className = 'form-group';
        const networkLabel = document.createElement('label');
        networkLabel.textContent = 'Nhà mạng:';
        networkLabel.htmlFor = 'codesim-network-select';
        const networkSelect = document.createElement('select');
        networkSelect.id = 'codesim-network-select';
        networkSelect.innerHTML = '<option value="">-- Mặc định --</option>';
        networkGroup.appendChild(networkLabel);
        networkGroup.appendChild(networkSelect);
        contentWrapper.appendChild(networkGroup);

        const prefixGroup = document.createElement('div');
        prefixGroup.className = 'form-group';
        const phonePrefixLabel = document.createElement('label');
        phonePrefixLabel.textContent = 'Đầu số (Tùy chọn):';
        phonePrefixLabel.htmlFor = 'codesim-phone-prefix';
        const phonePrefixInput = document.createElement('input');
        phonePrefixInput.type = 'text';
        phonePrefixInput.id = 'codesim-phone-prefix';
        phonePrefixInput.placeholder = 'VD: 098';
        prefixGroup.appendChild(phonePrefixLabel);
        prefixGroup.appendChild(phonePrefixInput);
        contentWrapper.appendChild(prefixGroup);

        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'button-group';
        const getOtpButton = document.createElement('button');
        getOtpButton.id = 'codesim-get-otp';
        getOtpButton.className = 'button primary';
        getOtpButton.textContent = 'Lấy số mới';
        getOtpButton.onclick = handleGetOtpClick;
        getOtpButton.disabled = true;
        buttonGroup.appendChild(getOtpButton);
        const cancelButton = document.createElement('button');
        cancelButton.id = 'codesim-cancel';
        cancelButton.className = 'button danger';
        cancelButton.textContent = 'Hủy Yêu Cầu';
        cancelButton.style.display = 'none';
        cancelButton.onclick = handleCancelClick;
        buttonGroup.appendChild(cancelButton);
        contentWrapper.appendChild(buttonGroup);

        const infoDiv = document.createElement('div');
        infoDiv.id = 'codesim-info';
        const phoneDisplayP = document.createElement('p');
        phoneDisplayP.id = 'codesim-phone';
        phoneDisplayP.innerHTML = '<strong>SĐT:</strong> <span class="non-clickable-text">N/A</span>';
        infoDiv.appendChild(phoneDisplayP);
        const otpDisplayP = document.createElement('p');
        otpDisplayP.id = 'codesim-otp';
        otpDisplayP.innerHTML = '<strong>OTP:</strong> <span class="non-clickable-text">N/A</span>';
        infoDiv.appendChild(otpDisplayP);
        contentWrapper.appendChild(infoDiv);

        const statusDisplay = document.createElement('div');
        statusDisplay.id = 'codesim-status';
        statusDisplay.className = 'status-message';
        contentWrapper.appendChild(statusDisplay);

        addStyles();
        console.log("[CodeSim] Fetching initial account data...");
        fetchInitialAccountData();
    }

    // --- CSS Styles ---
    function addStyles() {
        GM_addStyle(`
            #codesim-container {
                position: fixed; bottom: 20px; right: 20px; width: 320px;
                background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px;
                z-index: 9999; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); color: #333;
                overflow: hidden; transition: height 0.3s ease, padding 0.3s ease;
                height: auto; padding: 15px 20px 20px 20px;
            }
            #codesim-container.codesim-minimized { height: 45px; padding-top: 0; padding-bottom: 0; }
            #codesim-container.codesim-minimized .codesim-content { display: none; }
            #codesim-container h3 {
                margin: 0 0 15px 0; padding-right: 50px; text-align: left;
                font-size: 16px; color: #0056b3; font-weight: 600; line-height: 45px;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            #codesim-container.codesim-minimized h3 { margin-bottom: 0; }
            .codesim-controls {
                position: absolute; top: 0px; right: 10px; display: flex;
                align-items: center; height: 45px;
            }
            .control-button {
                background: none; border: none; color: #888; cursor: pointer;
                font-size: 20px; font-weight: bold; padding: 5px; margin-left: 5px;
                line-height: 1; transition: color 0.2s ease;
            }
            .control-button:hover { color: #333; }
            .control-button.close:hover { color: #f44336; }
            .codesim-content { /* Styles for content area if needed */ }
            .form-group { margin-bottom: 12px; }
            #codesim-container label { display: block; margin-bottom: 5px; font-weight: 500; color: #555; }
            #codesim-container select, #codesim-container input[type="text"] {
                width: 100%; padding: 10px; margin-bottom: 5px; border: 1px solid #ccc;
                border-radius: 4px; font-size: 14px; box-sizing: border-box; background-color: #fff;
                transition: border-color 0.2s ease;
            }
            #codesim-container select:focus, #codesim-container input[type="text"]:focus {
                border-color: #007bff; outline: none; box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.2);
            }
            .button-group { display: flex; justify-content: space-between; margin-top: 15px; }
            #codesim-container button.button {
                flex-grow: 1; border: none; padding: 10px 15px; text-align: center;
                text-decoration: none; font-size: 14px; border-radius: 4px; cursor: pointer;
                margin: 0 5px; transition: background-color 0.3s ease, box-shadow 0.2s ease;
                font-weight: 500;
            }
            #codesim-container button.button:first-child { margin-left: 0; }
            #codesim-container button.button:last-child { margin-right: 0; }
            #codesim-container button.primary { background-color: #007bff; color: white; }
            #codesim-container button.primary:hover:not(:disabled) { background-color: #0056b3; box-shadow: 0 2px 5px rgba(0, 86, 179, 0.3); }
            #codesim-container button.danger { background-color: #dc3545; color: white; }
            #codesim-container button.danger:hover:not(:disabled) { background-color: #c82333; box-shadow: 0 2px 5px rgba(200, 35, 51, 0.3); }
            #codesim-container button.button:disabled { background-color: #cccccc; color: #666; cursor: not-allowed; box-shadow: none; }
            #codesim-info { margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px; }
            #codesim-info p {
                margin: 2px 0; /* Giảm khoảng cách giữa các dòng */
                white-space: nowrap; /* Ngăn nội dung xuống dòng */
                overflow: hidden; /* Ẩn nội dung tràn ra ngoài */
                text-overflow: ellipsis; /* Thêm dấu ... nếu nội dung quá dài */
                color: #333;
                font-size: 14px;
                display: flex;
                align-items: center;
            }
            #codesim-info p strong { color: #555; margin-right: 5px; min-width: 40px; display: inline-block; }
            #codesim-info p span.non-clickable-text {
                font-weight: 600; color: #007bff; margin-right: 8px;
                padding: 2px 4px; border-radius: 3px;
            }
            .status-message {
                margin-top: 15px; font-weight: 500; padding: 8px; border-radius: 4px;
                text-align: center; min-height: 1.5em; background-color: #f0f0f0;
                color: #555; border: 1px solid #eee;
            }
            .status-message.success { background-color: #d4edda; color: #155724; border-color: #c3e6cb; }
            .status-message.error { background-color: #f8d7da; color: #721c24; border-color: #f5c6cb;}
            .status-message.loading { background-color: #e2e3e5; color: #383d41; border-color: #d6d8db;}
            #codesim-balance-main {
                text-align: right; font-size: 13px; color: #888; margin-bottom: 10px;
                font-weight: 500; height: 1.2em;
            }
        `);
    }

    // --- Data Fetching Functions ---
    function fetchInitialAccountData() {
        showStatus("Đang tải thông tin tài khoản...", false, true);
        const accountNames = Object.keys(ACCOUNTS);
        accountBalances = {};

        const balancePromises = accountNames.map(name => {
            return new Promise((resolve) => {
                const apiKey = ACCOUNTS[name];
                apiRequest('GET', '/yourself/information-by-api-key', {},
                    (data) => resolve({ name: name, balance: data.balance }),
                    (errorMsg) => {
                        console.error(`[CodeSim] Lỗi lấy balance cho ${name}: ${errorMsg}`);
                        resolve({ name: name, balance: null, error: errorMsg });
                    },
                    apiKey
                );
            });
        });

        Promise.allSettled(balancePromises).then(results => {
            console.log("[CodeSim] Account balance results:", results);
            let highestBalance = -Infinity;
            let defaultAccount = GM_getValue(LAST_SELECTED_ACCOUNT_KEY, null);
            let foundDefaultFromStorage = false;
            let bestFallbackAccount = null;

            const accountSelect = document.getElementById('codesim-account-select');
            if (!accountSelect) {
                console.error("[CodeSim] Account select element not found after fetching balances!");
                showStatus("Lỗi UI: Không tìm thấy phần tử chọn tài khoản.", true);
                return;
            }
            accountSelect.innerHTML = '';

            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    const { name, balance, error } = result.value;
                    accountBalances[name] = balance;
                    const option = document.createElement('option');
                    option.value = name;
                    let displayText = name;
                    if (balance !== null) {
                        displayText += ` (${balance.toLocaleString('vi-VN')}đ)`;
                        if (name === defaultAccount) foundDefaultFromStorage = true;
                        if (balance > highestBalance) {
                            highestBalance = balance;
                            bestFallbackAccount = name;
                        }
                    } else {
                        displayText += ` (Lỗi: ${error || 'N/A'})`;
                        if (name === defaultAccount) {
                            defaultAccount = null;
                            foundDefaultFromStorage = false;
                        }
                    }
                    option.textContent = displayText;
                    accountSelect.appendChild(option);
                } else {
                    console.error("[CodeSim] Promise rejected unexpectedly:", result.reason);
                }
            });

            if (!foundDefaultFromStorage) defaultAccount = bestFallbackAccount;
            if (!defaultAccount && accountNames.length > 0) defaultAccount = accountNames[0];

            if (defaultAccount) {
                console.log(`[CodeSim] Setting default account to: ${defaultAccount}`);
                accountSelect.value = defaultAccount;
                try {
                    handleAccountChangeLogic(defaultAccount);
                } catch(e) {
                    console.error("[CodeSim] Error during initial handleAccountChangeLogic:", e);
                    showStatus("Lỗi khởi tạo tài khoản.", true);
                }
            } else {
                showStatus("Không thể tải thông tin tài khoản nào!", true);
                updateMainBalanceDisplay();
                checkAndEnableOtpButton();
            }
        }).catch(error => {
            console.error("[CodeSim] Lỗi nghiêm trọng khi xử lý Promises:", error);
            showStatus("Lỗi nghiêm trọng khi tải dữ liệu tài khoản!", true);
        });
    }

    function handleAccountChange() {
        const accountSelect = document.getElementById('codesim-account-select');
        if (!accountSelect) return;
        const newAccountName = accountSelect.value;
        console.log(`[CodeSim] Account selection changed to: ${newAccountName}`);
        try {
            handleAccountChangeLogic(newAccountName);
        } catch (e) {
            console.error("[CodeSim] Error during handleAccountChange:", e);
            showStatus("Lỗi khi chuyển tài khoản.", true);
        }
    }

    function handleAccountChangeLogic(newAccountName) {
        if (!newAccountName || !ACCOUNTS[newAccountName]) {
            console.warn(`[CodeSim] Invalid account selected: ${newAccountName}`);
            selectedAccountName = null;
            currentApiKey = null;
            updateMainBalanceDisplay();
            resetOtpState(true);
            showStatus("Tài khoản không hợp lệ.", true);
            checkAndEnableOtpButton();
            return;
        }
        if (currentOtpId) {
            console.log("[CodeSim] Cancelling active OTP request due to account change.");
            clearTimeout(pollingTimeoutId);
            resetOtpState(true);
        }
        selectedAccountName = newAccountName;
        currentApiKey = ACCOUNTS[selectedAccountName];
        GM_setValue(LAST_SELECTED_ACCOUNT_KEY, selectedAccountName);
        console.log(`[CodeSim] State updated for account: ${selectedAccountName}`);
        showStatus(`Đã chọn tài khoản: ${selectedAccountName}.`, false);
        updateMainBalanceDisplay();
        resetOtpState(false);
        fetchServicesAndNetworks();
    }

    function fetchServicesAndNetworks() {
        if (!selectedAccountName || !currentApiKey) {
            console.warn("[CodeSim] fetchServicesAndNetworks called without selected account.");
            showStatus("Vui lòng chọn tài khoản hợp lệ.", true);
            checkAndEnableOtpButton();
            return;
        }
        showStatus(`Đang tải DV/NM cho ${selectedAccountName}...`, false, true);
        const getOtpButton = document.getElementById('codesim-get-otp');
        if(getOtpButton) getOtpButton.disabled = true;

        const serviceSelect = document.getElementById('codesim-service-select');
        const networkSelect = document.getElementById('codesim-network-select');
        if (!serviceSelect || !networkSelect) {
            console.error("[CodeSim] Service or Network select element not found!");
            showStatus("Lỗi UI: Không tìm thấy phần tử chọn DV/NM.", true);
            return;
        }

        filteredServices = [];
        networks = [];
        serviceSelect.innerHTML = '<option value="">-- Đang tải DV --</option>';
        networkSelect.innerHTML = '<option value="">-- Đang tải NM --</option>';

        const servicePromise = new Promise((resolve, reject) => {
            apiRequest('GET', '/service/get_service_by_api_key', {},
                (data) => {
                    try {
                        services = data;
                        filteredServices = services.filter(service =>
                            TARGET_SERVICES.includes(service.name) &&
                            (service.status === undefined || service.status === 1)
                        );
                        serviceSelect.innerHTML = '';
                        if (filteredServices.length === 0) {
                            serviceSelect.innerHTML = '<option value="">-- Không có DV phù hợp --</option>';
                            reject(`Không tìm thấy dịch vụ (${TARGET_SERVICES.join('/')}) nào đang hoạt động.`);
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
                        reject("Lỗi xử lý danh sách dịch vụ.");
                    }
                },
                (errorMsg) => {
                    serviceSelect.innerHTML = '<option value="">-- Lỗi tải DV --</option>';
                    reject(`Lỗi tải dịch vụ: ${errorMsg}`);
                }
            );
        });

        const networkPromise = new Promise((resolve) => {
            apiRequest('GET', '/network/get-network-by-api-key', {},
                (data) => {
                    try {
                        networks = data;
                        networkSelect.innerHTML = '<option value="">-- Mặc định (Tất cả) --</option>';
                        networks.forEach(network => {
                            if (network.status === 1) {
                                const option = document.createElement('option');
                                option.value = network.id;
                                option.textContent = network.name;
                                networkSelect.appendChild(option);
                                if (network.name === DEFAULT_NETWORK_NAME) {
                                    option.selected = true;
                                }
                            }
                        });
                        resolve();
                    } catch (e) {
                        console.error("[CodeSim] Error processing networks:", e);
                        networkSelect.innerHTML = '<option value="">-- Lỗi xử lý NM --</option>';
                        resolve();
                    }
                },
                (errorMsg) => {
                    networkSelect.innerHTML = '<option value="">-- Lỗi tải NM --</option>';
                    console.warn(`[CodeSim] Lỗi tải nhà mạng: ${errorMsg}`);
                    resolve();
                }
            );
        });

        Promise.all([servicePromise, networkPromise]).then(() => {
            showStatus(`Sẵn sàng cho tài khoản ${selectedAccountName}.`, false);
            checkAndEnableOtpButton();
        }).catch(error => {
            showStatus(error, true);
            checkAndEnableOtpButton();
        });
    }

    // --- Action Handlers ---
    function handleGetOtpClick() {
        const serviceSelect = document.getElementById('codesim-service-select');
        const networkSelect = document.getElementById('codesim-network-select');
        const phonePrefixInput = document.getElementById('codesim-phone-prefix');
        const getOtpButton = document.getElementById('codesim-get-otp');
        const cancelButton = document.getElementById('codesim-cancel');
        const phoneDisplaySpan = document.querySelector('#codesim-phone span.non-clickable-text');
        const otpDisplaySpan = document.querySelector('#codesim-otp span.non-clickable-text');

        if (!serviceSelect || !networkSelect || !phonePrefixInput || !getOtpButton || !cancelButton || !phoneDisplaySpan || !otpDisplaySpan) {
            console.error("[CodeSim] UI element missing for Get OTP action!");
            showStatus("Lỗi UI nghiêm trọng!", true);
            return;
        }

        const serviceId = serviceSelect.value;
        const networkId = networkSelect.value;
        const prefix = phonePrefixInput.value.trim();

        if (!serviceId) {
            showStatus("Vui lòng chọn một dịch vụ.", true);
            return;
        }

        getOtpButton.disabled = true;
        cancelButton.style.display = 'inline-block';
        phoneDisplaySpan.textContent = 'Đang lấy số...';
        otpDisplaySpan.textContent = 'Đang đợi mã...';
        showStatus("Đang gửi yêu cầu lấy số...", false, true);

        const params = {
            service_id: serviceId,
            network_id: networkId || undefined,
            phone: prefix || undefined
        };

        apiRequest('GET', '/sim/get_sim', params,
            (data) => {
                currentOtpId = data.otpId;
                currentSimId = data.simId;
                currentPhoneNumber = data.phone;
                console.log(`[CodeSim] Số đã nhận. OTP ID: ${currentOtpId}, SIM ID: ${currentSimId}, Phone: ${currentPhoneNumber}`);

                phoneDisplaySpan.textContent = currentPhoneNumber;
                otpDisplaySpan.textContent = 'Đang đợi mã...';
                showStatus('Đang đợi mã...', false, true);

                copyToClipboard(currentPhoneNumber, "Đã tự động copy SĐT:");

                clearTimeout(pollingTimeoutId);
                pollingTimeoutId = setTimeout(checkOtpStatus, POLLING_INTERVAL_PENDING);

                fetchBalanceForCurrentAccount();
            },
            (errorMsg) => {
                showStatus(`Hãy hủy phiên chưa xong trên website`, true);
                resetOtpState(false);
            }
        );
    }

    function checkOtpStatus() {
        if (!currentOtpId) {
            console.warn("[CodeSim] checkOtpStatus called without currentOtpId.");
            return;
        }

        const otpDisplaySpan = document.querySelector('#codesim-otp span.non-clickable-text');
        if (!otpDisplaySpan) {
            console.error("[CodeSim] OTP display element missing during status check!");
            pollingTimeoutId = setTimeout(checkOtpStatus, POLLING_INTERVAL_PENDING);
            return;
        }

        const params = {
            otp_id: currentOtpId
        };

        apiRequest('GET', '/otp/get_otp_by_phone_api_key', params,
            (data) => {
                const otpCode = data.code;
                const content = data.content;

                console.log(`[CodeSim] OTP Status Check Response: Code=${otpCode}, Content=${content}`);

                if (otpCode && otpCode.trim() !== "") {
                    otpDisplaySpan.textContent = otpCode;
                    showStatus(`Đã nhận OTP!`, false);
                    console.log(`[CodeSim] OTP Received: ${otpCode}. Full SMS: ${content}`);

                    copyToClipboard(otpCode, "Đã tự động copy OTP:");

                    clearTimeout(pollingTimeoutId);
                    pollingTimeoutId = null;

                    const cancelButton = document.getElementById('codesim-cancel');
                    if(cancelButton) cancelButton.style.display = 'none';

                    const getOtpButton = document.getElementById('codesim-get-otp');
                    if(getOtpButton) getOtpButton.disabled = false;
                } else {
                    otpDisplaySpan.textContent = 'Đang đợi mã...';
                    clearTimeout(pollingTimeoutId);
                    pollingTimeoutId = setTimeout(checkOtpStatus, POLLING_INTERVAL_PENDING);
                }
            },
            (errorMsg) => {
                console.error(`[CodeSim] Lỗi kiểm tra OTP: ${errorMsg}. Vẫn tiếp tục polling...`);
                clearTimeout(pollingTimeoutId);
                pollingTimeoutId = setTimeout(checkOtpStatus, POLLING_INTERVAL_PENDING);
            }
        );
    }

    function handleCancelClick() {
        if (!currentOtpId || !currentSimId) {
            showStatus("Không có yêu cầu (hoặc simId) để hủy.", true);
            return;
        }

        console.log(`[CodeSim] Attempting to cancel SIM ID: ${currentSimId} (OTP ID: ${currentOtpId})`);
        showStatus("Đang hủy yêu cầu...", false, true);
        const cancelButton = document.getElementById('codesim-cancel');
        if(cancelButton) cancelButton.disabled = true;

        const endpoint = `/sim/cancel_api_key/${currentSimId}`;
        const params = {};

        apiRequest('GET', endpoint, params,
            (data) => {
                showStatus("Đã gửi yêu cầu hủy thành công.", false);
                clearTimeout(pollingTimeoutId);
                resetOtpState(false);
            },
            (errorMsg) => {
                showStatus(`Lỗi hủy yêu cầu: ${errorMsg}`, true);
                if(cancelButton) cancelButton.disabled = false;
            }
        );
    }

    // --- Helper Functions ---
    function resetOtpState(resetAccountRelatedUI = false) {
        console.log(`[CodeSim] Resetting OTP state. Reset account UI: ${resetAccountRelatedUI}`);
        clearTimeout(pollingTimeoutId);
        pollingTimeoutId = null;
        currentOtpId = null;
        currentSimId = null;
        currentPhoneNumber = null;

        const getOtpButton = document.getElementById('codesim-get-otp');
        const cancelButton = document.getElementById('codesim-cancel');
        const phoneDisplaySpan = document.querySelector('#codesim-phone span.non-clickable-text');
        const otpDisplaySpan = document.querySelector('#codesim-otp span.non-clickable-text');
        const phonePrefixInput = document.getElementById('codesim-phone-prefix');
        const serviceSelect = document.getElementById('codesim-service-select');
        const networkSelect = document.getElementById('codesim-network-select');

        if (getOtpButton) getOtpButton.disabled = false;
        if (cancelButton) {
            cancelButton.style.display = 'none';
            cancelButton.disabled = false;
        }

        if (phoneDisplaySpan) phoneDisplaySpan.textContent = 'N/A';
        if (otpDisplaySpan) otpDisplaySpan.textContent = 'N/A';
        if(phonePrefixInput) phonePrefixInput.value = '';

        if (resetAccountRelatedUI) {
            if (serviceSelect) serviceSelect.innerHTML = '<option value="">-- Chọn tài khoản --</option>';
            if (networkSelect) networkSelect.innerHTML = '<option value="">-- Chọn tài khoản --</option>';
            if (getOtpButton) getOtpButton.disabled = true;
        } else {
            checkAndEnableOtpButton();
        }
    }

    function checkAndEnableOtpButton() {
        const getOtpButton = document.getElementById('codesim-get-otp');
        const serviceSelect = document.getElementById('codesim-service-select');

        if (getOtpButton && serviceSelect) {
            const isAccountSelected = !!selectedAccountName;
            const isServiceSelected = !!serviceSelect.value;
            const isOtpActive = !!currentOtpId;
            getOtpButton.disabled = !(isAccountSelected && isServiceSelected && !isOtpActive);
        }
    }

    function fetchBalanceForCurrentAccount() {
        if (!selectedAccountName || !currentApiKey) {
            console.warn("[CodeSim] fetchBalanceForCurrentAccount called without selected account.");
            return;
        }
        console.log(`[CodeSim] Refreshing balance for ${selectedAccountName}`);
        apiRequest('GET', '/yourself/information-by-api-key', {},
            (data) => {
                accountBalances[selectedAccountName] = data.balance;
                updateMainBalanceDisplay();
                updateAccountDropdownBalance(selectedAccountName, data.balance);
            },
            (errorMsg) => {
                console.error(`[CodeSim] Lỗi refresh balance cho ${selectedAccountName}: ${errorMsg}`);
                accountBalances[selectedAccountName] = null;
                updateMainBalanceDisplay();
                updateAccountDropdownBalance(selectedAccountName, null, errorMsg);
            }
        );
    }

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
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        createUI();
    } else {
        window.addEventListener('DOMContentLoaded', createUI);
    }

})();
