// ==UserScript==
// @name         🧠 Auto Sora
// @namespace    http://tampermonkey.net/
// @version      5.4.1
// @description  Auto generate prompt list, bulk download (PNG, multithreaded), single file download, auto crop (16:9, 9:16, 1:1), H/V/Square filter, Stop button, Find Similar Image, Auto-Submit (with UI disable toggle, 5-min timeout), Realtime Prompt Count, Glass UI, No prompt scrollbar, Enhanced Logging, Page Lock & Scroll Lock with Loading Indicator during run (Fix: Overlay timing)
// @author       Matthew M.
// @match        *://sora.com/*
// @match        *://www.sora.com/*
// @match        *://www.sora.*.com/*
// @match        *://sora.*.com/*
// @match        https://sora.chatgpt.com/*
// @updateURL    https://raw.githubusercontent.com/matthewm1805/tampermonkey/main/%F0%9F%A7%A0%20Auto%20Sora.user.js
// @downloadURL  https://raw.githubusercontent.com/matthewm1805/tampermonkey/main/%F0%9F%A7%A0%20Auto%20Sora.user.js
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// ==/UserScript==

(function () {
    'use strict';

    // --- Global Variables ---
    let promptQueue = [];
    let totalPromptCount = 0;
    let isRunning = false;
    let isGenerating = false;
    let countdownInterval = null;
    let cooldownTime = 130;
    let autoSubmitTimeoutId = null;
    let generationTimeoutId = null;
    const GENERATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    let selectedImageUrls = new Set();
    let isDownloading = false;
    let downloadErrors = 0;
    let isFindSimilarModeActive = false;
    let imageObserver = null;
    let completionObserver = null;
    let _generationIndicatorRemoved = false;
    let _newImagesAppeared = false;
    let pageOverlayElement = null;
    let originalBodyOverflow = '';
    let originalHtmlOverflow = '';
    let stylesInjected = false;

    // --- Logging Function ---
    function log(msg) {
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
        console.log(`[Auto Sora v5.4.1 ${timestamp}] ${msg}`); // <-- Updated version in log
    }

    // --- Inject CSS for Overlay Content ---
    function injectOverlayStyles() {
        if (stylesInjected) return;
        log("Injecting overlay CSS styles...");
        const style = document.createElement('style');
        style.textContent = `
            @keyframes sora-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .sora-overlay-spinner { border: 4px solid rgba(255, 255, 255, 0.2); border-top-color: #fff; border-radius: 50%; width: 40px; height: 40px; animation: sora-spin 1s linear infinite; margin-bottom: 25px; }
            .sora-overlay-text-main { color: #ffffff; font-size: 1.4em; font-weight: 500; text-shadow: 0 1px 3px rgba(0,0,0,0.4); margin-bottom: 8px; }
            .sora-overlay-text-sub { color: #e0e0e0; font-size: 0.9em; text-shadow: 0 1px 2px rgba(0,0,0,0.3); max-width: 80%; text-align: center; line-height: 1.4; }
        `;
        document.head.appendChild(style);
        stylesInjected = true;
         log("Overlay CSS styles injected.");
    }

    // --- Overlay & Scroll Lock Functions ---
    function createOverlay() {
        if (pageOverlayElement) return;
        injectOverlayStyles();
        log("Creating page lock overlay element...");
        pageOverlayElement = document.createElement('div');
        pageOverlayElement.id = 'sora-page-overlay';
        pageOverlayElement.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background-color: rgba(0, 0, 0, 0.45); z-index: 999990;
            opacity: 0; transition: opacity 0.3s ease;
            backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
            display: flex; flex-direction: column; justify-content: center;
            align-items: center; text-align: center; color: white;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            /* Start hidden */
            display: none;
        `;
        pageOverlayElement.innerHTML = `
            <div class="sora-overlay-spinner"></div>
            <div class="sora-overlay-text-main">Auto Sora đang chạy</div>
            <div class="sora-overlay-text-sub">Hãy truy cập Sora trên tab khác để tiếp tục thao tác</div>
        `;
        document.body.appendChild(pageOverlayElement);
        log("Page lock overlay appended to body with content.");
    }

    function showOverlay() {
        if (!pageOverlayElement) createOverlay();
        // Only proceed if the overlay isn't already fully visible
        if (pageOverlayElement && pageOverlayElement.style.opacity !== '1') {
            log("Showing page lock overlay and locking scroll.");
            originalBodyOverflow = document.body.style.overflow;
            originalHtmlOverflow = document.documentElement.style.overflow;
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';

            pageOverlayElement.style.display = 'flex'; // Set display before transition
            void pageOverlayElement.offsetWidth; // Force reflow
            pageOverlayElement.style.opacity = '1';
        }
    }

    function hideOverlay() {
        // Only proceed if the overlay exists and is currently visible or fading out
        if (pageOverlayElement && pageOverlayElement.style.display !== 'none') {
            // Check if scroll is currently locked by this script
            const bodyLocked = document.body.style.overflow === 'hidden';
            const htmlLocked = document.documentElement.style.overflow === 'hidden';

            if (pageOverlayElement.style.opacity !== '0') {
                 log("Hiding page lock overlay.");
                 pageOverlayElement.style.opacity = '0';
            }

            // Unlock scroll immediately if locked
            if (bodyLocked) {
                document.body.style.overflow = originalBodyOverflow;
            }
             if (htmlLocked) {
                 document.documentElement.style.overflow = originalHtmlOverflow;
             }
             // Clear stored values only after restoring
             originalBodyOverflow = '';
             originalHtmlOverflow = '';


            // Set display to none after the transition finishes
            setTimeout(() => {
                // Check again in case hideOverlay was called multiple times quickly
                if (pageOverlayElement && pageOverlayElement.style.opacity === '0') {
                   pageOverlayElement.style.display = 'none';
                   log("Overlay display set to none.");
                }
            }, 300);
        } else {
             // Ensure scroll is unlocked even if overlay wasn't visible
             if (document.body.style.overflow === 'hidden') {
                log("Scroll was locked, unlocking as overlay hide is requested (overlay not visible).");
                document.body.style.overflow = originalBodyOverflow; // Attempt restore
                originalBodyOverflow = '';
            }
             if (document.documentElement.style.overflow === 'hidden') {
                 document.documentElement.style.overflow = originalHtmlOverflow; // Attempt restore
                 originalHtmlOverflow = '';
             }
        }
    }
    // --- End Overlay & Scroll Lock Functions ---

    function getTimestamp() { const now = new Date(); const pad = n => String(n).padStart(2, '0'); return `${pad(now.getDate())}${pad(now.getMonth() + 1)}${String(now.getFullYear()).slice(2)}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`; }
    function triggerDownload(blob, filename) { const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = filename; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(link.href); log(`Download triggered: ${filename} (Size: ${(blob.size / 1024).toFixed(1)} KB)`); }

    function updateImageSelection() { /* ... no changes ... */ log("Updating image selections based on filter changes..."); let changedCount = 0; let initialSelectedSize = selectedImageUrls.size; try { const filterHorizState = document.getElementById('sora-select-horizontal')?.checked ?? false; const filterVertState = document.getElementById('sora-select-vertical')?.checked ?? false; const filterSquareState = document.getElementById('sora-select-square')?.checked ?? false; const deselectAll = !filterHorizState && !filterVertState && !filterSquareState; document.querySelectorAll("div[data-index]").forEach(gridItem => { const checkbox = gridItem.querySelector(".sora-image-checkbox"); const img = gridItem.querySelector("a > img"); if (!checkbox || !img) return; let shouldBeChecked = checkbox.checked; const wasChecked = checkbox.checked; const imgSrc = img.src; if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) { const imgWidth = img.naturalWidth; const imgHeight = img.naturalHeight; const isHoriz = imgWidth > imgHeight; const isVert = imgHeight > imgWidth; const isSquare = imgWidth === imgHeight; if (deselectAll) { shouldBeChecked = false; } else { shouldBeChecked = (filterHorizState && isHoriz) || (filterVertState && isVert) || (filterSquareState && isSquare); } if (checkbox.checked !== shouldBeChecked) { checkbox.checked = shouldBeChecked; changedCount++; } if (shouldBeChecked) { selectedImageUrls.add(imgSrc); } else { selectedImageUrls.delete(imgSrc); } } else if (!img.complete) { if (checkbox.checked) selectedImageUrls.add(imgSrc); else selectedImageUrls.delete(imgSrc); } else { if (checkbox.checked) { checkbox.checked = false; changedCount++; } selectedImageUrls.delete(imgSrc); } }); updateSelectedCount(); log(`Selection updated via filters. ${changedCount} checkboxes changed state. Total selected: ${selectedImageUrls.size} (was ${initialSelectedSize}).`); } catch (e) { log("ERROR during image selection update:"); console.error(e); } }
    function toggleCooldownInputState() { /* ... no changes ... */ const autoCheckbox = document.getElementById('sora-auto-submit-checkbox'); const cooldownInput = document.getElementById('sora-cooldown-time'); const cooldownLabel = cooldownInput?.previousElementSibling; if (!autoCheckbox || !cooldownInput) return; const isAuto = autoCheckbox.checked; if (isAuto) { cooldownInput.disabled = true; cooldownInput.style.opacity = '0.5'; cooldownInput.style.cursor = 'not-allowed'; if (cooldownLabel) cooldownLabel.style.opacity = '0.5'; } else { cooldownInput.disabled = false; cooldownInput.style.opacity = '1'; cooldownInput.style.cursor = 'auto'; if (cooldownLabel) cooldownLabel.style.opacity = '1'; } }
    function updateStartButtonPromptCount() { /* ... no changes ... */ const textarea = document.getElementById('sora-input'); const startButton = document.getElementById('sora-start'); if (!textarea || !startButton) return; const prompts = textarea.value.split('\n').map(x => x.trim()).filter(Boolean); const count = prompts.length; startButton.textContent = `▶ Bắt đầu (${count})`; }

    function createUI() {
        log("Creating main UI...");
        const wrapper = document.createElement('div'); wrapper.id = 'sora-auto-ui';
        wrapper.style.cssText = `position: fixed; bottom: 15px; left: 20px; background: rgba(35, 35, 40, 0.65); backdrop-filter: blur(10px) saturate(180%); -webkit-backdrop-filter: blur(10px) saturate(180%); padding: 20px 20px 15px 20px; border-radius: 16px; z-index: 999999; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.37); width: 330px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; border: 1px solid rgba(255, 255, 255, 0.12); color: #e0e0e0; transition: opacity 0.3s ease, transform 0.3s ease; opacity: 1; transform: scale(1); display: block;`;
        wrapper.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;"> <h3 style="margin: 0; font-size: 17px; display: flex; align-items: center; gap: 10px; color: #ffffff; font-weight: 500;"> <img src="https://www.svgrepo.com/show/306500/openai.svg" width="22" height="22" style="filter: invert(1);" alt="OpenAI Logo"/> Auto Sora <span style="font-size: 9px; opacity: 0.6; font-weight: 300; margin-left: -5px;">build 5.4.1</span> </h3> <button id="sora-close" style=" background: rgba(80, 80, 80, 0.4); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 2px 6px; font-size: 16px; color: rgba(255, 255, 255, 0.7); cursor: pointer; transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease; " onmouseover="this.style.backgroundColor='rgba(100, 100, 100, 0.6)'; this.style.color='rgba(255, 255, 255, 0.9)'; this.style.borderColor='rgba(255, 255, 255, 0.15)'" onmouseout="this.style.backgroundColor='rgba(80, 80, 80, 0.4)'; this.style.color='rgba(255, 255, 255, 0.7)'; this.style.borderColor='rgba(255, 255, 255, 0.1)'" title="Đóng bảng điều khiển">✕</button> </div>
            <label style="font-size: 13px; color: #bdbdbd; font-weight: 400; margin-bottom: 5px; display: block;">Nhập danh sách prompt:</label> <textarea rows="5" id="sora-input" placeholder="Mỗi dòng tương ứng với một prompt..." style="width: 100%; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.25); border-radius: 10px; resize: vertical; font-size: 14px; color: #e0e0e0; margin-top: 0px; margin-bottom: 12px; box-sizing: border-box; min-height: 80px; overflow-y: hidden;"></textarea>
            <div style="display: flex; align-items: center; margin-bottom: 15px; gap: 8px;"> <label style="font-size: 13px; color: #bdbdbd; font-weight: 400; margin-right: 0px; white-space: nowrap; transition: opacity 0.3s ease;">⏱ Cooldown:</label> <input id="sora-cooldown-time" type="number" min="1" value="${cooldownTime}" style="flex-grow: 0.5; width: 60px; padding: 8px 10px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.25); color: #e0e0e0; border-radius: 10px; font-size: 14px; box-sizing: border-box; margin-right: 35px; transition: opacity 0.3s ease, cursor 0.3s ease;" title="Thời gian chờ giữa các prompt khi chế độ 'Auto' tắt"/> <label title="Tự động gửi prompt tiếp theo sau 1 giây khi ảnh tạo xong (hoặc sau 5 phút nếu bị kẹt)" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="checkbox" id="sora-auto-submit-checkbox" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;"/> Auto </label> </div>
            <div style="display: flex; gap: 10px; margin-bottom: 20px;"> <button id="sora-start" style=" flex: 1; background: rgba(60, 130, 250, 0.5); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); color: white; padding: 10px; border: 1px solid rgba(60, 130, 250, 0.6); border-radius: 10px; cursor: pointer; font-weight: 500; transition: background-color 0.2s ease, border-color 0.2s ease; ">▶ Bắt đầu (0)</button> <button id="sora-clear" style=" flex: 1; background: rgba(80, 80, 80, 0.5); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); color: #d0d0d0; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; cursor: pointer; transition: background-color 0.2s ease, border-color 0.2s ease; " onmouseover="this.style.backgroundColor='rgba(100, 100, 100, 0.6)'; this.style.borderColor='rgba(255, 255, 255, 0.2)'" onmouseout="this.style.backgroundColor='rgba(80, 80, 80, 0.5)'; this.style.borderColor='rgba(255, 255, 255, 0.15)'">🗑️ Xóa</button> </div>
            <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 18px 0;" />
            <div style="font-size: 13px; color: #bdbdbd; margin-bottom: 12px; font-weight: 400;">Chọn ảnh tải về:</div> <div style="display: flex; gap: 18px; margin-bottom: 15px; flex-wrap: wrap; justify-content: flex-start; align-items: center;"> <label title="Chỉ chọn các ảnh có chiều ngang lớn hơn chiều dọc" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="checkbox" id="sora-select-horizontal" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;" /> Ảnh ngang </label> <label title="Chỉ chọn các ảnh có chiều dọc lớn hơn chiều ngang" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="checkbox" id="sora-select-vertical" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;" /> Ảnh dọc </label> <label title="Chỉ chọn các ảnh có chiều rộng bằng chiều cao" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="checkbox" id="sora-select-square" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;" /> Ảnh vuông </label> </div>
            <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 18px 0;" />
            <div style="font-size: 13px; color: #bdbdbd; margin-bottom: 10px; font-weight: 400;">Tùy chọn Crop ảnh khi tải:</div> <div id="sora-crop-options" style="display: flex; flex-direction: row; flex-wrap: wrap; gap: 15px; margin-bottom: 15px;"> <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="none" checked style="cursor: pointer; accent-color: #4a90e2; transform: scale(1.1);" /> Gốc </label> <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="16:9" style="cursor: pointer; accent-color: #4a90e2; transform: scale(1.1);" /> 16:9 </label> <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="9:16" style="cursor: pointer; accent-color: #4a90e2; transform: scale(1.1);" /> 9:16 </label> <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="1:1" style="cursor: pointer; accent-color: #4a90e2; transform: scale(1.1);" /> 1:1 </label> </div>
            <div style="display: flex; gap: 10px; margin-top: 20px; align-items: stretch;"> <button id="sora-download-images" style=" flex-grow: 1; background: rgba(46, 160, 67, 0.5); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); color: white; padding: 11px; border: 1px solid rgba(46, 160, 67, 0.6); border-radius: 10px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease; font-weight: 500; " onmouseover="if(!this.disabled) { this.style.backgroundColor='rgba(46, 160, 67, 0.7)'; this.style.borderColor='rgba(46, 160, 67, 0.8)'; }" onmouseout="if(!this.disabled) { this.style.backgroundColor='rgba(46, 160, 67, 0.5)'; this.style.borderColor='rgba(46, 160, 67, 0.6)'; }"> <svg id="sora-download-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-download" viewBox="0 0 16 16" style="display: inline;"> <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"/> <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z"/> </svg> <span id="sora-download-text">Tải hình (0)</span> </button> <button id="sora-find-similar-button" title="Kích hoạt chế độ tìm ảnh tương tự" style=" flex-shrink: 0; background: rgba(80, 80, 90, 0.5); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); color: white; padding: 11px 14px; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: background-color 0.2s ease, border-color 0.2s ease; " onmouseover="if(!this.classList.contains('active')) { this.style.backgroundColor='rgba(100, 100, 110, 0.6)'; this.style.borderColor='rgba(255, 255, 255, 0.2)'; }" onmouseout="if(!this.classList.contains('active')) { this.style.backgroundColor='rgba(80, 80, 90, 0.5)'; this.style.borderColor='rgba(255, 255, 255, 0.15)'; }"> <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-cursor-fill" viewBox="0 0 16 16"> <path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.103z"/> </svg> </button> </div>
            <style> #sora-download-images:disabled { background: rgba(80, 80, 80, 0.3) !important; border-color: rgba(255, 255, 255, 0.08) !important; color: rgba(255, 255, 255, 0.4) !important; backdrop-filter: blur(2px) saturate(100%); -webkit-backdrop-filter: blur(2px) saturate(100%); opacity: 0.6; cursor: not-allowed; } #sora-find-similar-button.active { background-color: rgba(60, 130, 250, 0.65) !important; border-color: rgba(60, 130, 250, 0.8) !important; } </style>
            <div id="sora-download-progress" style="display: none;"></div>
            <div id="sora-download-error" style="font-size: 11px; color: #ff8a8a; text-align: center; margin-top: 5px; font-weight: 400;"></div>
        `;
        document.body.appendChild(wrapper);
        log("Main UI elements appended to body.");
        // Event Listeners & Drag Logic
        let isDragging = false; let offsetX, offsetY; function dragMouseDown(e) { if (pageOverlayElement && pageOverlayElement.style.display !== 'none') return; if (e.button !== 0) return; const targetTagName = e.target.tagName.toLowerCase(); const isInteractive = ['input', 'button', 'textarea', 'svg', 'span', 'label', 'img'].includes(targetTagName) || e.target.closest('button, input, textarea, a, label[style*="cursor: pointer"], img'); if (isInteractive) { return; } log("Drag mouse down started on UI panel."); isDragging = true; wrapper.style.cursor = 'grabbing'; const rect = wrapper.getBoundingClientRect(); offsetX = e.clientX - rect.left; offsetY = e.clientY - rect.top; wrapper.style.bottom = 'auto'; wrapper.style.top = `${rect.top}px`; wrapper.style.left = `${rect.left}px`; document.addEventListener('mousemove', elementDrag); document.addEventListener('mouseup', closeDragElement); e.preventDefault(); } function elementDrag(e) { if (isDragging) { e.preventDefault(); const newTop = e.clientY - offsetY; const newLeft = e.clientX - offsetX; wrapper.style.top = `${newTop}px`; wrapper.style.left = `${newLeft}px`; } } function closeDragElement() { if (isDragging) { log("Drag mouse up, ending drag."); isDragging = false; wrapper.style.cursor = 'grab'; document.removeEventListener('mousemove', elementDrag); document.removeEventListener('mouseup', closeDragElement); } } wrapper.addEventListener('mousedown', dragMouseDown); wrapper.style.cursor = 'grab';
        log("Drag listeners added to UI panel.");
        // Button/Input Listeners
        document.getElementById('sora-start').addEventListener('click', handleStart);
        document.getElementById('sora-clear').addEventListener('click', handleClear);
        document.getElementById('sora-close').addEventListener('click', handleClose);
        document.getElementById('sora-download-images').addEventListener('click', handleDownload);
        document.getElementById('sora-find-similar-button').addEventListener('click', toggleFindSimilarMode);
        document.getElementById('sora-select-horizontal').addEventListener('change', updateImageSelection);
        document.getElementById('sora-select-vertical').addEventListener('change', updateImageSelection);
        document.getElementById('sora-select-square').addEventListener('change', updateImageSelection);
        document.getElementById('sora-auto-submit-checkbox').addEventListener('input', toggleCooldownInputState);
        document.getElementById('sora-input').addEventListener('input', updateStartButtonPromptCount);
        log("Event listeners added to UI controls.");
        // Initial state
        toggleCooldownInputState();
        updateStartButtonPromptCount();
        createAuxiliaryUI(); // Creates aux UI and overlay placeholder
        log("Auxiliary UI and Overlay created.");
    }

    function createAuxiliaryUI() {
        log("Creating auxiliary UI (progress, cooldown, stop)...");
        const auxContainer = document.createElement('div'); auxContainer.id = 'sora-aux-controls-container';
        auxContainer.style.cssText = `position: fixed; bottom: 15px; left: 20px; z-index: 999998; display: none; align-items: center; gap: 10px; transition: opacity 0.3s ease; opacity: 1;`;
        const glassItemStyle = `background: rgba(45, 45, 50, 0.7); backdrop-filter: blur(8px) saturate(150%); -webkit-backdrop-filter: blur(8px) saturate(150%); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 8px 14px; font-size: 13px; color: #d5d5d5; display: none; white-space: nowrap; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2); transition: background-color 0.2s ease, border-color 0.2s ease;`; const progress = document.createElement('div'); progress.id = 'sora-progress'; progress.style.cssText = glassItemStyle; progress.textContent = 'Đang xử lý...'; auxContainer.appendChild(progress); const cooldownBtn = document.createElement('button'); cooldownBtn.id = 'sora-cooldown'; cooldownBtn.style.cssText = glassItemStyle + `cursor: default;`; cooldownBtn.textContent = `⏳ Cooldown: --s`; auxContainer.appendChild(cooldownBtn); const stopBtn = document.createElement('button'); stopBtn.id = 'sora-stop-button'; stopBtn.style.cssText = glassItemStyle + `background: rgba(200, 50, 60, 0.7); border-color: rgba(255, 99, 132, 0.4); color: white; cursor: pointer; font-weight: 500;`; stopBtn.textContent = '🛑 Dừng'; stopBtn.title = 'Dừng gửi prompt và lưu các prompt còn lại'; stopBtn.onclick = handleStop; stopBtn.onmouseover = function () { this.style.backgroundColor = 'rgba(220, 53, 69, 0.8)'; this.style.borderColor = 'rgba(255, 99, 132, 0.6)'; }; stopBtn.onmouseout = function () { this.style.backgroundColor = 'rgba(200, 50, 60, 0.7)'; this.style.borderColor = 'rgba(255, 99, 132, 0.4)'; }; auxContainer.appendChild(stopBtn); document.body.appendChild(auxContainer);
        const miniBtn = document.createElement('div'); miniBtn.id = 'sora-minibtn'; miniBtn.style.cssText = `position: fixed; bottom: 15px; left: 20px; width: 16px; height: 16px; background: rgba(255, 255, 255, 0.8); border-radius: 50%; cursor: pointer; z-index: 999999; box-shadow: 0 0 8px rgba(255, 255, 255, 0.5); display: none; border: 1px solid rgba(255, 255, 255, 0.3); transition: background-color 0.2s ease;`; miniBtn.onmouseover = function () { this.style.backgroundColor = 'rgba(255, 255, 255, 1)'; }; miniBtn.onmouseout = function () { this.style.backgroundColor = 'rgba(255, 255, 255, 0.8)'; }; miniBtn.title = 'Mở lại Auto Sora'; miniBtn.onclick = handleMiniButtonClick; document.body.appendChild(miniBtn);
        log("Auxiliary UI appended to body.");
        createOverlay(); // Create overlay element now
    }

    function handleStart() {
        log("Start button clicked.");
        const input = document.getElementById('sora-input').value;
        const prompts = input.split('\n').map(x => x.trim()).filter(Boolean);
        const isAuto = document.getElementById('sora-auto-submit-checkbox')?.checked ?? false;
        let currentCooldown = cooldownTime;

        if (!isAuto) {
            const cooldownInput = parseInt(document.getElementById('sora-cooldown-time').value);
            currentCooldown = isNaN(cooldownInput) ? cooldownTime : Math.max(1, cooldownInput);
            cooldownTime = currentCooldown;
            log(`Manual mode selected. Cooldown set to ${currentCooldown}s.`);
        } else {
            log(`Auto mode selected. Manual cooldown input ignored.`);
        }

        if (prompts.length === 0) {
            log("Start cancelled: No prompts entered.");
            return alert("❗ Nhập ít nhất 1 prompt.");
        }
        if (isRunning) { log("Start cancelled: Process already running."); return; }

        log(`Starting process with ${prompts.length} prompts. Auto-Submit: ${isAuto}.`);
        promptQueue = prompts;
        totalPromptCount = prompts.length;
        isRunning = true;
        isGenerating = false;

        // --- Show Overlay/Lock Scroll & Hide Main UI ---
        showOverlay(); // <-- Only called here now!
        // --- End ---

        const mainUI = document.getElementById('sora-auto-ui');
        if (mainUI) {
            log("Hiding main UI panel.");
            mainUI.style.opacity = '0';
            mainUI.style.transform = 'scale(0.95)';
            setTimeout(() => { mainUI.style.display = 'none'; }, 300);
        }
        document.getElementById('sora-minibtn').style.display = 'none';

        const auxContainer = document.getElementById('sora-aux-controls-container');
        const progressEl = document.getElementById('sora-progress');
        const cooldownEl = document.getElementById('sora-cooldown');
        const stopBtn = document.getElementById('sora-stop-button');
        if (auxContainer) auxContainer.style.display = 'flex';
        if (progressEl) progressEl.style.display = 'inline-block';
        if (cooldownEl) cooldownEl.style.display = isAuto ? 'none' : 'inline-block';
        if (stopBtn) stopBtn.style.display = 'inline-block';
        log("Auxiliary UI controls made visible.");

        updateProgress(); // Update text display
        startLoop();
    }

    function handleClear() { /* ... no changes ... */ log("Clear button clicked."); document.getElementById('sora-input').value = ''; updateStartButtonPromptCount(); log("Prompt input cleared and button count updated."); }
    function handleClose() { /* ... no changes ... */ log("Close button clicked."); const wrapper = document.getElementById('sora-auto-ui'); if (!wrapper) return; wrapper.style.opacity = '0'; wrapper.style.transform = 'scale(0.95)'; setTimeout(() => { wrapper.style.display = 'none'; if (!isRunning) { const miniBtn = document.getElementById('sora-minibtn'); if (miniBtn) miniBtn.style.display = 'block'; log("Main UI hidden, mini button shown."); } }, 300); }
    function handleMiniButtonClick() { /* ... no changes ... */ log("Mini button clicked."); if (!isRunning) { const wrapper = document.getElementById('sora-auto-ui'); const miniBtn = document.getElementById('sora-minibtn'); if (wrapper) { wrapper.style.display = 'block'; void wrapper.offsetWidth; wrapper.style.opacity = '1'; wrapper.style.transform = 'scale(1)'; log("Main UI restored."); } if (miniBtn) miniBtn.style.display = 'none'; const auxContainer = document.getElementById('sora-aux-controls-container'); if (auxContainer) auxContainer.style.display = 'none'; hideOverlay(); /* Hide overlay & unlock scroll */ } else { log("Cannot open UI while process is running."); } }

    function handleStop() {
        log("Stop button clicked.");
        if (!isRunning) { log("Process is not running, stop ignored."); return; }
        hideOverlay(); // Hide overlay & unlock scroll first

        isRunning = false;
        isGenerating = false;
        // ... rest of stop logic ...
        _generationIndicatorRemoved = false;
        _newImagesAppeared = false;
        completionObserver?.disconnect();
        log("Completion observer disconnected.");
        if (autoSubmitTimeoutId) { clearTimeout(autoSubmitTimeoutId); autoSubmitTimeoutId = null; log("Cleared pending auto-submit timeout."); }
        if (generationTimeoutId) { clearTimeout(generationTimeoutId); generationTimeoutId = null; log("Cleared pending generation timeout."); }
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; const cooldownBtn = document.getElementById('sora-cooldown'); if (cooldownBtn) cooldownBtn.textContent = 'Cooldown: --'; log("Cooldown timer cleared."); }
        const done = totalPromptCount - promptQueue.length;
        const progressEl = document.getElementById('sora-progress');
        if (progressEl) { progressEl.textContent = `Đã dừng: ${done} / ${totalPromptCount}`; log(`Process stopped manually after ${done} prompts.`); }
        if (promptQueue.length > 0) { saveRemainingPromptsToFile(); }
        else { log("No remaining prompts to save."); }
        setTimeout(() => {
            if (!isRunning) {
                const auxContainer = document.getElementById('sora-aux-controls-container');
                if (auxContainer) auxContainer.style.display = 'none';
                const miniBtn = document.getElementById('sora-minibtn');
                if (miniBtn) miniBtn.style.display = 'block';
                log("Auxiliary UI hidden, mini button shown after stop.");
                totalPromptCount = 0;
            }
        }, 4000);
    }

    function saveRemainingPromptsToFile() { /* ... no changes ... */ if (!promptQueue || promptQueue.length === 0) { log("Attempted to save prompts, but queue is empty."); return; } log(`Saving ${promptQueue.length} remaining prompts to file...`); const content = promptQueue.join('\n'); const blob = new Blob([content], { type: 'text/plain;charset=utf-8' }); const filename = `AutoSora_remaining_${getTimestamp()}.txt`; try { triggerDownload(blob, filename); log("Remaining prompts file download triggered."); } catch (e) { log("ERROR triggering download for remaining prompts file:"); console.error(e); } }

    function updateProgress() {
        const progressEl = document.getElementById('sora-progress');
        const auxContainer = document.getElementById('sora-aux-controls-container');
        const cooldownEl = document.getElementById('sora-cooldown');
        const stopBtn = document.getElementById('sora-stop-button');
        const isAuto = document.getElementById('sora-auto-submit-checkbox')?.checked ?? false;

        if (!progressEl || !auxContainer) { return; }
        const done = totalPromptCount - promptQueue.length;

        if (isRunning) {
            // --- Removed showOverlay() from here ---
            let statusText = `Đã gửi: ${done} / ${totalPromptCount}`;
            progressEl.textContent = statusText;
            if (auxContainer.style.display !== 'flex') auxContainer.style.display = 'flex';
            if (progressEl.style.display !== 'inline-block') progressEl.style.display = 'inline-block';
            if (cooldownEl) cooldownEl.style.display = (isAuto || isGenerating) ? 'none' : 'inline-block';
            if (stopBtn && stopBtn.style.display !== 'inline-block') stopBtn.style.display = 'inline-block';
            // No need to call showOverlay() here anymore
        } else {
            // Script stopped or finished
            if (totalPromptCount > 0 && done === totalPromptCount) {
                progressEl.textContent = `Hoàn thành: ${done} / ${totalPromptCount}.`;
                log(`Finished processing all ${totalPromptCount} prompts.`);
            } else if (totalPromptCount > 0 && progressEl.textContent.indexOf('Đã dừng') === -1) {
                progressEl.textContent = `Đã dừng: ${done} / ${totalPromptCount}.`;
                log(`Process stopped or finished incompletely after ${done} prompts (updateProgress check).`);
            } else if (totalPromptCount === 0 && progressEl.textContent.indexOf('Đã dừng') === -1) {
                 progressEl.textContent = 'Chưa chạy/Đã dừng.';
                 log("Progress updated: Idle/Stopped state.");
            }

            setTimeout(() => {
                if (!isRunning) { // Check again
                    hideOverlay(); // Hide overlay & unlock scroll
                    if (auxContainer) auxContainer.style.display = 'none';
                    const wrapper = document.getElementById('sora-auto-ui');
                    const miniBtn = document.getElementById('sora-minibtn');
                    if (wrapper && wrapper.style.display === 'none' && miniBtn) {
                        miniBtn.style.display = 'block';
                        log("Auxiliary UI hidden, overlay hidden/scroll unlocked, mini button shown after completion/stop.");
                    } else {
                         log("Auxiliary UI hidden, overlay hidden/scroll unlocked after completion/stop.");
                    }
                    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
                    if (totalPromptCount > 0 && done === totalPromptCount) {
                         totalPromptCount = 0;
                         log("Reset totalPromptCount after successful completion.");
                     }
                }
            }, 4000); // Existing delay
        }
    }

    // --- Rest of the functions (startCountdown, submitPrompt, handleGenerationComplete, processNextPrompt, startLoop, download logic, image logic, find similar, initialization) remain the same as v5.4 ---
    function startCountdown() { /* ... */ let timeRemaining = cooldownTime; const cooldownBtn = document.getElementById('sora-cooldown'); if (!cooldownBtn || !isRunning || isGenerating) { log(`startCountdown skipped (running: ${isRunning}, generating: ${isGenerating}, btn: ${!!cooldownBtn})`); return; } log(`Starting manual cooldown timer: ${timeRemaining}s`); cooldownBtn.textContent = `⏳ ${timeRemaining}s`; cooldownBtn.style.display = 'inline-block'; if (countdownInterval) clearInterval(countdownInterval); countdownInterval = setInterval(() => { if (!isRunning || isGenerating) { clearInterval(countdownInterval); countdownInterval = null; const currentBtn = document.getElementById('sora-cooldown'); if (currentBtn) { currentBtn.textContent = `⏳ --`; currentBtn.style.display = 'none'; } log(`Countdown stopped/interrupted (running: ${isRunning}, generating: ${isGenerating}).`); return; } timeRemaining--; const currentBtn = document.getElementById('sora-cooldown'); if (currentBtn) currentBtn.textContent = `⏳ ${timeRemaining}s`; if (timeRemaining <= 0) { clearInterval(countdownInterval); countdownInterval = null; log("Manual cooldown finished."); if (currentBtn) { currentBtn.textContent = `⏳ 0s`; setTimeout(() => { if (currentBtn && !isGenerating) currentBtn.style.display = 'none'; }, 500); } processNextPrompt(); } }, 1000); }
    function submitPrompt(prompt) { /* ... */ if (!isRunning) { log("submitPrompt cancelled: Not running."); return; } const textarea = document.querySelector('textarea[placeholder*="Describe"], textarea.flex.w-full'); if (!textarea) { log("ERROR: Prompt textarea not found. Stopping."); handleStop(); return; } log(`Submitting prompt ${totalPromptCount - promptQueue.length}/${totalPromptCount}: ${prompt.substring(0, 50)}...`); textarea.value = prompt; log("Dispatching input and change events on textarea..."); textarea.dispatchEvent(new Event('input', { bubbles: true })); textarea.dispatchEvent(new Event('change', { bubbles: true })); const key = Object.keys(textarea).find(k => k.startsWith("__reactProps$")); if (key && textarea[key]?.onChange) { try { log("Triggering React onChange..."); textarea[key].onChange({ target: textarea }); } catch (e) { log("ERROR triggering React onChange:"); console.error(e); } } else { log("WARNING: React onChange handler not found for textarea."); } log("Waiting 600ms for submit button to enable..."); setTimeout(() => { if (!isRunning) { log("Submit button click cancelled: Not running."); return; } const btn = document.querySelector('button[data-disabled="false"][class*="bg-token-bg-inverse"]'); if (btn) { log("Submit button found and enabled. Setting flags, starting observer, clicking..."); isGenerating = true; _generationIndicatorRemoved = false; _newImagesAppeared = false; updateProgress(); const gridContainer = document.querySelector('div[class*="max-w-"][class*="flex-col"]') ?? document.body; if (completionObserver) { try { completionObserver.observe(gridContainer, { childList: true, subtree: true }); log(`Completion observer started observing ${gridContainer.tagName === 'BODY' ? 'document body' : 'grid container'}.`); } catch (e) { log(`ERROR starting completion observer: ${e.message}`); console.error(e); } } else { log(`ERROR: Completion observer not initialized.`); } log("Attempting button click..."); const btnKey = Object.keys(btn).find(k => k.startsWith("__reactProps$")); if (btnKey && btn[btnKey]?.onClick) { try { btn[btnKey].onClick({ bubbles: true, cancelable: true, isTrusted: true }); log("React onClick triggered."); } catch (e) { log("ERROR triggering React onClick:"); console.error(e); log("Attempting standard .click() as fallback..."); btn.click(); } } else { log("WARNING: React onClick handler not found on button. Attempting standard .click()."); btn.click(); } if (generationTimeoutId) { clearTimeout(generationTimeoutId); log("Cleared previous generation timeout before starting new one."); } generationTimeoutId = setTimeout(() => { if (!isRunning || !isGenerating) { log("Generation timeout callback fired, but state changed. Ignoring."); generationTimeoutId = null; return; } log(`ERROR: Generation TIMEOUT (${GENERATION_TIMEOUT_MS / 1000}s) reached for current prompt. Assuming failure and proceeding to next.`); isGenerating = false; completionObserver?.disconnect(); _generationIndicatorRemoved = false; _newImagesAppeared = false; generationTimeoutId = null; updateProgress(); processNextPrompt(); }, GENERATION_TIMEOUT_MS); log(`Generation timeout started (${GENERATION_TIMEOUT_MS / 1000}s). ID: ${generationTimeoutId}`); } else { log("ERROR: Submit button (data-disabled='false') not found after delay. Stopping."); handleStop(); } }, 600); }
    function handleGenerationComplete() { /* ... */ if (!isGenerating || !isRunning) { log(`handleGenerationComplete called but state is not correct (generating: ${isGenerating}, running: ${isRunning}). Ignoring.`); return; } if (generationTimeoutId) { clearTimeout(generationTimeoutId); log(`Generation completed before timeout. Timeout ${generationTimeoutId} cancelled.`); generationTimeoutId = null; } else { log("Generation completed, but no active timeout ID found (might have already timed out or been cleared)."); } log("Generation complete confirmed by observer. Handling next step..."); isGenerating = false; completionObserver?.disconnect(); log("Completion observer disconnected."); updateProgress(); if (autoSubmitTimeoutId) { clearTimeout(autoSubmitTimeoutId); autoSubmitTimeoutId = null; } const isAuto = document.getElementById('sora-auto-submit-checkbox')?.checked ?? false; if (isAuto) { if (promptQueue.length > 0) { log("Auto mode: Scheduling next prompt in 1 second."); autoSubmitTimeoutId = setTimeout(() => { autoSubmitTimeoutId = null; if (isRunning) { log("Auto-submit timer fired."); processNextPrompt(); } else { log("Auto-submit timer fired but process was stopped."); } }, 1000); } else { log("Auto mode: Queue empty after generation. Process finished."); isRunning = false; updateProgress(); } } else { log("Manual mode: Generation finished."); if (promptQueue.length > 0) { log("Manual mode: Starting cooldown timer for next prompt."); startCountdown(); } else { log("Manual mode: Queue empty after generation. Process finished."); isRunning = false; updateProgress(); } } }
    function processNextPrompt() { /* ... */ if (!isRunning) { log("processNextPrompt: Aborted, not running."); updateProgress(); return; } if (isGenerating) { log("processNextPrompt: Aborted, already generating."); return; } if (promptQueue.length === 0) { log("processNextPrompt: Queue is empty. Finishing run."); isRunning = false; updateProgress(); return; } if (autoSubmitTimeoutId) { clearTimeout(autoSubmitTimeoutId); autoSubmitTimeoutId = null; log("Cleared autoSubmitTimeoutId in processNextPrompt."); } if (generationTimeoutId) { clearTimeout(generationTimeoutId); generationTimeoutId = null; log("Cleared generationTimeoutId in processNextPrompt."); } if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; log("Cleared countdownInterval in processNextPrompt."); } const nextPrompt = promptQueue.shift(); log(`Processing prompt ${totalPromptCount - promptQueue.length + 1}/${totalPromptCount}...`); submitPrompt(nextPrompt); updateProgress(); }
    function startLoop() { /* ... */ if (!isRunning || promptQueue.length === 0) { log("startLoop: Condition not met."); isRunning = false; updateProgress(); return; } log(`Starting loop: Submitting first prompt (1/${totalPromptCount}).`); processNextPrompt(); }
    function updateSelectedCount() { const count = selectedImageUrls.size; try { const btnText = document.getElementById("sora-download-text"); const btn = document.getElementById("sora-download-images"); const icon = document.getElementById("sora-download-icon"); const errorEl = document.getElementById("sora-download-error"); if (btnText && btn && !isDownloading) { btnText.textContent = `Tải hình (${count})`; btn.disabled = (count === 0); if (icon) icon.style.display = 'inline'; if (errorEl) errorEl.textContent = ''; } else if (btn) { btn.disabled = true; } } catch (e) { log("ERROR updating selected count UI:"); console.error(e); } const btn = document.getElementById("sora-download-images"); if (btn && !isDownloading) { btn.disabled = (selectedImageUrls.size === 0); } }
    async function handleDownload() { /* ... */ log("Download button clicked."); const btn = document.getElementById("sora-download-images"); const btnText = document.getElementById("sora-download-text"); const btnIcon = document.getElementById("sora-download-icon"); const errorEl = document.getElementById("sora-download-error"); if (!btn || !btnText || !btnIcon || !errorEl) { log("ERROR: Download UI elements not found."); return; } if (isDownloading) { log("Download stop requested."); isDownloading = false; btnText.textContent = `Đang dừng...`; return; } const urlsToDownload = Array.from(selectedImageUrls); if (urlsToDownload.length === 0) { log("Download skipped: No images selected."); errorEl.textContent = "Chưa có ảnh nào được chọn."; setTimeout(() => { if (!isDownloading && errorEl) errorEl.textContent = ''; }, 3000); return; } isDownloading = true; downloadErrors = 0; let successfulCount = 0; const totalFiles = urlsToDownload.length; const selectedCropOption = document.querySelector('input[name="sora-crop-option"]:checked')?.value ?? 'none'; btn.disabled = true; btnIcon.style.display = 'none'; btnText.textContent = `Chuẩn bị... (0/${totalFiles})`; errorEl.textContent = ''; log(`Starting download of ${totalFiles} images. Crop: ${selectedCropOption}`); if (totalFiles === 1) { log("Processing single image download..."); const url = urlsToDownload[0]; btnText.textContent = `Đang xử lý 1 ảnh...`; try { const blob = await convertWebpToPngBlob(url, selectedCropOption); if (blob && isDownloading) { const timestamp = getTimestamp(); const filename = `AutoSora_${selectedCropOption}_${timestamp}.png`; triggerDownload(blob, filename); btnText.textContent = `Đã tải xong 1 ảnh`; successfulCount = 1; } else if (!blob && isDownloading) { downloadErrors = 1; errorEl.textContent = `Lỗi xử lý ảnh. Kiểm tra Console.`; btnText.textContent = `Lỗi tải ảnh`; } else if (!isDownloading) { errorEl.textContent = `Đã dừng tải.`; btnText.textContent = `Đã dừng tải`; } } catch (err) { if (isDownloading) { downloadErrors = 1; log(`ERROR processing single image (${url.substring(0, 30)}...): ${err.message}`); console.error(err); errorEl.textContent = `Lỗi xử lý ảnh. Kiểm tra Console.`; btnText.textContent = `Lỗi tải ảnh`; } else { errorEl.textContent = `Đã dừng tải.`; btnText.textContent = `Đã dừng tải`; } } finally { const wasDownloading = isDownloading; isDownloading = false; if (btnIcon) btnIcon.style.display = 'inline'; setTimeout(() => { if (!isDownloading) updateSelectedCount(); }, 5000); log(`Single image download process finished (was downloading: ${wasDownloading}). Success: ${successfulCount}, Errors: ${downloadErrors}`); } return; } log("Processing multiple images concurrently..."); let processedImageCount = 0; btnText.textContent = `Đang xử lý ảnh: 0/${totalFiles} (0%)`; const conversionPromises = urlsToDownload.map((url, index) => { return convertWebpToPngBlob(url, selectedCropOption) .then(blob => { if (isDownloading) { processedImageCount++; const percentage = ((processedImageCount / totalFiles) * 100).toFixed(0); btnText.textContent = `Đang xử lý ảnh: ${processedImageCount}/${totalFiles} (${percentage}%)`; } return blob; }) .catch(error => { if (isDownloading) { processedImageCount++; const percentage = ((processedImageCount / totalFiles) * 100).toFixed(0); btnText.textContent = `Đang xử lý ảnh: ${processedImageCount}/${totalFiles} (${percentage}%)`; log(`ERROR processing image ${processedImageCount}/${totalFiles}: ${error.message}`); } throw error; }); }); const results = await Promise.allSettled(conversionPromises); if (!isDownloading) { log("Download stopped during image processing phase."); errorEl.textContent = "Đã dừng tải."; btnText.textContent = "Đã dừng tải"; if(btnIcon) btnIcon.style.display = 'inline'; setTimeout(() => { if (!isDownloading) updateSelectedCount(); }, 5000); return; } log("All image processing settled. Preparing ZIP..."); btnText.textContent = `Đã xử lý ${totalFiles}/${totalFiles} (100%). Chuẩn bị ZIP...`; const zip = new JSZip(); let zipFileCount = 0; results.forEach((result, index) => { if (!isDownloading) return; if (result.status === 'fulfilled' && result.value) { const blob = result.value; const filename = `image_${index + 1}.png`; zip.file(filename, blob); successfulCount++; zipFileCount++; } else { downloadErrors++; const reason = result.status === 'rejected' ? result.reason : 'Unknown processing error'; log(`ERROR processing image index ${index} for ZIP: ${reason instanceof Error ? reason.message : reason}`); } }); if (!isDownloading) { log("Download stopped during ZIP preparation."); errorEl.textContent = "Đã dừng tạo ZIP."; btnText.textContent = "Đã dừng tạo ZIP"; if(btnIcon) btnIcon.style.display = 'inline'; setTimeout(() => { if (!isDownloading) updateSelectedCount(); }, 5000); return; } if (successfulCount > 0) { try { log(`Generating ZIP file with ${successfulCount} images...`); btnText.textContent = 'Đang tạo file ZIP...'; const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, (metadata) => { if (!isDownloading) throw new Error("Zip generation cancelled."); btnText.textContent = `Đang nén ZIP: ${metadata.percent.toFixed(0)}%`; }); if (!isDownloading) { log("Download stopped during ZIP generation."); errorEl.textContent = "Đã dừng tạo ZIP."; btnText.textContent = "Đã dừng tạo ZIP"; } else { const zipFilename = `AutoSora_Bulk_${getTimestamp()}.zip`; triggerDownload(zipBlob, zipFilename); btnText.textContent = `Đã tải xong ${successfulCount}/${totalFiles} ảnh`; if (downloadErrors > 0) { errorEl.textContent = `Có ${downloadErrors} lỗi xảy ra khi xử lý ảnh.`; log(`${downloadErrors} errors occurred during image processing.`); } log(`ZIP download triggered for ${successfulCount} files.`); } } catch (error) { log("ERROR during ZIP generation or download:"); console.error(error); if (error.message === "Zip generation cancelled.") { errorEl.textContent = "Đã dừng tạo file ZIP."; btnText.textContent = "Đã dừng tạo ZIP"; } else if (isDownloading){ errorEl.textContent = "Lỗi khi tạo file ZIP. Kiểm tra Console."; btnText.textContent = "Lỗi tạo ZIP"; } else { errorEl.textContent = "Đã dừng."; btnText.textContent = "Đã dừng"; } } } else if (isDownloading) { btnText.textContent = "Lỗi xử lý ảnh"; errorEl.textContent = `Không thể xử lý ảnh nào (${downloadErrors} lỗi).`; log("No images were successfully processed."); } else { log("Download stopped, no successful images to ZIP."); } const wasDownloadingMulti = isDownloading; isDownloading = false; if (btnIcon) btnIcon.style.display = 'inline'; setTimeout(() => { if (!isDownloading) updateSelectedCount(); }, 5000); log(`Multiple image download process finished (was downloading: ${wasDownloadingMulti}). Success: ${successfulCount}, Errors: ${downloadErrors}`); }
    async function convertWebpToPngBlob(url, cropOption = 'none') { /* ... */ const start = performance.now(); try { if (!isDownloading) throw new Error("Download cancelled before fetching."); const response = await fetch(url, { cache: "no-store"}); if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`); const webpBlob = await response.blob(); if (webpBlob.size === 0) throw new Error("Fetched blob is empty."); if (!isDownloading) throw new Error("Download cancelled after fetching."); const imgBitmap = await createImageBitmap(webpBlob); let sourceX = 0, sourceY = 0; let sourceWidth = imgBitmap.width; let sourceHeight = imgBitmap.height; let targetWidth = imgBitmap.width; let targetHeight = imgBitmap.height; const targetCanvas = document.createElement("canvas"); if (cropOption !== 'none' && sourceWidth > 0 && sourceHeight > 0) { let targetRatio = 1; let canvasTargetWidth = sourceWidth; let canvasTargetHeight = sourceHeight; switch (cropOption) { case '16:9': targetRatio = 16 / 9; canvasTargetWidth = 1920; canvasTargetHeight = 1080; break; case '9:16': targetRatio = 9 / 16; canvasTargetWidth = 1080; canvasTargetHeight = 1920; break; case '1:1': targetRatio = 1 / 1; canvasTargetWidth = 1080; canvasTargetHeight = 1080; break; } const currentRatio = sourceWidth / sourceHeight; if (Math.abs(currentRatio - targetRatio) >= 0.01) { if (currentRatio > targetRatio) { const idealWidth = sourceHeight * targetRatio; sourceX = (sourceWidth - idealWidth) / 2; sourceWidth = idealWidth; } else { const idealHeight = sourceWidth / targetRatio; sourceY = (sourceHeight - idealHeight) / 2; sourceHeight = idealHeight; } } targetWidth = canvasTargetWidth; targetHeight = canvasTargetHeight; } else { targetWidth = sourceWidth; targetHeight = sourceHeight; } if (targetWidth <= 0 || targetHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0 || sourceX < 0 || sourceY < 0) { throw new Error(`Invalid dimensions calculated`); } targetCanvas.width = targetWidth; targetCanvas.height = targetHeight; const ctx = targetCanvas.getContext("2d", { alpha: false }); ctx.imageSmoothingQuality = "high"; ctx.drawImage(imgBitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight); return new Promise((resolve, reject) => { if (!isDownloading) return reject(new Error("Download cancelled before blob creation.")); targetCanvas.toBlob(blob => { if (blob) { if (!isDownloading) return reject(new Error("Download cancelled during blob creation.")); const duration = performance.now() - start; resolve(blob); } else { reject(new Error("Canvas toBlob returned null.")); } }, "image/png", 0.95); }); } catch (error) { const duration = performance.now() - start; if (error.message.includes("cancelled")) log(`Conversion cancelled for ${url.substring(url.length - 50)}...: ${error.message}`); else { log(`ERROR converting image ${url.substring(url.length - 50)}... in ${duration.toFixed(0)}ms: ${error.message}`); console.error(`Full error for ${url}:`, error); } throw error; } }
    function handleImageError() { log(`ERROR: Failed to load image for checkbox init: ${this.src.substring(0, 50)}...`); }
    function insertCheckbox(img) { /* ... */ try { const a = img.closest('a'); if (!a) return; const gridItem = img.closest('div[data-index]'); if (!gridItem) return; if (gridItem.querySelector('.sora-image-checkbox')) return; const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.className = "sora-image-checkbox"; Object.assign(checkbox.style, { position: "absolute", top: "8px", left: "8px", zIndex: "10", width: "18px", height: "18px", cursor: "pointer", transform: "scale(1.3)", accentColor: "#4a90e2" }); checkbox.title = "Chọn/bỏ chọn ảnh này"; const setInitialCheckboxState = () => { try { if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) return; const filterHorizState = document.getElementById('sora-select-horizontal')?.checked ?? false; const filterVertState = document.getElementById('sora-select-vertical')?.checked ?? false; const filterSquareState = document.getElementById('sora-select-square')?.checked ?? false; const imgWidth = img.naturalWidth; const imgHeight = img.naturalHeight; let shouldBeChecked = false; const isHoriz = imgWidth > imgHeight; const isVert = imgHeight > imgWidth; const isSquare = imgWidth === imgHeight; if (!filterHorizState && !filterVertState && !filterSquareState) { shouldBeChecked = false; } else { shouldBeChecked = (filterHorizState && isHoriz) || (filterVertState && isVert) || (filterSquareState && isSquare); } if (checkbox.checked !== shouldBeChecked) { checkbox.checked = shouldBeChecked; } if (shouldBeChecked) { if (!selectedImageUrls.has(img.src)) { selectedImageUrls.add(img.src); updateSelectedCount(); } } else { if (selectedImageUrls.has(img.src)) { selectedImageUrls.delete(img.src); updateSelectedCount(); } } } catch (e) { log(`ERROR in setInitialCheckboxState for image: ${img.src.substring(0,50)}...`); console.error(e); } }; checkbox.addEventListener("change", (e) => { const action = e.target.checked ? 'Selected' : 'Deselected'; if (e.target.checked) selectedImageUrls.add(img.src); else selectedImageUrls.delete(img.src); updateSelectedCount(); }); if (window.getComputedStyle(gridItem).position === 'static') { gridItem.style.position = 'relative'; } gridItem.insertBefore(checkbox, gridItem.firstChild); if (img.complete && img.naturalWidth > 0) { setInitialCheckboxState(); } else { img.removeEventListener('load', setInitialCheckboxState); img.removeEventListener('error', handleImageError); img.addEventListener('load', setInitialCheckboxState, { once: true }); img.addEventListener('error', handleImageError, { once: true }); } } catch (e) { log(`ERROR inserting checkbox for image: ${img?.src?.substring(0, 50)}...`); console.error(e); } }
    imageObserver = new MutationObserver((mutations) => { /* ... */ let imagesToCheck = new Set(); for (const mutation of mutations) { if (mutation.type === 'childList') { for (const node of mutation.addedNodes) { if (node.nodeType === 1) { if (node.matches && node.matches('div[data-index]')) { const img = node.querySelector('a > img'); if (img && !node.querySelector('.sora-image-checkbox')) { imagesToCheck.add(img); } } else if (node.querySelectorAll) { node.querySelectorAll('div[data-index]').forEach(gridItem => { const img = gridItem.querySelector('a > img'); if (img && !gridItem.querySelector('.sora-image-checkbox')) { imagesToCheck.add(img); } }); } } } } } if (imagesToCheck.size > 0) { log(`ImageObserver found ${imagesToCheck.size} new image elements potentially needing checkboxes.`); imagesToCheck.forEach(img => insertCheckbox(img)); } });
    completionObserver = new MutationObserver((mutations) => { /* ... */ if (!isGenerating || !isRunning) return; let foundIndicatorRemoval = false; let foundNewImage = false; for (const mutation of mutations) { if (mutation.type === 'childList') { mutation.removedNodes.forEach(node => { if (node.nodeType === 1 && node.querySelector && node.querySelector('svg[class*="desktop:h-20"] circle[class*="-rotate-90"]')) { foundIndicatorRemoval = true; } else if (node.nodeType === 1 && node.matches && node.matches('div[class*="absolute"][class*="text-token-text-secondary"]') && node.textContent.match(/^\d{1,3}%$/)) { foundIndicatorRemoval = true; } }); mutation.addedNodes.forEach(node => { if (node.nodeType === 1) { if ((node.matches && node.matches('div[data-index="0"]')) || (node.querySelector && node.querySelector('div[data-index="0"]'))) { foundNewImage = true; } } }); } } if (foundIndicatorRemoval) _generationIndicatorRemoved = true; if (foundNewImage) _newImagesAppeared = true; if (isGenerating && isRunning && _generationIndicatorRemoved && _newImagesAppeared) { log("CompletionObserver: Both conditions met (_generationIndicatorRemoved && _newImagesAppeared). Calling handleGenerationComplete."); handleGenerationComplete(); } });
    function toggleFindSimilarMode() { /* ... */ isFindSimilarModeActive = !isFindSimilarModeActive; const button = document.getElementById('sora-find-similar-button'); if (button) { if (isFindSimilarModeActive) { button.classList.add('active'); button.title = 'Tắt chế độ tìm ảnh tương tự (Click vào ảnh để tìm)'; log("Find Similar mode ACTIVATED."); } else { button.classList.remove('active'); button.title = 'Kích hoạt chế độ tìm ảnh tương tự'; log("Find Similar mode DEACTIVATED."); } } }
    function handleDocumentClickForSimilar(event) { /* ... */ if (!isFindSimilarModeActive) { return; } const link = event.target.closest('a'); if (!link || !link.href) { return; } const soraGenRegex = /^https?:\/\/sora\.com\/g\/(gen_[a-zA-Z0-9]+)/; const match = link.href.match(soraGenRegex); if (match && match[1]) { const genId = match[1]; const exploreUrl = `${window.location.origin}/explore?query=${genId}`; log(`Find Similar Mode: Match found (${genId}). Opening with window.open: ${exploreUrl}`); event.preventDefault(); event.stopPropagation(); window.open(exploreUrl, '_blank'); } }
    function waitForElement(selector, callback, timeout = 20000) { /* ... */ log(`Waiting for element: "${selector}" (timeout: ${timeout/1000}s)`); let checkCount = 0; const intervalTime = 500; const maxChecks = timeout / intervalTime; const interval = setInterval(() => { checkCount++; const el = document.querySelector(selector); if (el) { clearInterval(interval); log(`Element found: "${selector}". Initializing script...`); try { callback(el); log("Initialization callback executed successfully."); } catch (e) { log("FATAL ERROR during initialization callback execution:"); console.error(e); alert("Lỗi nghiêm trọng khi khởi chạy Auto Sora script. Không thể tạo UI. Kiểm tra Console (F12) để biết chi tiết."); } } else if (checkCount >= maxChecks) { clearInterval(interval); log(`ERROR: Element "${selector}" not found after ${timeout/1000} seconds. Script cannot initialize UI.`); alert(`Auto Sora: Không tìm thấy phần tử quan trọng "${selector}" để khởi chạy UI. Script có thể không hoạt động đúng.`); } }, intervalTime); }

    // --- Script Entry Point ---
    log("Script starting...");
    if (typeof JSZip === 'undefined') { log("FATAL ERROR: JSZip library not loaded."); alert("Lỗi nghiêm trọng: Thư viện JSZip chưa được tải."); return; }
    else { log("JSZip library loaded successfully."); }

    waitForElement('textarea[placeholder*="Describe"], textarea.flex.w-full', () => {
        try {
            log("Core textarea element found. Proceeding with UI creation and observer setup.");
            createUI(); // Creates main UI, aux UI, and overlay placeholder
            hideOverlay(); // <-- Ensure overlay is hidden initially after creation
            log("UI creation function finished. Initial overlay state set to hidden.");

            log("Performing initial scan for images...");
            let initialImages = 0;
            document.querySelectorAll('div[data-index] > a > img').forEach(img => {
                 if (!img.closest('.sora-image-checkbox')) {
                     insertCheckbox(img);
                     initialImages++;
                 }
            });
            log(`Initial image scan complete. Processed ${initialImages} images.`);
            updateSelectedCount();

            log("Setting up Image Observer...");
            const imageGridContainer = document.querySelector('[data-testid="virtuoso-scroller"] > div') ?? document.body;
            imageObserver.observe(imageGridContainer, { childList: true, subtree: true });
            log(`Image Observer started observing ${imageGridContainer === document.body ? 'document body' : 'grid container'}.`);

            if (!completionObserver) { log("ERROR: Completion observer was not initialized correctly."); }
            else { log("Completion observer initialized."); }

            document.addEventListener('click', handleDocumentClickForSimilar, true);
            log("Added global click listener for Find Similar mode.");
            log("Initialization complete.");

        } catch (e) {
            log("FATAL ERROR during script initialization after core element found:");
            console.error(e);
            alert("Đã xảy ra lỗi nghiêm trọng trong quá trình khởi tạo Auto Sora. Kiểm tra Console (F12).");
        }
    });

})();
