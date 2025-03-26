// ==UserScript==
// @name         Douyin Video Downloader Multi-Thread
// @namespace    http://tampermonkey.net/
// @version      0.5
// @description  Download all videos from Douyin profile with multi-thread and modern UI
// @author       Matthew M.
// @match        https://www.douyin.com/user/*
// @grant        none
// ==/UserScript==

(async function() {
    'use strict';

    // Tạo nút Download All
    const downloadButton = document.createElement('button');
    downloadButton.innerHTML = 'Download All';
    downloadButton.style.position = 'fixed';
    downloadButton.style.bottom = '20px'; // Đặt ở dưới
    downloadButton.style.right = '20px';  // Đặt ở góc phải
    downloadButton.style.zIndex = '9999';
    downloadButton.style.padding = '12px 24px'; // Tăng padding cho nút lớn hơn
    downloadButton.style.backgroundColor = '#FF4444'; // Màu đỏ từ hình
    downloadButton.style.color = 'white'; // Chữ trắng
    downloadButton.style.border = 'none';
    downloadButton.style.borderRadius = '25px'; // Bo tròn nút
    downloadButton.style.cursor = 'pointer';
    downloadButton.style.fontFamily = 'Arial, sans-serif'; // Font chữ mượt mà
    downloadButton.style.fontSize = '16px'; // Kích thước chữ
    downloadButton.style.fontWeight = '600'; // Chữ đậm nhẹ
    downloadButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)'; // Thêm bóng
    downloadButton.style.transition = 'all 0.3s ease'; // Hiệu ứng mượt mà khi hover

    // Hiệu ứng hover
    downloadButton.addEventListener('mouseover', () => {
        downloadButton.style.backgroundColor = '#E63B3B'; // Đậm hơn khi hover
        downloadButton.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.3)';
        downloadButton.style.transform = 'translateY(-2px)';
    });
    downloadButton.addEventListener('mouseout', () => {
        downloadButton.style.backgroundColor = '#FF4444';
        downloadButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
        downloadButton.style.transform = 'translateY(0)';
    });

    document.body.appendChild(downloadButton);

    // Biến để theo dõi tiến trình
    let foundVideos = 0;
    let downloadedVideos = 0;
    const MAX_CONCURRENT = 5; // Số lượng tải đồng thời tối đa

    // Cập nhật văn bản trên nút
    function updateButtonText() {
        downloadButton.innerHTML = `Tìm thấy: ${foundVideos} | Đã tải: ${downloadedVideos}`;
    }

    // Hàm lấy dữ liệu video
    async function getid(sec_user_id, max_cursor) {
        try {
            const res = await fetch(`https://www.douyin.com/aweme/v1/web/aweme/post/?device_platform=webapp&aid=6383&channel=channel_pc_web&sec_user_id=${sec_user_id}&max_cursor=${max_cursor}`, {
                "headers": {
                    "accept": "application/json, text/plain, */*",
                    "accept-language": "vi",
                    "sec-ch-ua": navigator.userAgent,
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": "\"Windows\"",
                    "sec-fetch-dest": "empty",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "same-origin"
                },
                "referrer": window.location.href,
                "referrerPolicy": "strict-origin-when-cross-origin",
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

    // Hàm tải video
    async function download(url, aweme_id, desc) {
        try {
            const file_name = `${aweme_id}-${desc.replace(/[^\w\s]/gi, '')}.mp4`;
            const data = await fetch(url, {
                "headers": {
                    "accept": "*/*",
                    "accept-language": "vi,en-US;q=0.9,en;q=0.8",
                    "range": "bytes=0-",
                    "sec-ch-ua": navigator.userAgent,
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": "\"Windows\"",
                    "sec-fetch-dest": "video",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "cross-site"
                },
                "referrer": "https://www.douyin.com/",
                "referrerPolicy": "strict-origin-when-cross-origin",
                "method": "GET",
                "mode": "cors",
                "credentials": "omit"
            });
            if (!data.ok) throw new Error(`HTTP error! Status: ${data.status}`);
            const blob = await data.blob();
            const a = document.createElement("a");
            a.href = window.URL.createObjectURL(blob);
            a.download = file_name;
            a.click();
            downloadedVideos++;
            updateButtonText();
        } catch (e) {
            console.error(`Error downloading video ${aweme_id}:`, e);
        }
    }

    // Hàm chờ
    function waitforme(millisec) {
        return new Promise(resolve => setTimeout(() => resolve(''), millisec));
    }

    // Hàm tải video theo batch
    async function downloadBatch(videoList, startIndex, batchSize) {
        const batch = videoList.slice(startIndex, startIndex + batchSize);
        const downloadPromises = batch.map(video => download(video[0], video[1], video[2]));
        await Promise.all(downloadPromises);
    }

    // Hàm chính xử lý tải video
    async function downloadAllVideos() {
        const result = [];
        let hasMore = 1;
        const sec_user_id = location.pathname.replace("/user/", "");
        let max_cursor = 0;

        downloadButton.disabled = true;
        foundVideos = 0;
        downloadedVideos = 0;
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
                    result.push([url, video['aweme_id'], video['desc']]);
                    foundVideos++;
                    updateButtonText();
                    console.log("Found video:", video['aweme_id'], "Total:", foundVideos);
                }
            }

            // Tải video theo batch
            for (let i = 0; i < result.length; i += MAX_CONCURRENT) {
                console.log(`Downloading batch: ${i + 1} - ${Math.min(i + MAX_CONCURRENT, result.length)} of ${result.length}`);
                await downloadBatch(result, i, MAX_CONCURRENT);
                if (i + MAX_CONCURRENT < result.length) {
                    await waitforme(1000); // Delay 1 giây giữa các batch
                }
            }
            alert(`Downloaded ${downloadedVideos} out of ${foundVideos} videos successfully!`);
        } catch (e) {
            console.error("Download process failed:", e);
            alert("An error occurred. Check console for details.");
        } finally {
            downloadButton.disabled = false;
            downloadButton.innerHTML = 'Download All';
        }
    }

    // Gắn sự kiện click cho nút
    downloadButton.addEventListener('click', function() {
        if (confirm("Kết xác nhận muốn tải toàn bộ video từ user này về chứ?")) {
            downloadAllVideos();
        }
    });

    // Khởi tạo văn bản ban đầu
    updateButtonText();
})();