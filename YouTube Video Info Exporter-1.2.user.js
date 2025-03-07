// ==UserScript==
// @name         YouTube Video Info Exporter
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Export YouTube video info to Excel with a Download button styled like Subscribe
// @author       Matthew M.
// @match        https://www.youtube.com/*
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// ==/UserScript==

(function() {
    'use strict';

    // Hàm để tạo và thêm nút "Download Info"
    function addDownloadButton() {
        if (document.querySelector('#youtube-video-exporter-download-btn')) return;

        // Tìm nút Subscribe dựa trên yt-subscribe-button-view-model
        const subscribeButton = document.querySelector('yt-subscribe-button-view-model');
        if (!subscribeButton) {
            console.log('Subscribe button (yt-subscribe-button-view-model) not found yet, retrying...');
            setTimeout(addDownloadButton, 500); // Thử lại sau 0.5 giây
            return;
        }

        // Tạo nút Download Info
        const button = document.createElement('button');
        button.id = 'youtube-video-exporter-download-btn';
        button.innerText = 'Download Info';

        // Sao chép style từ nút Subscribe
        const subscribeBtn = subscribeButton.querySelector('button');
        if (!subscribeBtn) {
            console.log('Inner button of Subscribe not found, retrying...');
            setTimeout(addDownloadButton, 500);
            return;
        }
        const subscribeStyle = window.getComputedStyle(subscribeBtn);
        button.style.backgroundColor = '#FF0000'; // Nền đỏ YouTube
        button.style.color = '#FFFFFF'; // Chữ trắng
        button.style.border = 'none';
        button.style.borderRadius = subscribeStyle.borderRadius; // Bo tròn giống Subscribe
        button.style.padding = subscribeStyle.padding; // Padding giống Subscribe
        button.style.fontSize = subscribeStyle.fontSize; // Font size giống Subscribe
        button.style.fontFamily = subscribeStyle.fontFamily; // Font family giống Subscribe
        button.style.fontWeight = subscribeStyle.fontWeight; // Font weight giống Subscribe
        button.style.textTransform = subscribeStyle.textTransform; // Text transform giống Subscribe
        button.style.cursor = 'pointer';
        button.style.height = subscribeStyle.height; // Chiều cao giống Subscribe
        button.style.display = 'inline-flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.boxShadow = subscribeStyle.boxShadow;
        button.style.transition = 'background-color 0.3s';
        button.style.marginLeft = '8px'; // Khoảng cách nhỏ hơn để vừa khít

        // Hover effect
        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = '#CC0000'; // Màu đỏ đậm hơn khi hover
        });
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = '#FF0000';
        });

        button.onclick = handleDownloadClick;

        // Tìm container cha (yt-flexible-actions-view-model) để chèn nút
        const parentContainer = subscribeButton.closest('yt-flexible-actions-view-model');
        if (parentContainer) {
            // Chèn nút ngay sau nút Subscribe trong container flex
            parentContainer.insertBefore(button, subscribeButton.nextSibling);
            // Đảm bảo container cha là flex để nút nằm ngang hàng
            parentContainer.style.display = 'flex';
            parentContainer.style.alignItems = 'center';
            console.log('Download Info button added successfully next to Subscribe button.');
        } else {
            console.log('Parent container (yt-flexible-actions-view-model) not found, inserting after Subscribe button.');
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

            // Lấy lại channelName mỗi khi nhấn nút để đảm bảo đúng kênh hiện tại
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

    // Hàm lấy tên kênh
    function getChannelName() {
        console.log('Attempting to get channel name...');
        const channelHeader = document.querySelector('#channel-name #text');
        if (channelHeader && channelHeader.innerText) {
            console.log('Channel name found in UI:', channelHeader.innerText);
            return channelHeader.innerText.trim().replace(/[^a-zA-Z0-9]/g, '_');
        }

        const metaChannelName = document.querySelector('meta[itemprop="name"]');
        if (metaChannelName) {
            console.log('Channel name found in meta:', metaChannelName.getAttribute('content'));
            return metaChannelName.getAttribute('content').trim().replace(/[^a-zA-Z0-9]/g, '_');
        }

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

    // Theo dõi DOM để thêm nút khi sẵn sàng
    function init() {
        addDownloadButton();

        const observer = new MutationObserver((mutations) => {
            if (!document.querySelector('#youtube-video-exporter-download-btn')) {
                addDownloadButton();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Chạy khi trang tải hoặc DOM thay đổi
    window.addEventListener('load', init);
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(init, 1000); // Delay để đảm bảo DOM sẵn sàng
    });
})();