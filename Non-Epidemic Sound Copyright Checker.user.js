// ==UserScript==
// @name         Non-Epidemic Sound Copyright Checker
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Tự động quét hàng loạt, sử dụng logic popup gốc để quét khiếu nại và xuất báo cáo.
// @author       Matthew M.
// @match        *://studio.youtube.com/channel/*/videos*
// @match        *://studio.youtube.com/channel/*
// @match        *://studio.youtube.com/video/*/copyright*
// @match        *://studio.youtube.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_download
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIGURATION ---
    const SCRIPT_PREFIX = 'YT_HYBRID_SCANNER_v7_';
    const VIDEO_QUEUE_KEY = SCRIPT_PREFIX + 'videoQueue';
    const BAD_VIDEOS_KEY = SCRIPT_PREFIX + 'badVideos';
    const STATUS_KEY = SCRIPT_PREFIX + 'status';
    const VIDEO_LINK_SELECTORS = ["ytcp-video-list-cell-video a.yt-simple-endpoint", "a#video-title"];
    const SCROLL_CONTAINER_SELECTORS = ["#container.style-scope.ytcp-app", "#content-container", "ytcp-app"];
    const concurrencyLimit = 1;

    // =================================================================================
    // UTILITY: Các hàm tiện ích
    // =================================================================================

    function showNotification(message, duration = 5000) {
        const oldNotification = document.getElementById('yt-scanner-notification');
        if (oldNotification) oldNotification.remove();
        const notification = document.createElement('div');
        notification.id = 'yt-scanner-notification';
        Object.assign(notification.style, {
            position: 'fixed', top: '20px', right: '20px', backgroundColor: '#282828', color: 'white',
            padding: '15px 25px', borderRadius: '8px', zIndex: '99999', fontSize: '16px',
            boxShadow: '0 5px 15px rgba(0,0,0,0.5)', borderLeft: '5px solid #ff4d4d'
        });
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), duration);
    }

    function findElement(selectors) {
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element;
        }
        return null;
    }

    function findAllElements(selectors) {
         for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) return elements;
        }
        return [];
    }


    // =================================================================================
    // MAIN CONTROL: Bộ điều khiển chính
    // =================================================================================
    function mainRouter() {
        const url = window.location.href;
        const status = GM_getValue(STATUS_KEY, 'idle');
        console.log(`[Non-Epidemic Sound Copyright Checker] Status: ${status}, URL: ${url}`);
        if (url.includes('/videos')) {
            addBulkScanButton();
            if (status === 'finished') {
                showNotification('Hoàn tất quét! Báo cáo đã được tải xuống.');
                GM_deleteValue(STATUS_KEY);
            }
        } else if (url.includes('/copyright') && status === 'scanning') {
            scanCopyrightPageWithLegacyLogic();
        }
    }
    window.addEventListener('yt-navigate-finish', () => setTimeout(mainRouter, 1000));
    window.addEventListener('load', () => setTimeout(mainRouter, 2000));

    // =================================================================================
    // STEP 1: Trang danh sách video -> Thu thập ID
    // =================================================================================
    function addBulkScanButton() {
        const header = document.querySelector("ytcp-header .right-section");
        if (!header || document.getElementById("bulk-copyright-scan-btn")) return;
        const button = document.createElement("button");
        button.id = "bulk-copyright-scan-btn";
        button.innerText = "Scan Copyright";
        Object.assign(button.style, {
            padding: "10px 16px", marginLeft: "12px", cursor: "pointer", backgroundColor: "#c00",
            color: "white", border: "none", borderRadius: "4px", fontSize: "14px", fontWeight: "500"
        });
        button.onclick = startBulkScanWorkflow;
        header.insertBefore(button, header.firstChild);
    }

    async function startBulkScanWorkflow() {
        if (!confirm("Bắt đầu quy trình quét tự động?\n\n- Script sẽ thu thập ID tất cả video.\n- Tự động duyệt qua từng trang bản quyền để quét.\n- Xuất file báo cáo khi hoàn tất.\n\nVui lòng không đóng tab này.")) return;
        GM_setValue(STATUS_KEY, 'collecting');
        showNotification("Bắt đầu thu thập ID video. Trang sẽ tự động cuộn...");
        await new Promise(resolve => setTimeout(resolve, 500));
        const videoIds = await collectAllVideoIds();
        if (videoIds.length === 0) {
            showNotification("Lỗi: Không thể tìm thấy video nào. Giao diện có thể đã thay đổi.");
            GM_setValue(STATUS_KEY, 'idle');
            return;
        }
        showNotification(`Đã thu thập ${videoIds.length} ID video. Bắt đầu quá trình quét tự động...`);
        GM_setValue(VIDEO_QUEUE_KEY, JSON.stringify(Array.from(videoIds)));
        GM_setValue(BAD_VIDEOS_KEY, JSON.stringify([]));
        GM_setValue(STATUS_KEY, 'scanning');
        processNextVideoInQueue();
    }

    function collectAllVideoIds() {
        return new Promise(resolve => {
            const idSet = new Set();
            const scrollContainer = findElement(SCROLL_CONTAINER_SELECTORS);
            if (!scrollContainer) {
                console.error("[Non-Epidemic Sound Copyright Checker] Lỗi: Không tìm thấy vùng chứa để cuộn trang.");
                resolve([]);
                return;
            }
            const scrollInterval = setInterval(() => {
                const videoLinks = findAllElements(VIDEO_LINK_SELECTORS);
                videoLinks.forEach(link => {
                    const match = link.href.match(/\/video\/([a-zA-Z0-9_-]{11})\//);
                    if (match) idSet.add(match[1]);
                });
                const lastHeight = scrollContainer.scrollHeight;
                scrollContainer.scrollTo(0, lastHeight);
                setTimeout(() => {
                    if (scrollContainer.scrollHeight <= lastHeight) {
                        clearInterval(scrollInterval);
                        console.log(`[Non-Epidemic Sound Copyright Checker] Thu thập xong: ${idSet.size} ID.`);
                        resolve(Array.from(idSet));
                    }
                }, 2500);
            }, 1500);
        });
    }

    // =================================================================================
    // STEP 2: Trang bản quyền -> SỬ DỤNG LOGIC POPUP TỪ SCRIPT GỐC
    // =================================================================================

    async function legacy_waitForNewPopup() {
        for (let i = 0; i < 5; i++) {
            const popup = document.querySelector("ytcp-dialog");
            if (popup) return popup;
            await new Promise(r => setTimeout(r, 200));
        }
        return null;
    }

    function legacy_extractClaimantsFromPopup(popup) {
        const dtElements = popup.querySelectorAll("dt.style-scope.ytcr-video-content-details-dialog");
        for (const dt of dtElements) {
            if (dt.innerText.trim() === "Claimants") {
                const claimants = [];
                let next = dt.nextElementSibling;
                while (next && next.tagName === "DD") {
                    let name = next.innerText.trim();
                    if (name.includes("on behalf of")) {
                        name = name.split("on behalf of")[0].trim();
                    }
                    claimants.push(name);
                    next = next.nextElementSibling;
                }
                return claimants;
            }
        }
        return [];
    }

    async function legacy_closeAndRemovePopup() {
        const closeButton = document.querySelector("ytcp-dialog yt-icon-button[aria-label='Close']");
        if (closeButton) closeButton.click();
        await new Promise(r => setTimeout(r, 500));
        document.querySelectorAll("ytcp-dialog, tp-yt-iron-overlay-backdrop").forEach(el => {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
    }

    async function legacy_processRow(row) {
        if (!row || row.hasAttribute("data-processed-v7")) return [];
        const detailsButton = row.querySelector("button[aria-label*='See details']");
        if (!detailsButton) return [];

        await legacy_closeAndRemovePopup();
        await new Promise(r => setTimeout(r, 200));
        detailsButton.click();
        await new Promise(r => setTimeout(r, 500));

        const popup = await legacy_waitForNewPopup();
        if (!popup) {
             console.error("[Non-Epidemic Sound Copyright Checker] Không tìm thấy popup sau khi nhấn nút.");
             return [];
        }

        const claimants = legacy_extractClaimantsFromPopup(popup);
        await legacy_closeAndRemovePopup();
        row.setAttribute("data-processed-v7", "true");

        return claimants.filter(name => name && !name.toLowerCase().includes("epidemic sound"));
    }


    async function scanCopyrightPageWithLegacyLogic() {
        const rows = Array.from(document.querySelectorAll("ytcr-video-content-list-row"));
        if (rows.length === 0) {
            console.log("[Non-Epidemic Sound Copyright Checker] Không có khiếu nại nào trên trang. Bỏ qua.");
            processNextVideoInQueue();
            return;
        }

        console.log(`[Non-Epidemic Sound Copyright Checker] Tìm thấy ${rows.length} khiếu nại. Bắt đầu xử lý...`);
        let allNonEpidemicClaimants = [];

        // Xử lý tuần tự để tránh xung đột
        for (const row of rows) {
             const nonEpidemic = await legacy_processRow(row);
             if (nonEpidemic.length > 0) {
                 allNonEpidemicClaimants.push(...nonEpidemic);
             }
        }

        if (allNonEpidemicClaimants.length > 0) {
            const videoId = window.location.href.match(/\/video\/([a-zA-Z0-9_-]{11})\//)[1];
            const badVideos = JSON.parse(GM_getValue(BAD_VIDEOS_KEY, '[]'));
            badVideos.push({ id: videoId, claimants: allNonEpidemicClaimants.join(', ') });
            GM_setValue(BAD_VIDEOS_KEY, JSON.stringify(badVideos));
            console.log(`[Non-Epidemic Sound Copyright Checker] PHÁT HIỆN KHIẾU NẠI cho video ID: ${videoId} bởi: ${allNonEpidemicClaimants.join(', ')}`);
        }

        processNextVideoInQueue();
    }


    // =================================================================================
    // STEP 3: Điều hướng và tạo báo cáo
    // =================================================================================
    function processNextVideoInQueue() {
        let queue = JSON.parse(GM_getValue(VIDEO_QUEUE_KEY, '[]'));
        if (queue.length > 0) {
            const nextVideoId = queue.shift();
            GM_setValue(VIDEO_QUEUE_KEY, JSON.stringify(queue));
            console.log(`[Non-Epidemic Sound Copyright Checker] Còn lại ${queue.length} video. Đang đi tới: ${nextVideoId}`);
            window.location.href = `https://studio.youtube.com/video/${nextVideoId}/copyright`;
        } else {
            console.log("[Non-Epidemic Sound Copyright Checker] Đã quét xong tất cả video. Đang tạo báo cáo...");
            generateFinalReport();
        }
    }

    function generateFinalReport() {
        const badVideos = JSON.parse(GM_getValue(BAD_VIDEOS_KEY, '[]'));
        let reportContent = `Non-Epidemic Sound Copyright Checker 3.0\nNgày quét: ${new Date().toLocaleString()}\n========================================\n\n`;
        if (badVideos.length > 0) {
            reportContent += `Phát hiện ${badVideos.length} video có khiếu nại không phải từ Epidemic Sound:\n\n`;
            badVideos.forEach(video => {
                reportContent += `Video ID: ${video.id}\nLink: https://www.youtube.com/watch?v=${video.id}\nBên khiếu nại: ${video.claimants}\n----------------------------------------\n`;
            });
        } else {
            reportContent += "Tuyệt vời! Không có video nào bị khiếu nại bởi các bên khác ngoài Epidemic Sound.\n";
        }
        GM_download({ url: "data:text/plain;charset=utf-8," + encodeURIComponent(reportContent), name: "youtube_copyright_report.txt" });
        GM_deleteValue(VIDEO_QUEUE_KEY);
        GM_deleteValue(BAD_VIDEOS_KEY);
        GM_setValue(STATUS_KEY, 'finished');
        const channelId = getChannelId();
        if (channelId) {
             window.location.href = `https://studio.youtube.com/channel/${channelId}/videos/upload`;
        } else {
            console.error("[Non-Epidemic Sound Copyright Checker] Không thể tìm thấy ID kênh để quay về trang chính.");
        }
    }

    function getChannelId() {
        const match = window.location.href.match(/channel\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    }
})();
