// ==UserScript==
// @name         YouTube Video Info Exporter
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Export YouTube video info to Excel with a Download button styled like Subscribe
// @author       Matthew M.
// @match        https://www.youtube.com/*
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// ==/UserScript==

(function() {
    'use strict';

    // Hàm kiểm tra và thêm nút "Download Info"
    function addDownloadButton() {
        const existingButton = document.querySelector('#youtube-video-exporter-download-btn');
        if (existingButton) {
            console.log('Button already exists in DOM, skipping...');
            return;
        }

        console.log('No button found, attempting to add...');
        tryAddButtonWithRetry();
    }

    // Hàm thử thêm nút với retry logic
    function tryAddButtonWithRetry() {
        let attempts = 0;
        const maxAttempts = 15; // Tăng số lần thử để phù hợp với tốc độ tải của Firefox/Edge
        const interval = setInterval(() => {
            const subscribeButton = document.querySelector('yt-subscribe-button-view-model') ||
                                   document.querySelector('ytd-subscribe-button-renderer'); // Thêm fallback selector
            if (subscribeButton) {
                clearInterval(interval);
                insertDownloadButton(subscribeButton);
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                console.log('Failed to find Subscribe button after max attempts. DOM may have changed.');
            }
            attempts++;
            console.log(`Attempt ${attempts} to find Subscribe button...`);
        }, 500);
    }

    // Hàm chèn nút vào DOM
    function insertDownloadButton(subscribeButton) {
        const existingButton = document.querySelector('#youtube-video-exporter-download-btn');
        if (existingButton) {
            console.log('Button already added during retry, skipping insertion...');
            return;
        }

        const button = document.createElement('button');
        button.id = 'youtube-video-exporter-download-btn';
        button.innerText = 'Download Info';

        // Sao chép style từ nút Subscribe
        const subscribeBtn = subscribeButton.querySelector('button') ||
                            subscribeButton.querySelector('.yt-spec-button-shape-next');
        if (!subscribeBtn) {
            console.log('Inner button of Subscribe not found.');
            return;
        }
        const subscribeStyle = window.getComputedStyle(subscribeBtn);
        button.style.backgroundColor = '#FF0000';
        button.style.color = '#FFFFFF';
        button.style.border = 'none';
        button.style.borderRadius = subscribeStyle.borderRadius || '2px'; // Fallback cho Firefox
        button.style.padding = subscribeStyle.padding || '10px 16px';
        button.style.fontSize = subscribeStyle.fontSize || '14px';
        button.style.fontFamily = subscribeStyle.fontFamily || 'Roboto, Arial, sans-serif';
        button.style.fontWeight = subscribeStyle.fontWeight || '500';
        button.style.textTransform = subscribeStyle.textTransform || 'uppercase';
        button.style.cursor = 'pointer';
        button.style.height = subscribeStyle.height || '36px';
        button.style.display = 'inline-flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.boxShadow = subscribeStyle.boxShadow || 'none';
        button.style.transition = 'background-color 0.3s';
        button.style.marginLeft = '8px';

        // Hover effect
        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = '#CC0000';
        });
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = '#FF0000';
        });

        button.onclick = handleDownloadClick;

        // Chèn nút vào DOM
        const parentContainer = subscribeButton.closest('yt-flexible-actions-view-model') ||
                               subscribeButton.parentElement; // Fallback cho Edge/Firefox
        if (parentContainer) {
            parentContainer.insertBefore(button, subscribeButton.nextSibling);
            parentContainer.style.display = 'flex';
            parentContainer.style.alignItems = 'center';
            console.log('Download Info button added successfully.');
        } else {
            console.log('Parent container not found, inserting after Subscribe button.');
            subscribeButton.parentNode.insertBefore(button, subscribeButton.nextSibling);
        }
    }

    // Hàm xử lý khi nhấn nút Download
    async function handleDownloadClick() {
        const button = document.querySelector('#youtube-video-exporter-download-btn');
        button.disabled = true;
        button.innerText = 'Processing...';
        button.style.opacity = '0.7';

        try {
            console.log('Starting auto-scroll to load all videos...');
            await autoScrollToLoadAllVideos();

            console.log('Collecting video info after scroll...');
            const videoData = collectVideoInfo();

            if (videoData.length === 0) {
                alert('Không tìm thấy video nào để xuất!');
                return;
            }

            const channelName = getChannelName();
            const fileName = channelName ? `${channelName}_videos.xlsx` : 'youtube_videos.xlsx';

            console.log('Exporting to Excel with file name:', fileName);
            exportToExcel(videoData, fileName);
        } catch (e) {
            console.error('Error during download process:', e);
            alert('Có lỗi xảy ra. Vui lòng kiểm tra console để biết thêm chi tiết.');
        } finally {
            button.disabled = false;
            button.innerText = 'Download Info';
            button.style.opacity = '1';
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

                if (currentHeight === previousHeight) {
                    scrollAttempts++;
                    if (scrollAttempts >= 3) {
                        clearInterval(scrollInterval);
                        setTimeout(() => resolve(), 2000);
                    }
                } else {
                    scrollAttempts = 0;
                    previousHeight = currentHeight;
                }

                if (scrollAttempts >= maxAttempts) {
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

        videos.forEach((video) => {
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

    // Hàm lấy tên kênh
    function getChannelName() {
        console.log('Attempting to get channel name...');
        const channelHeader = document.querySelector('#channel-name #text');
        if (channelHeader && channelHeader.innerText) {
            return channelHeader.innerText.trim().replace(/[^a-zA-Z0-9]/g, '_');
        }

        const metaChannelName = document.querySelector('meta[itemprop="name"]');
        if (metaChannelName) {
            return metaChannelName.getAttribute('content').trim().replace(/[^a-zA-Z0-9]/g, '_');
        }

        const titleElement = document.querySelector('title');
        if (titleElement) {
            return titleElement.innerText.replace(' - YouTube', '').trim().replace(/[^a-zA-Z0-9]/g, '_');
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

    // Khởi tạo và theo dõi DOM
    function init() {
        addDownloadButton();

        const observer = new MutationObserver(() => {
            const button = document.querySelector('#youtube-video-exporter-download-btn');
            if (!button) {
                console.log('Button not found in DOM, re-adding immediately...');
                addDownloadButton();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        window.addEventListener('load', addDownloadButton);
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(addDownloadButton, 1000);
        });
    }

    // Chạy khi script khởi động
    init();
})();
