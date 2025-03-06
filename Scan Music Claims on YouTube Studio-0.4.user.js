// ==UserScript==
// @name         Scan Music Claims on YouTube Studio
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Scan music claims on YouTube Studio and list songs not belonging to Epidemic Sound
// @author       You
// @match        https://studio.youtube.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let isDragging = false;
    let currentX;
    let currentY;
    let xOffset = 0;
    let yOffset = 0;

    function createScanButton() {
        const button = document.createElement('button');
        button.id = 'scan-button';
        button.innerText = 'Scan';
        button.style.position = 'fixed';
        button.style.top = '10px';
        button.style.right = '10px';
        button.style.zIndex = '9999';
        button.style.padding = '10px 20px';
        button.style.backgroundColor = '#4CAF50';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '5px';
        button.style.cursor = 'move';

        document.body.appendChild(button);

        button.addEventListener('click', scanMusicClaims);

        button.addEventListener('mousedown', startDragging);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDragging);
    }

    function startDragging(e) {
        const button = document.getElementById('scan-button');
        currentX = e.clientX - xOffset;
        currentY = e.clientY - yOffset;

        if (e.target === button) {
            isDragging = true;
        }
    }

    function drag(e) {
        if (isDragging) {
            xOffset = e.clientX - currentX;
            yOffset = e.clientY - currentY;

            const button = document.getElementById('scan-button');
            button.style.top = (button.offsetTop + yOffset) + 'px';
            button.style.right = 'auto';
            button.style.left = (button.offsetLeft + xOffset) + 'px';

            xOffset = 0;
            yOffset = 0;
            currentX = e.clientX;
            currentY = e.clientY;
        }
    }

    function stopDragging() {
        isDragging = false;
    }

    function scanMusicClaims() {
        const claimRows = document.querySelectorAll('ytcr-video-content-list-claim-row');
        const results = [];
        let nonEpidemicSongs = [];

        if (claimRows.length === 0) {
            alert('Không tìm thấy thông tin bản quyền nào để quét. Hãy đảm bảo bạn đang ở trang có thông tin bản quyền (ví dụ: Content hoặc Video Details).');
            return;
        }

        claimRows.forEach((row, index) => {
            const songTitle = row.querySelector('#asset-title')?.innerText || 'Không xác định';
            const artist = row.querySelector('#artists')?.innerText || 'Không xác định';
            const copyrightOwnerElement = row.querySelector('.impact-tooltip-text')?.innerText || '';
            const copyrightOwner = copyrightOwnerElement.includes('Epidemic Sound') ? 'Epidemic Sound' : 'Không phải Epidemic Sound';

            if (!copyrightOwnerElement.includes('Epidemic Sound')) {
                nonEpidemicSongs.push({
                    title: songTitle,
                    artist: artist,
                    copyrightOwner: copyrightOwnerElement || 'Không xác định'
                });
            }

            results.push(`Hàng ${index + 1}: Bài hát: ${songTitle}, Nghệ sĩ: ${artist}, Chủ sở hữu bản quyền: ${copyrightOwner}`);
        });

        displayResults(results, nonEpidemicSongs);
    }

    function displayResults(allClaims, nonEpidemicSongs) {
        const existingResultDiv = document.getElementById('scan-results');
        if (existingResultDiv) {
            existingResultDiv.remove();
        }

        const resultDiv = document.createElement('div');
        resultDiv.id = 'scan-results';
        resultDiv.style.position = 'fixed';
        resultDiv.style.top = '50px';
        resultDiv.style.right = '10px';
        resultDiv.style.zIndex = '9999';
        resultDiv.style.backgroundColor = '#000'; // Nền màu đen
        resultDiv.style.color = '#fff'; // Chữ màu trắng
        resultDiv.style.border = '1px solid #444';
        resultDiv.style.padding = '10px';
        resultDiv.style.maxWidth = '400px';
        resultDiv.style.maxHeight = '400px';
        resultDiv.style.overflowY = 'auto';
        resultDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';

        const minimizeButton = document.createElement('button');
        minimizeButton.innerText = 'Minimize';
        minimizeButton.style.position = 'absolute';
        minimizeButton.style.top = '10px';
        minimizeButton.style.right = '10px';
        minimizeButton.style.padding = '5px 10px';
        minimizeButton.style.backgroundColor = '#ff4444';
        minimizeButton.style.color = 'white';
        minimizeButton.style.border = 'none';
        minimizeButton.style.borderRadius = '3px';
        minimizeButton.style.cursor = 'pointer';
        minimizeButton.addEventListener('click', () => {
            resultDiv.style.display = 'none';
            createRestoreButton();
        });
        resultDiv.appendChild(minimizeButton);

        const title = document.createElement('h3');
        title.innerText = 'Kết quả quét';
        title.style.color = '#fff';
        resultDiv.appendChild(title);

        const allClaimsList = document.createElement('ul');
        allClaims.forEach(claim => {
            const li = document.createElement('li');
            li.innerText = claim;
            li.style.color = '#fff';
            allClaimsList.appendChild(li);
        });
        resultDiv.appendChild(allClaimsList);

        if (nonEpidemicSongs.length > 0) {
            const nonEpidemicTitle = document.createElement('h4');
            nonEpidemicTitle.innerText = '\nBài hát không thuộc Epidemic Sound:';
            nonEpidemicTitle.style.color = '#fff';
            resultDiv.appendChild(nonEpidemicTitle);

            const nonEpidemicList = document.createElement('ul');
            nonEpidemicSongs.forEach(song => {
                const li = document.createElement('li');
                li.innerText = `Bài hát: ${song.title}, Nghệ sĩ: ${song.artist}, Chủ sở hữu: ${song.copyrightOwner}`;
                li.style.color = '#fff';
                nonEpidemicList.appendChild(li);
            });
            resultDiv.appendChild(nonEpidemicList);
        } else {
            const noNonEpidemic = document.createElement('p');
            noNonEpidemic.innerText = '\nKhông có bài hát nào không thuộc Epidemic Sound.';
            noNonEpidemic.style.color = '#fff';
            resultDiv.appendChild(noNonEpidemic);
        }

        document.body.appendChild(resultDiv);
    }

    function createRestoreButton() {
        const existingRestoreButton = document.getElementById('restore-button');
        if (existingRestoreButton) {
            return;
        }

        const restoreButton = document.createElement('button');
        restoreButton.id = 'restore-button';
        restoreButton.innerText = 'Restore Results';
        restoreButton.style.position = 'fixed';
        restoreButton.style.top = '10px';
        restoreButton.style.right = '80px';
        restoreButton.style.zIndex = '9999';
        restoreButton.style.padding = '5px 10px';
        restoreButton.style.backgroundColor = '#2196F3';
        restoreButton.style.color = 'white';
        restoreButton.style.border = 'none';
        restoreButton.style.borderRadius = '3px';
        restoreButton.style.cursor = 'pointer';

        restoreButton.addEventListener('click', () => {
            const resultDiv = document.getElementById('scan-results');
            if (resultDiv) {
                resultDiv.style.display = 'block';
                restoreButton.remove();
            }
        });

        document.body.appendChild(restoreButton);
    }

    function init() {
        setTimeout(() => {
            createScanButton();
        }, 3000);
    }

    window.addEventListener('load', init);

    const observer = new MutationObserver((mutations) => {
        if (!document.getElementById('scan-button')) {
            createScanButton();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();