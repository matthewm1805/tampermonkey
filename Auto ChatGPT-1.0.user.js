// ==UserScript==
// @name         Auto ChatGPT
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Auto ChatGPT with Import/Export Template
// @author       Matthew M.
// @match        https://chatgpt.com/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @require      https://cdn.jsdelivr.net/npm/arrive@2.4.1/minified/arrive.min.js
// ==/UserScript==

(function() {
    'use strict';

    // --- LOGIC VARIABLES (No changes needed here) ---
    let currentPromptIndex = 0;
    let currentRepeatCount = 0;
    let dialogueData = [];
    let isAutomating = false;
    let stopRequested = false;
    let isMinimized = false;
    let isDraggingPanel = false;
    let dragStartX = 0; let dragStartY = 0;
    let initialPanelX = 0; let initialPanelY = 0;
    let currentPanelX = 0; let currentPanelY = 0;
    let rafPending = false;
    let fileInput = null; // Added for import

    // --- CONSTANTS (Update version) ---
    const SCRIPT_VERSION = "1.4"; // Updated version for import/export feature
    const PROMPT_TEXTAREA_SELECTOR = '#prompt-textarea';
    const SEND_BUTTON_SELECTOR = 'button#composer-submit-button, button[data-testid="send-button"]';
    const STOP_GENERATING_BUTTON_SELECTOR = 'button[data-testid="stop-button"]';
    const DIALOGUES_STORAGE_KEY = 'savedDialogues_v2_6_reorder'; // Keep key for compatibility
    const MINIMIZED_STATE_KEY = 'autoChatGPTMinimizedState_v2_6'; // Keep key for compatibility
    const WAIT_MIN_SECONDS_KEY = 'autoChatGPTWaitMinSec_v2_6'; // Keep key for compatibility
    const WAIT_MAX_SECONDS_KEY = 'autoChatGPTWaitMaxSec_v2_6'; // Keep key for compatibility
    const DEFAULT_WAIT_MIN_MS = 1000;
    const DEFAULT_WAIT_MAX_MS = 2000;
    const CODE_BLOCK_CONTAINER_SELECTOR = 'div.rounded-md.border-\\[0\\.5px\\].border-token-border-medium.relative';
    const CODE_BLOCK_HEADER_SELECTOR = 'div.flex.items-center.text-token-text-secondary.px-4.py-2.text-xs';
    const CODE_BLOCK_CONTENT_SELECTOR = 'code[class*="language-"]';
    const MAIN_PANEL_ID = 'chatgpt-auto-dialogue-panel';
    const CONTAINER_ID = 'dialogue-inputs-container';
    const ITEM_WRAPPER_CLASS = 'dialogue-input-wrapper';
    const MINIMIZE_DOT_ID = 'chatgpt-auto-minimize-dot';
    const ACTIVE_PROMPT_DOT_CLASS = 'active-prompt-indicator-dot';
    const PROMPT_NUMBER_CLASS = 'dialogue-prompt-number';
    const ANIMATION_DURATION_MS = 300; // Keep duration for item swap

    // --- SVG ICONS (No changes needed here) ---
    const TRASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M7 4V2H17V4H22V6H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V6H2V4H7ZM6 6V20H18V6H6ZM9 9H11V17H9V9ZM13 9H15V17H13V9Z"></path></svg>`;
    const PLUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z"></path></svg>`;
    const MINIMIZE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M5 11V13H19V11H5Z"></path></svg>`;
    const DOWNLOAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M13 10H18L12 16L6 10H11V3H13V10ZM4 18V20H20V18H4Z"></path></svg>`;
    // New SVGs for Import/Export
    const EXPORT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M4 19H20V12H22V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V12H4V19ZM12 16L18 10H13V3H11V10H6L12 16Z"></path></svg>`;
    const IMPORT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M4 19H20V12H22V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V12H4V19ZM13 9H18L12 3L6 9H11V16H13V9Z"></path></svg>`;
    const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M8 5V19L19 12L8 5Z"></path></svg>`;
    const STOP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M6 6H18V18H6V6Z"></path></svg>`;
    const UP_ARROW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M12 8L18 14H6L12 8Z"></path></svg>`;
    const DOWN_ARROW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M12 16L6 10H18L12 16Z"></path></svg>`;

    // --- UTILITY FUNCTIONS (No changes needed here) ---
    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    function generateUniqueId() { return Date.now().toString(36) + Math.random().toString(36).substring(2); }
    async function waitForElementToBeEnabled(element, timeout = 5000) { return new Promise((resolve, reject) => { const checkInterval = 200; let timeElapsed = 0; if (!element || !document.body.contains(element)) return reject(new Error(`Element not found or removed from DOM before waiting.`)); if (!element.disabled) return resolve(); const intervalId = setInterval(() => { if (!element || !document.body.contains(element)) { clearInterval(intervalId); return reject(new Error(`Element no longer in DOM while waiting.`)); } if (!element.disabled) { clearInterval(intervalId); resolve(); } else { timeElapsed += checkInterval; if (timeElapsed >= timeout) { clearInterval(intervalId); console.warn(`Element did not become enabled within ${timeout}ms.`); resolve(); } } }, checkInterval); }); }
    function getCurrentTimeString() { const now = new Date(); const hours = String(now.getHours()).padStart(2, '0'); const minutes = String(now.getMinutes()).padStart(2, '0'); const seconds = String(now.getSeconds()).padStart(2, '0'); return `${hours}:${minutes}:${seconds}`; }
    function getCurrentTimestampForFilename() { const now = new Date(); const year = now.getFullYear(); const month = String(now.getMonth() + 1).padStart(2, '0'); const day = String(now.getDate()).padStart(2, '0'); const hours = String(now.getHours()).padStart(2, '0'); const minutes = String(now.getMinutes()).padStart(2, '0'); const seconds = String(now.getSeconds()).padStart(2, '0'); return `${year}${month}${day}_${hours}${minutes}${seconds}`; }

    // --- UI & DATA FUNCTIONS (Minor changes in createUI, add disableDialogueEditing) ---
    function updatePromptNumbers() { const container = document.getElementById(CONTAINER_ID); if (!container) return; const wrappers = container.querySelectorAll(`:scope > .${ITEM_WRAPPER_CLASS}`); wrappers.forEach((wrapper, index) => { const numberSpan = wrapper.querySelector(`.${PROMPT_NUMBER_CLASS}`); if (numberSpan) { numberSpan.textContent = `${index + 1}`; } }); }

    function createUI() {
        if (document.getElementById(MAIN_PANEL_ID)) return;
        isMinimized = GM_getValue(MINIMIZED_STATE_KEY, false);

        // Create hidden file input for import
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', handleFileImport);
        document.body.appendChild(fileInput); // Needs to be in DOM to function

        const controlPanel = document.createElement('div');
        controlPanel.id = MAIN_PANEL_ID;
        controlPanel.className = isMinimized ? 'minimized' : '';
        // Updated HTML structure to include Import/Export buttons
        controlPanel.innerHTML = `
            <div id="panel-header" title="Kéo để di chuyển">
                <img src="https://www.svgrepo.com/show/306500/openai.svg" class="openai-logo" alt="OpenAI Logo">
                <span class="header-title">Auto ChatGPT</span>
                <span class="header-version">build ${SCRIPT_VERSION}</span>
                <button id="minimize-btn" class="panel-header-button" title="Thu nhỏ / Mở rộng">${MINIMIZE_SVG}</button>
            </div>
            <div id="auto-chat-section">
                <div class="section-header">
                    <span>Tự động trò chuyện</span>
                </div>
                <div id="auto-chat-content">
                    <div id="${CONTAINER_ID}">
                        <div id="dialogue-empty-state" style="display: none;">
                            <p>Chưa có câu thoại nào. Hãy thêm một câu!</p>
                            <button id="add-prompt-empty-btn" class="add-prompt-main-btn">
                                ${PLUS_SVG} Thêm câu thoại
                            </button>
                        </div>
                    </div>
                    <div id="dialogue-add-footer">
                        <button id="add-prompt-footer-btn" class="add-prompt-main-btn">
                            ${PLUS_SVG} Thêm câu thoại
                        </button>
                    </div>
                    <!-- START: Import/Export Buttons Section -->
                    <div id="template-actions-footer" class="template-actions-container">
                         <button id="import-template-btn" class="template-action-btn" title="Nhập template từ file JSON">
                            ${IMPORT_SVG} Nhập Template
                         </button>
                         <button id="export-template-btn" class="template-action-btn" title="Xuất template hiện tại ra file JSON">
                            ${EXPORT_SVG} Xuất Template
                         </button>
                    </div>
                    <!-- END: Import/Export Buttons Section -->
                    <div class="section-content-divider"></div>
                    <div id="automation-settings">
                        <label class="wait-label">Thời gian chờ từ</label>
                        <input type="number" id="min-wait-input" min="0" step="0.1" title="Giây tối thiểu">
                        <label class="wait-label">(s) đến</label>
                        <input type="number" id="max-wait-input" min="0" step="0.1" title="Giây tối đa">
                        <label class="wait-label">(s)</label>
                    </div>
                    <div class="controls-footer">
                        <button id="start-automation-btn" title="Bắt đầu gửi tự động">
                            ${PLAY_SVG} <span>Bắt đầu</span>
                        </button>
                        <button id="stop-automation-btn" style="display: none;" title="Dừng gửi tự động">
                            ${STOP_SVG} <span>Dừng</span>
                        </button>
                    </div>
                    <div id="automation-status">Chờ</div>
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

        const minimizeDot = document.createElement('div');
        minimizeDot.id = MINIMIZE_DOT_ID;
        minimizeDot.title = 'Mở Auto ChatGPT';
        minimizeDot.style.display = isMinimized ? 'flex' : 'none';
        document.body.appendChild(minimizeDot);

        updateEmptyStateVisibility();

        // --- Attach Event Listeners ---
        document.getElementById('panel-header').addEventListener('mousedown', handlePanelDragStart);
        document.addEventListener('mousemove', handlePanelDragMove);
        document.addEventListener('mouseup', handlePanelDragEnd);
        document.addEventListener('mouseleave', handlePanelDragEnd); // Handle mouse leaving window
        document.getElementById('minimize-btn').addEventListener('click', toggleMinimize);
        minimizeDot.addEventListener('click', toggleMinimize);
        document.getElementById('min-wait-input').addEventListener('input', saveWaitTimes);
        document.getElementById('max-wait-input').addEventListener('input', saveWaitTimes);
        document.getElementById('start-automation-btn').addEventListener('click', startAutomation);
        document.getElementById('stop-automation-btn').addEventListener('click', () => stopAutomation());
        document.getElementById('download-codeblock-btn').addEventListener('click', downloadCodeblockData);
        document.getElementById('add-prompt-footer-btn').addEventListener('click', () => addDialogueInput());
        document.getElementById('add-prompt-empty-btn').addEventListener('click', () => addDialogueInput());

        // --- Add Import/Export Listeners ---
        document.getElementById('import-template-btn').addEventListener('click', triggerImport);
        document.getElementById('export-template-btn').addEventListener('click', exportTemplate);

        loadDialogues();
        loadWaitTimes();
    }

    function toggleMinimize() { /* ... no change ... */ const panel = document.getElementById(MAIN_PANEL_ID); const dot = document.getElementById(MINIMIZE_DOT_ID); if (!panel || !dot) return; isMinimized = !isMinimized; if (isMinimized) { panel.classList.add('minimizing'); dot.style.display = 'flex'; setTimeout(() => { if(isMinimized) panel.classList.add('minimized'); }, ANIMATION_DURATION_MS); } else { panel.classList.remove('minimized'); panel.classList.remove('minimizing'); dot.style.display = 'none'; } GM_setValue(MINIMIZED_STATE_KEY, isMinimized); }
    function autoResizeTextarea(textarea) { /* ... no change ... */ if (!textarea) return; textarea.style.height = 'auto'; textarea.style.height = (textarea.scrollHeight + 2) + 'px'; }
    function updateDialogueDataArray() { /* ... no change ... */ const container = document.getElementById(CONTAINER_ID); if (!container) { dialogueData = []; return; } dialogueData = Array.from(container.querySelectorAll(`:scope > .${ITEM_WRAPPER_CLASS}`)) .map(wrapper => { const textarea = wrapper.querySelector('.dialogue-textarea'); const repeatInput = wrapper.querySelector('.repeat-input'); const promptId = wrapper.getAttribute('data-id'); const repeatValue = parseInt(repeatInput?.value || '1', 10); return { id: promptId, text: textarea?.value || '', repeat: repeatValue > 0 ? repeatValue : 1 }; }) .filter(item => item.id); }
    function updateEmptyStateVisibility() { /* ... no change ... */ const container = document.getElementById(CONTAINER_ID); const emptyState = document.getElementById('dialogue-empty-state'); const addFooterBtn = document.getElementById('add-prompt-footer-btn'); if (!container || !emptyState || !addFooterBtn) return; const hasPrompts = container.querySelector(`:scope > .${ITEM_WRAPPER_CLASS}`) !== null; emptyState.style.display = hasPrompts ? 'none' : 'flex'; addFooterBtn.style.display = hasPrompts ? 'flex' : 'none'; }
    function addDialogueInput(data = { text: '', repeat: 1 }, insertAfterElement = null) { /* ... no change ... */ const container = document.getElementById(CONTAINER_ID); if (!container) return; const promptId = data.id || generateUniqueId(); const inputWrapper = document.createElement('div'); inputWrapper.className = ITEM_WRAPPER_CLASS; inputWrapper.setAttribute('data-id', promptId); const promptNumberSpan = document.createElement('span'); promptNumberSpan.className = PROMPT_NUMBER_CLASS; inputWrapper.appendChild(promptNumberSpan); const activeDot = document.createElement('span'); activeDot.className = ACTIVE_PROMPT_DOT_CLASS; inputWrapper.appendChild(activeDot); const contentDiv = document.createElement('div'); contentDiv.className = 'dialogue-content'; const textarea = document.createElement('textarea'); textarea.className = 'dialogue-textarea'; textarea.placeholder = 'Nhập hoặc dán câu thoại...'; textarea.rows = 1; textarea.value = data.text || ''; textarea.addEventListener('input', () => { autoResizeTextarea(textarea); saveDialogues(); }); const controlsDiv = document.createElement('div'); controlsDiv.className = 'prompt-controls'; const repeatLabel = document.createElement('label'); repeatLabel.className = 'repeat-label'; repeatLabel.textContent = 'Lặp:'; repeatLabel.htmlFor = `repeat-${promptId}`; const repeatInput = document.createElement('input'); repeatInput.className = 'repeat-input'; repeatInput.type = 'number'; repeatInput.id = `repeat-${promptId}`; repeatInput.min = '1'; repeatInput.value = data.repeat > 0 ? data.repeat : 1; repeatInput.title = 'Số lần lặp lại câu thoại này'; repeatInput.addEventListener('change', saveDialogues); repeatInput.addEventListener('input', saveDialogues); const moveUpBtn = document.createElement('button'); moveUpBtn.className = 'move-up-btn icon-button'; moveUpBtn.title = 'Di chuyển lên'; moveUpBtn.innerHTML = UP_ARROW_SVG; moveUpBtn.addEventListener('click', handleMoveUp); const moveDownBtn = document.createElement('button'); moveDownBtn.className = 'move-down-btn icon-button'; moveDownBtn.title = 'Di chuyển xuống'; moveDownBtn.innerHTML = DOWN_ARROW_SVG; moveDownBtn.addEventListener('click', handleMoveDown); const addBtn = document.createElement('button'); addBtn.className = 'add-prompt-btn icon-button'; addBtn.title = 'Thêm câu thoại mới bên dưới'; addBtn.innerHTML = PLUS_SVG; addBtn.addEventListener('click', (e) => { const currentWrapper = e.currentTarget.closest(`.${ITEM_WRAPPER_CLASS}`); addDialogueInput(undefined, currentWrapper); }); const removeBtn = document.createElement('button'); removeBtn.className = 'remove-prompt-btn icon-button'; removeBtn.title = 'Xóa câu thoại này'; removeBtn.innerHTML = TRASH_SVG; removeBtn.addEventListener('click', (e) => { const wrapperToRemove = e.currentTarget.closest(`.${ITEM_WRAPPER_CLASS}`); if (wrapperToRemove && !isAutomating) { wrapperToRemove.remove(); updateDialogueDataArray(); saveDialogues(); updateEmptyStateVisibility(); updateMoveButtonStates(); updatePromptNumbers(); } }); controlsDiv.appendChild(repeatLabel); controlsDiv.appendChild(repeatInput); controlsDiv.appendChild(moveUpBtn); controlsDiv.appendChild(moveDownBtn); controlsDiv.appendChild(addBtn); controlsDiv.appendChild(removeBtn); contentDiv.appendChild(textarea); contentDiv.appendChild(controlsDiv); inputWrapper.appendChild(contentDiv); const emptyState = container.querySelector('#dialogue-empty-state'); if (insertAfterElement && container.contains(insertAfterElement)) { const nextSibling = insertAfterElement.nextElementSibling; if (nextSibling && nextSibling !== emptyState) { container.insertBefore(inputWrapper, nextSibling); } else if (emptyState) { container.insertBefore(inputWrapper, emptyState); } else { container.appendChild(inputWrapper); } } else if (emptyState) { container.insertBefore(inputWrapper, emptyState); } else { container.appendChild(inputWrapper); } autoResizeTextarea(textarea); updateDialogueDataArray(); updateEmptyStateVisibility(); updateMoveButtonStates(); updatePromptNumbers(); }
    function handleMoveUp(e) { /* ... no change ... */ const currentWrapper = e.currentTarget.closest(`.${ITEM_WRAPPER_CLASS}`); if (!currentWrapper || isAutomating) return; const previousWrapper = currentWrapper.previousElementSibling; if (previousWrapper && previousWrapper.classList.contains(ITEM_WRAPPER_CLASS)) { animateSwap(currentWrapper, previousWrapper, 'up'); } }
    function handleMoveDown(e) { /* ... no change ... */ const currentWrapper = e.currentTarget.closest(`.${ITEM_WRAPPER_CLASS}`); if (!currentWrapper || isAutomating) return; const nextWrapper = currentWrapper.nextElementSibling; if (nextWrapper && nextWrapper.classList.contains(ITEM_WRAPPER_CLASS)) { animateSwap(currentWrapper, nextWrapper, 'down'); } }

    // --- ANIMATION FUNCTION (No change) ---
    function animateSwap(elementToMove, swapTargetElement, direction) { /* ... no change ... */ const container = elementToMove.parentElement; if (!container || !swapTargetElement || !swapTargetElement.classList.contains(ITEM_WRAPPER_CLASS)) { console.warn("animateSwap: Invalid elements or target.", {elementToMove, swapTargetElement, direction}); return; } disableAllMoveButtons(true); const rectMove = elementToMove.getBoundingClientRect(); const rectTarget = swapTargetElement.getBoundingClientRect(); const margin = parseFloat(window.getComputedStyle(elementToMove).marginBottom) || 0; const distanceMove = rectTarget.top - rectMove.top; const distanceTarget = (direction === 'up') ? (rectMove.bottom + margin) - (rectTarget.bottom + margin) : (rectMove.top) - (rectTarget.top); elementToMove.style.transition = 'none'; swapTargetElement.style.transition = 'none'; elementToMove.style.transform = `translateY(${distanceMove}px)`; swapTargetElement.style.transform = `translateY(${distanceTarget}px)`; elementToMove.offsetWidth; if (direction === 'up') { container.insertBefore(elementToMove, swapTargetElement); } else { container.insertBefore(elementToMove, swapTargetElement.nextElementSibling); } requestAnimationFrame(() => { const easingFunction = 'cubic-bezier(0.4, 0, 0.2, 1)'; elementToMove.style.transition = `transform ${ANIMATION_DURATION_MS}ms ${easingFunction}`; swapTargetElement.style.transition = `transform ${ANIMATION_DURATION_MS}ms ${easingFunction}`; elementToMove.style.transform = ''; swapTargetElement.style.transform = ''; }); setTimeout(() => { elementToMove.style.transition = ''; swapTargetElement.style.transition = ''; elementToMove.style.transform = ''; swapTargetElement.style.transform = ''; updateDialogueDataArray(); saveDialogues(); updateMoveButtonStates(); disableAllMoveButtons(false); updatePromptNumbers(); }, ANIMATION_DURATION_MS + 10); }

    // --- MORE UI & DATA FUNCTIONS (No changes needed in logic) ---
    function updateMoveButtonStates() { /* ... no change ... */ const container = document.getElementById(CONTAINER_ID); if (!container) return; const wrappers = container.querySelectorAll(`:scope > .${ITEM_WRAPPER_CLASS}`); wrappers.forEach((wrapper, index) => { const moveUpBtn = wrapper.querySelector('.move-up-btn'); const moveDownBtn = wrapper.querySelector('.move-down-btn'); if (moveUpBtn) moveUpBtn.disabled = (index === 0); if (moveDownBtn) moveDownBtn.disabled = (index === wrappers.length - 1); }); }
    function disableAllMoveButtons(disabled) { /* ... no change ... */ const container = document.getElementById(CONTAINER_ID); if (!container) return; container.querySelectorAll('.move-up-btn, .move-down-btn').forEach(btn => { btn.disabled = disabled; btn.style.opacity = disabled ? '0.3' : '1'; btn.style.cursor = disabled ? 'not-allowed' : 'pointer'; }); }
    function saveDialogues() { /* ... no change ... */ try { updateDialogueDataArray(); GM_setValue(DIALOGUES_STORAGE_KEY, JSON.stringify(dialogueData)); } catch (e) { console.error("Lỗi khi lưu câu thoại:", e); updateStatus("Lỗi khi lưu câu thoại."); } }
    function loadDialogues() { /* ... no change ... */ const saved = GM_getValue(DIALOGUES_STORAGE_KEY); const container = document.getElementById(CONTAINER_ID); if (!container) return; container.querySelectorAll(`:scope > .${ITEM_WRAPPER_CLASS}`).forEach(el => el.remove()); let loadedData = []; if (saved) { try { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) { loadedData = parsed.filter(item => item && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.repeat === 'number' ); if(loadedData.length !== parsed.length) console.warn("Removed invalid saved items during load."); } else { console.warn("Saved dialogue data format is invalid (not an array)."); } } catch (e) { console.error("Error parsing saved dialogues:", e); } } let promptsAdded = false; if (loadedData.length > 0) { loadedData.forEach(data => addDialogueInput(data)); promptsAdded = true; } if (!promptsAdded && container.querySelectorAll(`:scope > .${ITEM_WRAPPER_CLASS}`).length === 0) { addDialogueInput(); } updateDialogueDataArray(); updateEmptyStateVisibility(); updateMoveButtonStates(); updatePromptNumbers(); }
    function saveWaitTimes() { /* ... no change ... */ const minInput = document.getElementById('min-wait-input'); const maxInput = document.getElementById('max-wait-input'); if (!minInput || !maxInput) return; let minSeconds = parseFloat(minInput.value) || 0; let maxSeconds = parseFloat(maxInput.value) || 0; if (minSeconds < 0) minSeconds = 0; if (maxSeconds < 0) maxSeconds = 0; if (minSeconds > maxSeconds) maxSeconds = minSeconds; if (minSeconds < 0) minSeconds = 0; minInput.value = minSeconds.toFixed(1); maxInput.value = maxSeconds.toFixed(1); GM_setValue(WAIT_MIN_SECONDS_KEY, minSeconds); GM_setValue(WAIT_MAX_SECONDS_KEY, maxSeconds); }
    function loadWaitTimes() { /* ... no change ... */ const minInput = document.getElementById('min-wait-input'); const maxInput = document.getElementById('max-wait-input'); if (!minInput || !maxInput) return; const minSeconds = GM_getValue(WAIT_MIN_SECONDS_KEY, DEFAULT_WAIT_MIN_MS / 1000); const maxSeconds = GM_getValue(WAIT_MAX_SECONDS_KEY, DEFAULT_WAIT_MAX_MS / 1000); minInput.value = minSeconds.toFixed(1); maxInput.value = maxSeconds.toFixed(1); }
    function handlePanelDragStart(e) { /* ... no change ... */ if (e.target.closest('button, .header-version, input, textarea, label, .section-header, .icon-button')) { return; } if (!e.target.closest('#panel-header')) { return; } const panel = document.getElementById(MAIN_PANEL_ID); if (!panel || isDraggingPanel) return; isDraggingPanel = true; panel.classList.add('panel-dragging'); panel.style.userSelect = 'none'; const rect = panel.getBoundingClientRect(); initialPanelX = rect.left; initialPanelY = rect.top; dragStartX = e.clientX; dragStartY = e.clientY; panel.style.position = 'fixed'; panel.style.bottom = 'auto'; panel.style.right = 'auto'; panel.style.top = initialPanelY + 'px'; panel.style.left = initialPanelX + 'px'; panel.style.transform = ''; currentPanelX = initialPanelX; currentPanelY = initialPanelY; }
    function handlePanelDragMove(e) { /* ... no change ... */ if (!isDraggingPanel) return; const deltaX = e.clientX - dragStartX; const deltaY = e.clientY - dragStartY; let targetX = initialPanelX + deltaX; let targetY = initialPanelY + deltaY; const panel = document.getElementById(MAIN_PANEL_ID); if (!panel) return; const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0); const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0); const panelWidth = panel.offsetWidth; const panelHeight = panel.offsetHeight; const padding = 10; targetX = Math.max(padding, Math.min(targetX, vw - panelWidth - padding)); targetY = Math.max(padding, Math.min(targetY, vh - panelHeight - padding)); currentPanelX = targetX; currentPanelY = targetY; if (!rafPending) { rafPending = true; requestAnimationFrame(updatePanelPosition); } }
    function updatePanelPosition() { /* ... no change ... */ if (!isDraggingPanel) { rafPending = false; return; } const panel = document.getElementById(MAIN_PANEL_ID); if (panel) { panel.style.transform = `translate(${currentPanelX - initialPanelX}px, ${currentPanelY - initialPanelY}px)`; } rafPending = false; }
    function handlePanelDragEnd(e) { /* ... no change ... */ if (!isDraggingPanel) return; isDraggingPanel = false; rafPending = false; const panel = document.getElementById(MAIN_PANEL_ID); if (panel) { panel.classList.remove('panel-dragging'); panel.style.userSelect = ''; const computedStyle = window.getComputedStyle(panel); const matrix = new DOMMatrixReadOnly(computedStyle.transform); const finalX = initialPanelX + matrix.m41; const finalY = initialPanelY + matrix.m42; panel.style.transform = ''; panel.style.left = finalX + 'px'; panel.style.top = finalY + 'px'; currentPanelX = finalX; currentPanelY = finalY; } }
    function updateStatus(message) { /* ... no change ... */ const statusDiv = document.getElementById('automation-status'); if (statusDiv) { statusDiv.textContent = `${message}`; } console.log(`Automation Status: ${message}`); }
    async function startAutomation() { /* ... no change ... */ updateDialogueDataArray(); const validPromptsData = dialogueData.filter(data => data?.text?.trim()); if (isAutomating) { updateStatus("Đang chạy..."); return; } if (validPromptsData.length === 0) { updateStatus("Không có câu thoại hợp lệ để gửi."); return; } document.querySelectorAll(`.${ITEM_WRAPPER_CLASS} .${PROMPT_NUMBER_CLASS}`).forEach(span => { span.style.display = 'none'; }); isAutomating = true; stopRequested = false; currentPromptIndex = 0; currentRepeatCount = 0; const startBtn = document.getElementById('start-automation-btn'); const stopBtn = document.getElementById('stop-automation-btn'); if (startBtn) startBtn.style.display = 'none'; if (stopBtn) stopBtn.style.display = 'flex'; disableDialogueEditing(true); disableWaitTimeEditing(true); disableDownloadFeature(true); updateStatus("Đang bắt đầu..."); await delay(500); setActivePromptHighlight(-1); processNextPrompt(); }
    function stopAutomation(completedSuccessfully = false) { /* ... no change ... */ isAutomating = false; if (!completedSuccessfully) { stopRequested = true; } const startBtn = document.getElementById('start-automation-btn'); const stopBtn = document.getElementById('stop-automation-btn'); if (startBtn) startBtn.style.display = 'flex'; if (stopBtn) stopBtn.style.display = 'none'; disableDialogueEditing(false); disableWaitTimeEditing(false); disableDownloadFeature(false); if (completedSuccessfully) { const timeString = getCurrentTimeString(); updateStatus(`Hoàn thành tất cả câu thoại lúc ${timeString}`); } else if (stopRequested) { updateStatus("Đã dừng bởi người dùng."); } updatePromptNumbers(); document.querySelectorAll(`.${ITEM_WRAPPER_CLASS} .${PROMPT_NUMBER_CLASS}`).forEach(span => { span.style.display = 'block'; }); setActivePromptHighlight(-1); }

    // --- UPDATE: Add Import/Export buttons to disable list ---
    function disableDialogueEditing(disabled) {
        const container = document.getElementById(CONTAINER_ID);
        if (!container) return;

        // Select all standard editing controls
        container.querySelectorAll(`.${ITEM_WRAPPER_CLASS} .dialogue-textarea, .${ITEM_WRAPPER_CLASS} .repeat-input, .${ITEM_WRAPPER_CLASS} .remove-prompt-btn, .${ITEM_WRAPPER_CLASS} .add-prompt-btn, .${ITEM_WRAPPER_CLASS} .move-up-btn, .${ITEM_WRAPPER_CLASS} .move-down-btn`)
            .forEach(el => {
                el.disabled = disabled;
                el.style.cursor = disabled ? 'not-allowed' : '';
                el.style.opacity = disabled ? '0.5' : '1';
            });

        // Disable main add buttons
        const addFooterBtn = document.getElementById('add-prompt-footer-btn');
        const addEmptyBtn = document.getElementById('add-prompt-empty-btn');
        if (addFooterBtn) {
            addFooterBtn.disabled = disabled;
            addFooterBtn.style.cursor = disabled ? 'not-allowed' : '';
            addFooterBtn.style.opacity = disabled ? '0.5' : '1';
        }
        if (addEmptyBtn) {
            addEmptyBtn.disabled = disabled;
            addEmptyBtn.style.cursor = disabled ? 'not-allowed' : '';
            addEmptyBtn.style.opacity = disabled ? '0.5' : '1';
        }

        // Disable Import/Export buttons
        const importBtn = document.getElementById('import-template-btn');
        const exportBtn = document.getElementById('export-template-btn');
        if (importBtn) {
            importBtn.disabled = disabled;
             importBtn.style.cursor = disabled ? 'not-allowed' : ''; // Added
             importBtn.style.opacity = disabled ? '0.5' : '1'; // Added
        }
        if (exportBtn) {
            exportBtn.disabled = disabled;
            exportBtn.style.cursor = disabled ? 'not-allowed' : ''; // Added
            exportBtn.style.opacity = disabled ? '0.5' : '1'; // Added
        }

        // Update move buttons state based on general disabled status
        if (!disabled) {
            updateMoveButtonStates(); // Re-enable specific move buttons if necessary
            disableAllMoveButtons(false); // Ensure all move buttons are generally enabled styling-wise
        } else {
            disableAllMoveButtons(true); // Disable all move buttons styling-wise
        }
    }

    function disableWaitTimeEditing(disabled) { /* ... no change ... */ const minInput = document.getElementById('min-wait-input'); const maxInput = document.getElementById('max-wait-input'); [minInput, maxInput].forEach(input => { if (input) { input.disabled = disabled; input.style.opacity = disabled ? '0.5' : '1'; input.style.cursor = disabled ? 'not-allowed' : ''; } }); }
    function disableDownloadFeature(disabled) { /* ... no change ... */ const input = document.getElementById('codeblock-id-input'); const button = document.getElementById('download-codeblock-btn'); if (input) { input.disabled = disabled; input.style.opacity = disabled ? '0.5' : '1'; input.style.cursor = disabled ? 'not-allowed' : ''; } if (button) { button.disabled = disabled; button.style.opacity = disabled ? '0.5' : '1'; button.style.cursor = disabled ? 'not-allowed' : ''; } }
    function setActivePromptHighlight(index) { /* ... no change ... */ const wrappers = document.querySelectorAll(`#${CONTAINER_ID} .${ITEM_WRAPPER_CLASS}`); wrappers.forEach((wrapper, i) => { const dot = wrapper.querySelector(`.${ACTIVE_PROMPT_DOT_CLASS}`); const numberSpan = wrapper.querySelector(`.${PROMPT_NUMBER_CLASS}`); wrapper.classList.remove('active-prompt'); if (i === index && isAutomating) { if (dot) dot.style.display = 'block'; if (numberSpan) numberSpan.style.display = 'none'; wrapper.classList.add('active-prompt'); } else { if (dot) dot.style.display = 'none'; if (numberSpan) { numberSpan.style.display = isAutomating ? 'none' : 'block'; } } }); }
    async function processNextPrompt() { /* ... no change ... */ if (!isAutomating || stopRequested) { if (stopRequested) { updateStatus("Đã dừng."); } else if (!isAutomating) { stopAutomation(true); } setActivePromptHighlight(-1); return; } let targetPromptIndex = -1; for (let i = currentPromptIndex; i < dialogueData.length; i++) { if (dialogueData[i]?.text?.trim()) { targetPromptIndex = i; break; } else { console.log(`Skipping empty prompt at index ${i}`); } } if (targetPromptIndex === -1) { stopAutomation(true); return; } currentPromptIndex = targetPromptIndex; setActivePromptHighlight(currentPromptIndex); const currentData = dialogueData[currentPromptIndex]; if (!currentData || typeof currentData.repeat !== 'number' || !currentData.text) { console.error("Invalid prompt data encountered at index:", currentPromptIndex, currentData); updateStatus(`Lỗi dữ liệu prompt #${currentPromptIndex + 1}. Bỏ qua.`); currentPromptIndex++; currentRepeatCount = 0; setActivePromptHighlight(-1); setTimeout(processNextPrompt, 100); return; } const totalRepeatsNeeded = currentData.repeat > 0 ? currentData.repeat : 1; const promptText = currentData.text.trim(); if (currentRepeatCount >= totalRepeatsNeeded) { currentPromptIndex++; currentRepeatCount = 0; setActivePromptHighlight(-1); setTimeout(processNextPrompt, 50); return; } currentRepeatCount++; const validPromptsBefore = dialogueData.slice(0, currentPromptIndex).filter(d => d?.text?.trim()).length; const currentValidPromptNumber = validPromptsBefore + 1; const totalValidPrompts = dialogueData.filter(d => d?.text?.trim()).length; updateStatus(`Đang gửi: Câu ${currentValidPromptNumber}/${totalValidPrompts} (Lần ${currentRepeatCount}/${totalRepeatsNeeded})`); try { await sendPromptToChatGPT(promptText); if (stopRequested) { console.log("Stop requested after sending prompt."); return; } updateStatus(`Đang chờ P/Hồi: Câu ${currentValidPromptNumber}/${totalValidPrompts} (Lần ${currentRepeatCount}/${totalRepeatsNeeded})`); await waitForChatGPTResponse(); if (stopRequested) { console.log("Stop requested while waiting for response."); return; } const minWaitSec = GM_getValue(WAIT_MIN_SECONDS_KEY, DEFAULT_WAIT_MIN_MS / 1000); const maxWaitSec = GM_getValue(WAIT_MAX_SECONDS_KEY, DEFAULT_WAIT_MAX_MS / 1000); const minWaitMs = minWaitSec * 1000; const maxWaitMs = Math.max(minWaitMs, maxWaitSec * 1000); const randomWaitMs = minWaitMs + Math.random() * (maxWaitMs - minWaitMs); const waitSeconds = (randomWaitMs / 1000).toFixed(1); updateStatus(`Đã nhận P/Hồi: Câu ${currentValidPromptNumber}/${totalValidPrompts} (Lần ${currentRepeatCount}/${totalRepeatsNeeded}). Chờ ${waitSeconds}s...`); await delay(randomWaitMs); if (stopRequested) { console.log("Stop requested during wait delay."); return; } setTimeout(processNextPrompt, 150); } catch (error) { console.error("Lỗi trong quá trình tự động hóa:", error); updateStatus(`Lỗi: ${error.message}. Dừng.`); stopAutomation(); } }
    async function sendPromptToChatGPT(text) { /* ... no change ... */ const textarea = document.querySelector(PROMPT_TEXTAREA_SELECTOR); if (!textarea) throw new Error("Không tìm thấy ô nhập liệu ChatGPT."); textarea.focus(); await delay(100); const currentContent = textarea.value || textarea.textContent || textarea.querySelector('p')?.textContent || ''; if (currentContent) { const editorInstanceClear = textarea.cmView?.view; if (editorInstanceClear?.dispatch) { try { const clearTransaction = editorInstanceClear.state.update({ changes: { from: 0, to: editorInstanceClear.state.doc.length, insert: '' }, selection: { anchor: 0 } }); editorInstanceClear.dispatch(clearTransaction); console.log("Used CodeMirror dispatch to clear text."); } catch (e) { console.warn("CodeMirror dispatch clear failed, using fallback.", e); textarea.value = ''; const pTagClear = textarea.querySelector('p'); if (pTagClear) pTagClear.textContent = ''; } } else { textarea.value = ''; const pTagClear = textarea.querySelector('p'); if (pTagClear) pTagClear.textContent = ''; } textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true })); textarea.dispatchEvent(new Event('change', { bubbles: true })); await delay(50); } const pTag = textarea.querySelector('p'); const editorInstance = textarea.cmView?.view; let success = false; if (editorInstance?.dispatch) { try { const transaction = editorInstance.state.update({ changes: { from: 0, to: editorInstance.state.doc.length, insert: text }, selection: { anchor: text.length }, scrollIntoView: true }); editorInstance.dispatch(transaction); success = true; console.log("Used CodeMirror dispatch to set text."); } catch (e) { console.warn("CodeMirror dispatch failed, trying fallback:", e); } } if (!success && pTag) { try { pTag.textContent = text; textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true })); textarea.dispatchEvent(new Event('change', { bubbles: true })); success = true; console.log("Used pTag.textContent to set text."); } catch (e) { console.warn("Setting pTag textContent failed, trying final fallback:", e); } } if (!success) { try { textarea.value = text; textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true })); textarea.dispatchEvent(new Event('change', { bubbles: true })); success = true; console.log("Used textarea.value to set text."); } catch (e) { console.error("Setting textarea value failed:", e); throw new Error("Không thể điền text vào ô nhập liệu."); } } await delay(450); let sendButton = null; const findAttempts = 10; const attemptDelay = 500; for (let i = 0; i < findAttempts; i++) { sendButton = document.querySelector(SEND_BUTTON_SELECTOR); if (sendButton && !sendButton.disabled && sendButton.offsetHeight > 0) { break; } if (i < findAttempts - 1) { console.log(`Send button not ready (Attempt ${i+1}/${findAttempts}, Disabled: ${sendButton?.disabled}, Visible: ${sendButton?.offsetHeight > 0}). Retrying...`); await delay(attemptDelay); } } if (!sendButton || sendButton.disabled || sendButton.offsetHeight === 0) { console.error("Send button final state:", { sendButton, disabled: sendButton?.disabled, visible: sendButton?.offsetHeight > 0 }); throw new Error("Không tìm thấy hoặc không thể sử dụng nút gửi sau nhiều lần thử."); } console.log("Clicking send button..."); sendButton.click(); await delay(250); }
    async function waitForChatGPTResponse() { /* ... no change ... */ return new Promise((resolve, reject) => { const timeout = 600000; const checkInterval = 250; let timeElapsed = 0; let generationDetected = false; let noStopButtonCount = 0; const noStopButtonThreshold = 20; const intervalId = setInterval(() => { if (stopRequested) { console.log("waitForChatGPTResponse: Stop requested, resolving early."); clearInterval(intervalId); resolve(); return; } timeElapsed += checkInterval; if (timeElapsed > timeout) { clearInterval(intervalId); console.error("waitForChatGPTResponse: Timeout waiting for response."); return reject(new Error("Hết thời gian chờ phản hồi từ ChatGPT.")); } const stopButton = document.querySelector(STOP_GENERATING_BUTTON_SELECTOR); const isGenerating = !!stopButton && stopButton.offsetHeight > 0; if (isGenerating) { if (!generationDetected) { console.log("waitForChatGPTResponse: Generation detected (stop button appeared)."); generationDetected = true; } noStopButtonCount = 0; } else { if (generationDetected) { noStopButtonCount++; console.log(`waitForChatGPTResponse: Stop button absent (count: ${noStopButtonCount}/${noStopButtonThreshold}).`); if (noStopButtonCount >= noStopButtonThreshold) { console.log("waitForChatGPTResponse: Stop button absent threshold reached after detection. Assuming response complete."); clearInterval(intervalId); resolve(); } } else { const sendButton = document.querySelector(SEND_BUTTON_SELECTOR); if (sendButton && !sendButton.disabled && sendButton.offsetHeight > 0 && timeElapsed > 1000) { console.warn("waitForChatGPTResponse: Stop button never detected, but send button is active again. Assuming completion/error."); clearInterval(intervalId); resolve(); } } } }, checkInterval); }); }
    function downloadCodeblockData() { /* ... no change ... */ const idInput = document.getElementById('codeblock-id-input'); if (!idInput) return; const targetId = idInput.value.trim(); if (!targetId) { updateStatus("Vui lòng nhập ID Code Block."); return; } updateStatus(`Đang tìm code block với ID: ${targetId}...`); const codeBlockContainers = document.querySelectorAll(CODE_BLOCK_CONTAINER_SELECTOR); let foundContents = []; let foundCount = 0; codeBlockContainers.forEach(container => { if (container.closest(`#${MAIN_PANEL_ID}`)) { return; } const header = container.querySelector(CODE_BLOCK_HEADER_SELECTOR); if (header && header.textContent?.trim() === targetId) { const codeContent = container.querySelector(CODE_BLOCK_CONTENT_SELECTOR); if (codeContent) { const rawText = codeContent.textContent || ""; const cleanedText = rawText.split('\n').map(line => line.trimEnd()).join('\n').trim(); if (cleanedText) { foundContents.push(cleanedText); foundCount++; console.log(`Found matching code block content for ID '${targetId}'.`); } else { console.log(`Found matching header for ID '${targetId}', but code content was empty.`); } } else { console.warn(`Found header matching ID '${targetId}' but no code content element ('${CODE_BLOCK_CONTENT_SELECTOR}') inside.`); } } }); if (foundCount === 0) { updateStatus(`Không tìm thấy code block nào với ID: ${targetId}.`); console.log(`No code blocks found matching ID '${targetId}'.`); return; } const compiledContent = foundContents.join('\n\n'); try { const blob = new Blob([compiledContent], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; const safeId = targetId.replace(/[^a-z0-9_\-\(\)]/gi, '_'); link.download = `codeblock_${safeId}_data.txt`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); updateStatus(`Đã tải ${foundCount} code block với ID: ${targetId}.`); console.log(`Successfully downloaded ${foundCount} code blocks for ID '${targetId}'.`); } catch (error) { console.error("Error creating/downloading file:", error); updateStatus("Lỗi khi tạo file tải về."); } }


    // --- NEW: Import/Export Functions ---
    function exportTemplate() {
        if (isAutomating) {
            updateStatus("Không thể xuất khi đang chạy tự động.");
            return;
        }
        updateDialogueDataArray(); // Ensure current data is captured
        if (dialogueData.length === 0) {
            updateStatus("Không có câu thoại nào để xuất.");
            return;
        }

        try {
            // Create a clean version for export (optional, but good practice)
            const exportData = dialogueData.map(item => ({
                text: item.text || '',
                repeat: item.repeat || 1
            }));
            const jsonData = JSON.stringify(exportData, null, 2); // Pretty print JSON
            const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const timestamp = getCurrentTimestampForFilename();
            link.download = `auto_chatgpt_template_${timestamp}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            updateStatus(`Đã xuất ${exportData.length} câu thoại.`);
            console.log(`Successfully exported ${exportData.length} dialogues.`);
        } catch (error) {
            console.error("Lỗi khi xuất template:", error);
            updateStatus("Lỗi khi xuất file template.");
        }
    }

    function triggerImport() {
        if (isAutomating) {
            updateStatus("Không thể nhập khi đang chạy tự động.");
            return;
        }
        if (fileInput) {
            fileInput.click(); // Open file chooser dialog
        } else {
             console.error("Import Error: File input element not found.");
             updateStatus("Lỗi: Không tìm thấy thành phần nhập file.");
        }
    }

    function handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) {
            console.log("Import cancelled by user.");
            // Reset file input value to allow re-selecting the same file
            if (fileInput) fileInput.value = null;
            return;
        }

        if (file.type !== 'application/json') {
            updateStatus("Lỗi: Chỉ chấp nhận file .json.");
            console.warn("Import rejected: Invalid file type", file.type);
            if (fileInput) fileInput.value = null;
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const content = e.target.result;
                const parsedData = JSON.parse(content);

                // --- Validation ---
                if (!Array.isArray(parsedData)) {
                    throw new Error("Định dạng JSON không hợp lệ (không phải là một mảng).");
                }

                const validatedData = [];
                for (const item of parsedData) {
                    if (item && typeof item.text === 'string' && typeof item.repeat === 'number' && item.repeat >= 1) {
                        validatedData.push({
                            id: generateUniqueId(), // Generate new ID on import
                            text: item.text,
                            repeat: Math.floor(item.repeat) // Ensure integer
                        });
                    } else {
                        console.warn("Bỏ qua mục không hợp lệ trong file JSON:", item);
                    }
                }

                if (validatedData.length === 0 && parsedData.length > 0) {
                     throw new Error("File JSON không chứa mục câu thoại hợp lệ.");
                }
                 if (validatedData.length === 0) {
                     updateStatus("File không chứa câu thoại nào hoặc định dạng không đúng.");
                     return;
                 }

                // --- Confirmation ---
                const confirmationMessage = `Bạn có chắc chắn muốn thay thế ${dialogueData.length} câu thoại hiện tại bằng ${validatedData.length} câu thoại từ file "${file.name}" không?`;
                if (!confirm(confirmationMessage)) {
                    updateStatus("Đã hủy nhập template.");
                    console.log("Import cancelled by user confirmation.");
                    return;
                }

                // --- Apply Import ---
                const container = document.getElementById(CONTAINER_ID);
                if (!container) {
                    console.error("Cannot import: Dialogue container not found.");
                    updateStatus("Lỗi: Không tìm thấy vùng chứa câu thoại.");
                    return;
                }

                // Clear existing dialogues
                container.querySelectorAll(`:scope > .${ITEM_WRAPPER_CLASS}`).forEach(el => el.remove());
                dialogueData = []; // Clear internal data array

                // Add imported dialogues
                validatedData.forEach(data => addDialogueInput(data));

                // Update UI and save
                saveDialogues(); // This calls updateDialogueDataArray internally now
                updateEmptyStateVisibility();
                updateMoveButtonStates();
                updatePromptNumbers();
                updateStatus(`Đã nhập thành công ${validatedData.length} câu thoại.`);
                console.log(`Successfully imported ${validatedData.length} dialogues.`);

            } catch (error) {
                console.error("Lỗi khi nhập template:", error);
                updateStatus(`Lỗi nhập: ${error.message}`);
            } finally {
                 // Reset file input value MUST be done regardless of success/failure
                 if (fileInput) fileInput.value = null;
            }
        };

        reader.onerror = function(e) {
            console.error("Lỗi đọc file:", e);
            updateStatus("Lỗi khi đọc file.");
            if (fileInput) fileInput.value = null; // Reset on error too
        };

        reader.readAsText(file);
    }


    // --- STYLES (Add styles for new buttons) ---
    GM_addStyle(`
         :root {
            --panel-width: 300px;
            --panel-max-height: calc(100vh - 45px);
            --minimize-dot-size: 18px;
            --border-radius-main: 15px;
            --border-radius-inner: 8px;
            --panel-blur: 15px;
            --panel-shadow: 0 14px 40px rgba(0, 0, 0, 0.4);
            --minimize-dot-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
            --input-focus-shadow: 0 0 0 2.5px rgba(80, 140, 255, 0.25);
            --active-dot-size: 8px;
            --active-dot-color: #ff4d4f;
            --panel-bg: rgba(35, 38, 43, 0.3);
            --panel-border-color: rgba(255, 255, 255, 0.1);
            --text-primary: #f5f5f7;
            --text-secondary: #aeb8c5;
            --text-placeholder: #818a96;
            --input-bg: rgba(255, 255, 255, 0.08);
            --input-border: rgba(255, 255, 255, 0.2);
            --input-focus-border: rgba(80, 140, 255, 0.7);
            --input-focus-bg: rgba(255, 255, 255, 0.1);
            --primary-button-bg: #ffffff;
            --primary-button-text: #1d1d1f;
            --stop-button-bg: #ff4d4f;
            --stop-button-text: #ffffff;
            --icon-color: #bec5d0;
            --icon-hover-color: #ffffff;
            --scrollbar-thumb: rgba(255, 255, 255, 0.35);
            --divider-color: rgba(255, 255, 255, 0.1);
            --font-main: "SF Pro Display", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            --accent-blue: #508cff;
            --minimize-dot-bg: #ffffff;
            --animation-duration: ${ANIMATION_DURATION_MS}ms;
            --transition-curve-fast: cubic-bezier(0.4, 0, 0.2, 1); /* Standard curve */
            --transition-curve-bounce: cubic-bezier(0.175, 0.885, 0.32, 1.275); /* Slight overshoot */
            --transition-duration-fast: 0.15s;
            --transition-duration-normal: 0.2s;
            --transition-duration-slow: var(--animation-duration); /* Align with swap animation */
         }

        @keyframes gentle-pulse {
            from { opacity: 0.6; transform: scale(0.95); box-shadow: 0 0 3px 0px rgba(255, 77, 79, 0.5); }
            to   { opacity: 1; transform: scale(1.05); box-shadow: 0 0 6px 1px rgba(255, 77, 79, 0.7); }
        }

        #${MAIN_PANEL_ID} {
            position: fixed; bottom: 20px; right: 20px;
            width: var(--panel-width); max-height: var(--panel-max-height);
            background: var(--panel-bg); backdrop-filter: blur(var(--panel-blur)) saturate(180%); -webkit-backdrop-filter: blur(var(--panel-blur)) saturate(180%);
            border: 1px solid var(--panel-border-color); border-radius: var(--border-radius-main);
            box-shadow: var(--panel-shadow); z-index: 10001;
            color: var(--text-primary); font-family: var(--font-main); font-size: 11px;
            display: flex; flex-direction: column; overflow: hidden; resize: none !important;
            transform-origin: bottom right; opacity: 1; visibility: visible; transform: scale(1);
            transition: transform var(--transition-duration-slow) var(--transition-curve-fast),
                        opacity var(--transition-duration-slow) var(--transition-curve-fast),
                        visibility 0s linear 0s;
            will-change: transform, opacity, visibility;
        }
         #${MAIN_PANEL_ID}.minimizing {
            transform: scale(0.05) translate(-15px, -15px); opacity: 0;
        }
         #${MAIN_PANEL_ID}.minimized {
            transform: scale(0.05) translate(-15px, -15px); opacity: 0;
            pointer-events: none; visibility: hidden;
            transition: transform var(--transition-duration-slow) var(--transition-curve-fast),
                        opacity var(--transition-duration-slow) var(--transition-curve-fast),
                        visibility 0s linear var(--transition-duration-slow);
        }
         .panel-dragging { cursor: grabbing !important; }

         #${MINIMIZE_DOT_ID} {
            position: fixed; bottom: 15px; right: 15px;
            width: var(--minimize-dot-size); height: var(--minimize-dot-size);
            background-color: var(--minimize-dot-bg); border-radius: 50%;
            box-shadow: var(--minimize-dot-shadow); cursor: pointer; z-index: 10002;
            display: flex; align-items: center; justify-content: center;
            opacity: 0.9; transform: scale(1);
            transition: transform var(--transition-duration-normal) var(--transition-curve-bounce),
                        opacity var(--transition-duration-normal) var(--transition-curve-fast);
         }
         #${MINIMIZE_DOT_ID}:hover { transform: scale(1.2); opacity: 1; }

        #panel-header { display: flex; align-items: center; gap: 9px; padding: 9px 15px; cursor: grab; user-select: none; flex-shrink: 0; background-color: transparent; }
        #panel-header:active { cursor: grabbing; }
        .openai-logo { width: 18px; height: 18px; flex-shrink: 0; filter: brightness(0) invert(1); }
        .header-title { font-size: 1.2em; font-weight: 600; margin-right: auto; }
        .header-version { font-size: 0.8em; color: var(--text-secondary); margin-right: 6px; opacity: 0.8; }
        .panel-header-button {
            background: transparent; border: none; color: var(--icon-color); padding: 4px; border-radius: 7px; cursor: pointer;
            display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex-shrink: 0;
            transition: background-color var(--transition-duration-fast) var(--transition-curve-fast),
                        color var(--transition-duration-fast) var(--transition-curve-fast);
        }
        .panel-header-button:hover { background-color: rgba(255, 255, 255, 0.1); color: var(--icon-hover-color); }
        .panel-header-button svg { width: 13px; height: 13px; }

        .panel-section-divider { height: 1px; background-color: var(--divider-color); margin: 0; flex-shrink: 0; }
        .panel-section-divider.thick { height: 1px; background-color: rgba(255, 255, 255, 0.12); margin: 3px 0; }
        .section-content-divider { height: 1px; background-color: var(--divider-color); margin: 9px 15px 6px 15px; flex-shrink: 0; }

        #auto-chat-section { display: flex; flex-direction: column; min-height: 0; flex-shrink: 1; flex-grow: 1; }
        .section-header { display: flex; align-items: center; gap: 8px; padding: 11px 15px; font-size: 1.05em; font-weight: 600; user-select: none; flex-shrink: 0; }
        #auto-chat-content { display: flex; flex-direction: column; overflow: visible; padding: 0; flex-shrink: 1; flex-grow: 1; }

        #${CONTAINER_ID} {
            overflow-y: auto; overflow-x: hidden; padding: 6px 15px;
            scrollbar-width: thin; scrollbar-color: var(--scrollbar-thumb) transparent;
            flex-grow: 1; min-height: 75px; max-height: 40vh;
            display: flex; flex-direction: column; margin-bottom: 4px; position: relative;
        }
        #${CONTAINER_ID}::-webkit-scrollbar { width: 6px; }
        #${CONTAINER_ID}::-webkit-scrollbar-track { background: transparent; margin: 4px 0; }
        #${CONTAINER_ID}::-webkit-scrollbar-thumb { background-color: var(--scrollbar-thumb); border-radius: 3px; border: 1.5px solid transparent; background-clip: content-box; }
        #${CONTAINER_ID}::-webkit-scrollbar-thumb:hover { background-color: rgba(255, 255, 255, 0.5); }

        #dialogue-empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 25px 15px; text-align: center; color: var(--text-secondary); flex-grow: 1; user-select: none; order: 999; }
        #dialogue-empty-state p { margin: 0 0 12px 0; font-size: 1em; }
        #dialogue-add-footer { padding: 6px 15px 6px 15px; flex-shrink: 0; display: flex; } /* Reduced bottom padding */

        .add-prompt-main-btn {
            width: 100%; padding: 8px 11px; font-size: 1em; border-radius: var(--border-radius-inner);
            background-color: transparent; color: var(--text-secondary); border: 1px dashed rgba(255, 255, 255, 0.25);
            cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px; font-weight: 500;
            transition: all var(--transition-duration-normal) var(--transition-curve-fast);
        }
        .add-prompt-main-btn:hover:not(:disabled) { background-color: rgba(255, 255, 255, 0.06); color: var(--text-primary); border-color: rgba(255, 255, 255, 0.4); border-style: solid; }
        .add-prompt-main-btn:active:not(:disabled) { transform: scale(0.98); }
        .add-prompt-main-btn:disabled { cursor: not-allowed; opacity: 0.5; }
        .add-prompt-main-btn svg { width: 11px; height: 11px; vertical-align: middle; margin-bottom: 1px; }

        /* --- NEW: Styles for Import/Export Container & Buttons --- */
        .template-actions-container {
            padding: 6px 15px 8px 15px; /* Top, sides, bottom */
            display: flex;
            gap: 8px; /* Space between buttons */
            flex-shrink: 0;
        }
        .template-action-btn {
            flex-grow: 1; /* Make buttons share space */
            padding: 7px 10px; /* Slightly less padding than main button */
            font-size: 0.95em; /* Slightly smaller text */
            border-radius: var(--border-radius-inner);
            background-color: rgba(255, 255, 255, 0.06); /* Subtle background */
            color: var(--text-secondary);
            border: 1px solid rgba(255, 255, 255, 0.18);
            cursor: pointer;
            text-align: center;
            font-weight: 500;
            display: inline-flex; /* Align icon and text */
            align-items: center;
            justify-content: center;
            gap: 5px;
            transition: all var(--transition-duration-normal) var(--transition-curve-fast);
        }
        .template-action-btn svg {
            width: 11px; height: 11px; fill: currentColor;
             vertical-align: middle; margin-bottom: 1px;
        }
        .template-action-btn:hover:not(:disabled) {
            background-color: rgba(255, 255, 255, 0.1);
            color: var(--text-primary);
            border-color: rgba(255, 255, 255, 0.3);
        }
        .template-action-btn:active:not(:disabled) {
            transform: scale(0.98);
            background-color: rgba(255, 255, 255, 0.08);
        }
        .template-action-btn:disabled {
            cursor: not-allowed !important; /* Ensure cursor style applies */
            opacity: 0.5 !important; /* Ensure opacity applies */
             background-color: rgba(255, 255, 255, 0.05);
             border-color: rgba(255, 255, 255, 0.15);
             color: var(--text-placeholder);
        }
        /* --- End New Styles --- */

        .${ITEM_WRAPPER_CLASS} {
            margin-bottom: 6px; padding: 6px; border-radius: var(--border-radius-inner); border: 1px solid transparent;
            background-color: transparent; order: 1; position: relative; overflow: visible;
            padding-left: 26px; will-change: transform;
            transition: background-color var(--transition-duration-fast) var(--transition-curve-fast),
                        border-color var(--transition-duration-fast) var(--transition-curve-fast);
        }
        .${ITEM_WRAPPER_CLASS}:hover { background-color: rgba(255, 255, 255, 0.04); }
        /* .${ITEM_WRAPPER_CLASS}.active-prompt { background-color: rgba(80, 140, 255, 0.05); } */

        .${PROMPT_NUMBER_CLASS} {
            position: absolute; left: 8px; top: 18px; font-size: 0.9em; font-weight: 500; color: var(--text-secondary);
            width: 20px; text-align: left; line-height: 1.2; display: block; user-select: none; z-index: 1;
            transition: opacity var(--transition-duration-normal) var(--transition-curve-fast);
        }

        .${ACTIVE_PROMPT_DOT_CLASS} {
            position: absolute; left: 8px; top: 18px; width: var(--active-dot-size); height: var(--active-dot-size);
            background-color: var(--active-dot-color); border-radius: 50%; box-shadow: 0 0 5px 1px rgba(255, 77, 79, 0.7);
            display: none; z-index: 2;
            animation: gentle-pulse 1.2s infinite alternate ease-in-out;
        }

        .dialogue-content { width: 100%; display: flex; flex-direction: column; gap: 6px; }
        .dialogue-textarea {
            width: 100%; box-sizing: border-box; padding: 8px 11px; border: 1px solid var(--input-border); border-radius: var(--border-radius-inner);
            background-color: var(--input-bg); color: var(--text-primary); resize: none; min-height: 36px;
            font-size: 1em; line-height: 1.45; overflow-y: hidden; font-family: inherit;
            transition: border-color var(--transition-duration-normal) var(--transition-curve-fast),
                        background-color var(--transition-duration-normal) var(--transition-curve-fast),
                        box-shadow var(--transition-duration-normal) var(--transition-curve-fast);
        }
        .dialogue-textarea::placeholder { color: var(--text-placeholder); }
        .dialogue-textarea:focus { outline: none; border-color: var(--input-focus-border); background-color: var(--input-focus-bg); box-shadow: var(--input-focus-shadow); }
        .dialogue-textarea:disabled { cursor: not-allowed; opacity: 0.6; background-color: rgba(255,255,255,0.05);}
        .prompt-controls { display: flex; align-items: center; gap: 5px; height: 24px; flex-shrink: 0; }
        .repeat-label { font-size: 0.9em; color: var(--text-secondary); white-space: nowrap; cursor: default; margin-left: 3px; margin-right: 0; }
        .repeat-input {
            width: 38px; padding: 3px 5px; margin-right: auto; border: 1px solid var(--input-border); border-radius: 6px;
            background-color: var(--input-bg); color: var(--text-primary); font-size: 0.9em; text-align: center; -moz-appearance: textfield;
            line-height: 1.3; height: 24px; box-sizing: border-box;
            transition: border-color var(--transition-duration-normal) var(--transition-curve-fast),
                        background-color var(--transition-duration-normal) var(--transition-curve-fast),
                        box-shadow var(--transition-duration-normal) var(--transition-curve-fast);
        }
        .repeat-input::-webkit-outer-spin-button, .repeat-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .repeat-input:focus { outline: none; border-color: var(--input-focus-border); background-color: var(--input-focus-bg); box-shadow: var(--input-focus-shadow); }
        .repeat-input:disabled { cursor: not-allowed; opacity: 0.6; background-color: rgba(255,255,255,0.05); }
        .icon-button {
            background: transparent; border: none; color: var(--icon-color); padding: 4px; border-radius: 6px; cursor: pointer;
            display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px;
            transition: background-color var(--transition-duration-fast) var(--transition-curve-fast),
                        color var(--transition-duration-fast) var(--transition-curve-fast),
                        transform var(--transition-duration-fast) var(--transition-curve-fast),
                        opacity var(--transition-duration-normal) var(--transition-curve-fast);
        }
        .icon-button svg { width: 11px; height: 11px; }
        .icon-button:hover:not(:disabled) { background-color: rgba(255, 255, 255, 0.1); color: var(--icon-hover-color); }
        .icon-button:active:not(:disabled) { transform: scale(0.92); }
        .icon-button:disabled { opacity: 0.3 !important; cursor: not-allowed !important; background-color: transparent !important; color: var(--icon-color) !important; }
        .remove-prompt-btn { color: #ff8787; }
        .remove-prompt-btn:hover:not(:disabled) { background-color: rgba(255, 77, 79, 0.15); color: #ffabab; }
        .add-prompt-btn { color: #adc6ff; }
        .add-prompt-btn:hover:not(:disabled) { background-color: rgba(173, 198, 255, 0.15); color: #dcecff; }
        .move-up-btn, .move-down-btn { color: var(--icon-color); }
        .move-up-btn:hover:not(:disabled), .move-down-btn:hover:not(:disabled) { background-color: rgba(255, 255, 255, 0.1); color: var(--icon-hover-color); }

        #automation-settings { padding: 10px 15px 8px 15px; display: flex; align-items: center; gap: 6px; flex-shrink: 0; font-size: 1em; color: var(--text-secondary); }
        #automation-settings label.wait-label { margin: 0; flex-shrink: 0; line-height: 1; }
        #automation-settings input[type="number"] {
            width: 42px; padding: 5px 6px; border: 1px solid var(--input-border); border-radius: 6px; background-color: var(--input-bg);
            color: var(--text-primary); font-size: 1em; text-align: center; -moz-appearance: textfield;
            transition: border-color var(--transition-duration-normal) var(--transition-curve-fast),
                        background-color var(--transition-duration-normal) var(--transition-curve-fast),
                        box-shadow var(--transition-duration-normal) var(--transition-curve-fast);
        }
        #automation-settings input[type="number"]::-webkit-outer-spin-button,
        #automation-settings input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        #automation-settings input[type="number"]:focus { outline: none; border-color: var(--input-focus-border); background-color: var(--input-focus-bg); box-shadow: var(--input-focus-shadow); }
        #automation-settings input[type="number"]:disabled { cursor: not-allowed; opacity: 0.6; background-color: rgba(255,255,255,0.05); }

        .controls-footer { padding: 9px 15px 12px 15px; display: flex; gap: 9px; flex-shrink: 0; }
        #start-automation-btn, #stop-automation-btn {
            padding: 8px 12px; font-size: 1.05em; flex-grow: 1; margin: 0; border-radius: var(--border-radius-inner); font-weight: 500;
            border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
            transition: background-color var(--transition-duration-normal) var(--transition-curve-fast),
                        color var(--transition-duration-normal) var(--transition-curve-fast),
                        box-shadow var(--transition-duration-normal) var(--transition-curve-fast),
                        transform var(--transition-duration-fast) var(--transition-curve-fast),
                        opacity var(--transition-duration-normal) var(--transition-curve-fast);
        }
        #start-automation-btn span, #stop-automation-btn span { line-height: 1; }
        #start-automation-btn svg, #stop-automation-btn svg { margin-bottom: -1px; vertical-align: middle; }
        #start-automation-btn:active:not(:disabled), #stop-automation-btn:active:not(:disabled) { transform: scale(0.97); }
        #start-automation-btn { background-color: var(--primary-button-bg); color: var(--primary-button-text); box-shadow: 0 2px 6px rgba(0,0,0,0.12); }
        #start-automation-btn:hover:not(:disabled) { background-color: #f5f5f7; }
        #start-automation-btn:active:not(:disabled) { box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
        #start-automation-btn:disabled { background-color: #e8e8ed; color: #abadaf; cursor: not-allowed; opacity: 0.7; box-shadow: none;}
        #stop-automation-btn { background-color: var(--stop-button-bg); color: var(--stop-button-text); box-shadow: 0 2px 6px rgba(255, 77, 79, 0.2); }
        #stop-automation-btn:hover:not(:disabled) { background-color: #f73d40; }
        #stop-automation-btn:active:not(:disabled) { box-shadow: 0 1px 2px rgba(255, 77, 79, 0.2); }
        #stop-automation-btn:disabled { background-color: #ff9496; cursor: not-allowed; opacity: 0.7; box-shadow: none;}

        #automation-status { padding: 9px 15px 10px 15px; font-size: 0.95em; text-align: center; color: var(--text-secondary); width: 100%; line-height: 1.4; min-height: calc(1.4em + 3px); flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box; border-top: 1px solid var(--divider-color); background-color: rgba(0,0,0,0.04); }

        #download-section { padding: 12px 15px 14px 15px; display: flex; align-items: center; gap: 9px; flex-shrink: 0; font-size: 1em; background-color: transparent; }
        #download-section label { margin-right: 3px; flex-shrink: 0; font-weight: 500; color: var(--text-secondary); cursor: help; }
        #download-section input[type="text"] {
            flex-grow: 1; padding: 6px 10px; border: 1px solid var(--input-border); border-radius: 6px; background-color: var(--input-bg);
            color: var(--text-primary); font-size: 1em; min-width: 60px;
            transition: border-color var(--transition-duration-normal) var(--transition-curve-fast),
                        background-color var(--transition-duration-normal) var(--transition-curve-fast),
                        box-shadow var(--transition-duration-normal) var(--transition-curve-fast);
        }
        #download-section input[type="text"]::placeholder { color: var(--text-placeholder); }
        #download-section input[type="text"]:focus { outline: none; border-color: var(--input-focus-border); background-color: var(--input-focus-bg); box-shadow: var(--input-focus-shadow); }
        #download-section button {
            padding: 6px 10px; font-size: 1em; border-radius: 6px; background-color: rgba(80, 140, 255, 0.18); color: #cddbff;
            border: 1px solid rgba(80, 140, 255, 0.4); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px;
            flex-shrink: 0; font-weight: 500;
            transition: background-color var(--transition-duration-normal) var(--transition-curve-fast),
                        color var(--transition-duration-normal) var(--transition-curve-fast),
                        border-color var(--transition-duration-normal) var(--transition-curve-fast),
                        transform var(--transition-duration-fast) var(--transition-curve-fast),
                        opacity var(--transition-duration-normal) var(--transition-curve-fast);
        }
        #download-section button svg { width: 12px; height: 12px; margin-bottom: -1px;}
        #download-section button span { line-height: 1; }
        #download-section button:hover:not(:disabled) { background-color: rgba(80, 140, 255, 0.25); border-color: rgba(80, 140, 255, 0.6); color: #e0ecff; }
        #download-section button:active:not(:disabled) { transform: scale(0.97); }
        #download-section input:disabled, #download-section button:disabled { cursor: not-allowed; opacity: 0.6; background-color: rgba(255,255,255,0.05); box-shadow: none; border-color: var(--input-border); color: var(--text-placeholder); }
        #download-section button:disabled { background-color: rgba(80, 140, 255, 0.1); border-color: rgba(80, 140, 255, 0.2); color: rgba(205, 219, 255, 0.6); }

        #auto-chat-section, #auto-chat-content { overflow: visible; }
    `);

    // --- INITIALIZATION (No changes needed here) ---
    const listenerAttachedAttribute = `data-arrive-listener-attached-${SCRIPT_VERSION.replace(/\./g, '-')}`;
    if (!document.body.hasAttribute(listenerAttachedAttribute)) {
        document.body.setAttribute(listenerAttachedAttribute, 'true');
        document.arrive(PROMPT_TEXTAREA_SELECTOR, { onceOnly: true, existing: true }, function() {
            console.log(`Auto ChatGPT: Prompt textarea found. Creating UI (v${SCRIPT_VERSION}).`);
            setTimeout(createUI, 900); // Delay slightly to ensure page elements are stable
        });
    } else {
         // If script re-runs (e.g., Tampermonkey update), check if UI needs creation
         if (document.querySelector(PROMPT_TEXTAREA_SELECTOR) && !document.getElementById(MAIN_PANEL_ID)) {
            console.log(`Auto ChatGPT: Re-initializing UI (v${SCRIPT_VERSION}).`);
            setTimeout(createUI, 200);
        }
    }

})();
