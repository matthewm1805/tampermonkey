// ==UserScript==
// @name         YouTube Video Info Exporter
// @namespace    http://tampermonkey.net/
// @version      0.6
// @description  Export YouTube video info to Excel with improved auto-scroll and accurate channel name
// @author       Grok
// @match        https://www.youtube.com/*
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// ==/UserScript==

(function() {
    'use strict';

    // Hàm để tạo và thêm nút "Download"
    function addDownloadButton() {
        if (document.querySelector('#youtube-video-exporter-download-btn')) return;

        const button = document.createElement('button');
        button.id = 'youtube-video-exporter-download-btn';
        button.innerText = 'Download';
        button.style.position = 'fixed';
        button.style.top = '10px';
        button.style.right = '10px';
        button.style.zIndex = '9999';
        button.style.padding = '10px 20px';
        button.style.backgroundColor = '#ff0000';
        button.style.color = '#fff';
        button.style.border = 'none';
        button.style.borderRadius = '5px';
        button.style.cursor = 'pointer';
        button.onclick = handleDownloadClick;
        document.body.appendChild(button);
    }

    // Hàm xử lý khi nhấn nút Download
    async function handleDownloadClick() {
        const button = document.querySelector('#youtube-video-exporter-download-btn');
        button.disabled = true;
        button.innerText = 'Processing...';

        try {
            // Tự động cuộn để tải toàn bộ video
            console.log('Starting auto-scroll to load all videos...');
            await autoScrollToLoadAllVideos();

            // Thu thập thông tin video ngay sau khi cuộn xong
            console.log('Collecting video info after scroll...');
            const videoData = collectVideoInfo();

            if (videoData.length === 0) {
                alert('Không tìm thấy video nào để xuất!');
                return;
            }

            // Lấy tên kênh để đặt tên file
            const channelName = getChannelName();
            const fileName = channelName ? `${channelName}_videos.xlsx` : 'youtube_videos.xlsx';

            // Xuất file Excel
            console.log('Exporting to Excel...');
            exportToExcel(videoData, fileName);
        } catch (e) {
            console.error('Error during download process:', e);
            alert('Có lỗi xảy ra. Vui lòng kiểm tra console để biết thêm chi tiết.');
        } finally {
            button.disabled = false;
            button.innerText = 'Download';
        }
    }

    // Hàm tự động cuộn để tải tất cả video
    async function autoScrollToLoadAllVideos() {
        return new Promise((resolve) => {
            let previousHeight = 0;
            let currentHeight = document.documentElement.scrollHeight;
            let scrollAttempts = 0;
            const maxAttempts = 100;

            const scrollInterval = setInterval(() => {
                window.scrollTo(0, document.documentElement.scrollHeight);
                currentHeight = document.documentElement.scrollHeight;

                console.log(`Scroll attempt ${scrollAttempts + 1}: Previous height = ${previousHeight}, Current height = ${currentHeight}`);

                if (currentHeight === previousHeight) {
                    scrollAttempts++;
                    if (scrollAttempts >= 3) {
                        console.log('No more content to load, stopping scroll.');
                        clearInterval(scrollInterval);
                        setTimeout(() => resolve(), 2000);
                    }
                } else {
                    scrollAttempts = 0;
                    previousHeight = currentHeight;
                }

                if (scrollAttempts >= maxAttempts) {
                    console.log('Reached maximum scroll attempts, stopping.');
                    clearInterval(scrollInterval);
                    resolve();
                }
            }, 1500);
        });
    }

    // Hàm thu thập thông tin video
    function collectVideoInfo() {
        console.log('Collecting video info from current DOM state...');
        const videos = document.querySelectorAll('ytd-rich-grid-media');
        const videoData = [];
        const seenUrls = new Set();

        videos.forEach((video, index) => {
            try {
                const urlElement = video.querySelector('#thumbnail a');
                const videoURL = urlElement ? 'https://www.youtube.com' + urlElement.getAttribute('href') : '';

                if (!videoURL || seenUrls.has(videoURL)) return;
                seenUrls.add(videoURL);

                const titleElement = video.querySelector('#video-title');
                const videoTitle = titleElement ? titleElement.innerText.trim() : '';

                const metadataLine = video.querySelector('#metadata-line');
                let views = '';
                let timePosted = '';

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
            } catch (e) {
                console.error('Error processing video:', e);
            }
        });

        console.log(`Collected ${videoData.length} videos.`);
        return videoData;
    }

    // Hàm lấy tên kênh từ giao diện hoặc meta
    function getChannelName() {
        console.log('Attempting to get channel name...');

        // Ưu tiên lấy từ giao diện (thường hiển thị gần avatar hoặc tiêu đề kênh)
        const channelHeader = document.querySelector('#channel-name #text');
        if (channelHeader && channelHeader.innerText) {
            console.log('Channel name found in UI:', channelHeader.innerText);
            return channelHeader.innerText.trim().replace(/[^a-zA-Z0-9]/g, '_');
        }

        // Nếu không tìm thấy trong giao diện, thử lấy từ meta
        const metaChannelName = document.querySelector('meta[itemprop="name"]');
        if (metaChannelName) {
            console.log('Channel name found in meta:', metaChannelName.getAttribute('content'));
            return metaChannelName.getAttribute('content').trim().replace(/[^a-zA-Z0-9]/g, '_');
        }

        // Cuối cùng, lấy từ tiêu đề trang nếu không có lựa chọn nào khác
        const titleElement = document.querySelector('title');
        if (titleElement) {
            const title = titleElement.innerText.replace(' - YouTube', '').trim().replace(/[^a-zA-Z0-9]/g, '_');
            console.log('Channel name fallback from title:', title);
            return title;
        }

        console.log('Could not find channel name, using default.');
        return '';
    }

    // Hàm xuất dữ liệu ra file Excel
    function exportToExcel(videoData, fileName) {
        try {
            const worksheet = XLSX.utils.json_to_sheet(videoData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Videos');
            XLSX.writeFile(workbook, fileName);
            console.log(`Exported Excel file: ${fileName}`);
        } catch (e) {
            console.error('Error exporting to Excel:', e);
            throw new Error('Failed to export Excel file');
        }
    }

    // Chỉ thêm nút Download khi trang đã tải xong
    window.onload = function() {
        try {
            addDownloadButton();
        } catch (e) {
            console.error('Error adding download button:', e);
        }
    };

    document.addEventListener('DOMContentLoaded', function() {
        if (!document.querySelector('#youtube-video-exporter-download-btn')) {
            addDownloadButton();
        }
    });
})();