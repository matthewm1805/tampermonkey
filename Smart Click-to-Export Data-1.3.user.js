// ==UserScript==
// @name         Smart Click-to-Export Data
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Click on an element to export its refined data to a .txt file with improved accuracy
// @author       Mattthew M.
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let button = document.createElement('button');
    button.innerText = 'Get Data';
    button.style.position = 'fixed';
    button.style.bottom = '20px';
    button.style.right = '20px';
    button.style.background = '#FF0000'; // Màu đỏ YouTube
    button.style.border = 'none';
    button.style.color = 'white';
    button.style.padding = '6px 10px'; // Giảm kích thước nút
    button.style.fontSize = '12px'; // Giảm kích thước chữ
    button.style.borderRadius = '15px';
    button.style.cursor = 'pointer';
    button.style.boxShadow = '0px 2px 5px rgba(0, 0, 0, 0.2)';
    button.style.opacity = '0.5'; // Độ trong suốt 50%
    button.style.zIndex = '9999';
    button.style.transition = 'all 0.3s ease';

    button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.05)';
        button.style.boxShadow = '0px 4px 10px rgba(0, 0, 0, 0.3)';
        button.style.opacity = '1';
    });

    button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
        button.style.boxShadow = '0px 2px 5px rgba(0, 0, 0, 0.2)';
        button.style.opacity = '0.5';
    });

    document.body.appendChild(button);

    let selecting = false;

    button.addEventListener('click', () => {
        selecting = true;
        document.body.style.cursor = 'crosshair';
    });

    document.addEventListener('click', (event) => {
        if (!selecting) return;
        event.preventDefault(); // Ngăn chặn hành động mặc định (chuyển trang, submit form, v.v.)
        event.stopPropagation(); // Ngăn chặn sự kiện lan truyền
        selecting = false;
        document.body.style.cursor = 'default';

        let targetElement = event.target;
        let refinedSelector = getBestSelector(targetElement);

        if (!refinedSelector) {
            alert('Could not determine the best selector. Please try again.');
            return;
        }

        let elements = document.querySelectorAll(refinedSelector);
        let data = Array.from(elements).map(el => el.innerText.trim()).filter(text => text && text.length > 2);

        if (data.length === 0) {
            alert('No valid data found in the selected element. Try again.');
            return;
        }

        let textOutput = data.join('\n');
        let blob = new Blob([textOutput], { type: 'text/plain' });
        let link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'exported_data.txt';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, true);

    function getBestSelector(element) {
        if (element.id) {
            return `#${element.id}`;
        }
        if (element.className) {
            return '.' + element.className.split(' ').filter(Boolean).join('.');
        }
        return element.tagName.toLowerCase();
    }
})();
