// ==UserScript==
// @name         Scan Music Claims on YouTube Studio
// @namespace    http://tampermonkey.net/
// @version      0.9
// @description  Scan music claims on YouTube Studio with a modern, professional UI
// @author       Matthew M.
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

    // Thêm Google Fonts (Roboto)
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    function createScanButton() {
        const button = document.createElement('button');
        button.id = 'scan-button';
        button.innerText = 'Scan';
        button.style.position = 'fixed';
        button.style.bottom = '20px';
        button.style.left = '20px';
        button.style.zIndex = '9999';
        button.style.padding = '12px 24px';
        button.style.background = 'linear-gradient(135deg, #00C4B4, #3B82F6)';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '10px';
        button.style.cursor = 'move';
        button.style.boxShadow = '0 4px 15px rgba(0, 188, 212, 0.3)';
        button.style.transition = 'all 0.3s ease';
        button.style.fontFamily = "'Roboto', sans-serif";
        button.style.fontSize = '14px';
        button.style.fontWeight = '500';
        button.style.opacity = '0.5';

        button.addEventListener('mouseover', () => {
            button.style.opacity = '1';
            button.style.transform = 'translateY(-3px)';
            button.style.boxShadow = '0 6px 20px rgba(0, 188, 212, 0.5)';
        });
        button.addEventListener('mouseout', () => {
            if (!isDragging) {
                button.style.opacity = '0.5';
                button.style.transform = 'translateY(0)';
                button.style.boxShadow = '0 4px 15px rgba(0, 188, 212, 0.3)';
            }
        });

        button.addEventListener('mousedown', () => {
            button.style.opacity = '1';
        });

        const tooltip = document.createElement('span');
        tooltip.id = 'scan-tooltip';
        tooltip.innerText = 'Click to scan music claims';
        tooltip.style.position = 'absolute';
        tooltip.style.bottom = 'calc(100% + 10px)';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.backgroundColor = '#2D3748';
        tooltip.style.color = 'white';
        tooltip.style.padding = '6px 12px';
        tooltip.style.borderRadius = '6px';
        tooltip.style.fontSize = '12px';
        tooltip.style.fontFamily = "'Roboto', sans-serif";
        tooltip.style.opacity = '0';
        tooltip.style.transition = 'opacity 0.3s ease';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.whiteSpace = 'nowrap';

        const arrow = document.createElement('div');
        arrow.style.position = 'absolute';
        arrow.style.bottom = '-5px';
        arrow.style.left = '50%';
        arrow.style.transform = 'translateX(-50%)';
        arrow.style.width = '0';
        arrow.style.height = '0';
        arrow.style.borderLeft = '5px solid transparent';
        arrow.style.borderRight = '5px solid transparent';
        arrow.style.borderTop = '5px solid #2D3748';
        tooltip.appendChild(arrow);

        button.appendChild(tooltip);

        button.addEventListener('mouseover', () => {
            tooltip.style.opacity = '1';
        });
        button.addEventListener('mouseout', () => {
            tooltip.style.opacity = '0';
        });

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
            e.preventDefault();
            const button = document.getElementById('scan-button');
            const rect = button.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            xOffset = e.clientX - currentX;
            yOffset = e.clientY - currentY;

            let newLeft = button.offsetLeft + xOffset;
            let newBottom = viewportHeight - (button.offsetTop + yOffset);

            newLeft = Math.max(10, Math.min(newLeft, viewportWidth - rect.width - 10));
            newBottom = Math.max(10, Math.min(newBottom, viewportHeight - rect.height - 10));

            button.style.left = newLeft + 'px';
            button.style.bottom = newBottom + 'px';
            button.style.top = 'auto';
            button.style.right = 'auto';

            xOffset = 0;
            yOffset = 0;
            currentX = e.clientX;
            currentY = e.clientY;
        }
    }

    function stopDragging() {
        const button = document.getElementById('scan-button');
        button.style.opacity = '0.5';
        button.style.transform = 'translateY(0)';
        button.style.boxShadow = '0 4px 15px rgba(0, 188, 212, 0.3)';
        isDragging = false;
    }

    function scanMusicClaims() {
        const claimRows = document.querySelectorAll('ytcr-video-content-list-claim-row');

        if (claimRows.length === 0) {
            alert('Không tìm thấy thông tin bản quyền nào để quét. Hãy đảm bảo bạn đang ở trang có thông tin bản quyền (ví dụ: Content hoặc Video Details).');
            return;
        }

        document.querySelectorAll('.custom-claim-label').forEach(label => label.remove());

        let epidemicCount = 0;
        let nonEpidemicCount = 0;
        const totalCount = claimRows.length;

        claimRows.forEach((row) => {
            const songTitle = row.querySelector('#asset-title')?.innerText || 'Không xác định';
            const artist = row.querySelector('#artists')?.innerText || 'Không xác định';
            const copyrightOwnerElement = row.querySelector('.impact-tooltip-text')?.innerText || 'Không xác định';
            const isEpidemic = copyrightOwnerElement.includes('Epidemic Sound');

            if (isEpidemic) {
                epidemicCount++;
            } else {
                nonEpidemicCount++;
            }

            const claimLabel = document.createElement('span');
            claimLabel.className = 'custom-claim-label';
            claimLabel.innerText = `${songTitle} - ${artist} | Chủ sở hữu: ${copyrightOwnerElement}`;
            claimLabel.style.fontSize = '12px';
            claimLabel.style.marginLeft = '10px';
            claimLabel.style.display = 'inline-block';
            claimLabel.style.color = isEpidemic ? '#ffffff' : '#F56565';
            claimLabel.style.backgroundColor = isEpidemic ? '#38B2AC' : '#FEE2E2';
            claimLabel.style.padding = '6px 10px';
            claimLabel.style.borderRadius = '6px';
            claimLabel.style.fontFamily = "'Roboto', sans-serif";

            const impactCell = row.querySelector('.impact-cell');
            const selectActionCell = row.querySelector('.action-cell');

            if (impactCell && selectActionCell) {
                const newCell = document.createElement('div');
                newCell.className = 'custom-claim-cell';
                newCell.style.display = 'table-cell';
                newCell.style.padding = '10px';
                newCell.style.textAlign = 'left';
                newCell.appendChild(claimLabel);

                row.insertBefore(newCell, selectActionCell);
            } else {
                row.appendChild(claimLabel);
            }
        });

        // Hiển thị thông báo ngắn gọn
        setTimeout(() => {
            alert(`Tổng: ${totalCount} | Epidemic: ${epidemicCount} | Non-Epidemic: ${nonEpidemicCount}`);
        }, 500);
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
