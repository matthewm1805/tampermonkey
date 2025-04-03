// ==UserScript==
// @name         🧠 Auto Sora
// @namespace    http://tampermonkey.net/
// @version      2.15
// @description  Tự động nhập và gửi prompt trên sora.com/library, với timer đếm ngược 130 giây hiển thị trên console và button cooldown.
// @author       Matthew M.
// @match        https://sora.com/library
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let promptQueue = [];
    let totalPromptCount = 0;
    let isRunning = false;
    let lastProgress = 0;
    let retryCount = 0;
    let taskInProgress = false;
    let countdownInterval = null;
    let cooldownTime = 130; // Thời gian cooldown mặc định

    function log(msg) {
        console.log(`[🧠 Auto Sora] ${msg}`);
    }

    // Tạo UI nhập prompt
    function createUI() {
        const wrapper = document.createElement('div');
        wrapper.id = 'sora-auto-ui';
        wrapper.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 20px;
            background: #ffffff;
            padding: 20px;
            border-radius: 12px;
            z-index: 999999;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            width: 320px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            border: 1px solid #e0e0e0;
        `;
        wrapper.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="margin: 0; font-size: 16px; color: #333;">🧠 Auto Sora</h3>
                <button id="sora-close" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #888; transition: color 0.2s;">✕</button>
            </div>
            <label style="font-size: 14px; color: #555; display: block; margin-bottom: 8px;">📌 Nhập prompt (mỗi dòng 1 prompt):</label>
            <textarea rows="6" id="sora-input" placeholder="Nhập prompt tại đây..." style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; resize: none; font-size: 14px; outline: none; box-sizing: border-box;"></textarea>
            <div style="margin-top: 12px; display: flex; gap: 8px;">
                <button id="sora-start" style="flex: 1; background: #007bff; color: white; padding: 8px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; transition: background 0.2s;">▶️ Bắt đầu</button>
                <button id="sora-clear" style="flex: 1; background: #f1f3f5; color: #555; padding: 8px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; transition: background 0.2s;">🗑️ Xóa</button>
            </div>
        `;
        document.body.appendChild(wrapper);

        const progress = document.createElement('div');
        progress.id = 'sora-progress';
        progress.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: #ffffff;
            border: 1px solid #e0e0e0;
            border-radius: 10px;
            padding: 8px 16px;
            font-size: 14px;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
            display: none;
            color: #333;
        `;
        progress.textContent = 'Đang xử lý...';
        document.body.appendChild(progress);

        // Thêm button cooldown
        const cooldownBtn = document.createElement('button');
        cooldownBtn.id = 'sora-cooldown';
        cooldownBtn.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 180px;
            background: #ffffff;
            border: 1px solid #e0e0e0;
            border-radius: 10px;
            padding: 8px 16px;
            font-size: 14px;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
            display: none;
            color: #333;
            cursor: default;
            transition: background 0.2s;
        `;
        cooldownBtn.textContent = `⏳ Cooldown: ${cooldownTime}s`;
        document.body.appendChild(cooldownBtn);

        // Hover effects cho các nút
        const startBtn = document.getElementById('sora-start');
        const clearBtn = document.getElementById('sora-clear');
        const closeBtn = document.getElementById('sora-close');

        startBtn.onmouseover = () => (startBtn.style.background = '#0056b3');
        startBtn.onmouseout = () => (startBtn.style.background = '#007bff');
        clearBtn.onmouseover = () => (clearBtn.style.background = '#e0e0e0');
        clearBtn.onmouseout = () => (clearBtn.style.background = '#f1f3f5');
        closeBtn.onmouseover = () => (closeBtn.style.color = '#333');
        closeBtn.onmouseout = () => (closeBtn.style.color = '#888');

        // Sự kiện nút
        startBtn.onclick = () => {
            const input = document.getElementById('sora-input').value;
            const prompts = input.split('\n').map(x => x.trim()).filter(Boolean);
            if (prompts.length === 0) {
                alert("❗ Nhập ít nhất 1 prompt.");
                return;
            }
            promptQueue = prompts;
            totalPromptCount = prompts.length;
            isRunning = true;
            document.getElementById('sora-auto-ui').remove();
            document.getElementById('sora-progress').style.display = 'block';
            document.getElementById('sora-cooldown').style.display = 'block';
            updateProgress();
            startLoop();
        };

        clearBtn.onclick = () => {
            document.getElementById('sora-input').value = '';
        };

        closeBtn.onclick = () => {
            document.getElementById('sora-auto-ui').remove();
        };
    }

    // Cập nhật tiến độ
    function updateProgress() {
        const progress = document.getElementById('sora-progress');
        const done = totalPromptCount - promptQueue.length;
        progress.textContent = `📈 Đã gửi: ${done} / ${totalPromptCount}`;
        if (!isRunning) {
            setTimeout(() => {
                progress.remove();
                document.getElementById('sora-cooldown').remove();
            }, 3000);
        }
    }

    // Gọi React onClick submit button
    function triggerReactClick(btn) {
        const key = Object.keys(btn).find(k => k.startsWith("__reactProps$"));
        if (key && btn[key]?.onClick) {
            btn[key].onClick({ bubbles: true, cancelable: true, isTrusted: true });
            log("🖱️ Gọi React onClick");
            return true;
        }
        log("⚠️ Không tìm thấy React onClick");
        return false;
    }

    // Điền prompt vào textarea
    function inputPromptToTextarea(prompt) {
        const textarea = document.querySelector('textarea[placeholder="Describe your image..."]');
        if (!textarea) {
            log("❌ Không tìm thấy textarea");
            return false;
        }

        textarea.value = prompt;
        textarea.focus();

        const key = Object.keys(textarea).find(k => k.startsWith("__reactProps$"));
        if (key && textarea[key]?.onChange) {
            textarea[key].onChange({ target: textarea });
            log("⌨️ Gọi React onChange");
        }

        return true;
    }

    // Submit prompt và đợi render
    function submitPrompt(prompt) {
        const ok = inputPromptToTextarea(prompt);
        if (!ok) return;

        setTimeout(() => {
            const btn = document.querySelector('button[data-disabled="false"]');
            if (btn) {
                triggerReactClick(btn);
            } else {
                log("⚠️ Không tìm thấy nút submit hoặc nó đang disabled.");
            }
        }, 500);
    }

    // Xử lý timer đếm ngược và cập nhật button
    function startCountdown() {
        let timeRemaining = cooldownTime;
        const cooldownBtn = document.getElementById('sora-cooldown');
        cooldownBtn.textContent = `⏳ Cooldown: ${timeRemaining}s`;
        log(`⏳ Timer bắt đầu: ${timeRemaining}s`);

        if (countdownInterval) clearInterval(countdownInterval);

        countdownInterval = setInterval(() => {
            timeRemaining--;
            cooldownBtn.textContent = `⏳ Cooldown: ${timeRemaining}s`;
            log(`⏳ Timer: ${timeRemaining}s`);

            if (timeRemaining <= 0) {
                clearInterval(countdownInterval);
                log("✅ Timer hết thời gian, chuẩn bị gửi task tiếp theo.");
            }
        }, 1000);
    }

    // Xử lý prompt tiếp theo
    function processNextPrompt() {
        log("✅ Task hoàn tất, gửi prompt tiếp theo.");
        setTimeout(() => {
            if (promptQueue.length > 0) {
                const nextPrompt = promptQueue.shift();
                log(`📤 Đang gửi prompt tiếp theo: "${nextPrompt}"`);
                submitPrompt(nextPrompt);
                updateProgress();
                startCountdown();
                processNextPrompt();
            } else {
                log("🎉 Tất cả prompt đã được gửi!");
                isRunning = false;
                updateProgress();
            }
        }, cooldownTime * 1000);
    }

    // Bắt đầu loop gửi prompt
    function startLoop() {
        if (!isRunning || promptQueue.length === 0) {
            isRunning = false;
            log("✅ Hoàn tất!");
            updateProgress();
            return;
        }

        const prompt = promptQueue.shift();
        log(`📤 Đang gửi prompt: "${prompt}"`);
        submitPrompt(prompt);
        updateProgress();

        startCountdown();
        processNextPrompt();
    }

    window.addEventListener("load", () => {
        const wait = setInterval(() => {
            const textarea = document.querySelector('textarea[placeholder="Describe your image..."]');
            if (textarea) {
                clearInterval(wait);
                createUI();
            }
        }, 1000);
    });
})();