// ==UserScript==
// @name         🧠 Auto Sora
// @namespace    http://tampermonkey.net/
// @version      4.3.1
// @description  Auto generate prompt list, bulk download (PNG, multithreaded), single file download, auto crop (16:9, 9:16, 1:1), H/V/Square filter
// @author       Matthew M.
// @match        *://sora.com/*
// @match        *://www.sora.com/*
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
    let isRunning = false; // Flag for prompt generation process
    let countdownInterval = null;
    let cooldownTime = 130; // Default cooldown time in seconds

    let selectedImageUrls = new Set(); // Stores URLs of images selected for download
    let isDownloading = false; // Flag for download process
    let downloadErrors = 0;

    // --- Utility Functions ---
    function log(msg) {
        console.log(`[Auto Sora v4.3.1] ${msg}`); // Updated version in log
    }

    // --- Image Selection Logic (Based on Orientation Filters) ---
    function updateImageSelection() {
        log("Updating image selections based on H/V/Square filters...");
        try {
            // Get the state of the orientation filter checkboxes
            const filterHorizState = document.getElementById('sora-select-horizontal')?.checked ?? false;
            const filterVertState = document.getElementById('sora-select-vertical')?.checked ?? false;
            const filterSquareState = document.getElementById('sora-select-square')?.checked ?? false;
            selectedImageUrls.clear(); // Clear current selection before re-evaluating

            // Iterate through all image wrappers on the page
            document.querySelectorAll(".sora-image-wrapper").forEach(wrapper => {
                const checkbox = wrapper.querySelector(".sora-image-checkbox");
                const img = wrapper.querySelector("img");
                if (!checkbox || !img) return; // Skip if elements are missing

                // Use naturalWidth/Height for accurate dimensions if image is loaded
                const imgWidth = (img.complete && img.naturalWidth > 0) ? img.naturalWidth : img.width;
                const imgHeight = (img.complete && img.naturalHeight > 0) ? img.naturalHeight : img.height;
                let checkThisBox = false;

                // Only apply filters if image dimensions are valid
                if (img.complete && imgWidth > 0 && imgHeight > 0) {
                    const isHoriz = imgWidth > imgHeight;
                    const isVert = imgHeight > imgWidth;
                    const isSquare = imgWidth === imgHeight;

                    // Determine if the checkbox should be checked based on active filters
                    if (!filterHorizState && !filterVertState && !filterSquareState) {
                        checkThisBox = false; // Keep unchecked if no filters are active
                    } else {
                        checkThisBox = (filterHorizState && isHoriz) || (filterVertState && isVert) || (filterSquareState && isSquare);
                    }
                    checkbox.checked = checkThisBox; // Set checkbox state
                    if (checkThisBox) {
                        selectedImageUrls.add(img.src); // Add URL to the selection set
                    }
                } else if (!img.complete) {
                    // If image not loaded yet, keep its current manual state temporarily
                    checkThisBox = checkbox.checked;
                    if (checkThisBox) {
                        selectedImageUrls.add(img.src); // Re-add if it was manually checked
                    }
                } else {
                    // Image loaded but dimensions are invalid - keep unchecked
                    checkbox.checked = false;
                    log(`Image ${img.src.substring(0,30)}... has invalid dimensions (${imgWidth}x${imgHeight}) after loading.`);
                }
            });

            updateSelectedCount(); // Update the download button text/state
            log(`Selection updated. ${selectedImageUrls.size} images selected based on filters.`);
        } catch (e) {
            log("Error during image selection update:");
            console.error(e);
        }
    }

    // --- UI Creation ---
    function createUI() {
        const wrapper = document.createElement('div');
        wrapper.id = 'sora-auto-ui';
        // --- Styling for the main UI panel ---
        wrapper.style.cssText = `
            position: fixed; bottom: 8px; left: 20px; background: rgba(25, 25, 25, 0.96);
            padding: 18px; border-radius: 16px; z-index: 999999;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5); width: 320px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            border: 1px solid rgba(255, 255, 255, 0.1); color: #f1f1f1;
            backdrop-filter: blur(10px); opacity: 1; transform: scale(1);
            transition: all 0.3s ease;
        `;

        // --- Inner HTML for the UI panel ---
        wrapper.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="margin: 0; font-size: 16px; display: flex; align-items: center; gap: 8px;">
                    <img src="https://www.svgrepo.com/show/306500/openai.svg" width="20" height="20" style="filter: invert(1);" alt="OpenAI Logo"/>
                    Auto Sora <span style="font-size: 8px; opacity: 0.7;">build 4.3.1</span> </h3>
                <button id="sora-close" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #aaa;" title="Đóng bảng điều khiển">✕</button>
            </div>

            <label style="font-size: 14px; color: #ccc;">Nhập danh sách prompt:</label>
            <textarea rows="5" id="sora-input" placeholder="Mỗi dòng tương ứng với một prompt..." style="width: 100%; padding: 10px; border: 1px solid #444; background: #1a1a1a; border-radius: 8px; resize: none; font-size: 14px; color: #eee; margin-top: 4px; box-sizing: border-box;"></textarea>
            <label style="margin-top: 10px; display: block; font-size: 13px; color: #ccc;">⏱ Thời gian Cooldown (giây):</label>
            <input id="sora-cooldown-time" type="number" min="1" value="${cooldownTime}" style="width: 100%; padding: 6px 10px; border: 1px solid #444; background: #111; color: #fff; border-radius: 6px; font-size: 14px; margin-top: 4px; box-sizing: border-box;" />
            <div style="margin-top: 12px; display: flex; gap: 8px;">
                <button id="sora-start" style="flex: 1; background: #1f6feb; color: white; padding: 8px; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;">▶ Bắt đầu</button>
                <button id="sora-clear" style="flex: 1; background: #333; color: #ddd; padding: 8px; border: none; border-radius: 8px; cursor: pointer;">🗑️ Xóa</button>
            </div>

            <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 16px 0;" />

            <div style="font-size: 13px; color: #bbb; margin-bottom: 10px;">Chọn ảnh tải về:</div>
            <div style="display: flex; gap: 15px; margin-bottom: 10px; flex-wrap: wrap; justify-content: flex-start; align-items: center;">
                <label title="Chỉ chọn các ảnh có chiều ngang lớn hơn chiều dọc" style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #bbb; cursor: pointer;">
                    <input type="checkbox" id="sora-select-horizontal" style="transform: scale(1.1); cursor: pointer; accent-color: #1f6feb;" /> Ảnh ngang
                </label>
                <label title="Chỉ chọn các ảnh có chiều dọc lớn hơn chiều ngang" style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #bbb; cursor: pointer;">
                    <input type="checkbox" id="sora-select-vertical" style="transform: scale(1.1); cursor: pointer; accent-color: #1f6feb;" /> Ảnh dọc
                </label>
                <label title="Chỉ chọn các ảnh có chiều rộng bằng chiều cao" style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #bbb; cursor: pointer;">
                    <input type="checkbox" id="sora-select-square" style="transform: scale(1.1); cursor: pointer; accent-color: #1f6feb;" /> Ảnh vuông
                </label>
            </div>

            <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 12px 0;" />

            <div style="font-size: 13px; color: #bbb; margin-bottom: 8px;">Tùy chọn Crop ảnh khi tải:</div>
            <div id="sora-crop-options" style="display: flex; flex-direction: row; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
                <label style="display: flex; align-items: center; gap: 4px; font-size: 13px; color: #bbb; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="none" checked style="cursor: pointer; accent-color: #1f6feb; transform: scale(1.1);" /> Gốc
                </label>
                <label style="display: flex; align-items: center; gap: 4px; font-size: 13px; color: #bbb; cursor: pointer;">
                    <input type="radio" name="sora-crop-option" value="16:9" style="cursor: pointer; accent-color: #1f6feb; transform: scale(1.1);" /> 16:9
                </label>
                <label style="display: flex; align-items: center; gap: 4px; font-size: 13px; color: #bbb; cursor: pointer;">
                    <input type="radio" name="sora-crop-option" value="9:16" style="cursor: pointer; accent-color: #1f6feb; transform: scale(1.1);" /> 9:16
                </label>
                <label style="display: flex; align-items: center; gap: 4px; font-size: 13px; color: #bbb; cursor: pointer;">
                    <input type="radio" name="sora-crop-option" value="1:1" style="cursor: pointer; accent-color: #1f6feb; transform: scale(1.1);" /> 1:1
                </label>
            </div>

            <button id="sora-download-images" style="margin-top: 12px; background: #2ea043; color: white; padding: 9px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; transition: background-color 0.2s ease; font-weight: 500;">
                 <span id="sora-download-icon" style="display: inline;"></span>
                 <span id="sora-download-text">Tải hình (0)</span>
            </button>
            <div id="sora-download-progress" style="display: none;"></div> <div id="sora-download-error" style="font-size: 11px; color: #ffa0a0; text-align: center; margin-top: 5px; min-height: 14px;"></div>
        `;
        document.body.appendChild(wrapper);

        // --- Event Listeners for UI Elements ---
        document.getElementById('sora-start').onclick = handleStart;
        document.getElementById('sora-clear').onclick = handleClear;
        document.getElementById('sora-close').onclick = handleClose;
        document.getElementById('sora-download-images').onclick = handleDownload;

        // Orientation filter listeners
        document.getElementById('sora-select-horizontal').addEventListener('change', updateImageSelection);
        document.getElementById('sora-select-vertical').addEventListener('change', updateImageSelection);
        document.getElementById('sora-select-square').addEventListener('change', updateImageSelection);

        // --- Create Progress/Cooldown/Mini Button UI Elements (Initially Hidden) ---
        createAuxiliaryUI();
    }

    // --- Create Auxiliary UI (Progress, Cooldown, Mini Button) ---
    function createAuxiliaryUI() {
        // Progress Indicator
        const progress = document.createElement('div');
        progress.id = 'sora-progress';
        progress.style.cssText = `
            position: fixed; bottom: 20px; left: 20px; background: rgba(25, 25, 25, 0.9);
            border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 8px 16px;
            font-size: 14px; z-index: 999999; display: none; color: #eee; backdrop-filter: blur(8px);
        `;
        progress.textContent = 'Đang xử lý...';
        document.body.appendChild(progress);

        // Cooldown Timer Button
        const cooldownBtn = document.createElement('button');
        cooldownBtn.id = 'sora-cooldown';
        cooldownBtn.style.cssText = `
            position: fixed; bottom: 20px; left: /* Adjust position if needed */ 190px;
            background: rgba(25, 25, 25, 0.9); border: 1px solid rgba(255,255,255,0.1);
            border-radius: 10px; padding: 8px 16px; font-size: 14px; z-index: 999999;
            color: #eee; display: none; backdrop-filter: blur(8px); cursor: default;
        `;
        cooldownBtn.textContent = `⏳ Cooldown: ${cooldownTime}s`;
        document.body.appendChild(cooldownBtn);

        // Mini Button (to reopen UI)
        const miniBtn = document.createElement('div');
        miniBtn.id = 'sora-minibtn';
        miniBtn.style.cssText = `
            position: fixed; bottom: 10px; left: 10px; width: 14px; height: 14px;
            background: white; border-radius: 50%; cursor: pointer; z-index: 999999;
            box-shadow: 0 0 6px rgba(255,255,255,0.7); display: none; /* Initially hidden */
        `;
        miniBtn.title = 'Mở lại Auto Sora';
        miniBtn.onclick = handleMiniButtonClick;
        document.body.appendChild(miniBtn);
    }

    // --- Event Handlers for Main UI ---
    function handleStart() {
        const input = document.getElementById('sora-input').value;
        const prompts = input.split('\n').map(x => x.trim()).filter(Boolean);
        const cooldownInput = parseInt(document.getElementById('sora-cooldown-time').value);
        cooldownTime = isNaN(cooldownInput) ? 130 : Math.max(1, cooldownInput); // Update global cooldown

        if (prompts.length === 0) return alert("❗ Nhập ít nhất 1 prompt.");
        if (isRunning) { log("Process already running."); return; }

        log(`Starting process with ${prompts.length} prompts and ${cooldownTime}s cooldown.`);
        promptQueue = prompts;
        totalPromptCount = prompts.length;
        isRunning = true;
        document.getElementById('sora-auto-ui').style.display = 'none'; // Hide main UI
        document.getElementById('sora-minibtn').style.display = 'none'; // Hide mini button
        document.getElementById('sora-progress').style.display = 'block'; // Show progress
        document.getElementById('sora-cooldown').style.display = 'block'; // Show cooldown
        updateProgress();
        startLoop(); // Start the prompt submission loop
    }

    function handleClear() {
        document.getElementById('sora-input').value = '';
        log("Prompt input cleared.");
    }

    function handleClose() {
        const wrapper = document.getElementById('sora-auto-ui');
        wrapper.style.opacity = '0';
        wrapper.style.transform = 'scale(0.9)';
        setTimeout(() => {
            wrapper.style.display = 'none';
            // Show mini button only if not running
            if (!isRunning) {
                const miniBtn = document.getElementById('sora-minibtn');
                if (miniBtn) miniBtn.style.display = 'block';
            }
        }, 300);
    }

    function handleMiniButtonClick() {
        if (!isRunning) { // Only allow reopening if not running
            const wrapper = document.getElementById('sora-auto-ui');
            const miniBtn = document.getElementById('sora-minibtn');
            if (wrapper) {
                wrapper.style.display = 'block';
                setTimeout(() => {
                    wrapper.style.opacity = '1';
                    wrapper.style.transform = 'scale(1)';
                }, 10);
            }
            if (miniBtn) miniBtn.style.display = 'none';
        } else {
            log("Cannot open UI while process is running.");
        }
    }

    // --- Progress and Cooldown UI Update Functions ---
    function updateProgress() {
        const done = totalPromptCount - promptQueue.length;
        const progressEl = document.getElementById('sora-progress');
        const cooldownEl = document.getElementById('sora-cooldown');
        if (!progressEl || !cooldownEl) return;

        if (isRunning) {
            progressEl.textContent = `Đã gửi: ${done} / ${totalPromptCount}`;
            progressEl.style.display = 'block';
            cooldownEl.style.display = 'block';
        } else {
            // Process finished or stopped
            if (totalPromptCount > 0 && done === totalPromptCount) {
                progressEl.textContent = `Hoàn thành: ${done} / ${totalPromptCount}.`;
                log(`Finished processing all ${totalPromptCount} prompts.`);
            } else if (totalPromptCount > 0 && done < totalPromptCount && !isRunning) {
                progressEl.textContent = `Đã dừng: ${done} / ${totalPromptCount}.`;
                log(`Process stopped prematurely after ${done} prompts.`);
            } else {
                progressEl.textContent = 'Chưa chạy hoặc đã dừng.';
            }

            // Hide progress/cooldown after a delay and show mini button
            setTimeout(() => {
                if (!isRunning) {
                    progressEl.style.display = 'none';
                    cooldownEl.style.display = 'none';
                    const wrapper = document.getElementById('sora-auto-ui');
                    const miniBtn = document.getElementById('sora-minibtn');
                    if (wrapper && wrapper.style.display === 'none' && miniBtn) {
                        miniBtn.style.display = 'block';
                    }
                    totalPromptCount = 0; // Reset count
                    promptQueue = []; // Clear queue
                    if (countdownInterval) clearInterval(countdownInterval);
                    countdownInterval = null;
                }
            }, 4000); // Show final status for 4 seconds
        }
    }

    function startCountdown() {
        let timeRemaining = cooldownTime;
        const cooldownBtn = document.getElementById('sora-cooldown');
        if (!cooldownBtn) return;

        cooldownBtn.textContent = `Cooldown: ${timeRemaining}s`;
        if (countdownInterval) clearInterval(countdownInterval); // Clear previous

        countdownInterval = setInterval(() => {
            timeRemaining--;
            const currentBtn = document.getElementById('sora-cooldown'); // Re-fetch
            if (currentBtn) {
                currentBtn.textContent = `Cooldown: ${timeRemaining}s`;
            }

            if (timeRemaining <= 0 || !isRunning) { // Stop if time runs out or process stops
                clearInterval(countdownInterval);
                countdownInterval = null;
                if (currentBtn) {
                    currentBtn.textContent = isRunning ? `Cooldown: 0s` : `Cooldown: --`;
                }
            }
        }, 1000);
    }

    // --- Prompt Submission Logic ---
    function submitPrompt(prompt) {
        const textarea = document.querySelector('textarea[placeholder*="Describe your"]');
        if (!textarea) {
            log("Error: Prompt textarea not found. Stopping process.");
            isRunning = false;
            updateProgress();
            return;
        }
        log(`Submitting prompt: ${prompt.substring(0, 50)}...`);
        textarea.value = prompt;

        // Trigger React's onChange handler
        const key = Object.keys(textarea).find(k => k.startsWith("__reactProps$"));
        if (key && textarea[key]?.onChange) {
            try {
                log("Triggering React onChange...");
                textarea[key].onChange({ target: textarea });
            } catch (e) {
                log("Error triggering React onChange:"); console.error(e);
            }
        } else {
            log("Warning: React onChange handler not found. Attempting standard events.");
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Delay before clicking the submit button
        setTimeout(() => {
            const btn = document.querySelector('button[data-disabled="false"]'); // Find enabled submit button
            if (btn) {
                log("Submit button found, attempting React onClick...");
                const btnKey = Object.keys(btn).find(k => k.startsWith("__reactProps$"));
                if (btnKey && btn[btnKey]?.onClick) {
                    try {
                        btn[btnKey].onClick({ bubbles: true, cancelable: true, isTrusted: true });
                        log("React onClick triggered.");
                    } catch (e) {
                        log("Error triggering React onClick:"); console.error(e);
                        log("Attempting standard .click() as fallback...");
                        btn.click(); // Fallback
                    }
                } else {
                    log("Warning: React onClick handler not found on button. Attempting standard .click().");
                    btn.click(); // Fallback
                }
            } else {
                log("Error: Submit button (data-disabled='false') not found after delay.");
            }
        }, 600); // Delay for stability
    }

    // --- Prompt Processing Loop Logic ---
    function processNextPrompt() {
        if (!isRunning || promptQueue.length === 0) {
            log("Queue empty or process stopped. Ending loop.");
            isRunning = false;
            updateProgress();
            return;
        }

        // Read current cooldown time from input each time
        const currentCooldownInput = parseInt(document.getElementById('sora-cooldown-time')?.value);
        const currentCooldown = isNaN(currentCooldownInput) ? cooldownTime : Math.max(1, currentCooldownInput);
        log(`Waiting ${currentCooldown} seconds for next prompt...`);

        // Set timeout for the *next* prompt submission
        setTimeout(() => {
            if (!isRunning) { // Double-check running state after timeout
                log("Process stopped during cooldown.");
                updateProgress();
                return;
            }
            if (promptQueue.length > 0) {
                const nextPrompt = promptQueue.shift(); // Get next prompt
                log(`Processing next prompt (${totalPromptCount - promptQueue.length}/${totalPromptCount})`);
                submitPrompt(nextPrompt); // Submit it
                updateProgress(); // Update progress display
                startCountdown(); // Start visual cooldown timer
                processNextPrompt(); // Recursively schedule the *following* prompt
            } else {
                log("Queue became empty during cooldown.");
                isRunning = false;
                updateProgress();
            }
        }, currentCooldown * 1000); // Cooldown happens BEFORE the next submission
    }

    function startLoop() {
        if (!isRunning || promptQueue.length === 0) {
            isRunning = false;
            updateProgress();
            log("Loop not started or queue empty.");
            return;
        }
        // Submit the *first* prompt immediately
        const firstPrompt = promptQueue.shift();
        log(`Starting loop, submitting first prompt (1/${totalPromptCount}): ${firstPrompt.substring(0, 50)}...`);
        submitPrompt(firstPrompt);
        updateProgress();
        startCountdown();
        // Schedule the *next* prompt processing (after the first cooldown)
        processNextPrompt();
    }

    // --- Download Logic ---
    function updateSelectedCount() {
        const count = selectedImageUrls.size;
        try {
            const btnText = document.getElementById("sora-download-text");
            const btn = document.getElementById("sora-download-images");
            const progressEl = document.getElementById("sora-download-progress");

            if (btnText && btn && !isDownloading) { // Only update if not currently downloading
                btnText.textContent = `Tải hình (${count})`;
                btn.disabled = (count === 0);
                const icon = document.getElementById("sora-download-icon");
                if (icon) icon.style.display = 'inline'; // Ensure icon is visible
                if (progressEl) progressEl.style.display = 'none'; // Hide separate progress div
                const errorEl = document.getElementById("sora-download-error");
                if (errorEl) errorEl.textContent = ''; // Clear errors
            } else if (btn) {
                btn.disabled = true; // Keep disabled if downloading
                if (progressEl) progressEl.style.display = 'none';
            }
        } catch (e) {
            log("Error updating selected count UI:"); console.error(e);
        }
        // Ensure button is disabled if count is 0, even if downloading flag was somehow wrong
        const btn = document.getElementById("sora-download-images");
        if (btn && !isDownloading) {
            btn.disabled = (count === 0);
        }
    }

    // --- Utility function to generate timestamp string ---
    function getTimestamp() {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${pad(now.getDate())}${pad(now.getMonth() + 1)}${String(now.getFullYear()).slice(2)}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    }

    // --- Utility function to trigger blob download ---
    function triggerDownload(blob, filename) {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href); // Clean up
        log(`Triggered download for ${filename}`);
    }


    async function handleDownload() {
        const btn = document.getElementById("sora-download-images");
        const btnText = document.getElementById("sora-download-text");
        const btnIcon = document.getElementById("sora-download-icon");
        const progressEl = document.getElementById("sora-download-progress");
        const errorEl = document.getElementById("sora-download-error");

        if (!btn || !btnText || !btnIcon || !progressEl || !errorEl) {
            log("Error: Download UI elements not found."); return;
        }

        if (isDownloading) {
            log("Download stop requested.");
            isDownloading = false; // Set flag to stop processing further results
            btnText.textContent = `Đang dừng...`;
            // Button remains disabled until process fully stops
            return;
        }

        const urlsToDownload = Array.from(selectedImageUrls);
        if (urlsToDownload.length === 0) {
            errorEl.textContent = "Chưa có ảnh nào được chọn.";
            setTimeout(() => { if (!isDownloading) errorEl.textContent = ''; }, 3000);
            return;
        }

        isDownloading = true; // Set flag
        downloadErrors = 0;
        let completedCount = 0;
        let successfulCount = 0;
        const totalFiles = urlsToDownload.length;
        const selectedCropOption = document.querySelector('input[name="sora-crop-option"]:checked')?.value ?? 'none';

        // --- Update Button State for Download Start ---
        btn.disabled = true;
        btnIcon.style.display = 'none'; // Hide icon
        btnText.textContent = `Chuẩn bị... (0/${totalFiles})`;
        progressEl.style.display = 'none'; // Ensure separate progress hidden
        errorEl.textContent = '';

        log(`Starting download of ${totalFiles} images... Crop: ${selectedCropOption}`);

        // --- Single File Download Logic ---
        if (totalFiles === 1) {
            log("Processing single image download...");
            const url = urlsToDownload[0];
            btnText.textContent = `Đang xử lý 1 ảnh...`;
            try {
                const blob = await convertWebpToPngBlob(url, selectedCropOption);
                if (blob && isDownloading) { // Check flag again in case stopped during conversion
                    const timestamp = getTimestamp();
                    const filename = `AutoSora_${selectedCropOption}_${timestamp}.png`;
                    triggerDownload(blob, filename);
                    btnText.textContent = `Đã tải xong 1 ảnh`;
                    successfulCount = 1;
                } else if (!blob) {
                    downloadErrors = 1;
                    errorEl.textContent = `Lỗi xử lý ảnh. Kiểm tra Console.`;
                    btnText.textContent = `Lỗi tải ảnh`;
                } else { // Stopped during conversion
                     errorEl.textContent = `Đã dừng tải.`;
                     btnText.textContent = `Đã dừng tải`;
                }
            } catch (err) {
                downloadErrors = 1;
                log(`Error processing single image (${url.substring(0, 30)}...): ${err.message}`);
                console.error(err);
                errorEl.textContent = `Lỗi xử lý ảnh. Kiểm tra Console.`;
                btnText.textContent = `Lỗi tải ảnh`;
            } finally {
                // Final state reset for single file
                isDownloading = false;
                btnIcon.style.display = 'inline';
                btn.disabled = (selectedImageUrls.size === 0);
                setTimeout(() => {
                    if (!isDownloading) updateSelectedCount(); // Reset text if not downloading again
                }, 5000);
                log("Single image download process finished.");
            }
            return; // Exit handleDownload for single file case
        }

        // --- Multiple Files Download Logic (Concurrent) ---
        log("Processing multiple images concurrently...");
        btnText.textContent = `Đang xử lý ${totalFiles} ảnh...`;

        // Create an array of promises, each converting one image
        const conversionPromises = urlsToDownload.map((url, index) =>
            convertWebpToPngBlob(url, selectedCropOption)
                .then(blob => ({ status: 'fulfilled', value: blob, index: index })) // Wrap result
                .catch(error => ({ status: 'rejected', reason: error, index: index })) // Wrap error
        );

        // Wait for all conversions to settle (complete or fail)
        // Using a simple Promise.allSettled polyfill pattern for wider compatibility if needed,
        // but native Promise.allSettled is preferred.
        const results = await Promise.allSettled(conversionPromises);

        if (!isDownloading) { // Check if stopped while conversions were running
            log("Download stopped during image processing.");
            errorEl.textContent = "Đã dừng tải.";
            btnText.textContent = "Đã dừng tải";
            // Final state reset
            isDownloading = false;
            btnIcon.style.display = 'inline';
            btn.disabled = (selectedImageUrls.size === 0);
             setTimeout(() => {
                if (!isDownloading) updateSelectedCount();
            }, 5000);
            return;
        }

        // Process results and prepare ZIP
        log("All image processing settled. Preparing ZIP...");
        const zip = new JSZip();
        completedCount = 0; // Reset completed count for this stage

        results.forEach(result => {
            completedCount++; // Increment count as we process each result
            btnText.textContent = `Đang chuẩn bị ZIP: ${completedCount}/${totalFiles}...`; // Update progress

            if (result.status === 'fulfilled' && result.value.status === 'fulfilled' && result.value.value) {
                // Original promise fulfilled, and the inner conversion promise fulfilled with a blob
                const blob = result.value.value;
                const originalIndex = result.value.index;
                const filename = `image_${originalIndex + 1}.png`;
                zip.file(filename, blob);
                successfulCount++;
                log(`Added ${filename} to zip.`);
            } else {
                // Either the outer promise failed (unexpected) or the inner conversion failed/returned null
                downloadErrors++;
                const originalIndex = result.status === 'fulfilled' ? result.value.index : (result.reason?.index ?? -1); // Try to get index
                const reason = result.status === 'rejected' ? result.reason : (result.value?.reason ?? 'Unknown conversion error');
                log(`Error processing image index ${originalIndex}: ${reason}`);
                if (reason instanceof Error) console.error(reason); // Log full error object if available
            }
        });

        // Generate and trigger ZIP download if not stopped and there are successful files
        if (isDownloading && successfulCount > 0) {
            try {
                log("Generating ZIP file...");
                btnText.textContent = 'Đang tạo file ZIP...';
                const zipBlob = await zip.generateAsync({
                    type: "blob",
                    compression: "DEFLATE",
                    compressionOptions: { level: 6 } // Level 6 is a good balance
                }, (metadata) => {
                    // Check stop flag during zip generation
                    if (!isDownloading) throw new Error("Zip generation cancelled.");
                    btnText.textContent = `Đang nén: ${metadata.percent.toFixed(0)}%`;
                });

                // Generate dynamic filename
                const zipFilename = `AutoSora_Bulk_${getTimestamp()}.zip`;
                triggerDownload(zipBlob, zipFilename);

                // Update button on success
                btnText.textContent = `Đã tải xong ${successfulCount}/${totalFiles} ảnh`;
                if (downloadErrors > 0) {
                    errorEl.textContent = `Có ${downloadErrors} lỗi xảy ra khi xử lý ảnh.`;
                }

            } catch (error) {
                log("Error during ZIP generation or download:"); console.error(error);
                if (error.message === "Zip generation cancelled.") {
                    errorEl.textContent = "Đã dừng tạo file ZIP.";
                    btnText.textContent = "Đã dừng tạo ZIP";
                } else {
                    errorEl.textContent = "Lỗi khi tạo file ZIP. Kiểm tra Console.";
                    btnText.textContent = "Lỗi tạo ZIP";
                }
            }
        } else if (isDownloading && successfulCount === 0) {
            // Processed but all failed
            btnText.textContent = "Lỗi xử lý ảnh";
            errorEl.textContent = `Không thể xử lý ảnh nào (${downloadErrors} lỗi).`;
        } else if (!isDownloading && !errorEl.textContent) {
            // Stopped before ZIP generation started
             errorEl.textContent = "Đã dừng tải.";
             btnText.textContent = "Đã dừng tải";
        }

        // Final state reset for multiple files
        isDownloading = false; // Reset flag
        btnIcon.style.display = 'inline'; // Show icon again
        btn.disabled = (selectedImageUrls.size === 0); // Re-enable based on current selection
        // Reset button text after a delay to show status
        setTimeout(() => {
            if (!isDownloading) updateSelectedCount(); // Reset text if not downloading again
        }, 5000);
        log("Multiple image download process finished or stopped.");
    }


    // --- Image Conversion and Cropping Function ---
    // (No changes needed in this function itself for multithreading)
    async function convertWebpToPngBlob(url, cropOption = 'none') {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
            const webpBlob = await response.blob();
            if (webpBlob.size === 0) throw new Error("Fetched blob is empty.");

            const imgBitmap = await createImageBitmap(webpBlob);

            let sourceX = 0, sourceY = 0;
            let sourceWidth = imgBitmap.width;
            let sourceHeight = imgBitmap.height;
            let targetWidth = imgBitmap.width;
            let targetHeight = imgBitmap.height;

            const targetCanvas = document.createElement("canvas");

            // Apply crop based on the selected option
            if (cropOption !== 'none' && sourceWidth > 0 && sourceHeight > 0) {
                let targetRatio = 1; // Default for square or if calculation fails
                let canvasTargetWidth = sourceWidth; // Default target canvas size
                let canvasTargetHeight = sourceHeight;

                log(`Applying crop: ${cropOption} to ${sourceWidth}x${sourceHeight}`);

                switch (cropOption) {
                    case '16:9':
                        targetRatio = 16 / 9;
                        canvasTargetWidth = 1920; // Define target resolution
                        canvasTargetHeight = 1080;
                        break;
                    case '9:16':
                        targetRatio = 9 / 16;
                        canvasTargetWidth = 1080; // Define target resolution
                        canvasTargetHeight = 1920;
                        break;
                    case '1:1':
                        targetRatio = 1 / 1;
                        canvasTargetWidth = 1080; // Define target resolution
                        canvasTargetHeight = 1080;
                        break;
                }

                const currentRatio = sourceWidth / sourceHeight;

                if (Math.abs(currentRatio - targetRatio) < 0.01) {
                    log(`Image already ~${cropOption}, no crop needed, resizing to target.`);
                    // No crop needed, but will resize to target resolution below
                } else if (currentRatio > targetRatio) {
                    // Image is wider than target, crop width
                    const idealWidth = sourceHeight * targetRatio;
                    sourceX = (sourceWidth - idealWidth) / 2;
                    sourceWidth = idealWidth;
                    log(`Cropping width: sx=${sourceX.toFixed(0)}, sw=${sourceWidth.toFixed(0)}`);
                } else { // currentRatio < targetRatio
                    // Image is taller than target, crop height
                    const idealHeight = sourceWidth / targetRatio;
                    sourceY = (sourceHeight - idealHeight) / 2;
                    sourceHeight = idealHeight;
                    log(`Cropping height: sy=${sourceY.toFixed(0)}, sh=${sourceHeight.toFixed(0)}`);
                }

                // Set target canvas size for the cropped image (use defined target resolution)
                targetWidth = canvasTargetWidth;
                targetHeight = canvasTargetHeight;
                log(`Target canvas size set to ${targetWidth}x${targetHeight}`);

            } else {
                // No crop, use original dimensions for canvas
                targetWidth = sourceWidth;
                targetHeight = sourceHeight;
                if (cropOption === 'none') {
                     log(`No crop applied. Target size: ${targetWidth}x${targetHeight}`);
                } else {
                     log(`Crop skipped due to invalid source dimensions. Target size: ${targetWidth}x${targetHeight}`);
                }
            }

            // Validate dimensions before drawing
            if (targetWidth <= 0 || targetHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0 || sourceX < 0 || sourceY < 0) {
                throw new Error(`Invalid dimensions calculated: Target ${targetWidth}x${targetHeight}, Source Rect ${sourceWidth.toFixed(0)}x${sourceHeight.toFixed(0)} at (${sourceX.toFixed(0)},${sourceY.toFixed(0)}) from ${imgBitmap.width}x${imgBitmap.height}`);
            }

            // Set canvas dimensions and draw
            targetCanvas.width = targetWidth;
            targetCanvas.height = targetHeight;
            const ctx = targetCanvas.getContext("2d", { alpha: false }); // No transparency needed for PNG usually
            ctx.imageSmoothingQuality = "high"; // Use high quality resampling

            // Fill background white if needed (useful if original WEBP had transparency)
            // ctx.fillStyle = '#FFFFFF';
            // ctx.fillRect(0, 0, targetWidth, targetHeight);

            ctx.drawImage(
                imgBitmap,
                sourceX, sourceY,           // Source rectangle top-left
                sourceWidth, sourceHeight,  // Source rectangle size
                0, 0,                       // Destination rectangle top-left
                targetWidth, targetHeight   // Destination rectangle size (resizes/draws cropped area)
            );

            // Convert canvas to PNG Blob
            return new Promise((resolve, reject) => {
                targetCanvas.toBlob(blob => {
                    if (blob) {
                        log(`Converted ${url.substring(0,30)}... to PNG blob (${(blob.size / 1024).toFixed(1)} KB)`);
                        resolve(blob);
                    } else {
                        reject(new Error("Canvas toBlob returned null."));
                    }
                }, "image/png", 0.95); // PNG format, quality (0.95 good default, 1.0 is lossless but larger)
            });

        } catch (error) {
            log(`Error converting image ${url.substring(0,30)}...: ${error.message}`);
            console.error(`Full error for ${url}:`, error);
            // Reject the promise instead of returning null to work better with Promise.allSettled
            throw error; // Re-throw the error to be caught by the caller (.catch or Promise.allSettled)
        }
    }


    // --- Checkbox Insertion and Image Observation ---
    // (No changes needed in this section)
    function insertCheckbox(img) {
        try {
            const a = img.closest('a'); // Find the parent link
            if (!a || a.parentElement?.classList?.contains("sora-image-wrapper")) {
                return; // Already processed or unexpected structure
            }

            // Create wrapper div
            const wrapper = document.createElement("div");
            wrapper.className = "sora-image-wrapper";
            wrapper.style.position = "relative";
            wrapper.style.display = "inline-block";
            wrapper.style.margin = "5px";
            wrapper.style.verticalAlign = "top";
            wrapper.style.lineHeight = "0"; // Prevent extra space below image

            // Create checkbox
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "sora-image-checkbox";
            Object.assign(checkbox.style, {
                position: "absolute", top: "8px", left: "8px", zIndex: "10",
                width: "18px", height: "18px", cursor: "pointer",
                transform: "scale(1.3)", accentColor: "#1f6feb"
            });
            checkbox.title = "Chọn/bỏ chọn ảnh này";

            // Function to set initial checkbox state based on filters (run on load)
            const setInitialCheckboxState = () => {
                try {
                    // Ensure image is fully loaded with valid dimensions
                    if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
                        log(`Image ${img.src.substring(0,30)}... not ready for initial check.`);
                        // Add a small delay and retry? Or rely on MutationObserver? For now, just log.
                        return;
                    }
                    const filterHorizState = document.getElementById('sora-select-horizontal')?.checked ?? false;
                    const filterVertState = document.getElementById('sora-select-vertical')?.checked ?? false;
                    const filterSquareState = document.getElementById('sora-select-square')?.checked ?? false;

                    const imgWidth = img.naturalWidth;
                    const imgHeight = img.naturalHeight;
                    let shouldBeChecked = false;

                    const isHoriz = imgWidth > imgHeight;
                    const isVert = imgHeight > imgWidth;
                    const isSquare = imgWidth === imgHeight;

                    // Determine state based on filters
                    if (!filterHorizState && !filterVertState && !filterSquareState) {
                        shouldBeChecked = false; // Unchecked if no filters active
                    } else {
                        shouldBeChecked = (filterHorizState && isHoriz) || (filterVertState && isVert) || (filterSquareState && isSquare);
                    }

                    // Only change state if needed and update the main selection set
                    if (checkbox.checked !== shouldBeChecked) {
                        checkbox.checked = shouldBeChecked;
                        log(`Initial state for ${img.src.substring(0,30)}... set to ${shouldBeChecked} based on filters.`);
                        if (shouldBeChecked) {
                            if (!selectedImageUrls.has(img.src)) {
                                selectedImageUrls.add(img.src);
                                updateSelectedCount(); // Update count only if state changed
                            }
                        } else {
                            if (selectedImageUrls.has(img.src)) {
                                selectedImageUrls.delete(img.src);
                                updateSelectedCount(); // Update count only if state changed
                            }
                        }
                    } else {
                         // Ensure consistency even if checkbox state didn't change visually
                         if (shouldBeChecked && !selectedImageUrls.has(img.src)) {
                             selectedImageUrls.add(img.src); updateSelectedCount();
                         } else if (!shouldBeChecked && selectedImageUrls.has(img.src)) {
                             selectedImageUrls.delete(img.src); updateSelectedCount();
                         }
                    }


                } catch (e) {
                    log(`Error in setInitialCheckboxState for image: ${img.src.substring(0,50)}...`);
                    console.error(e);
                }
            };

            // Event listener for manual checkbox changes
            checkbox.addEventListener("change", (e) => {
                log(`Manual check change for ${img.src.substring(0,30)}...: ${e.target.checked}`);
                if (e.target.checked) {
                    selectedImageUrls.add(img.src);
                } else {
                    selectedImageUrls.delete(img.src);
                }
                updateSelectedCount(); // Update count on manual change
            });

            // Insert wrapper and move elements
            const parent = a.parentElement;
            parent.insertBefore(wrapper, a);
            wrapper.appendChild(checkbox);
            wrapper.appendChild(a); // Move the link (and image) inside the wrapper

            // Set initial state: if image already loaded, run now; otherwise, add listener
            if (img.complete && img.naturalWidth > 0) {
                log(`Image ${img.src.substring(0,30)}... already complete, running initial check.`);
                setInitialCheckboxState();
            } else {
                log(`Image ${img.src.substring(0,30)}... not complete, adding load listener.`);
                img.addEventListener('load', () => {
                    log(`Image ${img.src.substring(0,30)}... loaded, running initial check.`);
                    setInitialCheckboxState();
                });
                img.addEventListener('error', () => {
                    log(`Failed to load image for checkbox init: ${img.src.substring(0, 50)}...`);
                    // Optionally remove the broken image placeholder/wrapper
                    // wrapper.remove();
                });
            }

        } catch (e) {
            log(`Error inserting checkbox for image: ${img.src?.substring(0,50)}...`);
            console.error(e);
        }
    }

    // MutationObserver to detect newly added images
    // (No changes needed in this section)
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) { // Element node
                        // Find images within links that were added
                        const matchingImages = [];
                        if (node.matches && node.matches('a > img')) { // Check node itself
                             if (!node.closest('.sora-image-wrapper')) { // Check if not already wrapped
                                matchingImages.push(node);
                            }
                        } else if (node.querySelectorAll) { // Check descendants
                            node.querySelectorAll('a > img').forEach(img => {
                                 if (!img.closest('.sora-image-wrapper')) { // Check if not already wrapped
                                    matchingImages.push(img);
                                }
                            });
                        }

                        // Process found images
                        if (matchingImages.length > 0) {
                            log(`Detected ${matchingImages.length} new unwrapped images.`);
                            matchingImages.forEach(img => {
                                insertCheckbox(img);
                            });
                        }
                    }
                }
            }
        }
        // Note: Re-applying filters (updateImageSelection()) here can be resource-intensive.
        // It's generally better to let the 'load' event handle initial state for new images.
    });

    // --- Initialization ---
    // (No changes needed in this section)
    function waitForElement(selector, callback) {
        log(`Waiting for element: ${selector}`);
        let checkCount = 0;
        const maxChecks = 40; // Timeout after 20 seconds
        const interval = setInterval(() => {
            checkCount++;
            const el = document.querySelector(selector);
            if (el) {
                clearInterval(interval);
                log(`Element found: ${selector}. Initializing...`);
                try {
                    callback(el);
                    log("Initialization callback executed.");
                } catch (e) {
                    log("ERROR during initialization callback execution:");
                    console.error(e);
                    alert("Lỗi khi khởi chạy Auto Sora script. Kiểm tra Console (F12).");
                }
            } else if (checkCount >= maxChecks) {
                clearInterval(interval);
                log(`Element ${selector} not found after ${maxChecks * 0.5} seconds. Script may not function correctly.`);
                alert(`Auto Sora: Không tìm thấy phần tử "${selector}" sau ${maxChecks * 0.5} giây. Script có thể không hoạt động đúng.`);
            }
        }, 500);
    }

    // --- Script Entry Point ---
    // (No changes needed in this section)
    // Check if JSZip is loaded (critical dependency)
    if (typeof JSZip === 'undefined') {
        log("FATAL ERROR: JSZip library not loaded. @require may have failed. Download functionality will not work.");
        alert("Lỗi nghiêm trọng: Thư viện JSZip chưa được tải. Chức năng tải xuống sẽ không hoạt động. Kiểm tra cài đặt Tampermonkey và kết nối mạng.");
        return; // Stop script execution
    } else {
        log("JSZip library loaded successfully.");
    }

    // Wait for the main prompt textarea to appear before initializing the UI and observer
    waitForElement('textarea[placeholder*="Describe your"]', () => {
        createUI(); // Create the main UI panel
        log("UI Created.");

        // Initial scan for existing images on the page
        log("Performing initial scan for images...");
        document.querySelectorAll("a > img").forEach(img => {
             if (!img.closest('.sora-image-wrapper')) { // Ensure not already wrapped
                 insertCheckbox(img); // Add checkboxes and set initial state based on filters
             }
        });
        log("Initial image scan complete.");
        updateSelectedCount(); // Ensure count is correct after initial scan

        // Start observing the DOM for newly added images
        log("Starting MutationObserver...");
        observer.observe(document.body, { childList: true, subtree: true });
        log("MutationObserver started.");
    });

})();
