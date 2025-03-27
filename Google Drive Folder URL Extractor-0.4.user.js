// ==UserScript==
// @name         Google Drive Folder URL Extractor
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  Extract all file URLs from Google Drive folder
// @author       Grok
// @match        https://drive.google.com/drive/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Tạo nút
    function createButton() {
        const button = document.createElement('button');
        button.textContent = 'Get list URL';
        button.style.position = 'fixed';
        button.style.bottom = '20px';
        button.style.right = '20px';
        button.style.zIndex = '9999';
        button.style.padding = '12px 24px';
        button.style.background = 'linear-gradient(45deg, #6b7280, #9ca3af)';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '20px'; // Bo tròn hơn
        button.style.opacity = '0.5'; // Giảm opacity xuống 50%
        button.style.cursor = 'pointer';
        button.style.fontSize = '16px';
        button.style.fontFamily = 'Arial, sans-serif';
        button.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
        button.style.transition = 'all 0.3s ease';

        // Hiệu ứng hover
        button.addEventListener('mouseover', () => {
            button.style.background = 'linear-gradient(45deg, #7b8595, #acb3bf)';
            button.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
            button.style.transform = 'translateY(-2px)';
            button.style.opacity = '0.7'; // Tăng opacity khi hover
        });
        button.addEventListener('mouseout', () => {
            button.style.background = 'linear-gradient(45deg, #6b7280, #9ca3af)';
            button.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
            button.style.transform = 'translateY(0)';
            button.style.opacity = '0.5';
        });

        button.addEventListener('click', () => extractURLs(button));
        document.body.appendChild(button);
    }

    // Hàm trích xuất URL
    function extractURLs(button) {
        // Lấy tên folder
        const folderNameElement = document.querySelector('div[role="navigation"] span');
        let folderName = 'google_drive_urls';
        if (folderNameElement) {
            folderName = folderNameElement.textContent.trim().replace(/[^a-zA-Z0-9]/g, '_');
        }

        // Tìm tất cả các phần tử chứa liên kết file
        const fileElements = document.querySelectorAll('div[data-id]');
        const urls = [];

        fileElements.forEach(element => {
            const dataId = element.getAttribute('data-id');
            if (dataId) {
                const fileUrl = `https://drive.google.com/file/d/${dataId}/view`;
                urls.push(fileUrl);
            }
        });

        // Cập nhật số lượng link trên nút
        button.textContent = urls.length.toString();

        // Tạo nội dung file txt với các URL ngăn cách bởi dấu phẩy
        const content = urls.join(',');

        // Tạo và tải xuống file
        const blob = new Blob([content], {type: 'text/plain'});
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${folderName}_urls.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    // Chờ page load hoàn toàn
    window.addEventListener('load', () => {
        // Thêm nút sau 1 giây để đảm bảo page đã load
        setTimeout(createButton, 1000);
    });

})();