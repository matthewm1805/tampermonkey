// ==UserScript==
// @name         Cosmos | Download All Images with Auto Scroll
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Download all images on the page with optimized scrolling. Shows running status and image count.
// @author       Matthew M.
// @match        *://*.cosmos.so/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let imageCounter = 0;
    let downloadedCount = 0;
    let downloaded = new Set();
    let button;
    let isRunning = false;

    function getBestImageSource(img) {
        let src = img.src || img.getAttribute('data-src') || img.getAttribute('srcset')?.split(' ')[0] || '';
        
        if (src.includes('cdn.cosmos.so')) {
            src = src.replace(/\?format=webp&w=\d+/, '?format=jpg');
        }
        return src;
    }

    async function downloadImage(url) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();

            if (blob.size < 50000) {
                console.log(`Skipping image ${url}, size is below 50KB`);
                return false;
            }

            imageCounter++;
            downloadedCount++;
            const filename = `image_${imageCounter}.jpg`;

            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            
            updateButtonText();
            return true;
        } catch (error) {
            console.error(`Error downloading image ${url}:`, error);
            return false;
        }
    }

    async function scanAndDownloadImages() {
        const images = document.querySelectorAll('img');
        let newImages = new Set();
        
        images.forEach((img) => {
            if (img.complete && img.naturalHeight > 0) {
                let url = getBestImageSource(img);
                if (url && !downloaded.has(url)) {
                    downloaded.add(url);
                    newImages.add(url);
                }
            }
        });

        let successfulDownloads = 0;
        for (let url of newImages) {
            if (await downloadImage(url)) {
                successfulDownloads++;
            }
        }

        return successfulDownloads;
    }

    async function downloadAllImages() {
        if (isRunning) return; // Prevent multiple runs
        
        isRunning = true;
        imageCounter = 0;
        downloadedCount = 0;
        downloaded.clear();
        
        updateButtonText(); // Show "Running..."

        let lastHeight = 0;
        let retryCount = 0;
        let maxRetries = 5;

        while (retryCount < maxRetries && isRunning) {
            let successfulDownloads = await scanAndDownloadImages();

            if (successfulDownloads > 0) {
                retryCount = 0;
            } else {
                retryCount++;
            }

            window.scrollBy(0, window.innerHeight * 2);
            await new Promise(resolve => setTimeout(resolve, 2000));

            let newHeight = document.body.scrollHeight;
            if (newHeight === lastHeight) {
                retryCount++;
            }
            lastHeight = newHeight;
        }

        // Final scan
        console.log("Performing final scan for missed images...");
        await scanAndDownloadImages();

        console.log(`Download complete. Total: ${imageCounter}, Successfully downloaded: ${downloadedCount}`);
        isRunning = false;
        updateButtonText(); // Show final counts
    }

    function updateButtonText() {
        if (isRunning) {
            button.innerText = "Running...";
            button.style.background = '#ffeb3b'; // Yellow background while running
            button.style.color = 'black';
        } else {
            button.innerText = `Download All\nFound: ${imageCounter} | Downloaded: ${downloadedCount}`;
            button.style.background = 'white'; // Back to white when done
            button.style.color = 'black';
        }
    }

    function createDownloadButton() {
        button = document.createElement('button');
        button.innerText = 'Download All\nFound: 0 | Downloaded: 0';
        button.style.position = 'fixed';
        button.style.bottom = '20px';
        button.style.right = '20px';
        button.style.padding = '10px 16px';
        button.style.background = 'white';
        button.style.color = 'black';
        button.style.border = 'none';
        button.style.borderRadius = '25px';
        button.style.fontSize = '14px';
        button.style.fontWeight = 'bold';
        button.style.cursor = 'grab';
        button.style.zIndex = '10000';
        button.style.boxShadow = '0px 4px 10px rgba(0, 0, 0, 0.2)';
        button.style.transition = 'all 0.2s ease';
        button.style.whiteSpace = 'pre-line';
        button.style.textAlign = 'center';

        button.onmouseover = () => {
            if (!isRunning) {
                button.style.transform = 'scale(1.05)';
            }
        };

        button.onmouseleave = () => {
            button.style.transform = 'scale(1)';
        };

        let isDragging = false;
        let offsetX, offsetY;

        button.addEventListener('mousedown', (e) => {
            if (!isRunning) {
                isDragging = true;
                offsetX = e.clientX - button.getBoundingClientRect().left;
                offsetY = e.clientY - button.getBoundingClientRect().top;
                button.style.cursor = 'grabbing';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging && !isRunning) {
                button.style.left = `${e.clientX - offsetX}px`;
                button.style.top = `${e.clientY - offsetY}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            if (!isRunning) {
                button.style.cursor = 'grab';
            }
        });

        button.onclick = downloadAllImages;
        document.body.appendChild(button);
    }

    createDownloadButton();
})();
