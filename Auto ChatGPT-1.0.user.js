// ==UserScript==
// @name         Auto ChatGPT
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Auto ChatGPT
// @match        https://chatgpt.com/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @require      https://cdn.jsdelivr.net/npm/arrive@2.4.1/minified/arrive.min.js
// ==/UserScript==

(function() {
    'use strict';

    // --- Core Logic Variables (From Script 1) ---
    let currentPromptIndex = 0;
    let currentRepeatCount = 0;
    let dialogueData = [];
    let isAutomating = false;
    let stopRequested = false;
    let isMinimized = false;
    let isAutoChatExpanded = true;
    let draggedItem = null;

    // --- Panel Dragging State (From Script 1 - RAF version) ---
    let isDraggingPanel = false;
    let dragStartX = 0; let dragStartY = 0;
    let initialPanelX = 0; let initialPanelY = 0;
    let currentPanelX = 0; let currentPanelY = 0;
    let rafPending = false;

    // --- Constants (From Script 1) ---
    const SCRIPT_VERSION = "1.0"; // Updated version identifier
    const PROMPT_TEXTAREA_SELECTOR = '#prompt-textarea';
    const SEND_BUTTON_SELECTOR = 'button#composer-submit-button, button[data-testid="send-button"]';
    const STOP_GENERATING_BUTTON_SELECTOR = 'button[data-testid="stop-button"]';
    const DIALOGUES_STORAGE_KEY = 'savedDialogues_v2_6_reorder'; // Use Script 1's key
    const MINIMIZED_STATE_KEY = 'autoChatGPTMinimizedState_v2_6'; // Use Script 1's key
    const WAIT_MIN_SECONDS_KEY = 'autoChatGPTWaitMinSec_v2_6'; // Use Script 1's key
    const WAIT_MAX_SECONDS_KEY = 'autoChatGPTWaitMaxSec_v2_6'; // Use Script 1's key
    const AUTO_CHAT_EXPANDED_KEY = 'autoChatSectionExpandedState_v2_6'; // Use Script 1's key
    const DEFAULT_WAIT_MIN_MS = 1000; // Use Script 1's default (1 second)
    const DEFAULT_WAIT_MAX_MS = 2000; // Use Script 1's default (2 seconds)
    const CODE_BLOCK_CONTAINER_SELECTOR = 'div.rounded-md.border-\\[0\\.5px\\].border-token-border-medium.relative'; // Script 1's selector
    const CODE_BLOCK_HEADER_SELECTOR = 'div.flex.items-center.text-token-text-secondary.px-4.py-2.text-xs'; // Script 1's selector
    const CODE_BLOCK_CONTENT_SELECTOR = 'code[class*="language-"]'; // Script 1's selector

    // --- SVGs (From Script 1) ---
    const TRASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M7 4V2H17V4H22V6H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V6H2V4H7ZM6 6V20H18V6H6ZM9 9H11V17H9V9ZM13 9H15V17H13V9Z"></path></svg>`;
    const PLUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z"></path></svg>`;
    const MINIMIZE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M5 11V13H19V11H5Z"></path></svg>`;
    const DOWNLOAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M13 10H18L12 16L6 10H11V3H13V10ZM4 18V20H20V18H4Z"></path></svg>`;
    const CHEVRON_RIGHT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M10 17L15 12L10 7V17Z"></path></svg>`;
    const RESTORE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M5 3C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3H5ZM5 5H19V19H5V5Z"></path></svg>`;
    const DRAG_HANDLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M11 18C11 19.1 10.1 20 9 20C7.9 20 7 19.1 7 18C7 16.9 7.9 16 9 16C10.1 16 11 16.9 11 18ZM9 10C7.9 10 7 10.9 7 12C7 13.1 7.9 14 9 14C10.1 14 11 13.1 11 12C11 10.9 10.1 10 9 10ZM9 4C7.9 4 7 4.9 7 6C7 7.1 7.9 8 9 8C10.1 8 11 7.1 11 6C11 4.9 10.1 4 9 4ZM15 18C15 19.1 14.1 20 13 20C11.9 20 11 19.1 11 18C11 16.9 11.9 16 13 16C14.1 16 15 16.9 15 18ZM13 10C11.9 10 11 10.9 11 12C11 13.1 11.9 14 13 14C14.1 14 15 13.1 15 12C15 10.9 14.1 10 13 10ZM13 4C11.9 4 11 4.9 11 6C11 7.1 11.9 8 13 8C14.1 8 15 7.1 15 6C15 4.9 14.1 4 13 4Z"></path></svg>`;
    const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5V19L19 12L8 5Z"></path></svg>`;
    const STOP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M6 6H18V18H6V6Z"></path></svg>`;


    // --- Helper Functions (From Script 1) ---
    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    function generateUniqueId() { return Date.now().toString(36) + Math.random().toString(36).substring(2); }
    async function waitForElementToBeEnabled(element, timeout = 5000) { /* ... (Original logic from Script 1, omitted for brevity but should be pasted here) ... */
        // Paste the full implementation of waitForElementToBeEnabled from Script 1 here
         return new Promise((resolve, reject) => { const checkInterval = 200; let timeElapsed = 0; if (!element || !document.body.contains(element)) return reject(new Error(`Element not found or removed from DOM before waiting.`)); if (!element.disabled) return resolve(); const intervalId = setInterval(() => { if (!element || !document.body.contains(element)) { clearInterval(intervalId); return reject(new Error(`Element no longer in DOM while waiting.`)); } if (!element.disabled) { clearInterval(intervalId); resolve(); } else { timeElapsed += checkInterval; if (timeElapsed >= timeout) { clearInterval(intervalId); console.warn(`Element did not become enabled within ${timeout}ms.`); resolve(); /* Resolve anyway */ } } }, checkInterval); });
    }

    // --- Drag & Drop Helper (From Script 1) ---
    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.dialogue-input-wrapper:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    // --- UI Creation (Merged HTML from Script 1 into Script 2's structure) ---
    function createUI() {
        if (document.getElementById('chatgpt-auto-dialogue-panel')) return;

        isMinimized = GM_getValue(MINIMIZED_STATE_KEY, false);
        isAutoChatExpanded = GM_getValue(AUTO_CHAT_EXPANDED_KEY, true);

        const controlPanel = document.createElement('div');
        controlPanel.id = 'chatgpt-auto-dialogue-panel';
        controlPanel.className = isMinimized ? 'minimized' : ''; // Class controls visibility (Script 1 logic)

        // Use Script 1's HTML structure, adapted slightly for Script 2's sections if needed
        controlPanel.innerHTML = `
            <div id="panel-header" title="Kéo để di chuyển">
                <img src="https://www.svgrepo.com/show/306500/openai.svg" class="openai-logo" alt="OpenAI Logo">
                <span class="header-title">Auto ChatGPT</span>
                <span class="header-version">v${SCRIPT_VERSION}</span>
                <button id="minimize-btn" class="panel-header-button" title="Thu nhỏ / Mở rộng">${MINIMIZE_SVG}</button>
            </div>

            <div id="auto-chat-section" class="${isAutoChatExpanded ? 'expanded' : ''}">
                <div class="section-header" title="Click để thu gọn/mở rộng">
                    <span id="toggle-auto-chat-icon" class="toggle-icon">${CHEVRON_RIGHT_SVG}</span>
                    <span>Tự động trò chuyện</span>
                </div>
                <div id="auto-chat-content">
                    <div id="dialogue-inputs-container">
                         <div id="dialogue-empty-state" style="display: none;">
                            <p>Chưa có câu thoại nào. Hãy thêm một câu!</p>
                            <button id="add-prompt-empty-btn" class="add-prompt-main-btn">
                                ${PLUS_SVG} Thêm câu thoại
                            </button>
                        </div>
                        <!-- Prompts added here -->
                    </div>
                     <div id="dialogue-add-footer">
                         <button id="add-prompt-footer-btn" class="add-prompt-main-btn">
                             ${PLUS_SVG} Thêm câu thoại
                         </button>
                     </div>
                     <div class="section-content-divider"></div>
                     <!-- Updated Wait Time Layout (From Script 1) -->
                    <div id="automation-settings">
                         <label class="wait-label">Thời gian chờ từ</label>
                         <input type="number" id="min-wait-input" min="0" step="0.1" title="Giây tối thiểu">
                         <label class="wait-label">(s) đến</label>
                         <input type="number" id="max-wait-input" min="0" step="0.1" title="Giây tối đa">
                         <label class="wait-label">(s)</label>
                    </div>
                     <!-- End Updated Wait Time Layout -->
                    <div class="controls-footer">
                        <button id="start-automation-btn" title="Bắt đầu gửi tự động">
                            ${PLAY_SVG} <span>Bắt đầu</span>
                        </button>
                        <button id="stop-automation-btn" style="display: none;" title="Dừng gửi tự động">
                            ${STOP_SVG} <span>Dừng</span>
                        </button>
                    </div>
                     <div id="automation-status">Trạng thái: Chờ</div>
                </div>
            </div>

            <div class="panel-section-divider thick"></div>

            <div id="download-section">
                 <label for="codeblock-id-input" title="Nhập ID bạn đặt trong dấu ngoặc đơn ở đầu code block, vd: python(id_cua_ban)">ID Code Block:</label>
                 <input type="text" id="codeblock-id-input" placeholder="Điền block code...">
                 <button id="download-codeblock-btn" title="Tải nội dung code block khớp ID">
                     ${DOWNLOAD_SVG} <span>Tải về</span>
                 </button>
            </div>
        `;
        document.body.appendChild(controlPanel);

        updateToggleIcon('toggle-auto-chat-icon', isAutoChatExpanded);
        updateEmptyStateVisibility(); // From Script 1

        // Minimize Indicator (Floating Button - From Script 1)
        const minimizeIndicator = document.createElement('button');
        minimizeIndicator.id = 'minimize-indicator';
        minimizeIndicator.title = 'Mở Auto ChatGPT';
        minimizeIndicator.innerHTML = RESTORE_SVG; // Use Restore SVG from Script 1
        minimizeIndicator.style.display = isMinimized ? 'flex' : 'none'; // Use flex display from Script 1
        document.body.appendChild(minimizeIndicator);

        // --- Event Listeners (From Script 1) ---
        document.getElementById('panel-header').addEventListener('mousedown', handlePanelDragStart); // RAF version
        document.addEventListener('mousemove', handlePanelDragMove); // RAF version
        document.addEventListener('mouseup', handlePanelDragEnd); // RAF version
        document.addEventListener('mouseleave', handlePanelDragEnd); // Add mouseleave from Script 1
        document.getElementById('minimize-btn').addEventListener('click', toggleMinimize); // Script 1's logic
        minimizeIndicator.addEventListener('click', toggleMinimize); // Script 1's logic
        const autoChatHeader = document.querySelector('#auto-chat-section .section-header');
        if (autoChatHeader) { autoChatHeader.addEventListener('click', toggleAutoChatSection); } // Script 1's logic
        document.getElementById('min-wait-input').addEventListener('input', saveWaitTimes); // Script 1's logic
        document.getElementById('max-wait-input').addEventListener('input', saveWaitTimes); // Script 1's logic
        document.getElementById('start-automation-btn').addEventListener('click', startAutomation); // Script 1's logic
        document.getElementById('stop-automation-btn').addEventListener('click', stopAutomation); // Script 1's logic
        document.getElementById('download-codeblock-btn').addEventListener('click', downloadCodeblockData); // Script 1's logic
        document.getElementById('add-prompt-footer-btn').addEventListener('click', () => addDialogueInput()); // Script 1's logic
        document.getElementById('add-prompt-empty-btn').addEventListener('click', () => addDialogueInput()); // Script 1's logic
        const dialogueContainer = document.getElementById('dialogue-inputs-container');
        // Drag & Drop listeners from Script 1
        dialogueContainer.addEventListener('dragstart', handlePromptDragStart);
        dialogueContainer.addEventListener('dragover', handlePromptDragOver);
        dialogueContainer.addEventListener('drop', handlePromptDrop);
        dialogueContainer.addEventListener('dragend', handlePromptDragEnd);

        loadDialogues(); // Load saved data FIRST (Script 1 logic)
        loadWaitTimes(); // Load wait times (Script 1 logic)
    }

    // --- UI Interaction Functions (From Script 1) ---

    // Minimize/Maximize - Fixed to work like Script 1
    function toggleMinimize() {
        const panel = document.getElementById('chatgpt-auto-dialogue-panel');
        const indicator = document.getElementById('minimize-indicator');
        if (!panel || !indicator) return;

        isMinimized = !isMinimized; // Toggle state

        if (isMinimized) {
            panel.classList.add('minimized');    // Add class to hide panel via CSS
            indicator.style.display = 'flex';  // Show floating button (flex display)
        } else {
            panel.classList.remove('minimized'); // Remove class to show panel
            indicator.style.display = 'none';   // Hide floating button
        }
        GM_setValue(MINIMIZED_STATE_KEY, isMinimized); // Save state (Script 1's key)
    }

    // Toggle Section - From Script 1
    function toggleAutoChatSection() {
        const section = document.getElementById('auto-chat-section');
        const content = document.getElementById('auto-chat-content');
        if (!section || !content) return;

        isAutoChatExpanded = !isAutoChatExpanded;
        section.classList.toggle('expanded', isAutoChatExpanded);
        updateToggleIcon('toggle-auto-chat-icon', isAutoChatExpanded);
        GM_setValue(AUTO_CHAT_EXPANDED_KEY, isAutoChatExpanded); // Script 1's key
    }

    // Update Icon - From Script 1
    function updateToggleIcon(iconId, isExpanded) {
        const iconElement = document.getElementById(iconId);
        if (iconElement) {
            // Use transform for smoother rotation
            iconElement.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
            iconElement.style.transform = isExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
        }
    }

    // Add Dialogue Input - From Script 1 (includes drag handle)
    function addDialogueInput(data = { text: '', repeat: 1 }, insertAfterElement = null) {
        const container = document.getElementById('dialogue-inputs-container');
        if (!container) return;
        const promptId = data.id || generateUniqueId();
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'dialogue-input-wrapper';
        inputWrapper.setAttribute('data-id', promptId);
        inputWrapper.setAttribute('draggable', 'true'); // Make it draggable
        inputWrapper.innerHTML = `
            <div class="drag-handle" title="Kéo để sắp xếp">${DRAG_HANDLE_SVG}</div>
            <div class="dialogue-content">
                <textarea placeholder="Nhập hoặc dán câu thoại..." rows="1" class="dialogue-textarea">${data.text || ''}</textarea>
                <div class="prompt-controls">
                    <label class="repeat-label" for="repeat-${promptId}">Lặp:</label>
                    <input type="number" id="repeat-${promptId}" min="1" value="${data.repeat > 0 ? data.repeat : 1}" class="repeat-input" title="Số lần lặp lại câu thoại này">
                    <button class="add-prompt-btn icon-button" title="Thêm câu thoại mới bên dưới">${PLUS_SVG}</button>
                    <button class="remove-prompt-btn icon-button" title="Xóa câu thoại này">${TRASH_SVG}</button>
                </div>
            </div>`;
        const textarea = inputWrapper.querySelector('.dialogue-textarea');
        const repeatInput = inputWrapper.querySelector('.repeat-input');
        const addBtn = inputWrapper.querySelector('.add-prompt-btn');
        const removeBtn = inputWrapper.querySelector('.remove-prompt-btn');
        textarea.addEventListener('input', () => { autoResizeTextarea(textarea); saveDialogues(); });
        repeatInput.addEventListener('change', saveDialogues);
        repeatInput.addEventListener('input', saveDialogues); // Also save on input
        addBtn.addEventListener('click', (e) => { const currentWrapper = e.currentTarget.closest('.dialogue-input-wrapper'); addDialogueInput(undefined, currentWrapper); });
        removeBtn.addEventListener('click', (e) => { const wrapperToRemove = e.currentTarget.closest('.dialogue-input-wrapper'); if (wrapperToRemove) { wrapperToRemove.remove(); updateDialogueDataArray(); saveDialogues(); updateEmptyStateVisibility(); } }); // Added updateEmptyStateVisibility

        const emptyState = container.querySelector('#dialogue-empty-state');
        if (insertAfterElement && container.contains(insertAfterElement)) {
            insertAfterElement.insertAdjacentElement('afterend', inputWrapper);
        }
        else if (emptyState) {
            container.insertBefore(inputWrapper, emptyState); // Insert before empty state
        }
        else {
            container.appendChild(inputWrapper); // Fallback if empty state isn't there
        }

        autoResizeTextarea(textarea);
        updateDialogueDataArray();
        updateEmptyStateVisibility(); // Added this call
    }

    // Auto Resize - From Script 1
    function autoResizeTextarea(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto'; // Reset height
        // Add a small buffer (e.g., 2px) to prevent scrollbar flashing in some cases
        textarea.style.height = (textarea.scrollHeight + 2) + 'px';
    }

    // Update Data Array - From Script 1
    function updateDialogueDataArray() {
        const container = document.getElementById('dialogue-inputs-container');
        if (!container) { dialogueData = []; return; }
        dialogueData = Array.from(container.querySelectorAll('.dialogue-input-wrapper')).map(wrapper => {
            const textarea = wrapper.querySelector('.dialogue-textarea');
            const repeatInput = wrapper.querySelector('.repeat-input');
            const promptId = wrapper.getAttribute('data-id'); // Get the unique ID
            const repeatValue = parseInt(repeatInput?.value || '1', 10);
            return {
                id: promptId, // Store the ID
                text: textarea?.value || '',
                repeat: repeatValue > 0 ? repeatValue : 1
            };
        }).filter(item => item.id); // Ensure items have an ID
    }

    // Update Empty State Visibility - From Script 1
    function updateEmptyStateVisibility() {
        const container = document.getElementById('dialogue-inputs-container');
        const emptyState = document.getElementById('dialogue-empty-state');
        const addFooterBtn = document.getElementById('add-prompt-footer-btn');
        if (!container || !emptyState || !addFooterBtn) return;

        const hasPrompts = container.querySelector('.dialogue-input-wrapper') !== null;
        emptyState.style.display = hasPrompts ? 'none' : 'flex';
        addFooterBtn.style.display = hasPrompts ? 'flex' : 'none'; // Show footer button only when not empty
    }

    // --- Data Saving/Loading (From Script 1) ---
    function saveDialogues() {
        try {
            updateDialogueDataArray(); // Ensure array is up-to-date
            GM_setValue(DIALOGUES_STORAGE_KEY, JSON.stringify(dialogueData)); // Script 1's key
        } catch (e) {
            console.error("Lỗi khi lưu câu thoại:", e);
            updateStatus("Lỗi khi lưu câu thoại.");
        }
    }

    // Load Dialogues - Modified from Script 1 to add default item if none loaded
    function loadDialogues() {
        const saved = GM_getValue(DIALOGUES_STORAGE_KEY); // Script 1's key
        const container = document.getElementById('dialogue-inputs-container');
        if (!container) return;

        // Clear existing inputs before loading
        container.querySelectorAll('.dialogue-input-wrapper').forEach(el => el.remove());

        let loadedData = [];
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Validate loaded data structure (from Script 1)
                if (Array.isArray(parsed)) {
                    loadedData = parsed.filter(item => item && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.repeat === 'number');
                    if(loadedData.length !== parsed.length) console.warn("Đã loại bỏ một số mục câu thoại không hợp lệ khi tải.");
                } else console.warn("Định dạng dữ liệu câu thoại đã lưu không phải là mảng:", parsed);
            } catch (e) { console.error("Lỗi khi phân tích dữ liệu câu thoại đã lưu:", e); }
        }

        let promptsAdded = false;
        if (loadedData.length > 0) {
            loadedData.forEach(data => addDialogueInput(data));
            promptsAdded = true;
        }

        // --- Add default if none loaded (Script 1 logic) ---
        if (!promptsAdded && container.querySelectorAll('.dialogue-input-wrapper').length === 0) {
            addDialogueInput(); // Add one default blank prompt
        }
        // --- End add default ---

        updateDialogueDataArray(); // Update internal array based on loaded/default
        updateEmptyStateVisibility(); // Update visibility based on final state
    }

    // Save Wait Times - From Script 1 (includes validation)
    function saveWaitTimes() {
        const minInput = document.getElementById('min-wait-input');
        const maxInput = document.getElementById('max-wait-input');
        if (!minInput || !maxInput) return;

        let minSeconds = parseFloat(minInput.value) || 0;
        let maxSeconds = parseFloat(maxInput.value) || 0;

        if (minSeconds < 0) minSeconds = 0;
        if (maxSeconds < 0) maxSeconds = 0;

        // Ensure max >= min
        if (minSeconds > maxSeconds) {
            maxSeconds = minSeconds;
            maxInput.value = maxSeconds.toFixed(1); // Update the max input field if changed
        }

        // Ensure min is not negative after potential max adjustment
        if (minSeconds < 0) minSeconds = 0;
        minInput.value = minSeconds.toFixed(1); // Update min input field to reflect validation

        GM_setValue(WAIT_MIN_SECONDS_KEY, minSeconds); // Script 1's key
        GM_setValue(WAIT_MAX_SECONDS_KEY, maxSeconds); // Script 1's key
    }

    // Load Wait Times - From Script 1 (uses new defaults)
    function loadWaitTimes() {
        const minInput = document.getElementById('min-wait-input');
        const maxInput = document.getElementById('max-wait-input');
        if (!minInput || !maxInput) return;
        // Use Script 1's DEFAULT_WAIT_MIN_MS and MAX
        const minSeconds = GM_getValue(WAIT_MIN_SECONDS_KEY, DEFAULT_WAIT_MIN_MS / 1000);
        const maxSeconds = GM_getValue(WAIT_MAX_SECONDS_KEY, DEFAULT_WAIT_MAX_MS / 1000);
        minInput.value = minSeconds.toFixed(1); // Use toFixed(1) for consistency
        maxInput.value = maxSeconds.toFixed(1); // Use toFixed(1) for consistency
    }


    // --- Panel Dragging Logic (RAF / Transform - From Script 1) ---
    function handlePanelDragStart(e) {
        // Ignore drag on buttons, inputs, specific elements inside header, or non-header clicks
        if (e.target.closest('button, .header-version, input, textarea, label, .section-header, .drag-handle')) return;
        if (!e.target.closest('#panel-header')) return; // Only drag by header

        const panel = document.getElementById('chatgpt-auto-dialogue-panel');
        if (!panel || isDraggingPanel) return;

        isDraggingPanel = true;
        panel.classList.add('panel-dragging');
        panel.style.userSelect = 'none'; // Prevent text selection during drag

        // Get initial position based on current style (could be top/left or bottom/right)
        const rect = panel.getBoundingClientRect();
        initialPanelX = rect.left;
        initialPanelY = rect.top;

        dragStartX = e.clientX;
        dragStartY = e.clientY;

        // Switch to fixed positioning using top/left for smooth transform-based dragging
        panel.style.position = 'fixed';
        panel.style.bottom = 'auto'; // Remove bottom anchor during drag
        panel.style.top = initialPanelY + 'px';
        panel.style.left = initialPanelX + 'px';
        panel.style.transform = ''; // Reset transform before starting

        e.preventDefault(); // Prevent default drag behavior (like image ghosting)
    }

    function handlePanelDragMove(e) {
        if (!isDraggingPanel) return;

        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;

        // Calculate target position based on initial fixed position + delta
        let targetX = initialPanelX + deltaX;
        let targetY = initialPanelY + deltaY;

        // Constrain within viewport boundaries (with padding)
        const panel = document.getElementById('chatgpt-auto-dialogue-panel');
        const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        const panelWidth = panel.offsetWidth;
        const panelHeight = panel.offsetHeight;
        const padding = 10; // Min distance from edge

        targetX = Math.max(padding, Math.min(targetX, vw - panelWidth - padding));
        targetY = Math.max(padding, Math.min(targetY, vh - panelHeight - padding));

        // Store current target for RAF
        currentPanelX = targetX;
        currentPanelY = targetY;

        // Throttle updates using requestAnimationFrame
        if (!rafPending) {
            rafPending = true;
            requestAnimationFrame(updatePanelPosition);
        }
    }

    function updatePanelPosition() {
        if (!isDraggingPanel) {
             rafPending = false;
             return;
        }
        const panel = document.getElementById('chatgpt-auto-dialogue-panel');
        if (panel) {
            // Apply position change via transform for performance
            // The transform is relative to the initial fixed top/left set in handlePanelDragStart
            panel.style.transform = `translate(${currentPanelX - initialPanelX}px, ${currentPanelY - initialPanelY}px)`;
        }
        rafPending = false; // Allow next frame request
    }

    function handlePanelDragEnd(e) {
        if (!isDraggingPanel) return;
        isDraggingPanel = false;
        rafPending = false; // Ensure RAF stops

        const panel = document.getElementById('chatgpt-auto-dialogue-panel');
        if (panel) {
            panel.classList.remove('panel-dragging');
            panel.style.userSelect = ''; // Restore text selection

            // Calculate the final absolute position after transform
            const computedStyle = window.getComputedStyle(panel);
            const matrix = new DOMMatrix(computedStyle.transform);
            const finalX = initialPanelX + matrix.m41;
            const finalY = initialPanelY + matrix.m42;

            // Apply the final position using top/left and remove transform
            panel.style.transform = '';
            panel.style.left = finalX + 'px';
            panel.style.top = finalY + 'px';

            // Update stored position (optional, but good practice)
            currentPanelX = finalX;
            currentPanelY = finalY;
        }
    }

    // --- Prompt Drag & Drop Logic (From Script 1) ---
    function handlePromptDragStart(e) {
        if (isAutomating) { e.preventDefault(); return; } // Prevent drag during automation
        // Only allow dragging from the handle
        if (!e.target.classList.contains('drag-handle') && !e.target.closest('.drag-handle')) {
             e.preventDefault(); return;
        }
        draggedItem = e.target.closest('.dialogue-input-wrapper');
        if (!draggedItem) return;

        // Use setTimeout to allow browser to render drag image before style changes
        setTimeout(() => {
            if (draggedItem) draggedItem.classList.add('dragging');
        }, 0);

        e.dataTransfer.effectAllowed = 'move';
        // Set data (optional but good practice, ID is useful)
        e.dataTransfer.setData('text/plain', draggedItem.getAttribute('data-id'));
    }

    function handlePromptDragOver(e) {
        e.preventDefault(); // Necessary to allow dropping
        if (isAutomating || !draggedItem) return;

        const container = e.currentTarget; // Should be dialogue-inputs-container
        const afterElement = getDragAfterElement(container, e.clientY);

        // --- Manage Drop Indicator ---
        let indicator = container.querySelector('.drop-indicator');
        if (!indicator) {
             indicator = document.createElement('div');
             indicator.classList.add('drop-indicator');
             // Append initially, it will be moved to the correct spot
             container.appendChild(indicator);
        }

        // Move indicator to the correct position
        if (afterElement) {
             // Insert indicator *before* the element it should come before
             if (indicator !== afterElement.previousSibling) { // Avoid unnecessary DOM manipulation
                 container.insertBefore(indicator, afterElement);
             }
        } else {
            // If no element after (dragging to the end), place indicator last
            // (or before the empty state if it exists)
            const emptyState = container.querySelector('#dialogue-empty-state');
            if (emptyState && indicator !== emptyState.previousSibling) {
                container.insertBefore(indicator, emptyState);
            } else if (!emptyState && indicator !== container.lastChild) {
                 // Check if it's already the last child excluding the indicator itself
                 const children = Array.from(container.children);
                 const lastRealChild = children[children.length - (indicator.parentElement === container ? 2 : 1)];
                 if (indicator !== lastRealChild?.nextSibling) {
                     container.appendChild(indicator); // True end if no empty state
                 }
            }
        }
        // --- End Manage Drop Indicator ---

        e.dataTransfer.dropEffect = 'move'; // Visual feedback
    }

    function handlePromptDrop(e) {
        e.preventDefault();
        if (isAutomating || !draggedItem) return;

        const container = e.currentTarget;
        const indicator = container.querySelector('.drop-indicator');

        if (indicator && indicator.parentElement === container) {
             // Insert the dragged item right before the indicator's final position
             container.insertBefore(draggedItem, indicator);
             indicator.remove(); // Clean up indicator
        } else if (draggedItem.parentElement !== container) {
             // Fallback: if indicator somehow failed or wasn't placed correctly, just append
             container.appendChild(draggedItem);
             if (indicator) indicator.remove(); // Still try to remove indicator if it exists
        } else {
             // If dropped in original position or indicator failed, remove indicator
             if (indicator) indicator.remove();
        }


        if (draggedItem) {
             draggedItem.classList.remove('dragging');
        }
        draggedItem = null;

        updateDialogueDataArray(); // Update data order based on new DOM order
        saveDialogues();        // Save the new order
        updateEmptyStateVisibility(); // Just in case
    }

    function handlePromptDragEnd(e) {
        // Cleanup in case drop didn't happen over a valid target or drag was cancelled
        if (draggedItem) {
             draggedItem.classList.remove('dragging');
        }
        const container = document.getElementById('dialogue-inputs-container');
        if (container) {
             const indicator = container.querySelector('.drop-indicator');
             if (indicator) indicator.remove(); // Always remove indicator on drag end
        }
        draggedItem = null; // Reset dragged item
    }

    // --- Automation Core Logic (From Script 1) ---
    function updateStatus(message) {
        const statusDiv = document.getElementById('automation-status');
        if (statusDiv) statusDiv.textContent = `Trạng thái: ${message}`;
        console.log(`Automation Status: ${message}`);
    }

    // Start Automation - From Script 1 (Enables/disables correctly)
    async function startAutomation() {
        updateDialogueDataArray(); // Ensure data is current
        const validPromptsData = dialogueData.filter(data => data && data.text && data.text.trim());

        if (isAutomating) { updateStatus("Đang chạy..."); return; }
        if (validPromptsData.length === 0) { updateStatus("Không có câu thoại hợp lệ để gửi."); return; }

        isAutomating = true;
        stopRequested = false;
        currentPromptIndex = 0;
        currentRepeatCount = 0;

        // Update button states
        const startBtn = document.getElementById('start-automation-btn');
        const stopBtn = document.getElementById('stop-automation-btn');
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'flex'; // Use flex for consistency if needed

        // Disable UI elements
        disableDialogueEditing(true);
        disableWaitTimeEditing(true);
        disableDownloadFeature(true);

        updateStatus("Đang bắt đầu...");
        await delay(500); // Small delay before starting the loop
        processNextPrompt(); // Start the processing loop
    }

    // Stop Automation - From Script 1 (Enables/disables correctly)
    function stopAutomation() {
        isAutomating = false;
        stopRequested = true; // Signal the loop to stop

        // Update button states
        const startBtn = document.getElementById('start-automation-btn');
        const stopBtn = document.getElementById('stop-automation-btn');
        if (startBtn) startBtn.style.display = 'flex'; // Use flex for consistency if needed
        if (stopBtn) stopBtn.style.display = 'none';

        // Enable UI elements
        disableDialogueEditing(false);
        disableWaitTimeEditing(false);
        disableDownloadFeature(false);

        updateStatus("Đã dừng bởi người dùng.");
        setActivePromptHighlight(-1); // Remove highlight
    }

    // Disable Dialogue Editing - From Script 1 (Includes drag handles)
    function disableDialogueEditing(disabled) {
        const container = document.getElementById('dialogue-inputs-container');
        if (!container) return;
        // Disable textareas, inputs, buttons, and make handles non-draggable/dimmed
        container.querySelectorAll('.dialogue-textarea, .repeat-input, .remove-prompt-btn, .add-prompt-btn')
            .forEach(el => {
                el.disabled = disabled;
                el.style.cursor = disabled ? 'not-allowed' : '';
                // Adjust opacity for visual feedback, avoid making it completely invisible
                el.style.opacity = disabled ? '0.5' : '1';
            });
        container.querySelectorAll('.dialogue-input-wrapper').forEach(wrapper => {
             wrapper.setAttribute('draggable', !disabled); // Enable/disable draggable attribute
        });
        container.querySelectorAll('.drag-handle').forEach(handle => {
             handle.style.cursor = disabled ? 'not-allowed' : 'grab';
             handle.style.opacity = disabled ? '0.2' : '0.5'; // Dim handle more when disabled
        });

        // Also disable main add buttons
        const addFooterBtn = document.getElementById('add-prompt-footer-btn');
        const addEmptyBtn = document.getElementById('add-prompt-empty-btn');
         if (addFooterBtn) addFooterBtn.disabled = disabled;
         if (addEmptyBtn) addEmptyBtn.disabled = disabled;

    }

    // Disable Wait Time Editing - From Script 1
    function disableWaitTimeEditing(disabled) {
        const minInput = document.getElementById('min-wait-input');
        const maxInput = document.getElementById('max-wait-input');
        [minInput, maxInput].forEach(input => {
             if (input) {
                 input.disabled = disabled;
                 input.style.opacity = disabled ? '0.5' : '1';
                 input.style.cursor = disabled ? 'not-allowed' : '';
             }
        });
    }

    // Disable Download Feature - From Script 1
    function disableDownloadFeature(disabled) {
        const input = document.getElementById('codeblock-id-input');
        const button = document.getElementById('download-codeblock-btn');
        if (input) {
            input.disabled = disabled;
            input.style.opacity = disabled ? '0.5' : '1';
            input.style.cursor = disabled ? 'not-allowed' : '';
        }
        if (button) {
            button.disabled = disabled;
            // Keep button somewhat visible but clearly disabled
            button.style.opacity = disabled ? '0.5' : '1';
            button.style.cursor = disabled ? 'not-allowed' : '';
        }
    }

    // Set Active Highlight - From Script 1
    function setActivePromptHighlight(index) {
        const wrappers = document.querySelectorAll('#dialogue-inputs-container .dialogue-input-wrapper');
        wrappers.forEach((wrapper, i) => {
            wrapper.classList.toggle('active-prompt', i === index);
        });
    }

    // Process Next Prompt - Restored Wait Logic from Script 1
    async function processNextPrompt() {
        if (!isAutomating || stopRequested) {
            updateStatus(stopRequested ? "Đã dừng." : "Hoàn thành.");
            const startBtn = document.getElementById('start-automation-btn');
            const stopBtn = document.getElementById('stop-automation-btn');
            if (startBtn) startBtn.style.display = 'flex'; // Use flex
            if (stopBtn) stopBtn.style.display = 'none';
            disableDialogueEditing(false); disableWaitTimeEditing(false); disableDownloadFeature(false);
            setActivePromptHighlight(-1); isAutomating = false;
            return;
        }

        // Find the next *valid* prompt starting from currentPromptIndex
        let targetPromptIndex = -1;
        for (let i = currentPromptIndex; i < dialogueData.length; i++) {
             if (dialogueData[i]?.text?.trim()) {
                targetPromptIndex = i;
                break;
             }
         }

        // If no more valid prompts found
        if (targetPromptIndex === -1) {
             updateStatus("Hoàn thành tất cả câu thoại.");
             stopAutomation(); // Call stopAutomation to reset state cleanly
             return;
         }

        currentPromptIndex = targetPromptIndex;
        setActivePromptHighlight(currentPromptIndex); // Highlight the current one

        const currentData = dialogueData[currentPromptIndex];

        // Basic validation for the current prompt data
        if (!currentData || typeof currentData.repeat !== 'number' || !currentData.text) {
             console.error("Dữ liệu prompt không hợp lệ tại index:", currentPromptIndex, currentData);
             updateStatus(`Lỗi dữ liệu prompt #${currentPromptIndex + 1}. Bỏ qua.`);
             currentPromptIndex++; // Move to the next index
             currentRepeatCount = 0; // Reset repeat count for the next prompt
             setTimeout(processNextPrompt, 100); // Try next prompt quickly
             return;
        }

        const totalRepeatsNeeded = currentData.repeat > 0 ? currentData.repeat : 1;
        const promptText = currentData.text.trim();

        // Check if we've finished repeats for the current prompt
        if (currentRepeatCount >= totalRepeatsNeeded) {
            currentPromptIndex++; // Move to the next prompt index
            currentRepeatCount = 0; // Reset repeat count
            setActivePromptHighlight(-1); // Remove highlight temporarily
            setTimeout(processNextPrompt, 50); // Move quickly to the next check
            return;
        }

        currentRepeatCount++; // Increment repeat count for this send attempt

        // Calculate display numbers (X/Y) based on valid prompts
        const validPromptsBefore = dialogueData.slice(0, currentPromptIndex).filter(d => d?.text?.trim()).length;
        const currentValidPromptNumber = validPromptsBefore + 1;
        const totalValidPrompts = dialogueData.filter(d => d?.text?.trim()).length;

        updateStatus(`Đang gửi: Câu ${currentValidPromptNumber}/${totalValidPrompts} (Lần ${currentRepeatCount}/${totalRepeatsNeeded})`);

        try {
            await sendPromptToChatGPT(promptText);
            updateStatus(`Đang chờ P/Hồi: Câu ${currentValidPromptNumber}/${totalValidPrompts} (Lần ${currentRepeatCount}/${totalRepeatsNeeded})`);
            await waitForChatGPTResponse(); // Wait for response generation to complete

            if (stopRequested) return; // Check if stop was requested *during* the wait

            // --- Wait logic restored from Script 1 ---
            const minWaitSec = GM_getValue(WAIT_MIN_SECONDS_KEY, DEFAULT_WAIT_MIN_MS / 1000);
            const maxWaitSec = GM_getValue(WAIT_MAX_SECONDS_KEY, DEFAULT_WAIT_MAX_MS / 1000);
            const minWaitMs = minWaitSec * 1000;
            const maxWaitMs = Math.max(minWaitMs, maxWaitSec * 1000); // Ensure max >= min
            const randomWaitMs = minWaitMs + Math.random() * (maxWaitMs - minWaitMs);
            const waitSeconds = (randomWaitMs / 1000).toFixed(1);

            updateStatus(`Đã nhận P/Hồi: Câu ${currentValidPromptNumber}/${totalValidPrompts} (Lần ${currentRepeatCount}/${totalRepeatsNeeded}). Chờ ${waitSeconds}s...`);
            // console.log(`Waiting for ${waitSeconds}s (${randomWaitMs}ms)`); // Debugging log
            await delay(randomWaitMs); // Perform the actual wait
            // console.log("Wait finished."); // Debugging log
            // --- End wait logic ---

            if (stopRequested) return; // Check again after delay

            // Proceed to the next prompt/repeat after a short delay
            setTimeout(processNextPrompt, 150);

        } catch (error) {
            console.error("Lỗi trong quá trình tự động hóa:", error);
            updateStatus(`Lỗi: ${error.message}. Dừng.`);
            stopAutomation(); // Stop automation on error
        }
    }

    // Send Prompt - RESTORED FROM Script 1
    async function sendPromptToChatGPT(text) {
        const textarea = document.querySelector(PROMPT_TEXTAREA_SELECTOR);
        if (!textarea) throw new Error("Không tìm thấy ô nhập liệu ChatGPT.");

        textarea.focus();
        await delay(100); // Small delay for focus

        // Clear existing content (original method from Script 1)
         const currentContent = textarea.value || textarea.textContent || textarea.querySelector('p')?.textContent || '';
         if (currentContent) {
             textarea.value = '';
             if (textarea.querySelector('p')) textarea.querySelector('p').textContent = '';
             // Dispatch events to simulate user input and trigger any listeners
             textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
             textarea.dispatchEvent(new Event('change', { bubbles: true }));
             await delay(50); // Wait briefly for clearing to take effect
         }

        // Input the new text (original method from Script 1)
        const pTag = textarea.querySelector('p');
        const editorInstance = textarea.cmView?.view; // Check for CodeMirror instance
        let success = false;

        // Try CodeMirror dispatch first (most reliable if available)
        if (editorInstance?.dispatch) {
            try {
                const transaction = editorInstance.state.update({
                    changes: { from: 0, to: editorInstance.state.doc.length, insert: text },
                    selection: { anchor: text.length }, // Move cursor to end
                    scrollIntoView: true
                });
                editorInstance.dispatch(transaction);
                success = true;
                //console.log("Sent via CodeMirror dispatch");
            } catch (e) { console.warn("CodeMirror dispatch failed, trying other methods:", e); }
        }

        // Fallback to setting <p> tag content (if CodeMirror fails or isn't used)
        if (!success && pTag) {
             try {
                pTag.textContent = text;
                // Dispatch events again
                textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                textarea.dispatchEvent(new Event('change', { bubbles: true }));
                success = true;
                //console.log("Sent via pTag textContent");
            } catch (e) { console.warn("Setting pTag textContent failed, trying textarea value:", e); }
        }

        // Final fallback: set textarea.value directly
        if (!success) {
            try {
                textarea.value = text;
                // Dispatch events again
                textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                textarea.dispatchEvent(new Event('change', { bubbles: true }));
                success = true;
                //console.log("Sent via textarea.value");
            } catch (e) {
                 console.error("Setting textarea value failed:", e);
                 throw new Error("Không thể điền text vào ô nhập liệu.");
             }
        }

        await delay(450); // Original delay from Script 1 after inputting text

        // Find and click the Send button (original method from Script 1)
        let sendButton = null;
        const findAttempts = 8;
        const attemptDelay = 500;

        for (let i = 0; i < findAttempts; i++) {
            sendButton = document.querySelector(SEND_BUTTON_SELECTOR);
            // Check if button exists, is visible, and is not disabled
            if (sendButton && !sendButton.disabled && sendButton.offsetHeight > 0) break;
            // If not found/ready, wait and try again
            if (i < findAttempts - 1) await delay(attemptDelay);
        }

        // If button still not found or usable after attempts
        if (!sendButton || sendButton.disabled || sendButton.offsetHeight === 0) {
             console.error("Send button state:", { sendButton, disabled: sendButton?.disabled, visible: sendButton?.offsetHeight > 0 });
             throw new Error("Không tìm thấy hoặc không thể sử dụng nút gửi.");
        }

        sendButton.click();
        await delay(250); // Original delay from Script 1 after clicking send
    }

    // Wait for Response - RESTORED FROM Script 1
    async function waitForChatGPTResponse() {
        return new Promise((resolve, reject) => {
            const timeout = 600000; // 10 minutes (same as Script 1)
            const checkInterval = 250; // Check every 250ms
            let timeElapsed = 0;
            let generationDetected = false; // Flag to track if we've seen the stop button at least once
            let noStopButtonCount = 0; // Counter for consecutive checks where the stop button is *not* seen
            const noStopButtonThreshold = 16; // ~4 seconds (16 * 250ms), tolerance for button flickering/disappearing briefly

            const intervalId = setInterval(() => {
                if (stopRequested) { // Check if user manually stopped
                    clearInterval(intervalId);
                    resolve(); // Resolve immediately if stopped
                    return;
                }

                timeElapsed += checkInterval;
                if (timeElapsed > timeout) {
                    clearInterval(intervalId);
                    return reject(new Error("Hết thời gian chờ phản hồi từ ChatGPT."));
                }

                const stopButton = document.querySelector(STOP_GENERATING_BUTTON_SELECTOR);
                const isGenerating = !!stopButton && stopButton.offsetHeight > 0; // Check if button exists and is visible

                if (isGenerating) {
                    // If the button is visible, generation is in progress
                    if (!generationDetected) generationDetected = true; // Mark that we've seen it
                    noStopButtonCount = 0; // Reset the counter because we see the button
                } else {
                    // Button is not visible
                    if (generationDetected) {
                        // If we *have* seen the button before, and now it's gone,
                        // assume generation has finished.
                        clearInterval(intervalId);
                        resolve();
                    } else {
                        // If we *never* saw the stop button (e.g., very fast response or error)
                        // Wait a bit longer using the threshold before giving up.
                        noStopButtonCount++;
                        if (noStopButtonCount >= noStopButtonThreshold) {
                            console.warn(`Không phát hiện nút '${STOP_GENERATING_BUTTON_SELECTOR}' sau ${noStopButtonThreshold * checkInterval}ms. Giả định đã hoàn thành hoặc có lỗi.`);
                            clearInterval(intervalId);
                            resolve(); // Assume done or failed, resolve anyway to continue the script
                        }
                    }
                }
            }, checkInterval);
        });
    }

    // Download Code Block - RESTORED FROM Script 1
    function downloadCodeblockData() {
        const idInput = document.getElementById('codeblock-id-input');
        if (!idInput) return;
        const targetId = idInput.value.trim();
        if (!targetId) { updateStatus("Vui lòng nhập ID Code Block."); return; }

        updateStatus(`Đang tìm code block với ID: ${targetId}...`);

        const codeBlockContainers = document.querySelectorAll(CODE_BLOCK_CONTAINER_SELECTOR);
        let foundContents = [];
        let foundCount = 0;

        codeBlockContainers.forEach(container => {
            const header = container.querySelector(CODE_BLOCK_HEADER_SELECTOR);
             // Original check from Script 1: header exists, text matches exactly, and NOT inside our panel
             if (header && header.textContent.trim() === targetId && !container.closest('#chatgpt-auto-dialogue-panel')) {
                const codeContent = container.querySelector(CODE_BLOCK_CONTENT_SELECTOR);
                if (codeContent) {
                    const rawText = codeContent.textContent || "";
                    // Original cleaning from Script 1: trim trailing space from each line, then trim the whole block
                    const cleanedText = rawText.split('\n').map(line => line.trimEnd()).join('\n').trim();
                     if (cleanedText) { // Only add if there's actual content after cleaning
                        foundContents.push(cleanedText);
                        foundCount++;
                     }
                } else {
                     // Log if header matches but content is missing (Script 1 behavior)
                     console.warn(`Found header matching ID '${targetId}' but no code content inside.`);
                 }
            }
        });

        if (foundCount === 0) {
            updateStatus(`Không tìm thấy code block nào với ID: ${targetId}.`);
            return;
        }

        const compiledContent = foundContents.join('\n\n'); // Original separator from Script 1

        try {
            const blob = new Blob([compiledContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            // Original sanitization and filename from Script 1
            const safeId = targetId.replace(/[^a-z0-9_\-\(\)]/gi, '_');
            link.download = `codeblock_${safeId}_data.txt`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            updateStatus(`Đã tải ${foundCount} code block với ID: ${targetId}.`);
        } catch (error) {
            console.error("Error creating/downloading file:", error);
            updateStatus("Lỗi khi tạo file tải về.");
        }
    }

    // --- Polished CSS (From Script 1, applied within GM_addStyle) ---
    GM_addStyle(`
        /* --- CSS Variables (Theme v2.8.0 - Copied from Script 1) --- */
        :root {
            --panel-width: 400px;
            --panel-max-height: calc(100vh - 60px); /* Adjust max-height if needed */
            --panel-bg: rgba(35, 38, 43, 0.7);
            --panel-blur: 20px;
            --panel-border-color: rgba(255, 255, 255, 0.1);
            --panel-shadow: 0 18px 55px rgba(0, 0, 0, 0.5);
            --text-primary: #f5f5f7;
            --text-secondary: #aeb8c5;
            --text-placeholder: #818a96;
            --input-bg: rgba(255, 255, 255, 0.08);
            --input-border: rgba(255, 255, 255, 0.2);
            --input-focus-border: rgba(80, 140, 255, 0.7);
            --input-focus-bg: rgba(255, 255, 255, 0.1);
            --input-focus-shadow: 0 0 0 3.5px rgba(80, 140, 255, 0.25);
            --primary-button-bg: #ffffff;
            --primary-button-text: #1d1d1f;
            --primary-button-hover-bg: #f5f5f7;
            --primary-button-shadow: 0 3px 8px rgba(0,0,0,0.12);
            --primary-button-active-shadow: 0 1px 3px rgba(0,0,0,0.1);
            --stop-button-bg: #ff4d4f;
            --stop-button-text: #ffffff;
            --stop-button-hover-bg: #f73d40;
            --stop-button-shadow: 0 3px 8px rgba(255, 77, 79, 0.2);
            --stop-button-active-shadow: 0 1px 3px rgba(255, 77, 79, 0.2);
            --secondary-button-bg: rgba(80, 140, 255, 0.18);
            --secondary-button-text: #cddbff;
            --secondary-button-border: rgba(80, 140, 255, 0.4);
            --secondary-button-hover-bg: rgba(80, 140, 255, 0.25);
            --secondary-button-hover-border: rgba(80, 140, 255, 0.6);
            --icon-color: #bec5d0;
            --icon-hover-color: #ffffff;
            --scrollbar-thumb: rgba(255, 255, 255, 0.35);
            --scrollbar-thumb-hover: rgba(255, 255, 255, 0.5);
            --active-prompt-bg: rgba(80, 140, 255, 0.08);
            --active-prompt-border: rgba(80, 140, 255, 0.5);
            --border-radius-main: 20px;
            --border-radius-inner: 10px;
            --section-header-bg: transparent; /* Script 1 style */
            --section-header-hover-bg: rgba(255,255,255,0.04); /* Script 1 style */
            --divider-color: rgba(255, 255, 255, 0.1);
            --font-main: "SF Pro Display", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            --accent-blue: #508cff;
            --minimize-indicator-size: 50px; /* Script 1 style */
        }

        /* --- Main Panel (Styles from Script 1, keep Script 2's initial position) --- */
        #chatgpt-auto-dialogue-panel {
            position: fixed;
            bottom: 25px; /* Keep Script 2's initial anchor */
            right: 25px;  /* Keep Script 2's initial anchor */
            width: var(--panel-width); /* Use Script 1 variable */
            min-width: 380px; /* Script 1 constraint */
            max-height: var(--panel-max-height); /* Use Script 1 variable */
            background: var(--panel-bg); /* Script 1 style */
            backdrop-filter: blur(var(--panel-blur)) saturate(180%); /* Script 1 style */
            -webkit-backdrop-filter: blur(var(--panel-blur)) saturate(180%); /* Script 1 style */
            border: 1px solid var(--panel-border-color); /* Script 1 style */
            border-radius: var(--border-radius-main); /* Script 1 style */
            box-shadow: var(--panel-shadow); /* Script 1 style */
            z-index: 10001; /* Ensure it's above indicator */
            color: var(--text-primary); /* Script 1 style */
            font-family: var(--font-main); /* Script 1 style */
            font-size: 14.5px; /* Script 1 style */
            display: flex; flex-direction: column;
            overflow: hidden; /* Script 1: Content scrolls internally */
             /* Transition for minimize/maximize (Script 1) */
            transition: opacity 0.25s ease-out, transform 0.25s ease-out, visibility 0s linear 0.25s;
            opacity: 1; visibility: visible;
            transform: scale(1) translate(0, 0);
            resize: none !important; /* Disable resize */
            will-change: transform, opacity; /* Hint for smoother animations */
        }
         /* Minimized state (Script 1) - applies fade out and prevents interaction */
        #chatgpt-auto-dialogue-panel.minimized {
            opacity: 0;
            transform: scale(0.95) translateY(15px); /* Script 1 effect */
            visibility: hidden;
            pointer-events: none;
            transition: opacity 0.25s ease-out, transform 0.25s ease-out, visibility 0s linear 0.25s;
        }
        .panel-dragging { cursor: grabbing !important; } /* Script 1 style */

        /* --- Panel Header (Script 1 style) --- */
        #panel-header {
            display: flex; align-items: center; gap: 12px; /* Script 1 gap */
            padding: 12px 20px; /* Script 1 padding */
            cursor: grab; /* Script 1 cursor */
            user-select: none; flex-shrink: 0;
            border-bottom: none; /* Remove border if added by Script 2 style */
            background-color: transparent; /* Script 1 style */
        }
        #panel-header:active { cursor: grabbing; }
        .openai-logo {
             width: 24px; height: 24px; /* Script 1 size */
             flex-shrink: 0; filter: brightness(0) invert(1); /* Script 1 filter */
             display: block;
         }
        .header-title {
            font-size: 1.18em; /* Script 1 size */
            font-weight: 600; white-space: nowrap;
            margin-right: auto; color: var(--text-primary); /* Script 1 style */
         }
        .header-version {
             font-size: 0.8em; color: var(--text-secondary); /* Script 1 style */
             font-weight: 500; white-space: nowrap;
             margin-right: 8px; opacity: 0.8; /* Script 1 style */
         }
        .panel-header-button { /* Style for minimize button (Script 1) */
             background: transparent; border: none; color: var(--icon-color);
             padding: 6px; border-radius: 9px; cursor: pointer;
             display: inline-flex; align-items: center; justify-content: center;
             width: 30px; height: 30px; flex-shrink: 0;
             transition: background-color 0.2s ease, color 0.2s ease;
         }
        .panel-header-button:hover {
             background-color: rgba(255, 255, 255, 0.1); color: var(--icon-hover-color);
         }
        .panel-header-button svg { width: 17px; height: 17px; }

        /* --- Section Divider (Script 1) --- */
        .panel-section-divider { height: 1px; background-color: var(--divider-color); margin: 0; flex-shrink: 0; }
        .panel-section-divider.thick { height: 1.5px; background-color: rgba(255, 255, 255, 0.12); margin: 4px 0; }
        .section-content-divider { height: 1px; background-color: var(--divider-color); margin: 12px 20px 8px 20px; flex-shrink: 0; }

        /* --- Collapsible Section (Script 1 style/behavior) --- */
        #auto-chat-section { display: flex; flex-direction: column; min-height: 0; flex-shrink: 1;} /* Allow shrinking */
        .section-header {
            display: flex; align-items: center; gap: 10px; /* Script 1 gap */
            padding: 15px 20px; /* Script 1 padding */
            font-weight: 600; font-size: 1.0em; /* Script 1 font */
            cursor: pointer; user-select: none;
            transition: background-color 0.2s ease; flex-shrink: 0;
            background-color: var(--section-header-bg); /* Script 1 background */
            border-top: none; /* Ensure no top border from script 2 */
         }
        .section-header:hover { background-color: var(--section-header-hover-bg); } /* Script 1 hover */
        .toggle-icon {
             display: inline-flex; align-items: center; justify-content: center;
             transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); /* Script 1 transition */
             color: var(--icon-color); transform: rotate(0deg); margin-right: 2px;
         }
        #auto-chat-section.expanded .toggle-icon { transform: rotate(90deg); }
        #auto-chat-content {
             display: flex; flex-direction: column;
             overflow: hidden; /* Hide when collapsed */
             transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease-out; /* Script 1 transition */
             max-height: 0; opacity: 0; min-height: 0;
             background-color: transparent; /* Script 1 background */
             padding: 0; /* Remove padding if added by Script 2 */
             flex-shrink: 1; /* Allow inner content to potentially scroll */
             flex-grow: 1; /* Allow content to take available space */
         }
        #auto-chat-section.expanded #auto-chat-content {
             /* Allow content to expand, overall panel max-height will limit */
             max-height: 80vh; /* Or a large value like 9999px, limited by panel */
             opacity: 1;
             overflow: visible; /* Let internal container scroll if needed */
         }

        /* --- Prompt Input Area (Script 1 style/structure) --- */
        #dialogue-inputs-container {
            overflow-y: auto; overflow-x: hidden; /* Scroll this section */
            padding: 8px 10px 8px 20px; /* Script 1 padding (note right padding less for scrollbar) */
            scrollbar-width: thin; scrollbar-color: var(--scrollbar-thumb) transparent;
            flex-grow: 1; /* Take available space */
            min-height: 100px; /* Script 1 min-height */
            max-height: 45vh; /* Add reasonable max-height for scrolling within section */
            display: flex; flex-direction: column;
            margin-bottom: 5px; position: relative; /* Needed for drop indicator */
        }
        #dialogue-inputs-container::-webkit-scrollbar { width: 8px; }
        #dialogue-inputs-container::-webkit-scrollbar-track { background: transparent; margin: 5px 0; }
        #dialogue-inputs-container::-webkit-scrollbar-thumb { background-color: var(--scrollbar-thumb); border-radius: 4px; border: 2px solid transparent; background-clip: content-box; }
        #dialogue-inputs-container::-webkit-scrollbar-thumb:hover { background-color: var(--scrollbar-thumb-hover); }

        /* Empty State (Script 1) */
        #dialogue-empty-state {
             display: flex; flex-direction: column; align-items: center; justify-content: center;
             padding: 35px 20px; text-align: center; color: var(--text-secondary);
             flex-grow: 1; user-select: none;
         }
        #dialogue-empty-state p { margin: 0 0 16px 0; font-size: 0.98em; }
        /* Footer Add Button Area (Script 1) */
        #dialogue-add-footer { padding: 8px 20px 16px 20px; flex-shrink: 0; display: flex; }
        .add-prompt-main-btn { /* Style for both empty state and footer add buttons */
            width: 100%; padding: 10px 15px; font-size: 0.98em;
            border-radius: var(--border-radius-inner); background-color: transparent;
            color: var(--text-secondary); border: 1px dashed rgba(255, 255, 255, 0.25);
            cursor: pointer; transition: all 0.2s ease;
            display: inline-flex; align-items: center; justify-content: center; gap: 7px;
            font-weight: 500;
        }
        .add-prompt-main-btn:hover:not(:disabled) { background-color: rgba(255, 255, 255, 0.06); color: var(--text-primary); border-color: rgba(255, 255, 255, 0.4); border-style: solid; }
        .add-prompt-main-btn:active:not(:disabled) { transform: scale(0.98); }
        .add-prompt-main-btn:disabled { cursor: not-allowed; opacity: 0.5; }
        .add-prompt-main-btn svg { width: 15px; height: 15px; }

        /* Individual Prompt Item (Script 1 style) */
        .dialogue-input-wrapper {
            display: flex; align-items: flex-start; margin-bottom: 8px;
            padding: 6px 6px 6px 0; /* Script 1 padding */
            border-radius: var(--border-radius-inner);
            transition: background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
            border: 1px solid transparent; position: relative;
            background-color: transparent; /* Overwrite Script 2 background */
         }
        .dialogue-input-wrapper:last-of-type { margin-bottom: 0; }
        .dialogue-input-wrapper:hover:not(.dragging):not(.active-prompt) { background-color: rgba(255, 255, 255, 0.04); }
        .dialogue-input-wrapper.active-prompt { background-color: var(--active-prompt-bg); border-color: var(--active-prompt-border); }

        /* Drag Handle (Script 1) */
        .drag-handle {
            flex-shrink: 0; width: 30px; padding: 12px 0 12px 10px;
            cursor: grab; color: var(--icon-color); opacity: 0.5;
            transition: opacity 0.2s ease, color 0.2s ease;
            display: flex; align-items: center;
        }
        .dialogue-input-wrapper:hover .drag-handle { opacity: 0.8; }
        .drag-handle:active { cursor: grabbing; }
        .drag-handle svg { width: 16px; height: 16px; }
        .dialogue-input-wrapper.dragging { /* Style for item being dragged */
            opacity: 0.4; background-color: rgba(0,0,0,0.2);
            border: 1px dashed rgba(255,255,255,0.3);
        }

        /* Drop Indicator (Script 1) - Simple Line */
         .drop-indicator {
             height: 2px !important; /* Force height */
             background-color: var(--accent-blue) !important; /* Use theme color */
             border-radius: 1px;
             margin-left: 30px; /* Indent past handle */
             margin-right: 10px; /* Account for padding/scrollbar */
             margin-top: -5px;    /* Position between items */
             margin-bottom: 3px;
             pointer-events: none; /* Ignore mouse events */
             flex-shrink: 0; /* Prevent shrinking */
             z-index: 1; /* Ensure it's above wrapper backgrounds */
         }

        .dialogue-content { flex-grow: 1; display: flex; flex-direction: column; gap: 8px; } /* Script 1 gap */
        .dialogue-textarea {
            width: 100%; box-sizing: border-box; padding: 11px 15px; /* Script 1 padding */
            border: 1px solid var(--input-border); border-radius: var(--border-radius-inner);
            background-color: var(--input-bg); color: var(--text-primary);
            resize: none; min-height: 48px; /* Script 1 min-height */
            font-size: 1em; line-height: 1.5; overflow-y: hidden;
            transition: all 0.2s ease; font-family: inherit;
            margin-bottom: 0; /* Remove margin from script 2 */
        }
        .dialogue-textarea::placeholder { color: var(--text-placeholder); }
        .dialogue-textarea:focus { outline: none; border-color: var(--input-focus-border); background-color: var(--input-focus-bg); box-shadow: var(--input-focus-shadow); }
        .dialogue-textarea:disabled { cursor: not-allowed; opacity: 0.6; background-color: rgba(255,255,255,0.05);}
        .prompt-controls {
             display: flex; align-items: center; gap: 8px;
             height: 30px; padding-left: 0px; margin-top: 2px; /* Script 1 layout */
         }
        .repeat-label { font-size: 0.9em; color: var(--text-secondary); white-space: nowrap; cursor: default; margin-left: 4px; margin-right: 0; } /* Script 1 layout */
        .repeat-input {
             width: 50px; padding: 6px 6px; /* Script 1 size/padding */
             margin-right: auto; border: 1px solid var(--input-border);
             border-radius: 8px; background-color: var(--input-bg); color: var(--text-primary);
             font-size: 0.9em; text-align: center; -moz-appearance: textfield;
             transition: all 0.2s ease;
         }
        .repeat-input::-webkit-outer-spin-button, .repeat-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .repeat-input:focus { outline: none; border-color: var(--input-focus-border); background-color: var(--input-focus-bg); box-shadow: var(--input-focus-shadow); }
        .repeat-input:disabled { cursor: not-allowed; opacity: 0.6; background-color: rgba(255,255,255,0.05); }
        /* Icon Button Base Style (Script 1) */
        .icon-button {
             background: transparent; border: none; color: var(--icon-color);
             padding: 5px; border-radius: 8px; cursor: pointer;
             display: inline-flex; align-items: center; justify-content: center;
             width: 28px; height: 28px; /* Script 1 size */
             transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
         }
        .icon-button svg { width: 15px; height: 15px; }
        .icon-button:hover:not(:disabled) { background-color: rgba(255, 255, 255, 0.1); color: var(--icon-hover-color); }
        .icon-button:active:not(:disabled) { transform: scale(0.92); }
        .icon-button:disabled { opacity: 0.4; cursor: not-allowed; }
        /* Specific Icon Button Styles (Script 1) */
        .remove-prompt-btn { color: #ff8787; }
        .remove-prompt-btn:hover:not(:disabled) { background-color: rgba(255, 77, 79, 0.15); color: #ffabab; }
        .add-prompt-btn { color: #adc6ff; }
        .add-prompt-btn:hover:not(:disabled) { background-color: rgba(173, 198, 255, 0.15); color: #dcecff; }

        /* --- Automation Settings (Wait Times) - Updated Layout (Script 1) --- */
        #automation-settings {
            padding: 14px 20px 10px 20px; /* Script 1 padding */
            display: flex; align-items: center; gap: 8px; /* Adjust gap */
            flex-shrink: 0; font-size: 0.95em; /* Slightly larger label */
            color: var(--text-secondary);
        }
        #automation-settings label.wait-label { margin: 0; flex-shrink: 0; line-height: 1; /* Align text */ }
        #automation-settings input[type="number"] {
            width: 55px; /* Adjust width */ padding: 7px 8px; /* Script 1 padding */
            border: 1px solid var(--input-border); border-radius: 8px;
            background-color: var(--input-bg); color: var(--text-primary);
            font-size: 0.95em; text-align: center; -moz-appearance: textfield;
            transition: all 0.2s ease;
         }
         #automation-settings input[type="number"]::-webkit-outer-spin-button, #automation-settings input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
         #automation-settings input[type="number"]:focus { outline: none; border-color: var(--input-focus-border); background-color: var(--input-focus-bg); box-shadow: var(--input-focus-shadow); }
         #automation-settings input[type="number"]:disabled { cursor: not-allowed; opacity: 0.6; background-color: rgba(255,255,255,0.05); }

        /* --- Controls Footer (Start/Stop Buttons - Script 1) --- */
        .controls-footer {
             padding: 12px 20px 16px 20px; /* Script 1 padding */
             display: flex; gap: 12px; flex-shrink: 0;
             border-top: none; /* Remove border if added by Script 2 */
         }
        #start-automation-btn, #stop-automation-btn {
             padding: 10px 16px; font-size: 1.0em; flex-grow: 1; margin: 0;
             border-radius: var(--border-radius-inner); font-weight: 600;
             transition: all 0.2s ease; text-align: center; cursor: pointer; border: none;
             line-height: 1.5; display: flex; align-items: center; justify-content: center; gap: 8px;
         }
        #start-automation-btn span, #stop-automation-btn span { line-height: 1; }
        #start-automation-btn svg, #stop-automation-btn svg { margin-bottom: -1px; vertical-align: middle; /* Align SVGs better */}
        #start-automation-btn:active:not(:disabled), #stop-automation-btn:active:not(:disabled) { transform: scale(0.97); }
        /* Start Button Styles (Script 1) */
        #start-automation-btn { background-color: var(--primary-button-bg); color: var(--primary-button-text); box-shadow: var(--primary-button-shadow); }
        #start-automation-btn:hover:not(:disabled) { background-color: var(--primary-button-hover-bg); }
        #start-automation-btn:active:not(:disabled) { box-shadow: var(--primary-button-active-shadow); }
        #start-automation-btn:disabled { background-color: #e8e8ed; color: #abadaf; cursor: not-allowed; opacity: 0.7; box-shadow: none;}
        /* Stop Button Styles (Script 1) */
        #stop-automation-btn { background-color: var(--stop-button-bg); color: var(--stop-button-text); box-shadow: var(--stop-button-shadow); }
        #stop-automation-btn:hover:not(:disabled) { background-color: var(--stop-button-hover-bg); }
        #stop-automation-btn:active:not(:disabled) { box-shadow: var(--stop-button-active-shadow); }
        #stop-automation-btn:disabled { background-color: #ff9496; cursor: not-allowed; opacity: 0.7; box-shadow: none;}

        /* --- Automation Status (Script 1) --- */
        #automation-status {
            padding: 12px 20px 14px 20px; /* Script 1 padding */
            font-size: 0.95em; text-align: center; color: var(--text-secondary);
            width: 100%; line-height: 1.4; min-height: calc(1.4em + 4px);
            flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            box-sizing: border-box; border-top: 1px solid var(--divider-color); /* Script 1 divider */
            background-color: rgba(0,0,0,0.04); /* Script 1 background */
        }

        /* --- Download Section (Script 1 style) --- */
        #download-section {
             padding: 16px 20px 18px 20px; /* Script 1 padding */
             display: flex; align-items: center; gap: 12px;
             flex-shrink: 0; font-size: 0.95em;
             border-top: none; /* Remove border if added by Script 2 */
             background-color: transparent; /* Ensure transparent bg */
         }
        #download-section label {
             margin-right: 4px; flex-shrink: 0; font-weight: 500;
             color: var(--text-secondary); cursor: help; /* Script 1 style */
         }
        #download-section input[type="text"] {
            flex-grow: 1; padding: 8px 14px; /* Script 1 padding */
            border: 1px solid var(--input-border); border-radius: 8px; /* Script 1 style */
            background-color: var(--input-bg); color: var(--text-primary);
            font-size: 1em; min-width: 80px; transition: all 0.2s ease;
        }
        #download-section input[type="text"]::placeholder { color: var(--text-placeholder); }
        #download-section input[type="text"]:focus { outline: none; border-color: var(--input-focus-border); background-color: var(--input-focus-bg); box-shadow: var(--input-focus-shadow); }
        #download-section button {
             padding: 8px 14px; font-size: 0.95em; border-radius: 8px; /* Script 1 style */
             background-color: var(--secondary-button-bg); color: var(--secondary-button-text);
             border: 1px solid var(--secondary-button-border); cursor: pointer;
             transition: all 0.2s ease; display: inline-flex; align-items: center;
             justify-content: center; gap: 7px; flex-shrink: 0; font-weight: 500;
         }
        #download-section button svg { width: 15px; height: 15px; margin-bottom: -1px;}
        #download-section button span { line-height: 1; }
        #download-section button:hover:not(:disabled) { background-color: var(--secondary-button-hover-bg); border-color: var(--secondary-button-hover-border); color: #e0ecff; }
        #download-section button:active:not(:disabled) { transform: scale(0.97); }
        #download-section input:disabled, #download-section button:disabled { cursor: not-allowed; opacity: 0.6; background-color: rgba(255,255,255,0.05); box-shadow: none; border-color: var(--input-border); color: var(--text-placeholder); }
        #download-section button:disabled { background-color: rgba(80, 140, 255, 0.1); border-color: rgba(80, 140, 255, 0.2); color: rgba(205, 219, 255, 0.6); }

        /* --- Minimize Indicator (FAB Style - Script 1) --- */
        #minimize-indicator {
             position: fixed;
             bottom: 25px; /* Match panel anchor */
             right: 25px; /* Match panel anchor */
             width: var(--minimize-indicator-size); /* Script 1 variable */
             height: var(--minimize-indicator-size); /* Script 1 variable */
             background-color: var(--accent-blue); /* Script 1 color */
             color: white; border-radius: 50%; border: none;
             box-shadow: 0 5px 15px rgba(80, 140, 255, 0.3); /* Script 1 shadow */
             cursor: pointer; display: flex; /* Use flex for centering */
             align-items: center; justify-content: center;
             z-index: 10000; /* Below panel when open */
             transition: transform 0.2s ease-out, background-color 0.2s ease, box-shadow 0.2s ease;
             opacity: 1;
         }
        #minimize-indicator svg { width: 22px; height: 22px; }
        #minimize-indicator:hover { background-color: #6ea3ff; transform: scale(1.06); box-shadow: 0 7px 20px rgba(80, 140, 255, 0.35); }
        #minimize-indicator:active { transform: scale(0.96); }

        /* --- Ensure no conflicting overflow styles from Script 2 --- */
        #auto-chat-section, #auto-chat-content { overflow: visible; } /* Allow inner container to scroll */

    `);

    // --- Initialization Logic (From Script 1) ---
    const listenerAttachedAttribute = `data-arrive-listener-attached-${SCRIPT_VERSION.replace(/\./g, '-')}`; // Use updated version in attribute
    if (!document.body.hasAttribute(listenerAttachedAttribute)) {
        document.body.setAttribute(listenerAttachedAttribute, 'true');
        // Use arrive to wait for the textarea
        document.arrive(PROMPT_TEXTAREA_SELECTOR, { onceOnly: true, existing: true }, function() {
            console.log(`Auto ChatGPT: Prompt textarea found. Creating UI (v${SCRIPT_VERSION}).`);
            // Delay UI creation slightly to ensure page is fully ready
            setTimeout(createUI, 900); // Script 1 delay
        });
    } else {
        // Fallback/Re-initialization check if script reloads somehow
        if (document.querySelector(PROMPT_TEXTAREA_SELECTOR) && !document.getElementById('chatgpt-auto-dialogue-panel')) {
            console.log(`Auto ChatGPT: Re-initializing UI (v${SCRIPT_VERSION}).`);
            setTimeout(createUI, 200); // Shorter delay for re-init
        }
    }

})();