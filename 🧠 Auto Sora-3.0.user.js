// ==UserScript==
// @name         🧠 Auto Sora
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Tự động generate hình trên Sora, tự động tải hình.
// @author       Matthew M.
// @match        *://sora.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let promptQueue = [];
    let totalPromptCount = 0;
    let isRunning = false;
    let countdownInterval = null;
    let cooldownTime = 130;

    let selectedImageUrls = new Set();
    let selectAllEnabled = false;
    let isDownloading = false;

    function log(msg) {
        console.log(`[Auto Sora] ${msg}`);
    }

    function createUI() {
        const wrapper = document.createElement('div');
        wrapper.id = 'sora-auto-ui';
        wrapper.style.cssText = `
            position: fixed;
            bottom: 8px;
            left: 20px;
            background: rgba(25, 25, 25, 0.96);
            padding: 18px;
            border-radius: 16px;
            z-index: 999999;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
            width: 320px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #f1f1f1;
            backdrop-filter: blur(10px);
        `;

        wrapper.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="margin: 0; font-size: 16px; display: flex; align-items: center; gap: 8px;">
                    <img src="https://www.svgrepo.com/show/306500/openai.svg" width="20" height="20" style="filter: invert(1);" alt="OpenAI Logo"/>
                    Auto Sora 3.0
                </h3>
                <button id="sora-close" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #aaa;">✕</button>
            </div>
            <label style="font-size: 14px; color: #ccc;">  Nhập danh sách prompt:</label>
            <textarea rows="6" id="sora-input" placeholder="Mỗi dòng tương ứng với một prompt..." style="width: 100%; padding: 10px; border: 1px solid #444; background: #1a1a1a; border-radius: 8px; resize: none; font-size: 14px; color: #eee;"></textarea>
            <label style="margin-top: 8px; display: block; font-size: 13px; color: #ccc;">⏱️ Cooldown mỗi prompt (giây):</label>
            <input id="sora-cooldown-time" type="number" min="1" value="130" style="width: 100%; padding: 6px 10px; border: 1px solid #444; background: #111; color: #fff; border-radius: 6px; font-size: 14px; margin-top: 4px;" />
            <div style="margin-top: 12px; display: flex; gap: 8px;">
                <button id="sora-start" style="flex: 1; background: #1f6feb; color: white; padding: 8px; border: none; border-radius: 8px;">▶  Bắt đầu</button>
                <button id="sora-clear" style="flex: 1; background: #333; color: #ddd; padding: 8px; border: none; border-radius: 8px;">🗑️ Xóa</button>
            </div>
            <button id="sora-download-images" style="margin-top: 16px; background: #2ea043; color: white; padding: 8px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; width: 100%;">Tải hình (0)</button>
            <div style="margin-top: 8px; display: flex; align-items: center; gap: 6px;">
                <input type="checkbox" id="sora-select-all" />
                <label for="sora-select-all" style="font-size: 13px; color: #bbb;">Chọn tất cả ảnh hiển thị</label>
            </div>
        `;
        document.body.appendChild(wrapper);

        document.getElementById('sora-start').onclick = () => {
            const input = document.getElementById('sora-input').value;
            const prompts = input.split('\n').map(x => x.trim()).filter(Boolean);
            const cooldownInput = parseInt(document.getElementById('sora-cooldown-time').value);
            cooldownTime = isNaN(cooldownInput) ? 130 : Math.max(1, cooldownInput);

            if (prompts.length === 0) return alert("❗ Nhập ít nhất 1 prompt.");
            promptQueue = prompts;
            totalPromptCount = prompts.length;
            isRunning = true;
            wrapper.remove();
            document.getElementById('sora-progress').style.display = 'block';
            document.getElementById('sora-cooldown').style.display = 'block';
            updateProgress();
            startLoop();
        };

        document.getElementById('sora-clear').onclick = () => {
            document.getElementById('sora-input').value = '';
        };

        document.getElementById('sora-close').onclick = () => wrapper.remove();
        document.getElementById('sora-download-images').onclick = handleDownload;
        document.getElementById('sora-select-all').addEventListener("change", (e) => {
            selectAllEnabled = e.target.checked;
            document.querySelectorAll(".sora-image-checkbox").forEach(cb => {
                const img = cb.parentElement.querySelector("img");
                cb.checked = selectAllEnabled;
                if (img) {
                    if (selectAllEnabled) selectedImageUrls.add(img.src);
                    else selectedImageUrls.delete(img.src);
                }
            });
            updateSelectedCount();
        });

        const progress = document.createElement('div');
        progress.id = 'sora-progress';
        progress.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: rgba(25, 25, 25, 0.9);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 10px;
            padding: 8px 16px;
            font-size: 14px;
            z-index: 999999;
            display: none;
            color: #eee;
            backdrop-filter: blur(8px);
        `;
        progress.textContent = 'Đang xử lý...';
        document.body.appendChild(progress);

        const cooldownBtn = document.createElement('button');
        cooldownBtn.id = 'sora-cooldown';
        cooldownBtn.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 180px;
            background: rgba(25, 25, 25, 0.9);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 10px;
            padding: 8px 16px;
            font-size: 14px;
            z-index: 999999;
            color: #eee;
            display: none;
            backdrop-filter: blur(8px);
        `;
        cooldownBtn.textContent = `⏳ Cooldown: ${cooldownTime}s`;
        document.body.appendChild(cooldownBtn);
    }

    function updateProgress() {
        const done = totalPromptCount - promptQueue.length;
        const progress = document.getElementById('sora-progress');
        progress.textContent = `📈 Đã gửi: ${done} / ${totalPromptCount}`;
        if (!isRunning) {
            setTimeout(() => {
                progress?.remove();
                document.getElementById('sora-cooldown')?.remove();
            }, 3000);
        }
    }

    function startCountdown() {
        let timeRemaining = cooldownTime;
        const cooldownBtn = document.getElementById('sora-cooldown');
        cooldownBtn.textContent = `⏳ Cooldown: ${timeRemaining}s`;
        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = setInterval(() => {
            timeRemaining--;
            cooldownBtn.textContent = `⏳ Cooldown: ${timeRemaining}s`;
            if (timeRemaining <= 0) clearInterval(countdownInterval);
        }, 1000);
    }

    function submitPrompt(prompt) {
        const textarea = document.querySelector('textarea[placeholder="Describe your image..."]');
        if (!textarea) return;

        textarea.value = prompt;
        const key = Object.keys(textarea).find(k => k.startsWith("__reactProps$"));
        if (key && textarea[key]?.onChange) textarea[key].onChange({ target: textarea });

        setTimeout(() => {
            const btn = document.querySelector('button[data-disabled="false"]');
            if (btn) {
                const key = Object.keys(btn).find(k => k.startsWith("__reactProps$"));
                if (key && btn[key]?.onClick) {
                    btn[key].onClick({ bubbles: true, cancelable: true, isTrusted: true });
                }
            }
        }, 500);
    }

    function processNextPrompt() {
        setTimeout(() => {
            if (promptQueue.length > 0) {
                const nextPrompt = promptQueue.shift();
                submitPrompt(nextPrompt);
                updateProgress();
                startCountdown();
                processNextPrompt();
            } else {
                isRunning = false;
                updateProgress();
            }
        }, cooldownTime * 1000);
    }

    function startLoop() {
        if (!isRunning || promptQueue.length === 0) {
            isRunning = false;
            updateProgress();
            return;
        }
        const prompt = promptQueue.shift();
        submitPrompt(prompt);
        updateProgress();
        startCountdown();
        processNextPrompt();
    }

    function updateSelectedCount() {
        const count = selectedImageUrls.size;
        const btn = document.getElementById("sora-download-images");
        if (btn && !isDownloading) btn.textContent = `Tải hình (${count})`;
    }

    async function handleDownload() {
        const btn = document.getElementById("sora-download-images");
        if (!btn) return;

        if (isDownloading) {
            isDownloading = false;
            btn.textContent = `🛑 Đã dừng tải`;
            return;
        }

        const urls = Array.from(new Set(selectedImageUrls));
        if (urls.length === 0) return;

        isDownloading = true;
        btn.textContent = ` Đang tải ${urls.length} ảnh...`;

        const zip = new JSZip();
        await Promise.all(urls.map(async (url, i) => {
            const blob = await convertWebpToPngBlob(url);
            zip.file(`image_${i + 1}.png`, blob);
        }));

        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = "selected_images_png.zip";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        isDownloading = false;
        btn.textContent = `✅ Đã tải xong ${urls.length} ảnh`;
        setTimeout(updateSelectedCount, 2000);
    }

    async function convertWebpToPngBlob(url) {
        const response = await fetch(url);
        const webpBlob = await response.blob();
        const imgBitmap = await createImageBitmap(webpBlob);
        const canvas = document.createElement("canvas");
        canvas.width = imgBitmap.width;
        canvas.height = imgBitmap.height;
        canvas.getContext("2d").drawImage(imgBitmap, 0, 0);
        return new Promise(resolve => canvas.toBlob(blob => resolve(blob), "image/png"));
    }

    function insertCheckbox(img) {
        const a = img.parentElement;
        if (a?.parentElement?.classList?.contains("sora-image-wrapper")) return;

        const wrapper = document.createElement("div");
        wrapper.className = "sora-image-wrapper";
        wrapper.style.position = "relative";
        wrapper.style.display = "inline-block";
        wrapper.style.margin = "5px";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "sora-image-checkbox";
        Object.assign(checkbox.style, {
            position: "absolute",
            top: "8px",
            left: "8px",
            zIndex: "10",
            width: "20px",
            height: "20px",
            transform: "scale(1.3)",
            background: "white"
        });

        checkbox.checked = selectAllEnabled || selectedImageUrls.has(img.src);
        if (checkbox.checked) selectedImageUrls.add(img.src);
        updateSelectedCount();

        checkbox.addEventListener("change", () => {
            if (checkbox.checked) selectedImageUrls.add(img.src);
            else selectedImageUrls.delete(img.src);
            updateSelectedCount();
        });

        const parent = a.parentElement;
        parent.insertBefore(wrapper, a);
        wrapper.appendChild(checkbox);
        wrapper.appendChild(a);
    }

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) {
                    const imgs = node.querySelectorAll?.("a > img") || [];
                    imgs.forEach(insertCheckbox);
                }
            }
        }
    });

    function waitForElement(selector, callback) {
        const interval = setInterval(() => {
            const el = document.querySelector(selector);
            if (el) {
                clearInterval(interval);
                callback(el);
            }
        }, 500);
    }

    waitForElement('textarea[placeholder="Describe your image..."]', () => {
        createUI();
        document.querySelectorAll("a > img").forEach(insertCheckbox);
        observer.observe(document.body, { childList: true, subtree: true });
    });

    const jszipScript = document.createElement("script");
    jszipScript.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    document.head.appendChild(jszipScript);
})();
