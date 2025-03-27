// ==UserScript==
// @name         Douyin Video Downloader
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Download videos from Douyin profile sequentially with video type selection, retry, and progress bar
// @author       Matthew M.
// @match        https://www.douyin.com/user/*
// @updateURL    https://github.com/danthekidd/Kittl-Editor-Crack/raw/refs/heads/main/Kittl%20Editor%20Expert%20Spoofer.user.js
// @grant        none
// ==/UserScript==

(async function() {
    'use strict';

    // Tạo container cho nút và thanh progress
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.zIndex = '9999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'flex-end';

    // Tạo nút Download All
    const downloadButton = document.createElement('button');
    downloadButton.innerHTML = 'Download All';
    downloadButton.style.padding = '12px 24px';
    downloadButton.style.backgroundColor = '#FF4444';
    downloadButton.style.color = 'white';
    downloadButton.style.border = 'none';
    downloadButton.style.borderRadius = '25px';
    downloadButton.style.cursor = 'pointer';
    downloadButton.style.fontFamily = 'Arial, sans-serif';
    downloadButton.style.fontSize = '16px';
    downloadButton.style.fontWeight = '600';
    downloadButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
    downloadButton.style.transition = 'all 0.3s ease';

    // Hiệu ứng hover cho nút
    downloadButton.addEventListener('mouseover', () => {
        downloadButton.style.backgroundColor = '#E63B3B';
        downloadButton.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.3)';
        downloadButton.style.transform = 'translateY(-2px)';
    });
    downloadButton.addEventListener('mouseout', () => {
        downloadButton.style.backgroundColor = '#FF4444';
        downloadButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
        downloadButton.style.transform = 'translateY(0)';
    });

    // Tạo thanh progress
    const progressBarContainer = document.createElement('div');
    progressBarContainer.style.width = '200px';
    progressBarContainer.style.height = '10px';
    progressBarContainer.style.backgroundColor = '#e0e0e0';
    progressBarContainer.style.borderRadius = '5px';
    progressBarContainer.style.marginTop = '10px';
    progressBarContainer.style.overflow = 'hidden';
    progressBarContainer.style.display = 'none'; // Ẩn mặc định

    const progressBar = document.createElement('div');
    progressBar.style.width = '0%';
    progressBar.style.height = '100%';
    progressBar.style.backgroundColor = '#4CAF50';
    progressBar.style.transition = 'width 0.3s ease';

    progressBarContainer.appendChild(progressBar);
    container.appendChild(downloadButton);
    container.appendChild(progressBarContainer);
    document.body.appendChild(container);

    // Biến để theo dõi tiến trình
    let foundVideos = 0;
    let downloadedVideos = 0;
    const RETRY_DELAY = 1000; // Delay khi retry (1 giây)
    const MAX_RETRIES = 3; // Số lần thử lại tối đa
    const debugLog = []; // Lưu log lỗi để tạo file debug
    const failedVideos = []; // Lưu danh sách video thất bại để retry

    // Cập nhật văn bản trên nút (giới hạn tần suất để tối ưu)
    let lastUpdate = 0;
    function updateButtonText() {
        const now = Date.now();
        if (now - lastUpdate > 500) { // Chỉ cập nhật mỗi 500ms
            downloadButton.innerHTML = `Found: ${foundVideos} | Downloaded: ${downloadedVideos}`;
            lastUpdate = now;
        }
    }

    // Cập nhật thanh progress
    function updateProgressBar(percentage) {
        progressBar.style.width = `${percentage}%`;
    }

    // Hiển thị/ẩn thanh progress
    function toggleProgressBar(show) {
        progressBarContainer.style.display = show ? 'block' : 'none';
        if (!show) {
            updateProgressBar(0); // Reset progress khi ẩn
        }
    }

    // Hàm tạo và tải file debug
    function createDebugFile() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const debugContent = [
            `Douyin Video Downloader Debug Log`,
            `Timestamp: ${new Date().toISOString()}`,
            `Total Videos Found: ${foundVideos}`,
            `Total Videos Downloaded: ${downloadedVideos}`,
            `Failed Downloads: ${foundVideos - downloadedVideos}`,
            `\n--- Failed Downloads Details ---`,
            ...debugLog.map(log => `Video ID: ${log.aweme_id}\nURL: ${log.url}\nDescription: ${log.desc}\nError: ${log.error}\n`)
        ].join('\n');

        const blob = new Blob([debugContent], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        a.download = `douyin_debug_log_${timestamp}.txt`;
        a.click();
    }

    // Hàm chờ
    function waitforme(millisec) {
        return new Promise(resolve => setTimeout(() => resolve(''), millisec));
    }

    // Hàm lấy dữ liệu video
    async function getid(sec_user_id, max_cursor) {
        try {
            const res = await fetch(`https://www.douyin.com/aweme/v1/web/aweme/post/?device_platform=webapp&aid=6383&channel=channel_pc_web&sec_user_id=${sec_user_id}&max_cursor=${max_cursor}`, {
                "headers": {
                    "accept": "application/json, text/plain, */*",
                    "sec-ch-ua": navigator.userAgent,
                    "sec-fetch-dest": "empty",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "same-origin"
                },
                "referrer": window.location.href,
                "method": "GET",
                "mode": "cors",
                "credentials": "include"
            });
            if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
            return await res.json();
        } catch (e) {
            console.error("Error fetching video list:", e);
            alert("Failed to fetch video list. Check console for details.");
            throw e;
        }
    }

    // Hàm tải video với cơ chế retry và theo dõi tiến độ
    async function download(url, aweme_id, desc, retries = 0) {
        try {
            toggleProgressBar(true); // Hiển thị thanh progress
            const response = await fetch(url, {
                "headers": {
                    "accept": "*/*",
                    "range": "bytes=0-",
                    "sec-ch-ua": navigator.userAgent,
                    "sec-fetch-dest": "video",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "cross-site"
                },
                "referrer": "https://www.douyin.com/",
                "method": "GET",
                "mode": "cors",
                "credentials": "omit"
            });

            if (!response.ok) {
                if (response.status === 429 && retries < MAX_RETRIES) {
                    console.warn(`Rate limit hit for video ${aweme_id}. Retrying (${retries + 1}/${MAX_RETRIES})...`);
                    await waitforme(RETRY_DELAY);
                    return download(url, aweme_id, desc, retries + 1);
                }
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            // Lấy tổng kích thước file từ header (nếu có)
            const totalSize = parseInt(response.headers.get('content-length'), 10);
            let loadedSize = 0;

            // Tạo reader để đọc dữ liệu theo stream
            const reader = response.body.getReader();
            const chunks = [];

            // Theo dõi tiến độ tải
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                loadedSize += value.length;

                // Cập nhật thanh progress nếu biết tổng kích thước
                if (totalSize) {
                    const percentage = Math.min((loadedSize / totalSize) * 100, 100);
                    updateProgressBar(percentage);
                }
            }

            // Gộp các chunk thành blob
            const blob = new Blob(chunks);
            const file_name = `${aweme_id}-${desc.replace(/[^\w\s]/gi, '')}.mp4`;
            const a = document.createElement("a");
            a.href = window.URL.createObjectURL(blob);
            a.download = file_name;
            a.click();

            downloadedVideos++;
            updateButtonText();
            toggleProgressBar(false); // Ẩn thanh progress sau khi tải xong
            return true; // Tải thành công
        } catch (e) {
            console.error(`Error downloading video ${aweme_id}:`, e);
            debugLog.push({
                aweme_id: aweme_id,
                url: url,
                desc: desc,
                error: e.message
            });
            failedVideos.push([url, aweme_id, desc]); // Lưu video thất bại để retry
            toggleProgressBar(false); // Ẩn thanh progress nếu lỗi
            return false; // Tải thất bại
        }
    }

    // Hàm tải lại các video thất bại
    async function retryFailedVideos() {
        if (failedVideos.length === 0) return;

        console.log(`Retrying ${failedVideos.length} failed videos...`);
        const retryQueue = [...failedVideos];
        failedVideos.length = 0; // Reset danh sách video thất bại

        for (let i = 0; i < retryQueue.length; i++) {
            const [url, aweme_id, desc] = retryQueue[i];
            console.log(`Retrying video ${aweme_id} (${i + 1}/${retryQueue.length})...`);
            const success = await download(url, aweme_id, desc);
            if (!success) {
                console.warn(`Video ${aweme_id} still failed after retry.`);
            }
            await waitforme(500); // Delay nhỏ giữa các lần thử lại
        }
    }

    // Hàm chính xử lý tải video
    async function downloadAllVideos() {
        // Hỏi người dùng muốn tải loại video nào
        const videoType = prompt(
            "Which type of videos do you want to download?\n" +
            "1. Video dọc (Vertical)\n" +
            "2. Video ngang (Horizontal)\n" +
            "3. Tất cả (All)\n" +
            "4. Hủy (Cancel)\n" +
            "Enter the number (1-4):",
            "3"
        );

        let filterType;
        switch (videoType) {
            case "1":
                filterType = "vertical";
                break;
            case "2":
                filterType = "horizontal";
                break;
            case "3":
                filterType = "all";
                break;
            case "4":
            default:
                alert("Download canceled.");
                return;
        }

        const videoList = [];
        let hasMore = 1;
        const sec_user_id = location.pathname.replace("/user/", "");
        let max_cursor = 0;

        downloadButton.disabled = true;
        foundVideos = 0;
        downloadedVideos = 0;
        debugLog.length = 0;
        failedVideos.length = 0;
        updateButtonText();

        try {
            // Thu thập tất cả video trước
            while (hasMore == 1) {
                const moredata = await getid(sec_user_id, max_cursor);
                hasMore = moredata['has_more'];
                max_cursor = moredata['max_cursor'];
                for (const video of moredata['aweme_list']) {
                    const url = video['video']['play_addr']['url_list'][0].startsWith("https")
                        ? video['video']['play_addr']['url_list'][0]
                        : video['video']['play_addr']['url_list'][0].replace("http", "https");

                    // Lấy chiều rộng và chiều cao từ metadata
                    const width = video['video']['width'] || 0;
                    const height = video['video']['height'] || 0;
                    const isVertical = height > width;
                    const isHorizontal = width > height;

                    // Lọc video theo loại
                    if (filterType === "vertical" && !isVertical) continue;
                    if (filterType === "horizontal" && !isHorizontal) continue;

                    videoList.push([url, video['aweme_id'], video['desc']]);
                    foundVideos++;
                    updateButtonText();
                    console.log("Found video:", video['aweme_id'], "Type:", isVertical ? "Vertical" : "Horizontal", "Total:", foundVideos);
                }
            }

            if (videoList.length === 0) {
                alert("No videos found matching your selection.");
                downloadButton.disabled = false;
                downloadButton.innerHTML = 'Download All';
                return;
            }

            // Tải lần lượt theo thứ tự
            for (let i = 0; i < videoList.length; i++) {
                const [url, aweme_id, desc] = videoList[i];
                console.log(`Downloading video ${aweme_id} (${i + 1}/${videoList.length})...`);
                await download(url, aweme_id, desc);
                await waitforme(200); // Delay nhỏ giữa các video để tránh rate limit
            }

            // Thử tải lại các video thất bại
            if (failedVideos.length > 0) {
                console.log(`Initial download completed. ${failedVideos.length} videos failed. Starting retry...`);
                await retryFailedVideos();
            }

            // Kiểm tra nếu vẫn còn video không tải được
            if (downloadedVideos < foundVideos) {
                console.warn(`Not all videos were downloaded after retry. Generating debug log...`);
                createDebugFile();
            }

            alert(`Downloaded ${downloadedVideos} out of ${foundVideos} videos successfully!`);
        } catch (e) {
            console.error("Download process failed:", e);
            alert("An error occurred. Check console for details.");
            if (debugLog.length > 0) {
                createDebugFile();
            }
        } finally {
            downloadButton.disabled = false;
            downloadButton.innerHTML = 'Download All';
            toggleProgressBar(false); // Ẩn thanh progress khi hoàn tất
        }
    }

    // Gắn sự kiện click cho nút
    downloadButton.addEventListener('click', function() {
        if (confirm("Do you want to download videos from this profile?")) {
            downloadAllVideos();
        }
    });

    // Khởi tạo văn bản ban đầu
    updateButtonText();
})();
