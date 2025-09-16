// ==UserScript==
// @name         YouTube Channel Exporter (Thumbnails + Info)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  3 menu Tampermonkey: export URL thumbnail, tải tất cả ảnh thumbnail, và xuất file Excel info video kênh
// @author       Matthew M.
// @match        https://www.youtube.com/*
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    // Helper lấy URL thumbnail
    function getThumbnailURLs() {
        let thumbLinks = new Set();
        document.querySelectorAll('a[href^="/watch?v="]').forEach(a => {
            let href = a.getAttribute('href');
            let match = href.match(/v=([\w\-]{11})/);
            if (match) {
                let vid = match[1];
                thumbLinks.add(`https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`);
            }
        });
        return Array.from(thumbLinks);
    }

    // Helper lấy tên dễ lưu file
    function getChannelName() {
        let channelName = '';
        if (document.title && document.title.includes(' - YouTube')) {
            channelName = document.title.replace(/^\(\d+\)\s*/,'').replace(/ - YouTube.*$/,'').trim();
        }
        if (!channelName) {
            channelName = (window.location.pathname.split('/')[1] || 'channel').replace('@', '');
        }
        channelName = channelName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                                   .replace(/[^\w\s-]/g, '')
                                   .replace(/\s+/g, '_');
        return channelName || 'channel';
    }

    // Ngày hiện tại
    function getDateStr() {
        let now = new Date();
        let dd = String(now.getDate()).padStart(2, '0');
        let mm = String(now.getMonth() + 1).padStart(2, '0');
        let yyyy = now.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
    }

    // 1. Export thumbnail URLs (maxres)
    function exportURLs() {
        let urls = getThumbnailURLs();
        if (urls.length === 0) {
            alert('Không tìm thấy thumbnail. Hãy kéo xuống cho hiện hết video!');
            return;
        }
        let channelName = getChannelName();
        let dateStr = getDateStr();
        let filename = `${channelName}_thumbnails_${dateStr}.txt`;
        const blob = new Blob([urls.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // 2. Download all maxres thumbnails (background, tuần tự)
    async function downloadAllImages() {
        let urls = getThumbnailURLs();
        if (urls.length === 0) {
            alert('Không tìm thấy thumbnail. Hãy kéo xuống cho hiện hết video!');
            return;
        }
        let channelName = getChannelName();
        let dateStr = getDateStr();
        let count = 1;

        for (let url of urls) {
            const num = String(count++).padStart(3, '0');
            try {
                const res = await fetch(url);
                const blob = await res.blob();
                const tmpUrl = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = tmpUrl;
                a.download = `${channelName}_thumb_${num}_${dateStr}.jpg`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(tmpUrl);
                await new Promise(r => setTimeout(r, 300));
            } catch(e) {
                console.error("Download failed", url, e);
            }
        }
        alert('Đã bắt đầu tải toàn bộ thumbnail. Kiểm tra thư mục Downloads!');
    }

    // 3. Export video data ra Excel
    async function exportChannelData() {
        // Nạp thư viện XLSX nếu chưa có
        if (typeof XLSX === "undefined") {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }
        // Auto scroll tải hết video
        await scrollToLoadAll();

        // Collect video info
        const videos = document.querySelectorAll('ytd-rich-grid-media');
        const videoData = [];
        const seenUrls = new Set();
        for (let video of videos) {
            try {
                const urlElement = video.querySelector('#thumbnail a');
                const videoURL = urlElement ? 'https://www.youtube.com' + urlElement.getAttribute('href') : '';
                if (!videoURL || seenUrls.has(videoURL)) continue;
                seenUrls.add(videoURL);
                const titleElement = video.querySelector('#video-title');
                const videoTitle = titleElement ? titleElement.innerText.trim() : '';
                const metadataLine = video.querySelector('#metadata-line');
                let views = '', timePosted = '';
                if (metadataLine) {
                    const metadataItems = metadataLine.querySelectorAll('.inline-metadata-item');
                    views = metadataItems[0] ? metadataItems[0].innerText.trim() : '';
                    timePosted = metadataItems[1] ? metadataItems[1].innerText.trim() : '';
                }
                if (videoURL && videoTitle) {
                    videoData.push({
                        'Số thứ tự': videoData.length + 1,
                        'URL của video': videoURL,
                        'Tên Video': videoTitle,
                        'Số lượng view': views,
                        'Thời gian video được đăng': timePosted
                    });
                }
            } catch {}
        }
        if (!videoData.length) {
            alert('Không tìm thấy video nào!');
            return;
        }
        let channelName = getChannelName();
        let dateStr = getDateStr();
        let fileName = `${channelName}_videos_${dateStr}.xlsx`;
        try {
            const ws = XLSX.utils.json_to_sheet(videoData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Videos');
            XLSX.writeFile(wb, fileName);
            alert('Đã xuất file Excel thành công!');
        } catch (e) {
            alert('Có lỗi khi xuất file Excel!');
            throw e;
        }
    }

    // Hỗ trợ auto-scroll để tải hết video trên trang
    async function scrollToLoadAll() {
        return new Promise((resolve) => {
            let last = 0;
            let attempts = 0;
            const maxAttempt = 40;
            const timer = setInterval(() => {
                window.scrollTo(0, document.documentElement.scrollHeight);
                let current = document.documentElement.scrollHeight;
                if (current === last) {
                    attempts++;
                    if (attempts >= 3) {
                        clearInterval(timer);
                        setTimeout(resolve, 1500);
                    }
                } else {
                    attempts = 0;
                    last = current;
                }
                if (attempts > maxAttempt) {
                    clearInterval(timer);
                    resolve();
                }
            }, 1200);
        });
    }

    // Menu registry
    if (typeof GM_registerMenuCommand !== "undefined") {
        GM_registerMenuCommand("Export thumbnail URLs (.txt)", exportURLs);
        GM_registerMenuCommand("Download all thumbnails", downloadAllImages);
        GM_registerMenuCommand("Export channel data", exportChannelData);
    }
})();
