// ==UserScript==
// @name         Pixabay Download All
// @namespace    http://tampermonkey.net/
// @version      0.11
// @description  Download all images from Pixabay with smart scrolling, fixed pagination, reliable stop, and updated modern UI
// @author       Matthew M.
// @match        *://pixabay.com/*
// @match        *://*.pixabay.com/*
// @grant        GM_download
// ==/UserScript==

(function() {
    'use strict';

    const MAX_THREADS = 10;
    const SCROLL_STEP = 1000;
    const SCROLL_DELAY = 1000;
    const IMAGE_LOAD_TIMEOUT = 5000;

    const downloadButton = document.createElement('button');
    downloadButton.style.position = 'fixed';
    downloadButton.style.bottom = '20px';
    downloadButton.style.right = '20px';
    downloadButton.style.zIndex = '9999';
    downloadButton.style.padding = '12px 24px';
    downloadButton.style.backgroundColor = '#ffffff';
    downloadButton.style.color = '#333333';
    downloadButton.style.border = 'none';
    downloadButton.style.borderRadius = '25px';
    downloadButton.style.fontFamily = 'Arial, sans-serif';
    downloadButton.style.fontSize = '16px';
    downloadButton.style.fontWeight = '600';
    downloadButton.style.cursor = 'pointer';
    downloadButton.style.boxShadow = '0 4px 6px rgba(255, 0, 0, 0.2)';
    downloadButton.style.transition = 'all 0.3s ease';
    document.body.appendChild(downloadButton);

    let state = JSON.parse(localStorage.getItem('pixabayDownloadState')) || {
        isDownloading: false,
        foundCount: 0,
        downloadedCount: 0,
        processedUrls: [],
        currentPage: 1,
        shouldStop: false
    };

    function updateStateAndButton() {
        localStorage.setItem('pixabayDownloadState', JSON.stringify(state));
        downloadButton.textContent = state.isDownloading
            ? `Đang chạy (Page ${state.currentPage}, ${state.foundCount} found, ${state.downloadedCount} downloaded) - Nhấn để dừng`
            : 'Download All';
    }

    function findImageUrls() {
        const imageElements = document.querySelectorAll('img[src*="cdn.pixabay.com"]');
        const newUrls = new Set();

        imageElements.forEach(img => {
            if (!img.complete) return;
            let url = img.src;
            if (url.includes('_640.') && !state.processedUrls.includes(url)) {
                url = url.replace('_640.', '_1280.');
                newUrls.add(url);
                state.processedUrls.push(url);
            }
        });
        return Array.from(newUrls);
    }

    function downloadImage(url) {
        return new Promise((resolve) => {
            if (state.shouldStop) {
                resolve();
                return;
            }
            const fileName = url.split('/').pop();
            GM_download({
                url: url,
                name: fileName,
                onload: () => {
                    state.downloadedCount++;
                    updateStateAndButton();
                    resolve();
                },
                onerror: () => {
                    console.log(`Error downloading ${url}`);
                    resolve();
                }
            });
        });
    }

    async function waitForImagesToLoad() {
        return new Promise((resolve) => {
            if (state.shouldStop) {
                resolve();
                return;
            }
            const images = document.querySelectorAll('img[src*="cdn.pixabay.com"]:not([data-loaded])');
            if (images.length === 0) {
                resolve();
                return;
            }

            let loadedCount = 0;
            const totalImages = images.length;
            const timeout = setTimeout(() => resolve(), IMAGE_LOAD_TIMEOUT);

            images.forEach(img => {
                if (img.complete) {
                    img.setAttribute('data-loaded', 'true');
                    loadedCount++;
                    if (loadedCount === totalImages) {
                        clearTimeout(timeout);
                        resolve();
                    }
                } else {
                    img.addEventListener('load', () => {
                        if (state.shouldStop) {
                            clearTimeout(timeout);
                            resolve();
                            return;
                        }
                        img.setAttribute('data-loaded', 'true');
                        loadedCount++;
                        if (loadedCount === totalImages) {
                            clearTimeout(timeout);
                            resolve();
                        }
                    }, { once: true });
                    img.addEventListener('error', () => {
                        loadedCount++;
                        if (loadedCount === totalImages) {
                            clearTimeout(timeout);
                            resolve();
                        }
                    }, { once: true });
                }
            });
        });
    }

    async function smartScroll() {
        if (state.shouldStop) return;

        let currentPosition = window.scrollY;
        let maxHeight = document.body.scrollHeight;

        while (currentPosition < maxHeight && !state.shouldStop) {
            currentPosition += SCROLL_STEP;
            window.scrollTo(0, currentPosition);

            await new Promise(resolve => setTimeout(resolve, SCROLL_DELAY));
            await waitForImagesToLoad();

            const newMaxHeight = document.body.scrollHeight;
            if (newMaxHeight > maxHeight) {
                maxHeight = newMaxHeight;
            } else if (currentPosition >= maxHeight) {
                break;
            }
        }
    }

    async function goToNextPage() {
        if (state.shouldStop) return false;

        const currentUrl = window.location.href;
        const pageMatch = currentUrl.match(/[\?&]pagi=(\d+)/);
        const currentPage = pageMatch ? parseInt(pageMatch[1]) : 1;

        const nextPageLinks = Array.from(document.querySelectorAll('a[href*="pagi="]'));
        const nextPageLink = nextPageLinks.find(link => {
            const hrefPageMatch = link.href.match(/[\?&]pagi=(\d+)/);
            if (!hrefPageMatch) return false;
            const hrefPage = parseInt(hrefPageMatch[1]);
            return hrefPage > currentPage && (!pageMatch || hrefPage === currentPage + 1);
        });

        if (nextPageLink) {
            state.currentPage = currentPage + 1;
            updateStateAndButton();
            window.location.href = nextPageLink.href;
            return true;
        }
        return false;
    }

    function waitForPageLoad() {
        return new Promise((resolve) => {
            if (state.shouldStop) {
                resolve();
                return;
            }
            const checkLoad = setInterval(() => {
                if (document.readyState === 'complete' || state.shouldStop) {
                    clearInterval(checkLoad);
                    resolve();
                }
            }, 500);
        });
    }

    async function downloadImagesWithThreads(imageUrls) {
        const chunks = [];
        for (let i = 0; i < imageUrls.length; i += MAX_THREADS) {
            chunks.push(imageUrls.slice(i, i + MAX_THREADS));
        }

        for (const chunk of chunks) {
            if (state.shouldStop) break;
            await Promise.all(chunk.map(url => downloadImage(url)));
            if (state.shouldStop) break;
        }
    }

    async function processAllContent() {
        if (state.isDownloading && !state.shouldStop) {
            await waitForPageLoad();
        } else if (!state.isDownloading) {
            state.isDownloading = true;
            state.shouldStop = false;
            state.foundCount = 0;
            state.downloadedCount = 0;
            state.processedUrls = [];
            state.currentPage = 1;
            updateStateAndButton();
        } else {
            return;
        }

        while (state.isDownloading && !state.shouldStop) {
            await smartScroll();
            await waitForPageLoad();

            const imageUrls = findImageUrls();
            if (imageUrls.length > 0) {
                state.foundCount += imageUrls.length;
                updateStateAndButton();
                await downloadImagesWithThreads(imageUrls);
            }

            const hasMorePages = await goToNextPage();
            if (!hasMorePages) {
                break;
            }
        }

        state.isDownloading = false;
        state.shouldStop = false;
        state.foundCount = 0;
        state.downloadedCount = 0;
        updateStateAndButton();
        localStorage.removeItem('pixabayDownloadState');
    }

    downloadButton.addEventListener('click', () => {
        if (state.isDownloading) {
            state.shouldStop = true;
            state.isDownloading = false;
            state.foundCount = 0;
            state.downloadedCount = 0;
            updateStateAndButton();
        } else {
            processAllContent();
        }
    });

    downloadButton.addEventListener('mouseover', () => {
        downloadButton.style.backgroundColor = '#f0f0f0';
        downloadButton.style.boxShadow = '0 6px 12px rgba(255, 0, 0, 0.3)';
        downloadButton.style.transform = 'translateY(-2px)';
    });
    downloadButton.addEventListener('mouseout', () => {
        downloadButton.style.backgroundColor = '#ffffff';
        downloadButton.style.boxShadow = '0 4px 6px rgba(255, 0, 0, 0.2)';
        downloadButton.style.transform = 'translateY(0)';
    });

    if (state.isDownloading && !state.shouldStop) {
        updateStateAndButton();
        processAllContent();
    } else {
        updateStateAndButton();
    }
})();