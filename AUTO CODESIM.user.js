// ==UserScript==
// @name         Auto Tools for Automusic
// @namespace    http://tampermonkey.net/
// @version      3.5.0
// @description  Tích hợp: Lấy OTP từ codesim.net và tự động điền email khi thêm kênh mới.
// @author       Matthew M.
// @match        *://automusic.win/*
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

    // =================================================================================
    // == PHẦN 1: TÍNH NĂNG TỰ ĐỘNG ĐIỀN EMAIL KHI THÊM KÊNH (SEAMLESS CHANNEL ADDER) ==
    // =================================================================================

    (function() {
        const styleId_channelAdder = 'automusic-seamless-style';

        function hideDropdown_channelAdder() {
            document.getElementById(styleId_channelAdder)?.remove();
            const style = document.createElement('style');
            style.id = styleId_channelAdder;
            style.textContent = `
                body > div.bootstrap-select.show > .dropdown-menu {
                    visibility: hidden !important;
                    opacity: 0 !important;
                    display: block !important;
                }
            `;
            document.head.appendChild(style);
        }

        function cleanupStyle_channelAdder() {
            document.getElementById(styleId_channelAdder)?.remove();
        }

        function runOnPage_channelAdder() {
            const actionSections = document.querySelectorAll('.action-buttons.mt-3:not([data-channel-adder-processed])');
            actionSections.forEach(section => {
                section.setAttribute('data-channel-adder-processed', 'true');

                const parentTd = section.closest('td');
                if (!parentTd) return;

                const emailSpan = parentTd.querySelector('div.email-text span.copyable-text');
                if (!emailSpan) return;
                const emailToSelect = emailSpan.dataset.copy;

                const newBtn = document.createElement('button');
                newBtn.type = 'button';
                newBtn.className = 'btn btn-sm btn-action btn-clone-add-channel';
                newBtn.setAttribute('data-toggle', 'tooltip');
                newBtn.setAttribute('data-original-title', 'Add Channel');
                newBtn.innerHTML = '<i class="fas fa-plus mr-1"></i> Channel';

                newBtn.addEventListener('click', () => {
                    hideDropdown_channelAdder();

                    const originalBtn = document.querySelector('.btn-add-channel');
                    if (originalBtn) {
                        originalBtn.click();
                    } else {
                        cleanupStyle_channelAdder();
                        alert('Không tìm thấy nút "Add Channel" gốc!');
                        return;
                    }

                    let pollerAttempts = 0;
                    const maxAttempts = 100;

                    const mainPoller = setInterval(() => {
                        pollerAttempts++;
                        const dropdownToggleButton = document.querySelector('button[data-id="select_rmail"]');

                        if (dropdownToggleButton) {
                            clearInterval(mainPoller);
                            dropdownToggleButton.click();

                            const searchPoller = setInterval(() => {
                                const searchInput = document.querySelector('div.bootstrap-select.show .bs-searchbox input.form-control');
                                if (searchInput) {
                                    clearInterval(searchPoller);
                                    searchInput.focus();
                                    searchInput.value = emailToSelect;
                                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                                    searchInput.dispatchEvent(new Event('keyup', { bubbles: true }));

                                    setTimeout(() => {
                                        searchInput.dispatchEvent(new KeyboardEvent('keydown', {
                                            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
                                        }));
                                        cleanupStyle_channelAdder();
                                    }, 100);
                                } else if (pollerAttempts > maxAttempts) {
                                    clearInterval(searchPoller);
                                    cleanupStyle_channelAdder();
                                }
                            }, 50);
                        } else if (pollerAttempts > maxAttempts) {
                            clearInterval(mainPoller);
                            cleanupStyle_channelAdder();
                        }
                    }, 50);
                });

                const moreButtonGroup = section.querySelector('.dropdown');
                if (moreButtonGroup) {
                    section.insertBefore(newBtn, moreButtonGroup);
                } else {
                    section.appendChild(newBtn);
                }
            });
        }

        const observer_channelAdder = new MutationObserver(() => runOnPage_channelAdder());
        observer_channelAdder.observe(document.body, { childList: true, subtree: true });

        setTimeout(runOnPage_channelAdder, 1000);
    })();


    // ========================================================================
    // == PHẦN 2: TÍNH NĂNG LẤY OTP TỰ ĐỘNG (AUTO CODESIM) ======================
    // ========================================================================

    (function() {
        const API_BASE_URL = "https://apisim.codesim.net";
        const POLLING_INTERVAL_PENDING = 4100;
        const TARGET_SERVICES = ["YouTube", "Gmail"];
        const DEFAULT_SERVICE_NAME = "YouTube";
        const DEFAULT_NETWORK_NAME = "VIETTEL";
        const ACCOUNTS = {
            "bassteam": "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJiYXNzdGVhbSIsImp0aSI6IjIyNzA2IiwiaWF0IjoxNzAwNzg0NzYxLCJleHAiOjE3NjI5OTI3NjF9.Y-EdhWVLhyo2A-KOfoNNDzUMt4Ht0yzSa9dtMkL1EJTlJ4BtAcjlYqD2BNIYpU95m5B7NFxJtDlHpHHAKpmGzw",
            "sang88": "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJzYW5nODgiLCJqdGkiOiIxMzM4MCIsImlhdCI6MTcwMDc4NDc4NiwiZXhwIjoxNzYyOTkyNzg2fQ.ucsVc3AGnV3OOIuZR10fciFD1vU4a32lXLLOXIV9nyxDvTJmqvzGbXNlx7UaHap2Zyw4j8838Fr1B_xytrE7Wg"
        };
        const LAST_SELECTED_ACCOUNT_KEY = 'codesim_last_selected_account_v4';
        const MINIMIZED_STATE_KEY = 'codesim_minimized_state_v4';
        const DEFAULT_POSITION = { top: 'auto', bottom: '20px', left: 'auto', right: '20px' };
        const ICON_MINIMIZE = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        const ICON_MAXIMIZE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;

        let services = [];
        let filteredServices = [];
        let networks = [];
        let currentOtpId = null;
        let currentSimId = null;
        let currentPhoneNumber = null;
        let currentOtpCode = null;
        let pollingTimeoutId = null;
        let accountBalances = {};
        let selectedAccountName = null;
        let currentApiKey = null;
        let isMinimized = GM_getValue(MINIMIZED_STATE_KEY, false);
        let isFetchingOtp = false;

        function updatePhoneDisplayStatus(message) {
            const phoneSpan = document.querySelector('#codesim-phone-display span');
            if (phoneSpan) {
                phoneSpan.textContent = message;
            }
        }

        function updateOtpDisplayStatus(message) {
            const otpSpan = document.querySelector('#codesim-otp-display span');
            if (otpSpan) {
                otpSpan.textContent = message;
            }
        }

        function copyToClipboard(text, context = "Text") {
            if (!text || typeof text !== 'string' || text.trim() === '' || ['Đang chờ yêu cầu', 'Đang chờ...', 'Đang lấy số...'].includes(text)) {
                return;
            }
            try {
                GM_setClipboard(text);
                console.log(`[CodeSim] Copied ${context}: ${text}`);
            } catch (err) {
                console.error(`[CodeSim] Copy error for ${context}:`, err);
            }
        }

        function apiRequest(method, endpoint, params = {}, callback, onError, specificApiKey = null) {
            const keyToUse = specificApiKey || currentApiKey;
            if (!keyToUse && endpoint !== '/yourself/information-by-api-key') {
                const errorMsg = "Chưa chọn tài khoản!";
                if (onError) onError(errorMsg);
                return;
            }

            const requestParams = { ...params };
            if (keyToUse) {
                requestParams.api_key = keyToUse;
            }

            const url = new URL(`${API_BASE_URL}${endpoint}`);
            if (method.toUpperCase() === 'GET') {
                Object.keys(requestParams).forEach(key => {
                    if (requestParams[key] !== undefined && requestParams[key] !== null && requestParams[key] !== '') {
                        url.searchParams.append(key, requestParams[key]);
                    }
                });
            }

            GM_xmlhttpRequest({
                method: method.toUpperCase(),
                url: url.toString(),
                timeout: 15000,
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                onload: function(response) {
                    try {
                        const json = JSON.parse(response.responseText);
                        if (json.status === 200) {
                            if (callback) callback(json.data);
                        } else {
                            const errMsg = json.message || `Lỗi API (${json.status})`;
                            if (onError) onError(errMsg);
                        }
                    } catch (e) {
                        const errorMsg = "Lỗi xử lý phản hồi API.";
                        if (onError) onError(errorMsg);
                    }
                },
                onerror: function(response) {
                    const errorMsg = "Lỗi mạng hoặc yêu cầu API.";
                    if (onError) onError(errorMsg);
                },
                ontimeout: function() {
                    const errorMsg = "Yêu cầu API bị timeout.";
                    if (onError) onError(errorMsg);
                }
            });
        }

        function updateMainBalanceDisplay() {
            const balanceEl = document.getElementById('codesim-balance-main');
            if (!balanceEl) return;
            if (selectedAccountName && accountBalances[selectedAccountName] !== undefined) {
                if (accountBalances[selectedAccountName] === null) {
                    balanceEl.textContent = `Số dư (${selectedAccountName}): Lỗi`;
                    balanceEl.style.color = 'var(--danger-color)';
                } else {
                    balanceEl.textContent = `Số dư (${selectedAccountName}): ${accountBalances[selectedAccountName].toLocaleString('vi-VN')}đ`;
                    balanceEl.style.color = 'var(--success-color)';
                }
            } else {
                balanceEl.textContent = 'Số dư: Chọn tài khoản...';
                balanceEl.style.color = 'var(--text-color-dim)';
            }
        }

        function toggleMinimize() {
            isMinimized = !isMinimized;
            const container = document.getElementById('codesim-container');
            const minimizeBtn = document.getElementById('codesim-minimize-btn');
            if (container && minimizeBtn) {
                container.classList.toggle('codesim-minimized', isMinimized);
                minimizeBtn.innerHTML = isMinimized ? ICON_MAXIMIZE : ICON_MINIMIZE;
                minimizeBtn.title = isMinimized ? 'Phóng to' : 'Thu nhỏ';
                if (isMinimized) {
                    Object.assign(container.style, DEFAULT_POSITION);
                }
                GM_setValue(MINIMIZED_STATE_KEY, isMinimized);
            }
        }

        function createUI() {
            const container = document.createElement('div');
            container.id = 'codesim-container';
            if (isMinimized) container.classList.add('codesim-minimized');
            Object.assign(container.style, DEFAULT_POSITION);
            document.body.appendChild(container);

            container.innerHTML = `
                <div id="codesim-header" style="cursor: move;">
                    <h3>Auto Codesim</h3>
                    <div class="codesim-controls">
                        <button id="codesim-minimize-btn" class="control-button minimize svg-button" title="${isMinimized ? 'Phóng to' : 'Thu nhỏ'}">${isMinimized ? ICON_MAXIMIZE : ICON_MINIMIZE}</button>
                        <button id="codesim-close-btn" class="control-button close" title="Đóng">×</button>
                    </div>
                </div>
                <div class="codesim-content">
                    <div class="form-group">
                        <label for="codesim-account-select">Tài khoản:</label>
                        <select id="codesim-account-select"><option value="">-- Đang tải TK --</option></select>
                    </div>
                    <div id="codesim-balance-main"></div>
                    <div class="form-group">
                        <label for="codesim-service-select">Dịch vụ:</label>
                        <select id="codesim-service-select"><option value="">-- Chọn dịch vụ --</option></select>
                    </div>
                    <div class="form-group">
                        <label for="codesim-network-select">Nhà mạng:</label>
                        <select id="codesim-network-select"><option value="">-- Mặc định --</option></select>
                    </div>
                    <div class="form-group">
                        <label for="codesim-phone-prefix">Đầu số (Tùy chọn):</label>
                        <input type="text" id="codesim-phone-prefix" placeholder="VD: 098,034,...">
                    </div>
                    <div id="codesim-info-separator">
                        <div class="info-display-group">
                            <div id="codesim-phone-display" class="info-display clickable" title="Click để copy số điện thoại">
                                Số điện thoại: <span>Đang chờ yêu cầu</span>
                            </div>
                        </div>
                        <div class="info-display-group">
                            <div id="codesim-otp-display" class="info-display clickable" title="Click để copy mã OTP">
                                OTP: <span>Đang chờ yêu cầu</span>
                            </div>
                        </div>
                    </div>
                    <div class="button-group">
                        <button id="codesim-get-otp" class="button primary" disabled>Lấy số mới</button>
                        <button id="codesim-cancel" class="button danger" style="display: none;">Hủy Yêu Cầu</button>
                    </div>
                </div>
            `;

            document.getElementById('codesim-minimize-btn').onclick = toggleMinimize;
            document.getElementById('codesim-close-btn').onclick = (e) => { e.stopPropagation(); container.style.display = 'none'; };
            document.getElementById('codesim-account-select').onchange = handleAccountChange;
            document.getElementById('codesim-service-select').onchange = checkAndEnableOtpButton;
            document.getElementById('codesim-phone-display').onclick = () => { if (currentPhoneNumber) copyToClipboard(currentPhoneNumber, 'SĐT'); };
            document.getElementById('codesim-otp-display').onclick = () => { if (currentOtpCode) copyToClipboard(currentOtpCode, 'OTP'); };
            document.getElementById('codesim-get-otp').onclick = handleGetOtpClick;
            document.getElementById('codesim-cancel').onclick = handleCancelClick;

            addStyles();
            makeDraggable(container, document.getElementById('codesim-header'));
            fetchInitialAccountData();
        }

        function addStyles() {
            GM_addStyle(`
                :root {
                    --bg-color: rgba(30, 30, 40, 0.75); --input-bg: rgba(50, 50, 60, 0.6); --button-bg: rgba(70, 70, 80, 0.6); --button-hover-bg: rgba(90, 90, 100, 0.7); --button-active-bg: rgba(60, 60, 70, 0.8); --button-primary-bg: rgba(13, 110, 253, 0.6); --button-primary-hover-bg: rgba(41, 130, 255, 0.7); --button-danger-bg: rgba(220, 53, 69, 0.6); --button-danger-hover-bg: rgba(230, 76, 92, 0.7); --blur-intensity: 8px; --border-color: rgba(255, 255, 255, 0.1); --input-border: rgba(255, 255, 255, 0.15); --input-focus-border: var(--primary-color); --shadow-color: rgba(0, 0, 0, 0.4); --border-radius: 8px; --separator-border-color: var(--text-color-dim); --text-color: #f0f0f0; --text-color-dim: #a0a0a0; --text-color-strong: #ffffff; --title-color: #64b5f6; --primary-color: #64b5f6; --danger-color: #ef5350; --success-color: #66bb6a; --info-display-text: #e0e0e0; --info-display-label: #b0b0b0;
                }
                #codesim-container { position: fixed; width: 300px; background-color: var(--bg-color); border: 1px solid var(--border-color); border-radius: var(--border-radius); z-index: 99999; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 14px; box-shadow: 0 8px 32px 0 var(--shadow-color); color: var(--text-color); overflow: hidden; backdrop-filter: blur(var(--blur-intensity)); -webkit-backdrop-filter: blur(var(--blur-intensity)); transition: height 0.3s ease, opacity 0.3s ease, background-color 0.3s ease; height: auto; opacity: 1; }
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
                .button-group { display: flex; gap: 10px; margin-top: 18px; margin-bottom: 0px; }
                #codesim-container button.button { flex-grow: 1; border: none; padding: 10px 15px; text-align: center; text-decoration: none; font-size: 14px; border-radius: 6px; cursor: pointer; transition: background-color 0.2s ease, transform 0.1s ease, box-shadow 0.2s ease; font-weight: 600; color: var(--text-color-strong); background-color: var(--button-bg); box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                #codesim-container button.button:hover:not(:disabled) { box-shadow: 0 4px 8px rgba(0,0,0,0.15); transform: translateY(-1px); }
                #codesim-container button.button:active:not(:disabled) { transform: translateY(0px); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
                #codesim-container button.primary { background-color: var(--button-primary-bg); }
                #codesim-container button.primary:hover:not(:disabled) { background-color: var(--button-primary-hover-bg); }
                #codesim-container button.danger { background-color: var(--button-danger-bg); }
                #codesim-container button.danger:hover:not(:disabled) { background-color: var(--button-danger-hover-bg); }
                #codesim-container button.button:disabled { background-color: rgba(90, 90, 100, 0.4); color: var(--text-color-dim); cursor: not-allowed; box-shadow: none; transform: none; opacity: 0.6; }
                #codesim-info-separator { margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--separator-border-color); }
                .info-display-group { margin-bottom: 8px; }
                .info-display { background-color: transparent; color: var(--info-display-label); padding: 2px 0; border: none; font-size: 14px; word-wrap: break-word; }
                .info-display span { font-weight: 600; margin-left: 5px; color: var(--info-display-text); }
                .info-display.clickable { cursor: pointer; }
                .info-display.clickable:hover, .info-display.clickable:hover span { color: var(--primary-color); }
                #codesim-balance-main { text-align: right; font-size: 13px; color: var(--text-color-dim); margin-bottom: 12px; margin-top: -8px; font-weight: 500; height: 1.2em; }
                #codesim-balance-main[style*="var(--success-color)"] { color: var(--success-color) !important; }
                #codesim-balance-main[style*="var(--danger-color)"] { color: var(--danger-color) !important; }
            `);
        }

        function makeDraggable(elmnt, dragHandle) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            const dragMouseDown = (e) => {
                if (e.target.closest('button, select, input, .clickable')) return;
                e.preventDefault();
                pos3 = e.clientX; pos4 = e.clientY;
                document.onmouseup = closeDragElement; document.onmousemove = elementDrag;
            };
            const elementDrag = (e) => {
                e.preventDefault();
                pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
                pos3 = e.clientX; pos4 = e.clientY;
                let newTop = elmnt.offsetTop - pos2; let newLeft = elmnt.offsetLeft - pos1;
                const buffer = 10;
                newTop = Math.max(buffer, Math.min(newTop, window.innerHeight - elmnt.offsetHeight - buffer));
                newLeft = Math.max(buffer, Math.min(newLeft, window.innerWidth - elmnt.offsetWidth - buffer));
                elmnt.style.top = newTop + "px"; elmnt.style.left = newLeft + "px";
                elmnt.style.bottom = "auto"; elmnt.style.right = "auto";
            };
            const closeDragElement = () => { document.onmouseup = null; document.onmousemove = null; };
            if (dragHandle) dragHandle.onmousedown = dragMouseDown;
        }

        function fetchInitialAccountData() {
            const accountNames = Object.keys(ACCOUNTS);
            const balancePromises = accountNames.map(name => new Promise((resolve) => {
                apiRequest('GET', '/yourself/information-by-api-key', {}, (data) => resolve({ name, balance: data.balance }), (errorMsg) => resolve({ name, balance: null, error: errorMsg }), ACCOUNTS[name]);
            }));

            Promise.allSettled(balancePromises).then(results => {
                let highestBalance = -Infinity;
                let accountWithHighestBalance = null;
                const accountSelect = document.getElementById('codesim-account-select');
                if (!accountSelect) return;
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
                            if (balance > highestBalance) {
                                highestBalance = balance;
                                accountWithHighestBalance = name;
                            }
                        } else {
                            displayText += ` (Lỗi)`;
                        }
                        option.textContent = displayText;
                        accountSelect.appendChild(option);
                    }
                });

                let accountToSelect = accountWithHighestBalance || (accountNames.length > 0 ? accountNames[0] : null);
                if (accountToSelect) {
                    accountSelect.value = accountToSelect;
                    handleAccountChangeLogic(accountToSelect);
                } else {
                    if (accountSelect.options.length === 0) accountSelect.innerHTML = '<option value="">-- Không có TK --</option>';
                }
            });
        }

        function handleAccountChange() {
            handleAccountChangeLogic(document.getElementById('codesim-account-select')?.value);
        }

        function handleAccountChangeLogic(newAccountName) {
            if (!newAccountName || !ACCOUNTS[newAccountName]) {
                selectedAccountName = null; currentApiKey = null;
                updateMainBalanceDisplay(); resetOtpState(true); checkAndEnableOtpButton();
                const serviceSelect = document.getElementById('codesim-service-select');
                const networkSelect = document.getElementById('codesim-network-select');
                if (serviceSelect) serviceSelect.innerHTML = '<option value="">-- Chọn TK --</option>';
                if (networkSelect) networkSelect.innerHTML = '<option value="">-- Chọn TK --</option>';
                return;
            }
            if (currentOtpId || isFetchingOtp) {
                clearTimeout(pollingTimeoutId); pollingTimeoutId = null;
                resetOtpState(true);
            }
            selectedAccountName = newAccountName;
            currentApiKey = ACCOUNTS[selectedAccountName];
            GM_setValue(LAST_SELECTED_ACCOUNT_KEY, selectedAccountName);
            updateMainBalanceDisplay();
            resetOtpState(false);
            fetchServicesAndNetworks();
        }

        function fetchServicesAndNetworks() {
            if (!selectedAccountName || !currentApiKey) return;
            const getOtpButton = document.getElementById('codesim-get-otp');
            if (getOtpButton) getOtpButton.disabled = true;
            const serviceSelect = document.getElementById('codesim-service-select');
            const networkSelect = document.getElementById('codesim-network-select');
            if (!serviceSelect || !networkSelect) return;

            filteredServices = []; networks = [];
            serviceSelect.innerHTML = '<option value="">-- Đang tải DV --</option>';
            networkSelect.innerHTML = '<option value="">-- Đang tải NM --</option>';

            const servicePromise = new Promise((resolve, reject) => {
                apiRequest('GET', '/service/get_service_by_api_key', {}, (data) => {
                    services = data || [];
                    filteredServices = services.filter(s => TARGET_SERVICES.includes(s.name) && (s.status === undefined || s.status === 1));
                    serviceSelect.innerHTML = '';
                    if (filteredServices.length === 0) {
                        serviceSelect.innerHTML = `<option value="">-- Không có DV --</option>`;
                        reject(); return;
                    }
                    filteredServices.sort((a, b) => a.name.localeCompare(b.name)).forEach(service => {
                        const option = document.createElement('option');
                        option.value = service.id;
                        option.textContent = `${service.name} (${service.price.toLocaleString('vi-VN')}đ)`;
                        serviceSelect.appendChild(option);
                    });
                    const defaultOption = Array.from(serviceSelect.options).find(o => o.text.includes(DEFAULT_SERVICE_NAME));
                    if (defaultOption) defaultOption.selected = true;
                    resolve();
                }, (errorMsg) => { serviceSelect.innerHTML = '<option value="">-- Lỗi tải DV --</option>'; reject(); });
            });

            const networkPromise = new Promise((resolve) => {
                apiRequest('GET', '/network/get-network-by-api-key', {}, (data) => {
                    networks = data || [];
                    networkSelect.innerHTML = '<option value="">-- Mặc định (Tất cả) --</option>';
                    networks.forEach(network => {
                        if (network.status === 1) {
                            const option = document.createElement('option');
                            option.value = network.id;
                            option.textContent = network.name;
                            networkSelect.appendChild(option);
                        }
                    });
                    const defaultOption = Array.from(networkSelect.options).find(o => o.text === DEFAULT_NETWORK_NAME);
                    if (defaultOption) defaultOption.selected = true;
                    resolve();
                }, (errorMsg) => { networkSelect.innerHTML = '<option value="">-- Lỗi tải NM --</option>'; resolve(); });
            });

            Promise.all([servicePromise, networkPromise]).finally(() => {
                checkAndEnableOtpButton();
            });
        }

        function handleGetOtpClick() {
            if (isFetchingOtp || currentOtpId) return;
            const serviceId = document.getElementById('codesim-service-select')?.value;
            if (!serviceId || !selectedAccountName || !currentApiKey) return;

            isFetchingOtp = true;
            document.getElementById('codesim-get-otp').disabled = true;
            document.getElementById('codesim-cancel').style.display = 'inline-block';
            document.getElementById('codesim-cancel').disabled = false;
            updatePhoneDisplayStatus("Đang lấy số..."); updateOtpDisplayStatus("---");
            currentPhoneNumber = null; currentOtpCode = null;

            const params = {
                service_id: serviceId,
                network_id: document.getElementById('codesim-network-select')?.value || undefined,
                phone: document.getElementById('codesim-phone-prefix')?.value.trim() || undefined
            };

            apiRequest('GET', '/sim/get_sim', params, (data) => {
                isFetchingOtp = false;
                if (!data || !data.otpId || !data.simId || !data.phone) {
                    updatePhoneDisplayStatus("Lỗi lấy số (API)");
                    resetOtpState(false); return;
                }
                currentOtpId = data.otpId; currentSimId = data.simId; currentPhoneNumber = data.phone;
                updatePhoneDisplayStatus(currentPhoneNumber); updateOtpDisplayStatus("Đang chờ OTP...");
                copyToClipboard(currentPhoneNumber, "SĐT");
                clearTimeout(pollingTimeoutId);
                pollingTimeoutId = setTimeout(checkOtpStatus, POLLING_INTERVAL_PENDING);
                fetchBalanceForCurrentAccount(); checkAndEnableOtpButton();
            }, (errorMsg) => {
                isFetchingOtp = false;
                updatePhoneDisplayStatus(`Lỗi: ${errorMsg}`); updateOtpDisplayStatus("---");
                resetOtpState(false);
            });
        }

        function checkOtpStatus() {
            if (!currentOtpId) { resetOtpState(false); return; }
            apiRequest('GET', '/otp/get_otp_by_phone_api_key', { otp_id: currentOtpId }, (data) => {
                const otpCode = data ? data.code : null;
                if (otpCode && typeof otpCode === 'string' && otpCode.trim() !== "" && otpCode !== "null") {
                    currentOtpCode = otpCode.trim();
                    updateOtpDisplayStatus(currentOtpCode);
                    copyToClipboard(currentOtpCode, "OTP");
                    resetOtpState(false);
                } else {
                    clearTimeout(pollingTimeoutId);
                    pollingTimeoutId = setTimeout(checkOtpStatus, POLLING_INTERVAL_PENDING);
                }
            }, (errorMsg) => {
                if (errorMsg && typeof errorMsg === 'string' && (errorMsg.includes("Hết hạn") || errorMsg.includes("hủy") || errorMsg.includes("timeout") || errorMsg.includes("không tồn tại"))) {
                    updateOtpDisplayStatus(`Lỗi: ${errorMsg}`);
                    resetOtpState(false);
                } else {
                    clearTimeout(pollingTimeoutId);
                    pollingTimeoutId = setTimeout(checkOtpStatus, POLLING_INTERVAL_PENDING);
                }
            });
        }

        function handleCancelClick() {
            if (!currentSimId && !currentOtpId) { resetOtpState(false); return; }
            const idToCancel = currentSimId || currentOtpId;
            const endpoint = currentSimId ? `/sim/cancel_api_key/${idToCancel}` : `/otp/cancel_api_key/${currentOtpId}`;
            document.getElementById('codesim-cancel').disabled = true;
            apiRequest('GET', endpoint, {}, () => {
                clearTimeout(pollingTimeoutId); pollingTimeoutId = null;
                resetOtpState(false);
                fetchBalanceForCurrentAccount();
            }, (errorMsg) => {
                clearTimeout(pollingTimeoutId); pollingTimeoutId = null;
                resetOtpState(false);
            });
        }

        function resetOtpState(resetAccountRelatedUI = false) {
            clearTimeout(pollingTimeoutId); pollingTimeoutId = null;
            currentOtpId = null; currentSimId = null; isFetchingOtp = false;
            if (!resetAccountRelatedUI) {
                currentPhoneNumber = null; currentOtpCode = null;
                updatePhoneDisplayStatus("Đang chờ yêu cầu"); updateOtpDisplayStatus("Đang chờ yêu cầu");
            } else {
                updatePhoneDisplayStatus("Đang chờ yêu cầu"); updateOtpDisplayStatus("Đang chờ yêu cầu");
            }
            const cancelButton = document.getElementById('codesim-cancel');
            if (cancelButton) {
                cancelButton.style.display = 'none'; cancelButton.disabled = false;
            }
            if (resetAccountRelatedUI) {
                const serviceSelect = document.getElementById('codesim-service-select');
                const networkSelect = document.getElementById('codesim-network-select');
                if (serviceSelect) serviceSelect.innerHTML = '<option value="">-- Chọn tài khoản --</option>';
                if (networkSelect) networkSelect.innerHTML = '<option value="">-- Chọn tài khoản --</option>';
                const getOtpButton = document.getElementById('codesim-get-otp');
                if (getOtpButton) getOtpButton.disabled = true;
            } else {
                checkAndEnableOtpButton();
            }
        }

        function checkAndEnableOtpButton() {
            const getOtpButton = document.getElementById('codesim-get-otp');
            const serviceSelect = document.getElementById('codesim-service-select');
            if (getOtpButton && serviceSelect) {
                getOtpButton.disabled = !(!!selectedAccountName && !!serviceSelect.value && !currentOtpId && !isFetchingOtp);
            } else if (getOtpButton) {
                getOtpButton.disabled = true;
            }
        }

        function fetchBalanceForCurrentAccount() {
            if (!selectedAccountName || !currentApiKey) return;
            apiRequest('GET', '/yourself/information-by-api-key', {}, (data) => {
                const newBalance = data.balance;
                accountBalances[selectedAccountName] = newBalance;
                updateMainBalanceDisplay();
                updateAccountDropdownBalance(selectedAccountName, newBalance);
            }, (errorMsg) => {
                accountBalances[selectedAccountName] = null;
                updateMainBalanceDisplay();
                updateAccountDropdownBalance(selectedAccountName, null, errorMsg);
            });
        }

        function updateAccountDropdownBalance(accountName, balance, error = null) {
            const option = document.querySelector(`#codesim-account-select option[value="${accountName}"]`);
            if (option) {
                let displayText = accountName;
                if (balance !== null) {
                    displayText += ` (${balance.toLocaleString('vi-VN')}đ)`;
                } else {
                    displayText += ` (Lỗi)`;
                }
                option.textContent = displayText;
            }
        }

        function initializeScript() {
            if (document.readyState === 'loading') {
                window.addEventListener('DOMContentLoaded', createUI);
            } else {
                createUI();
            }
        }

        initializeScript();
    })();

})();
