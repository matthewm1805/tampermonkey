// ==UserScript==
// @name        Google Drive Folder URL Extractor
// @namespace   http://tampermonkey.net/
// @version     0.5
// @description Extract all file URLs from Google Drive folder, with accurate file count
// @author      Matthew M.
// @match       https://drive.google.com/drive/*
// @grant       none
// ==/UserScript==

(function() {
    'use strict';

    let extractButton; // Biến toàn cục để lưu trữ nút

    // Tạo nút
    function createButton() {
        if (extractButton) return; // Không tạo lại nút nếu đã tồn tại

        extractButton = document.createElement('button');
        extractButton.textContent = 'Get list URL';
        extractButton.style.position = 'fixed';
        extractButton.style.bottom = '20px';
        extractButton.style.right = '20px';
        extractButton.style.zIndex = '9999';
        extractButton.style.padding = '12px 24px';
        extractButton.style.background = 'linear-gradient(45deg, #6b7280, #9ca3af)';
        extractButton.style.color = 'white';
        extractButton.style.border = 'none';
        extractButton.style.borderRadius = '20px';
        extractButton.style.opacity = '0.7'; // Tăng opacity mặc định
        extractButton.style.cursor = 'pointer';
        extractButton.style.fontSize = '16px';
        extractButton.style.fontFamily = 'Arial, sans-serif';
        extractButton.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
        extractButton.style.transition = 'all 0.3s ease';

        // Hiệu ứng hover
        extractButton.addEventListener('mouseover', () => {
            extractButton.style.background = 'linear-gradient(45deg, #7b8595, #acb3bf)';
            extractButton.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
            extractButton.style.transform = 'translateY(-2px)';
            extractButton.style.opacity = '1'; // Tăng opacity khi hover
        });
        extractButton.addEventListener('mouseout', () => {
            extractButton.style.background = 'linear-gradient(45deg, #6b7280, #9ca3af)';
            extractButton.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
            extractButton.style.transform = 'translateY(0)';
            extractButton.style.opacity = '0.7';
        });

        extractButton.addEventListener('click', () => extractURLs());
        document.body.appendChild(extractButton);
    }

    // Hàm trích xuất URL
    function extractURLs() {
        if (!extractButton) return; // Đảm bảo nút đã được tạo

        extractButton.textContent = 'Đang trích xuất...';
        extractButton.disabled = true; // Vô hiệu hóa nút trong khi xử lý

        // Lấy tên folder
        const folderNameElement = document.querySelector('div[role="navigation"] span');
        let folderName = 'google_drive_urls';
        if (folderNameElement) {
            folderName = folderNameElement.textContent.trim().replace(/[^a-zA-Z0-9_.-]/g, '_'); // Ký tự hợp lệ cho tên file
        }

        // Sử dụng Intersection Observer để phát hiện khi các phần tử mới được load vào DOM
        let observer = null;
        const urls = new Set(); // Sử dụng Set để tránh trùng lặp URL

        // Cuộn xuống để load tất cả các file
        function scrollAndExtract() {
            const initialHeight = document.documentElement.scrollHeight;
            window.scrollTo(0, document.documentElement.scrollHeight);

            // Chờ một chút để nội dung mới được render
            setTimeout(() => {
                const currentHeight = document.documentElement.scrollHeight;
                if (currentHeight > initialHeight) {
                    // Có nội dung mới, tiếp tục theo dõi và cuộn
                    extractCurrentVisibleFiles();
                    scrollAndExtract();
                } else {
                    // Không còn nội dung mới, hoàn tất trích xuất
                    if (observer) {
                        observer.disconnect();
                    }
                    finalizeExtraction();
                }
            }, 1000); // Tăng thời gian chờ nếu cần
        }

        // Trích xuất các file hiện có trên màn hình
        function extractCurrentVisibleFiles() {
            const fileElements = document.querySelectorAll('div[data-id]');
            fileElements.forEach(element => {
                const dataId = element.getAttribute('data-id');
                if (dataId) {
                    const fileUrl = `https://drive.google.com/file/d/${dataId}/view`;
                    urls.add(fileUrl);
                }
            });
            updateButtonCount();
        }

        // Cập nhật số lượng link trên nút
        function updateButtonCount() {
            if (extractButton) {
                extractButton.textContent = `Tìm thấy: ${urls.size} files`;
            }
        }

        // Hoàn tất quá trình trích xuất và tải xuống file
        function finalizeExtraction() {
            // Thay đổi dòng này để nối các URL bằng dấu phẩy
            const content = Array.from(urls).join(','); 

            const blob = new Blob([content], {type: 'text/plain'});
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${folderName}_urls.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            extractButton.textContent = `Tải xuống ${urls.size} files`;
            extractButton.disabled = false; // Kích hoạt lại nút
            setTimeout(() => {
                extractButton.textContent = 'Get list URL';
            }, 3000); // Đặt lại văn bản nút sau 3 giây
        }

        // Bắt đầu quá trình
        extractCurrentVisibleFiles(); // Lấy các file ban đầu
        scrollAndExtract(); // Bắt đầu cuộn và trích xuất
    }

    // Chờ page load hoàn toàn và có thể thao tác được
    function initializeScript() {
        // Sử dụng MutationObserver để phát hiện khi nội dung chính của Google Drive đã tải
        const targetNode = document.body;
        const config = { childList: true, subtree: true };

        const observer = new MutationObserver((mutationsList, observer) => {
            // Tìm kiếm một phần tử đặc trưng của Google Drive đã load (ví dụ: thanh điều hướng hoặc vùng hiển thị file)
            const driveContentLoaded = document.querySelector('div[role="main"]');
            if (driveContentLoaded) {
                createButton();
                observer.disconnect(); // Ngừng theo dõi sau khi nút được tạo
            }
        });

        observer.observe(targetNode, config);
    }

    // Khởi tạo script
    initializeScript();

})();
