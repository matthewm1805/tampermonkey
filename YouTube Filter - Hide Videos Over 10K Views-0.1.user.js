// ==UserScript==
// @name         YouTube Filter - Hide Videos Over 10K Views
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Hide videos with more than 10,000 views on YouTube homepage
// @author       Grok (xAI)
// @match        https://www.youtube.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Hàm phân tích số lượt xem từ chuỗi văn bản
    function parseViews(text) {
        if (!text) return null;

        const viewMatch = text.match(/(\d+\.?\d*[KM]?)\s*views/i);
        if (!viewMatch) return null;

        let viewStr = viewMatch[1];
        if (viewStr.includes('K')) {
            return parseFloat(viewStr.replace('K', '')) * 1000;
        } else if (viewStr.includes('M')) {
            return parseFloat(viewStr.replace('M', '')) * 1000000;
        } else {
            return parseInt(viewStr);
        }
    }

    // Hàm lọc video
    function filterVideos() {
        // Tìm tất cả các video trên trang chủ
        const videoElements = document.querySelectorAll('ytd-rich-item-renderer');

        videoElements.forEach(video => {
            // Tìm metadata chứa số lượt xem
            const metadata = video.querySelector('#metadata-line');
            if (!metadata) {
                // Nếu không có metadata, giữ video hiển thị (giả định không đủ thông tin)
                return;
            }

            const viewText = metadata.textContent;
            const viewCount = parseViews(viewText);

            // Nếu số lượt xem >= 10,000, ẩn video
            if (viewCount !== null && viewCount >= 10000) {
                video.style.display = 'none';
            } else {
                video.style.display = 'block';
            }
        });
    }

    // Theo dõi sự thay đổi trong DOM và lọc lại khi cần
    function observePage() {
        filterVideos();

        const observer = new MutationObserver(() => {
            filterVideos();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Chạy khi trang tải xong
    window.addEventListener('load', observePage);

    // Chạy ngay lập tức nếu trang đã tải
    if (document.readyState === 'complete') {
        observePage();
    }

    // Thêm nút bật/tắt (tùy chọn)
    function addToggleButton() {
        const button = document.createElement('button');
        button.textContent = 'Toggle Filter <10K Views';
        button.style.position = 'fixed';
        button.style.top = '10px';
        button.style.right = '10px';
        button.style.zIndex = '1000';
        button.style.padding = '5px';
        button.style.backgroundColor = '#ff0000';
        button.style.color = '#fff';
        let isFiltering = true;

        button.addEventListener('click', () => {
            isFiltering = !isFiltering;
            if (isFiltering) {
                filterVideos();
                button.textContent = 'Toggle Filter <10K Views (ON)';
                button.style.backgroundColor = '#ff0000';
            } else {
                document.querySelectorAll('ytd-rich-item-renderer').forEach(video => {
                    video.style.display = 'block';
                });
                button.textContent = 'Toggle Filter <10K Views (OFF)';
                button.style.backgroundColor = '#00ff00';
            }
        });

        document.body.appendChild(button);
    }

    window.addEventListener('load', addToggleButton);
})();