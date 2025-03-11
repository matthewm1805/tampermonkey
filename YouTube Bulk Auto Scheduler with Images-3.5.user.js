// ==UserScript==
// @name         YouTube Bulk Auto Scheduler with Images
// @namespace    http://tampermonkey.net/
// @version      3.5
// @description  Tự động lên lịch đăng nhiều bài trên YouTube Community với hình ảnh, hiển thị tiến trình và đếm ngược
// @author       Matthew M.
// @match        https://www.youtube.com/*/community
// @match        https://www.youtube.com/channel/*/community?pvf=CAE%253D

// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let logs = [];
    let scheduleButton;
    let uploadedImages = []; // Mảng lưu trữ các file ảnh đã tải lên

    function logAction(action) {
        logs.push(`[${new Date().toLocaleTimeString()}] ${action}`);
        console.log(action);
    }

    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const interval = 100;
            let elapsedTime = 0;
            const check = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(check);
                    resolve(element);
                }
                elapsedTime += interval;
                if (elapsedTime >= timeout) {
                    clearInterval(check);
                    reject(new Error(`Timeout: ${selector} not found`));
                }
            }, interval);
        });
    }

    function convertDateFormat(date) {
        let [day, month, year] = date.split('/');
        let newDate = new Date(`${year}-${month}-${day}`);
        return newDate.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    }

    async function attachImage(imageIndex) {
        if (imageIndex >= uploadedImages.length) return; // Không có ảnh để đính kèm

        logAction("Bắt đầu đính kèm ảnh");
        await waitForElement("span#image-button yt-button-shape button");
        document.querySelector("span#image-button yt-button-shape button").click();
        logAction("Nhấp vào nút thêm ảnh");

        await waitForElement("a#select-link");
        document.querySelector("a#select-link").click();
        logAction("Nhấp vào 'select from your computer'");

        await waitForElement("ytd-backstage-multi-image-select-renderer input[type='file']");
        let fileInput = document.querySelector("ytd-backstage-multi-image-select-renderer input[type='file']");
        let dataTransfer = new DataTransfer();
        dataTransfer.items.add(uploadedImages[imageIndex]);
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        logAction("Đã chọn ảnh để tải lên");

        await new Promise(resolve => setTimeout(resolve, 2000)); // Chờ ảnh tải lên
    }

    async function scheduleBulkPosts() {
        logs = [];
        logAction("Bắt đầu đặt lịch bài đăng hàng loạt");

        const startDate = prompt("Nhập ngày bắt đầu đăng (DD/MM/YYYY):");
        if (!startDate) return;

        let currentDate = new Date(startDate.split('/').reverse().join('-'));
        let postContent = await getUserTextAreaInput("Nhập nội dung các bài viết, mỗi dòng là một bài đăng:");
        if (!postContent) return;

        let posts = postContent.split('\n').filter(line => line.trim() !== "");
        if (!posts.length) return;

        // Hỏi người dùng có muốn thêm ảnh không
        if (confirm("Bạn có muốn thêm ảnh cho các bài đăng không?")) {
            uploadedImages = await getUserImageInput("Tải lên các ảnh (số lượng ảnh phải khớp hoặc ít hơn số bài đăng):");
            if (!uploadedImages.length) logAction("Không có ảnh nào được tải lên");
        }

        for (let i = 0; i < posts.length; i++) {
            let formattedDate = convertDateFormat(currentDate.toLocaleDateString('en-GB').replaceAll('/', '/'));
            logAction(`Đặt lịch bài đăng ${i + 1}/${posts.length} vào ngày: ${formattedDate}`);
            updateButtonText(`Posting (${i + 1}/${posts.length})`);

            await waitForElement("#commentbox-placeholder");
            document.querySelector("#commentbox-placeholder").click();
            logAction("Mở hộp nhập nội dung bài đăng");

            await waitForElement("div#contenteditable-root");
            document.querySelector("div#contenteditable-root").focus();
            document.execCommand("insertText", false, posts[i]);
            logAction("Nhập nội dung bài đăng");

            // Đính kèm ảnh nếu có
            if (uploadedImages.length > 0 && i < uploadedImages.length) {
                await attachImage(i);
            }

            await waitForElement("div#option-menu yt-button-shape button");
            document.querySelector("div#option-menu yt-button-shape button").click();
            logAction("Mở menu đặt lịch");

            await waitForElement("yt-formatted-string.style-scope.ytd-menu-service-item-renderer");
            document.querySelector("yt-formatted-string.style-scope.ytd-menu-service-item-renderer").click();
            logAction("Chọn chế độ đặt lịch");

            await waitForElement("#date-label-text");
            document.querySelector("#date-label-text").click();
            logAction("Mở lịch chọn ngày");

            await waitForElement("input#textbox.style-scope.ytd-calendar-date-picker");
            let dateInput = document.querySelector("input#textbox.style-scope.ytd-calendar-date-picker");
            dateInput.value = formattedDate;
            dateInput.dispatchEvent(new Event('input', { bubbles: true }));
            logAction("Điền ngày vào ô input: " + formattedDate);

            await waitForElement("ytd-button-renderer#submit-button button");
            document.querySelector("ytd-button-renderer#submit-button button").click();
            logAction("Xác nhận đặt lịch");

            currentDate.setDate(currentDate.getDate() + 1);
            await countdown(10);
        }

        updateButtonText("Bulk Schedule YouTube Posts");
    }

    function updateButtonText(text) {
        scheduleButton.innerText = text;
    }

    async function countdown(seconds) {
        for (let i = seconds; i > 0; i--) {
            updateButtonText(`Waiting (${i}s)...`);
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    function getUserTextAreaInput(title) {
        return new Promise(resolve => {
            let popup = document.createElement("div");
            popup.style.position = "fixed";
            popup.style.top = "50%";
            popup.style.left = "50%";
            popup.style.transform = "translate(-50%, -50%)";
            popup.style.background = "#fff";
            popup.style.padding = "20px";
            popup.style.borderRadius = "10px";
            popup.style.boxShadow = "0 4px 10px rgba(0, 0, 0, 0.2)";
            popup.style.zIndex = "10000";
            popup.style.display = "flex";
            popup.style.flexDirection = "column";
            popup.style.gap = "10px";

            let titleElem = document.createElement("h3");
            titleElem.innerText = title;
            titleElem.style.margin = "0";
            popup.appendChild(titleElem);

            let textarea = document.createElement("textarea");
            textarea.style.width = "300px";
            textarea.style.height = "200px";
            textarea.style.padding = "10px";
            textarea.style.border = "1px solid #ccc";
            textarea.style.borderRadius = "5px";
            popup.appendChild(textarea);

            let button = document.createElement("button");
            button.innerText = "Xác nhận";
            button.style.padding = "10px";
            button.style.backgroundColor = "#007bff";
            button.style.color = "white";
            button.style.border = "none";
            button.style.borderRadius = "5px";
            button.style.cursor = "pointer";
            button.onclick = () => {
                resolve(textarea.value);
                document.body.removeChild(popup);
            };
            popup.appendChild(button);

            document.body.appendChild(popup);
        });
    }

    function getUserImageInput(title) {
        return new Promise(resolve => {
            let popup = document.createElement("div");
            popup.style.position = "fixed";
            popup.style.top = "50%";
            popup.style.left = "50%";
            popup.style.transform = "translate(-50%, -50%)";
            popup.style.background = "#fff";
            popup.style.padding = "20px";
            popup.style.borderRadius = "10px";
            popup.style.boxShadow = "0 4px 10px rgba(0, 0, 0, 0.2)";
            popup.style.zIndex = "10000";
            popup.style.display = "flex";
            popup.style.flexDirection = "column";
            popup.style.gap = "10px";

            let titleElem = document.createElement("h3");
            titleElem.innerText = title;
            titleElem.style.margin = "0";
            popup.appendChild(titleElem);

            let fileInput = document.createElement("input");
            fileInput.type = "file";
            fileInput.multiple = true;
            fileInput.accept = "image/*";
            fileInput.style.padding = "10px";
            popup.appendChild(fileInput);

            let button = document.createElement("button");
            button.innerText = "Xác nhận \n(Vui lòng TẮT cửa sổ chọn ảnh ngay sau bước này)";
            button.style.padding = "10px";
            button.style.backgroundColor = "#007bff";
            button.style.color = "white";
            button.style.border = "none";
            button.style.borderRadius = "5px";
            button.style.cursor = "pointer";
            button.onclick = () => {
                resolve(Array.from(fileInput.files));
                document.body.removeChild(popup);
            };
            popup.appendChild(button);

            document.body.appendChild(popup);
        });
    }

    scheduleButton = document.createElement("button");
    scheduleButton.innerText = "Bulk Schedule YouTube Posts";
    scheduleButton.style.position = "fixed";
    scheduleButton.style.bottom = "20px";
    scheduleButton.style.right = "20px";
    scheduleButton.style.padding = "12px 20px";
    scheduleButton.style.backgroundColor = "#ff4d4d";
    scheduleButton.style.color = "white";
    scheduleButton.style.border = "none";
    scheduleButton.style.borderRadius = "5px";
    scheduleButton.style.cursor = "pointer";
    scheduleButton.onclick = scheduleBulkPosts;
    document.body.appendChild(scheduleButton);
})();