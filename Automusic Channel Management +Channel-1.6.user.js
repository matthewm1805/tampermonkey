// ==UserScript==
// @name         Automusic Channel Management +Channel
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Clone "+ Channel" button
// @author       MM.
// @match        *://automusic.win/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function waitForElements(selector, callback, timeout = 10000) {
        const start = Date.now();
        const interval = setInterval(() => {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                clearInterval(interval);
                callback(elements);
            } else if (Date.now() - start > timeout) {
                clearInterval(interval);
                console.warn(`Timeout waiting for selector: ${selector}`);
            }
        }, 300);
    }

    waitForElements('.action-buttons.mt-3', function (actionSections) {
        actionSections.forEach(section => {
            // Tránh thêm lặp lại
            if (section.querySelector('.btn-clone-add-channel')) return;

            // Tạo nút mới
            const newBtn = document.createElement('button');
            newBtn.type = 'button';
            newBtn.className = 'btn btn-sm btn-action btn-clone-add-channel';
            newBtn.setAttribute('data-toggle', 'tooltip');
            newBtn.setAttribute('data-original-title', 'Add Channel');
            newBtn.innerHTML = '<i class="fas fa-plus mr-1"></i> Channel';

            // Thêm hành vi giống nút gốc
            newBtn.addEventListener('click', () => {
                const original = document.querySelector('.btn-add-channel');
                if (original) original.click();
                else alert('Không tìm thấy nút gốc!');
            });

            // Thêm vào DOM
            const moreButtonGroup = section.querySelector('.dropdown');
            if (moreButtonGroup) {
                section.insertBefore(newBtn, moreButtonGroup);
            } else {
                section.appendChild(newBtn);
            }
        });
    });
})();
