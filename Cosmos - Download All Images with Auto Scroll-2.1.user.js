// ==UserScript==
// @name         Cosmos | Download All Images with Auto Scroll
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Download all images on the page with optimized scrolling. Skips images under 50KB. Ensures no images are missed before exiting.
// @author       Matthew M.
// @match        *://*.cosmos.so/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let imageCounter = 1;
    let downloaded = new Set();

    function getBestImageSource(img) {
        return img.src || img.getAttribute('data-src') || img.getAttribute('srcset')?.split(' ')[0] || '';
    }

    async function downloadImage(url) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();

            if (blob.size < 50000) {
                console.log(`Skipping image, size is below 50KB.`);
                return;
            }

            const filename = `image_${imageCounter}.jpg`;
            imageCounter++;

            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        } catch (error) {
            console.error(`Error downloading image:`, error);
        }
    }

    async function scanAndDownloadImages() {
        const images = document.querySelectorAll('img');
        let newImages = [];

        images.forEach((img) => {
            let url = getBestImageSource(img);
            if (url && !downloaded.has(url)) {
                downloaded.add(url);
                newImages.push(url);
            }
        });

        for (let i = 0; i < newImages.length; i++) {
            await downloadImage(newImages[i]);
        }

        return newImages.length > 0;
    }

    async function downloadAllImages() {
        imageCounter = 1;
        let lastHeight = 0;
        let retryCount = 0;

        while (retryCount < 3) {
            let foundNewImages = await scanAndDownloadImages();

            if (foundNewImages) {
                retryCount = 0;
            } else {
                retryCount++;
            }

            window.scrollBy(0, window.innerHeight);
            await new Promise(resolve => setTimeout(resolve, 1500));

            let newHeight = document.body.scrollHeight;
            if (newHeight === lastHeight) {
                retryCount++;
            }
            lastHeight = newHeight;
        }

        console.log("Final scan for missed images...");
        let finalCheck = await scanAndDownloadImages();

        if (!finalCheck) {
            console.log("All images downloaded. Exiting script.");
        }
    }

    function createDownloadButton() {
        const button = document.createElement('button');
        button.innerText = 'Download All';
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

        button.onmouseover = () => {
            button.style.transform = 'scale(1.05)';
        };

        button.onmouseleave = () => {
            button.style.transform = 'scale(1)';
        };

        let isDragging = false;
        let offsetX, offsetY;

        button.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - button.getBoundingClientRect().left;
            offsetY = e.clientY - button.getBoundingClientRect().top;
            button.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                button.style.left = `${e.clientX - offsetX}px`;
                button.style.top = `${e.clientY - offsetY}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            button.style.cursor = 'grab';
        });

        button.onclick = downloadAllImages;
        document.body.appendChild(button);
    }

    createDownloadButton();
})();