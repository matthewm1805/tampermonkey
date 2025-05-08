// ==UserScript==
// @name         Lummi.ai Enhancer
// @namespace    http://tampermonkey.net/
// @version      2.17.1
// @description  Glass UI, batch download (sequential), filters, count, cropping, enhanced status.
// @author       Matthew M.
// @match        https://www.lummi.ai/*
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @connect      assets.lummi.ai
// @connect      *
// @run-at       document-start
// ==/UserScript==

(function() { // Mở IIFE
    'use strict';

    const logPrefix = '[LummiEnhancer]';
    let initialRunDone = false;
    let panelCreated = false;

    // --- CSS Section (Giữ nguyên) ---
    const styles = `
        /* ... CSS như cũ ... */
        /* --- Base Hiding --- */
        div.relative.overflow-hidden.group\\/item > div.absolute.inset-0.pointer-events-none.z-20 button:not(.userscript-download-btn) {
           display: none !important; visibility: hidden !important; pointer-events: none !important;
        }
        header button span.text-yellow.font-semibold {
             closest('button').style.display = 'none !important';
        }
        div.absolute.w-full.flex.items-center.justify-center[style*="height:calc(100vh - 116px)"],
        div.absolute.w-full.flex.items-center.justify-center > div.bg-background.rounded-xl {
             display: none !important; visibility: hidden !important; opacity: 0 !important;
        }
         div.bg-background.backdrop-blur-xl.absolute[class*="top-"][style*="max-width: 360px"] {
              display: none !important; visibility: hidden !important; opacity: 0 !important;
         }

        /* --- Individual Download Button --- */
         .userscript-download-btn {
            position: absolute; bottom: 10px; right: 10px; z-index: 30;
            background-color: rgba(0, 0, 0, 0.7) !important; color: white !important;
            border: none !important; border-radius: 50% !important;
            width: 32px !important; height: 32px !important; min-width: 32px !important;
            padding: 0 !important; cursor: pointer; display: flex !important;
            align-items: center !important; justify-content: center !important;
            opacity: 0.7; transition: opacity 0.2s ease-in-out, background-color 0.2s ease-in-out;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3); visibility: visible !important;
            pointer-events: auto !important; overflow: hidden;
         }
         .userscript-download-btn:hover {
            opacity: 1; background-color: rgba(0, 0, 0, 0.9) !important;
         }
         .userscript-download-btn svg { width: 16px; height: 16px; fill: currentColor; transition: opacity 0.2s ease; }
         .userscript-download-btn::after { /* Spinner */
            content: ''; position: absolute; width: 100%; height: 100%; top: 0; left: 0;
            border: 3px solid transparent; border-top-color: white; border-radius: 50%;
            box-sizing: border-box; opacity: 0; transition: opacity 0.2s ease;
            animation: userscript-spin 0.8s linear infinite; pointer-events: none;
         }
         .userscript-download-btn.loading svg { opacity: 0.2; }
         .userscript-download-btn.loading::after { opacity: 1; }
         @keyframes userscript-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* --- Batch Download Panel (Glass UI) --- */
        #lummi-enhancer-batch-panel {
            position: fixed; bottom: 20px; left: 20px; z-index: 10000;
            background-color: rgba(0, 0, 0, 0.35);
            backdrop-filter: blur(15px) saturate(180%);
            -webkit-backdrop-filter: blur(15px) saturate(180%);
            padding: 15px;
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.18);
            box-shadow: 0 6px 20px rgba(0,0,0,0.35);
            display: flex; flex-direction: column; gap: 12px;
            color: white; font-family: ui-sans-serif, system-ui, sans-serif;
            opacity: 0; transform: translateY(20px);
            transition: opacity 0.3s ease-out, transform 0.3s ease-out;
            pointer-events: none;
            min-width: 230px;
        }
        #lummi-enhancer-batch-panel.visible {
            opacity: 1; transform: translateY(0); pointer-events: auto;
        }
        .lummi-panel-title {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            text-align: center;
            color: rgba(255, 255, 255, 0.65);
            margin-bottom: -2px;
            font-weight: 500;
        }

        /* Filter Buttons */
        .lummi-enhancer-filter-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
        .lummi-filter-btn {
            background-color: rgba(255, 255, 255, 0.15); color: white;
            border: 1px solid rgba(255, 255, 255, 0.25);
            width: 36px; height: 36px;
            display: flex; align-items: center; justify-content: center;
            padding: 0;
            border-radius: 8px;
            cursor: pointer;
            transition: background-color 0.2s, border-color 0.2s;
        }
        .lummi-filter-btn svg { /* SVG size is set in HTML attributes */ }
        .lummi-filter-btn:hover {
            background-color: rgba(255, 255, 255, 0.25); border-color: rgba(255, 255, 255, 0.35);
        }
        .lummi-filter-btn.deselect {
            background-color: rgba(255, 100, 100, 0.15); border-color: rgba(255, 100, 100, 0.25);
        }
        .lummi-filter-btn.deselect:hover {
            background-color: rgba(255, 100, 100, 0.25); border-color: rgba(255, 100, 100, 0.35);
        }

        /* Crop Options */
        .lummi-enhancer-crop-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
        .lummi-enhancer-crop-row label { font-weight: 500; color: rgba(255,255,255,0.9); }
        #lummi-crop-select {
            background-color: rgba(255, 255, 255, 0.2); color: white;
            border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 6px;
            padding: 6px 10px; font-size: 12px; cursor: pointer; flex-grow: 1;
            -moz-appearance: none; -webkit-appearance: none; appearance: none;
            background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22rgba(255,255,255,0.7)%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.4-5.4-12.8z%22%2F%3E%3C%2Fsvg%3E');
            background-repeat: no-repeat;
            background-position: right 10px center;
            background-size: 8px 8px;
            padding-right: 30px;
        }
        #lummi-crop-select option { background-color: #222; color: white; }

        /* Main Download Button */
        #lummi-batch-download-btn {
            background-color: rgba(76, 175, 80, 0.8); color: white;
            border: 1px solid rgba(76, 175, 80, 0.9); padding: 10px 12px;
            text-align: center; display: inline-flex; align-items: center; gap: 6px;
            font-size: 13px;
            font-weight: 500;
            border-radius: 8px;
            cursor: pointer;
            transition: background-color 0.3s, border-color 0.3s, opacity 0.3s, color 0.3s;
            white-space: nowrap; width: 100%; justify-content: center;
            overflow: hidden; text-overflow: ellipsis;
        }
        #lummi-batch-download-btn:hover:not(:disabled) {
            background-color: rgba(69, 160, 73, 0.9); border-color: rgba(69, 160, 73, 1);
        }
        #lummi-batch-download-btn:disabled {
            background-color: rgba(150, 150, 150, 0.4) !important;
            border-color: rgba(150, 150, 150, 0.5) !important;
            color: rgba(220, 220, 220, 0.6) !important;
            cursor: not-allowed; opacity: 0.6;
        }
        .lummi-selected-count {
            display: inline-block; background-color: rgba(0, 0, 0, 0.5); color: #e0e0e0;
            padding: 1px 7px;
            border-radius: 10px; font-size: 0.85em; font-weight: bold;
            min-width: 18px; text-align: center; line-height: 1.2; vertical-align: baseline;
            margin-left: 3px;
        }
        .lummi-selected-count[data-count="0"] { display: none; }

        /* Image Checkbox */
        .lummi-image-checkbox {
            position: absolute; top: 10px; left: 10px; z-index: 35;
            width: 24px; height: 24px;
            cursor: pointer;
            accent-color: #4CAF50; opacity: 0.7;
            transition: opacity 0.2s ease-in-out;
            background-color: rgba(255,255,255,0.35);
            border: 1px solid rgba(0,0,0,0.25); border-radius: 4px;
        }
        .lummi-image-checkbox:hover { opacity: 1; }
        .lummi-image-checkbox:checked { opacity: 1; }
    `;

    if (typeof GM_addStyle !== "undefined") { GM_addStyle(styles); }
    else { /* ... (style appending logic) ... */ }
    // --- End CSS Section ---

    // --- Helper Functions (Giữ nguyên) ---
    function updateSelectedCount() { /* ... Giữ nguyên ... */
         const downloadBtn = document.getElementById('lummi-batch-download-btn');
        const panel = document.getElementById('lummi-enhancer-batch-panel');
        if (!panel) { return; }
        const checkedCheckboxes = document.querySelectorAll('.lummi-image-checkbox:checked');
        const count = checkedCheckboxes.length;
        const anyCheckboxesOnPage = document.querySelector('.lummi-image-checkbox');
        if (anyCheckboxesOnPage) { if (!panel.classList.contains('visible')) { panel.classList.add('visible'); } }
        if (!downloadBtn) { return; }
        if (downloadBtn.dataset.isProcessing !== 'true') {
            const baseHTML = `Download Selected <span id="lummi-selected-count" class="lummi-selected-count" data-count="0">(0)</span>`;
            downloadBtn.innerHTML = baseHTML;
            const newCountSpan = downloadBtn.querySelector('#lummi-selected-count');
            if (newCountSpan) { newCountSpan.textContent = `(${count})`; newCountSpan.dataset.count = String(count); }
            downloadBtn.disabled = (count === 0);
        } else { /* Status handled by updateButtonStatus */ }
    }
    function createBatchDownloadPanel() { /* ... Giữ nguyên ... */
         if (document.getElementById('lummi-enhancer-batch-panel')) { return; }
        console.log(logPrefix, 'Attempting to create batch download panel...');
        const panel = document.createElement('div'); panel.id = 'lummi-enhancer-batch-panel';
        const panelTitle = document.createElement('div'); panelTitle.className = 'lummi-panel-title'; panelTitle.textContent = 'Quick Actions'; panel.appendChild(panelTitle);
        const filterRow = document.createElement('div'); filterRow.className = 'lummi-enhancer-filter-row';
        const btnH = document.createElement('button'); btnH.title = 'Select Horizontal Images'; btnH.className = 'lummi-filter-btn'; btnH.innerHTML = `<svg width="20" height="13" viewBox="0 0 20 13" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="13" rx="2" fill="currentColor"/></svg>`; btnH.onclick = () => selectByOrientation('horizontal');
        const btnV = document.createElement('button'); btnV.title = 'Select Vertical Images'; btnV.className = 'lummi-filter-btn'; btnV.innerHTML = `<svg width="13" height="20" viewBox="0 0 13 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="13" height="20" rx="2" fill="currentColor"/></svg>`; btnV.onclick = () => selectByOrientation('vertical');
        const btnS = document.createElement('button'); btnS.title = 'Select Square Images'; btnS.className = 'lummi-filter-btn'; btnS.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16" rx="2" fill="currentColor"/></svg>`; btnS.onclick = () => selectByOrientation('square');
        const btnClear = document.createElement('button'); btnClear.title = 'Deselect All Images'; btnClear.className = 'lummi-filter-btn deselect'; btnClear.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.3334 2.66699L2.66675 13.3337M2.66675 2.66699L13.3334 13.3337" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`; btnClear.onclick = () => selectByOrientation('none');
        filterRow.append(btnH, btnV, btnS, btnClear); panel.appendChild(filterRow);
        const cropRow = document.createElement('div'); cropRow.className = 'lummi-enhancer-crop-row'; const cropLabel = document.createElement('label'); cropLabel.textContent = 'Crop:'; cropLabel.htmlFor = 'lummi-crop-select'; const cropSelect = document.createElement('select'); cropSelect.id = 'lummi-crop-select'; cropSelect.innerHTML = `<option value="original">Original</option><option value="16:9">16:9 (Landscape)</option><option value="9:16">9:16 (Portrait)</option><option value="1:1">1:1 (Square)</option>`; cropRow.append(cropLabel, cropSelect); panel.appendChild(cropRow);
        const downloadBtn = document.createElement('button'); downloadBtn.id = 'lummi-batch-download-btn'; downloadBtn.type = 'button'; downloadBtn.addEventListener('click', () => handleDownloadSelected(downloadBtn)); panel.appendChild(downloadBtn);
        const appendPanelInterval = setInterval(() => { if (document.body) { document.body.appendChild(panel); clearInterval(appendPanelInterval); panelCreated = true; console.log(logPrefix, 'Batch download panel appended.'); setTimeout(updateSelectedCount, 150); } }, 100);
    }
    function selectByOrientation(orientation) { /* ... Giữ nguyên ... */
        console.log(logPrefix, `Applying orientation filter: ${orientation}`);
        const checkboxes = document.querySelectorAll('.lummi-image-checkbox'); let anyCheckboxStateChanged = false;
        if (orientation === 'none') { checkboxes.forEach(cb => { if (cb.checked) { cb.checked = false; anyCheckboxStateChanged = true; } }); }
        else { checkboxes.forEach(cb => { const cbOrientation = cb.dataset.orientation; if (cbOrientation === orientation) { if (!cb.checked) { cb.checked = true; anyCheckboxStateChanged = true; } } }); }
        updateSelectedCount(); if (anyCheckboxStateChanged) console.log(logPrefix, `Selection by orientation finished. Checkbox states changed.`); else console.log(logPrefix, `Selection by orientation finished. No checkbox states changed.`);
    }
    function fetchBlob(url, filenameForLog = 'image') { /* ... Giữ nguyên ... */
         return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({ method: "GET", url: url, responseType: 'blob', headers: { "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" }, timeout: 45000,
                onload: function(response) { if (response.status >= 200 && response.status < 300) { if (response.response && response.response.size > 0) { resolve(response.response); } else { reject(new Error(`Fetched blob is empty for ${filenameForLog}`)); } } else { reject(new Error(`Fetch failed (${response.status} ${response.statusText}) for ${filenameForLog}`)); } },
                onerror: (error) => reject(new Error(`Network error fetching ${filenameForLog}: ${error.error || 'Unknown error'}`)),
                ontimeout: () => reject(new Error(`Timeout fetching ${filenameForLog}`))
            });
        });
    }
    async function cropImageFromBlob(imageBlob, originalFilename, cropType) { /* ... Giữ nguyên ... */
        return new Promise((resolve, reject) => {
            if (!imageBlob || imageBlob.size === 0) { return reject(new Error('Input blob is empty for cropping.')); }
            if (cropType === 'original') { return resolve({ blob: imageBlob, filename: originalFilename }); }
            const objectURL = URL.createObjectURL(imageBlob); const img = new Image();
            img.onload = () => { URL.revokeObjectURL(objectURL); if (img.naturalWidth === 0 || img.naturalHeight === 0) { return reject(new Error('Image loaded with zero dimensions for cropping.')); }
                const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const originalWidth = img.naturalWidth; const originalHeight = img.naturalHeight; let sx = 0, sy = 0, sWidth = originalWidth, sHeight = originalHeight; let targetAspectRatio;
                if (cropType === '16:9') targetAspectRatio = 16 / 9; else if (cropType === '9:16') targetAspectRatio = 9 / 16; else if (cropType === '1:1') targetAspectRatio = 1; else { return resolve({ blob: imageBlob, filename: originalFilename }); }
                const originalAspectRatio = originalWidth / originalHeight;
                if (Math.abs(originalAspectRatio - targetAspectRatio) < 0.01) { return resolve({ blob: imageBlob, filename: originalFilename }); } else if (originalAspectRatio > targetAspectRatio) { sWidth = originalHeight * targetAspectRatio; sx = (originalWidth - sWidth) / 2; } else { sHeight = originalWidth / targetAspectRatio; sy = (originalHeight - sHeight) / 2; }
                canvas.width = Math.round(sWidth); canvas.height = Math.round(sHeight);
                try { ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height); } catch (drawError) { return reject(new Error(`Canvas drawImage failed during crop: ${drawError.message}`)); }
                let outputMimeType = imageBlob.type; if (!outputMimeType || !outputMimeType.startsWith('image/')) outputMimeType = 'image/png'; if (outputMimeType === 'image/webp' && !canvas.toDataURL('image/webp').startsWith('data:image/webp')) outputMimeType = 'image/png';
                canvas.toBlob((croppedBlob) => { if (croppedBlob && croppedBlob.size > 0) { const nameParts = originalFilename.split('.'); const extension = nameParts.length > 1 ? nameParts.pop().toLowerCase() : (outputMimeType.split('/')[1] || 'png'); const baseName = nameParts.join('.'); const croppedFilename = `${baseName}_crop_${cropType.replace(':', 'x')}.${extension}`; resolve({ blob: croppedBlob, filename: croppedFilename }); } else { reject(new Error('Canvas toBlob failed or produced empty blob after cropping.')); } }, outputMimeType, 0.92);
            };
            img.onerror = () => { URL.revokeObjectURL(objectURL); reject(new Error(`Failed to load image blob into Image object for ${originalFilename} during crop.`)); };
            img.src = objectURL;
        });
    }

    // --- SỬA LỖI handleDownloadSelected (Phiên bản 2.17.1) ---
    async function handleDownloadSelected(btnElement) {
        if (btnElement.dataset.isProcessing === 'true') {
            console.warn(logPrefix, "Download process already running.");
            return;
        }

        const checkedCheckboxes = Array.from(document.querySelectorAll('.lummi-image-checkbox:checked'));
        const totalToProcess = checkedCheckboxes.length;
        const selectedCrop = document.getElementById('lummi-crop-select')?.value || 'original';

        if (totalToProcess === 0) { alert('No images selected.'); return; }

        btnElement.dataset.isProcessing = 'true';
        btnElement.disabled = true;
        const originalButtonBaseHTML = `Download Selected`;

        let filesDownloadedSuccessfully = 0;
        let filesErrored = 0;

        function updateButtonStatus(mainText, detail = "") {
             // Sửa lỗi: Đảm bảo detail được hiển thị đúng cách
             const countDetail = detail ? detail : `(${totalToProcess - filesDownloadedSuccessfully - filesErrored})`;
             const countSpanHTML = `<span id="lummi-selected-count" class="lummi-selected-count" data-count="${totalToProcess}">${countDetail}</span>`;
             btnElement.innerHTML = `${mainText} ${countSpanHTML}`;
        }

        // --- SINGLE FILE LOGIC ---
        if (totalToProcess === 1) {
            const checkbox = checkedCheckboxes[0];
            const downloadUrl = checkbox.dataset.downloadUrl;
            let filename = checkbox.dataset.filename;

            if (!downloadUrl || !filename) {
                alert("Error: Missing image data.");
                btnElement.innerHTML = `${originalButtonBaseHTML} <span id="lummi-selected-count" class="lummi-selected-count" data-count="0">(0)</span>`;
                delete btnElement.dataset.isProcessing;
                updateSelectedCount();
                return;
            }

            let filesAttemptedCount = 0; // Biến cục bộ cho single file
            updateButtonStatus("Fetching", "1/1");
            console.log(logPrefix, "[SINGLE] Starting single file download for:", filename);
            try {
                const originalBlob = await fetchBlob(downloadUrl, filename);
                console.log(logPrefix, "[SINGLE] Fetched blob:", originalBlob);
                filesAttemptedCount = 1;
                let blobToDownload = originalBlob; let finalFilename = filename;

                if (selectedCrop !== 'original') {
                    updateButtonStatus("Cropping", "1/1");
                    console.log(logPrefix, "[SINGLE] Cropping...");
                    const cropResult = await cropImageFromBlob(originalBlob, filename, selectedCrop);
                    blobToDownload = cropResult.blob; finalFilename = cropResult.filename;
                    console.log(logPrefix, "[SINGLE] Cropped blob:", blobToDownload);
                }
                filesDownloadedSuccessfully = 1; // Đánh dấu thành công
                updateButtonStatus("Downloading", "1/1");
                const objectUrl = URL.createObjectURL(blobToDownload);
                GM_download({
                    url: objectUrl, name: finalFilename,
                    onload: () => { console.log(logPrefix, `[SINGLE] Downloaded: ${finalFilename}`); },
                    onerror: (err) => { filesErrored++; console.error(logPrefix, `[SINGLE] DL Error:`, err); alert(`Error downloading.`); },
                    ontimeout: () => { filesErrored++; console.error(logPrefix, `[SINGLE] DL Timeout`); alert(`Timeout downloading.`); },
                    finally: () => {
                        URL.revokeObjectURL(objectUrl);
                        btnElement.innerHTML = `${originalButtonBaseHTML} <span id="lummi-selected-count" class="lummi-selected-count" data-count="0">(0)</span>`;
                        checkbox.checked = false;
                        delete btnElement.dataset.isProcessing;
                        updateSelectedCount();
                         console.log(logPrefix, "[SINGLE] Process finished.");
                    }
                });
            } catch (error) {
                filesErrored++;
                console.error(logPrefix, `[SINGLE] Error processing single file:`, error);
                alert(`Error processing file: ${error.message}`);
                btnElement.innerHTML = `${originalButtonBaseHTML} <span id="lummi-selected-count" class="lummi-selected-count" data-count="0">(0)</span>`;
                delete btnElement.dataset.isProcessing;
                updateSelectedCount();
            }
            return; // Kết thúc hàm nếu chỉ có 1 file
        }


        // --- SEQUENTIAL DOWNLOAD LOGIC (>= 2 files) ---
        // Sửa lỗi ReferenceError: Thay thế log(...) bằng console.log(logPrefix, ...)
        console.log(logPrefix, `Starting sequential download for ${totalToProcess} files. Crop: ${selectedCrop}`);

        for (let i = 0; i < totalToProcess; i++) {
            if (btnElement.dataset.isProcessing !== 'true') {
                console.log(logPrefix, "Download process cancelled by user (hypothetical).");
                break;
            }

            const checkbox = checkedCheckboxes[i];
            const downloadUrl = checkbox.dataset.downloadUrl;
            let filename = checkbox.dataset.filename;
            const currentFileNum = i + 1;

            updateButtonStatus(`Processing`, `${currentFileNum}/${totalToProcess}`);
            console.log(logPrefix, `[Seq DL ${currentFileNum}/${totalToProcess}] Processing: ${filename}`);

            if (!downloadUrl || !filename) {
                filesErrored++;
                console.error(logPrefix, `[Seq DL ${currentFileNum}/${totalToProcess}] Missing data for item.`);
                continue;
            }

            try {
                updateButtonStatus(`Fetching`, `${currentFileNum}/${totalToProcess}`);
                console.log(logPrefix, `[Seq DL ${currentFileNum}/${totalToProcess}] Fetching...`);
                const originalBlob = await fetchBlob(downloadUrl, filename);
                let blobToDownload = originalBlob;
                let finalFilename = filename;

                if (selectedCrop !== 'original') {
                    updateButtonStatus(`Cropping`, `${currentFileNum}/${totalToProcess}`);
                    console.log(logPrefix, `[Seq DL ${currentFileNum}/${totalToProcess}] Cropping...`);
                    const cropResult = await cropImageFromBlob(originalBlob, filename, selectedCrop);
                    blobToDownload = cropResult.blob;
                    finalFilename = cropResult.filename;
                }

                updateButtonStatus(`Downloading`, `${currentFileNum}/${totalToProcess}`);
                console.log(logPrefix, `[Seq DL ${currentFileNum}/${totalToProcess}] Starting download for ${finalFilename}...`);
                const objectUrl = URL.createObjectURL(blobToDownload);

                await new Promise((resolve, reject) => {
                    GM_download({
                        url: objectUrl, name: finalFilename,
                        onload: () => { console.log(logPrefix, `[Seq DL ${currentFileNum}/${totalToProcess}] Download successful: ${finalFilename}`); filesDownloadedSuccessfully++; resolve(); },
                        onerror: (err) => { console.error(logPrefix, `[Seq DL ${currentFileNum}/${totalToProcess}] GM_download Error for ${finalFilename}:`, err); filesErrored++; reject(new Error("GM_download failed")); },
                        ontimeout: () => { console.error(logPrefix, `[Seq DL ${currentFileNum}/${totalToProcess}] GM_download Timeout for ${finalFilename}`); filesErrored++; reject(new Error("GM_download timed out")); }
                    });
                });

                URL.revokeObjectURL(objectUrl);

            } catch (error) {
                filesErrored++;
                console.error(logPrefix, `[Seq DL ${currentFileNum}/${totalToProcess}] Error processing file ${filename}:`, error);
            }

            if (currentFileNum < totalToProcess) {
                await new Promise(resolve => setTimeout(resolve, 350));
             }
        } // End of for loop

        // --- Final UI Update ---
        console.log(logPrefix, `Sequential download finished. Success: ${filesDownloadedSuccessfully}, Errors: ${filesErrored}`);
        alert(`Batch download finished.\nSuccessfully downloaded: ${filesDownloadedSuccessfully}\nFailed: ${filesErrored}`);

        btnElement.innerHTML = `${originalButtonBaseHTML} <span id="lummi-selected-count" class="lummi-selected-count" data-count="0">(0)</span>`;
        checkedCheckboxes.forEach(cb => cb.checked = false);
        delete btnElement.dataset.isProcessing;
        updateSelectedCount();

    } // End of handleDownloadSelected

    // --- Core Logic (Giữ nguyên) ---
    function processUndesiredElements() { /* ... Giữ nguyên ... */
        document.querySelectorAll('header button span.text-yellow.font-semibold').forEach(span => { const button = span.closest('button'); if (button && !button.dataset.lummiProcessedProButton) { button.style.display = 'none'; button.dataset.lummiProcessedProButton = 'true'; } });
        document.querySelectorAll('div.absolute.w-full.flex.items-center.justify-center').forEach(modal => { if (!modal.parentElement || modal.dataset.lummiProcessedModal) return; const titleElement = modal.querySelector('div.text-h3, div.sm\\:text-h2'); const styleAttribute = modal.getAttribute('style'); const hasUpgradeText = titleElement && titleElement.textContent.includes('Get full access to Lummi'); const hasSpecificStyle = styleAttribute && styleAttribute.includes('height:calc(100vh - 116px)'); if (hasUpgradeText || hasSpecificStyle) { try { modal.remove(); modal.dataset.lummiProcessedModal = 'true'; } catch (e) { /* ignore */ } } });
        document.querySelectorAll('div.bg-background.backdrop-blur-xl.absolute[style*="max-width: 360px"]').forEach(banner => { if (!banner.parentElement || banner.dataset.lummiProcessedBanner) return; const pElement = banner.querySelector('p.font-medium'); if (pElement && pElement.textContent.includes('You are previewing Lummi Pro')) { try { banner.remove(); banner.dataset.lummiProcessedBanner = 'true'; } catch (e) { /* ignore */ } } });
    }
    function processImageItems() { /* ... Giữ nguyên ... */
         const imageContainers = document.querySelectorAll('div.relative.overflow-hidden.group\\/item'); let countNeedsUpdate = false;
        imageContainers.forEach((container) => {
            const imageWrapper = container.querySelector('div.h-min.w-auto.relative.z-10'); if (!imageWrapper) return;
            const checkboxExists = imageWrapper.querySelector('.lummi-image-checkbox'); const indDownloadBtnExists = imageWrapper.querySelector('.userscript-download-btn');
            const hoverOverlay = container.querySelector('div.absolute.inset-0.pointer-events-none.z-20'); if (hoverOverlay && !hoverOverlay.dataset.lummiProcessedOverlay) { const originalButtons = hoverOverlay.querySelectorAll('button:not(.userscript-download-btn)'); originalButtons.forEach(btn => btn.style.display = 'none'); hoverOverlay.dataset.lummiProcessedOverlay = 'true'; }
            const linkElement = imageWrapper.querySelector('a[href^="/photo/"], a[href^="/illustration/"], a[href^="/3d/"]'); if (!linkElement) return;
            let orientation = 'unknown'; let aspectRatio = null; const aspectPlaceholder = container.querySelector('div.overflow-hidden[style*="aspect-ratio"]'); const imgElementDirect = imageWrapper.querySelector('img[src^="https://assets.lummi.ai/assets/"], img[src^="https://www.lummi.ai/api/pro/image/"]'); const svgImageElement = imageWrapper.querySelector('svg > image[href]');
            if (aspectPlaceholder?.style.aspectRatio) { try { const parts = aspectPlaceholder.style.aspectRatio.split('/').map(s => parseFloat(s.trim())); if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[1] !== 0) aspectRatio = parts[0] / parts[1]; } catch (e) {} } else if (imgElementDirect && imgElementDirect.naturalWidth > 0 && imgElementDirect.naturalHeight > 0) { aspectRatio = imgElementDirect.naturalWidth / imgElementDirect.naturalHeight; } else if (svgImageElement?.getBBox) { try { const bbox = svgImageElement.getBBox(); if (bbox.width > 0 && bbox.height > 0) aspectRatio = bbox.width / bbox.height; } catch(e) {} }
            if (aspectRatio) { if (Math.abs(aspectRatio - 1) < 0.05) orientation = 'square'; else if (aspectRatio > 1) orientation = 'horizontal'; else orientation = 'vertical'; }
            let rawImageUrl = null; let imageUrlSource = null; let isBgRemovedVersion = false; let isApiProUrl = false; const bgRemoveSvgImage = imageWrapper.querySelector('svg > image[href*="bg-remove=true"]'); if (bgRemoveSvgImage) { rawImageUrl = bgRemoveSvgImage.getAttribute('href'); isBgRemovedVersion = true; imageUrlSource = 'SVG (bg-remove)'; } if (!rawImageUrl) { const proApiImg = imageWrapper.querySelector('img[src^="https://www.lummi.ai/api/pro/image/"]'); if (proApiImg) { rawImageUrl = proApiImg.getAttribute('src'); imageUrlSource = 'IMG (API)'; isApiProUrl = true; } } if (!rawImageUrl) { const anySvgImage = imageWrapper.querySelector('svg > image[href^="https://assets.lummi.ai/assets/"]'); if (anySvgImage) { rawImageUrl = anySvgImage.getAttribute('href'); imageUrlSource = 'SVG (assets)'; } } if (!rawImageUrl) { const assetsImg = imageWrapper.querySelector('img[src^="https://assets.lummi.ai/assets/"]'); if (assetsImg) { rawImageUrl = assetsImg.getAttribute('src'); imageUrlSource = 'IMG (assets)'; } }
            if (rawImageUrl) {
                 let downloadUrl; const baseUrl = rawImageUrl.split('?')[0]; if (isApiProUrl) downloadUrl = rawImageUrl; else if (isBgRemovedVersion) downloadUrl = baseUrl + '?bg-remove=true'; else downloadUrl = baseUrl;
                 const photoPageUrl = linkElement.getAttribute('href'); let filename = 'lummi-image.jpg'; try { const slug = photoPageUrl.split('/').pop().split('?')[0]; if (slug) { const sanitizedSlug = slug.replace(/[^a-zA-Z0-9_-]/g, '_'); const defaultExt = isBgRemovedVersion ? 'png' : (baseUrl.match(/\.(png)/i) ? 'png' : 'jpg'); const extension = isApiProUrl ? defaultExt : (baseUrl.match(/\.(jpe?g|png|webp|gif)/i)?.[1]?.toLowerCase() ?? defaultExt); filename = `${sanitizedSlug}${isBgRemovedVersion ? '_bg_removed' : ''}.${extension}`; } } catch (e) { console.error(logPrefix, "Error parsing filename", e); }
                 if (!checkboxExists) { const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'lummi-image-checkbox'; checkbox.title = `Select ${filename} (${orientation})`; checkbox.dataset.downloadUrl = downloadUrl; checkbox.dataset.filename = filename; checkbox.dataset.orientation = orientation; checkbox.addEventListener('click', (event) => event.stopPropagation()); checkbox.addEventListener('change', updateSelectedCount); imageWrapper.appendChild(checkbox); countNeedsUpdate = true; } else { if (checkboxExists.dataset.orientation !== orientation || checkboxExists.dataset.downloadUrl !== downloadUrl || checkboxExists.dataset.filename !== filename) { checkboxExists.dataset.orientation = orientation; checkboxExists.dataset.downloadUrl = downloadUrl; checkboxExists.dataset.filename = filename; checkboxExists.title = `Select ${filename} (${orientation})`; } }
                 if (!indDownloadBtnExists) { const indDownloadBtn = document.createElement('button'); indDownloadBtn.className = 'userscript-download-btn'; indDownloadBtn.title = `Download ${filename}`; indDownloadBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z"></path></svg>`; indDownloadBtn.addEventListener('click', (event) => { /* ... Logic individual download không đổi ... */ }); imageWrapper.appendChild(indDownloadBtn); }
            }
        });
        if (countNeedsUpdate && panelCreated) { updateSelectedCount(); }
    }
    function runEnhancements(isCalledFromObserver = false) { /* ... Giữ nguyên ... */
        if (!document.getElementById('lummi-enhancer-batch-panel') && !panelCreated) { createBatchDownloadPanel(); } else if (document.getElementById('lummi-enhancer-batch-panel') && !panelCreated) { panelCreated = true; }
        processUndesiredElements(); processImageItems();
        if (panelCreated || document.getElementById('lummi-enhancer-batch-panel')) { updateSelectedCount(); }
        if (!initialRunDone && !isCalledFromObserver) { initialRunDone = true; console.log(logPrefix, 'Initial full run complete.'); }
    }
    setTimeout(() => runEnhancements(false), 800);
    setTimeout(() => runEnhancements(false), 2000);
    const observer = new MutationObserver((mutationsList) => { /* ... Giữ nguyên ... */
        let relevantChange = false; for (const mutation of mutationsList) { if (mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) { if (mutation.addedNodes.length > 0) { for (const node of mutation.addedNodes) { if (node.nodeType === 1 && (node.matches('div.relative.overflow-hidden.group\\/item') || node.querySelector('div.relative.overflow-hidden.group\\/item'))) { relevantChange = true; break; } } } if (!relevantChange && mutation.removedNodes.length > 0) { let isModalRemoval = false; for (const node of mutation.removedNodes) { if (node.nodeType === 1 && node.matches('div[id^="headlessui-portal-root"]')) { isModalRemoval = true; break; } } if (!isModalRemoval) relevantChange = true; } if (relevantChange) break; } if (!relevantChange && mutation.type === 'attributes' && ['style', 'class', 'src', 'href', 'data-state'].includes(mutation.attributeName)) { if (mutation.target.closest && mutation.target.closest('div.relative.overflow-hidden.group\\/item')) { relevantChange = true; break; } } }
        if (relevantChange) { if (observer._debounceTimeout) clearTimeout(observer._debounceTimeout); observer._debounceTimeout = setTimeout(() => runEnhancements(true), 650); }
    });
    const startObserving = () => { /* ... Giữ nguyên ... */
        if (document.body) { console.log(logPrefix, "Body found, starting MutationObserver."); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'src', 'href', 'data-state', 'id'] }); if (!initialRunDone) { setTimeout(() => runEnhancements(false), 200); } } else { setTimeout(startObserving, 150); }
    };
    startObserving();

    console.log(logPrefix, 'Script active, v2.17.1 (Fixed ReferenceError, Sequential DL) enhancements enabled.');

})();
