// ==UserScript==
// @name         Unsplash High Quality Image Downloader (Multi-threaded)
// @namespace    http://tampermonkey.net/
// @version      0.8
// @description  Add a modern button to download all high quality images from Unsplash with enhanced multi-threading and real-time progress
// @author       Matthew M.
// @match        *://unsplash.com/*
// @grant        GM_download
// ==/UserScript==

(function() {
    'use strict';

    // Cấu hình
    const MAX_CONCURRENT_DOWNLOADS = 12; // Tăng lên 12 để tải nhanh hơn
    const MAX_RETRIES = 2;
    const BATCH_SIZE = 24; // Tăng lên 24 để xử lý nhiều ảnh hơn mỗi lần

    class DownloadManager {
        constructor() {
            this.queue = new Set();
            this.activeDownloads = new Set();
            this.completed = 0;
            this.failed = 0;
            this.total = 0;
            this.downloadButton = this.createButton();
        }

        createButton() {
            const button = document.createElement('button');
            Object.assign(button.style, {
                position: 'fixed',
                bottom: '30px',
                right: '30px',
                zIndex: '9999',
                padding: '12px 24px',
                backgroundColor: '#ffffff',
                color: '#000000',
                border: '1px solid #e0e0e0',
                borderRadius: '50px',
                cursor: 'pointer',
                fontSize: '16px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.2s ease-in-out'
            });

            button.textContent = 'Download All';
            this.addHoverEffects(button);
            document.body.appendChild(button);
            this.bindEvents(button);
            return button;
        }

        addHoverEffects(button) {
            button.onmouseover = () => Object.assign(button.style, {
                boxShadow: '0 6px 12px rgba(0, 0, 0, 0.15)',
                transform: 'translateY(-2px)'
            });
            button.onmouseout = () => Object.assign(button.style, {
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                transform: 'translateY(0)'
            });
        }

        getHighQualityUrl(url) {
            if (url?.startsWith('https://images.unsplash.com/photo-')) {
                return url.split('?')[0];
            }
            return null;
        }

        downloadImage(url, retryCount = 0) {
            const cleanUrl = this.getHighQualityUrl(url);
            if (!cleanUrl) {
                this.failed++;
                this.updateButtonText();
                return Promise.resolve(false);
            }

            const downloadId = Symbol();
            this.activeDownloads.add(downloadId);
            this.updateButtonText();

            const filename = cleanUrl.split('/').pop() + '.jpg';
            return new Promise((resolve) => {
                GM_download({
                    url: cleanUrl,
                    name: filename,
                    saveAs: false,
                    onload: () => {
                        this.completed++;
                        this.activeDownloads.delete(downloadId);
                        this.updateButtonText();
                        resolve(true);
                    },
                    onerror: async () => {
                        if (retryCount < MAX_RETRIES) {
                            this.activeDownloads.delete(downloadId);
                            await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
                            resolve(await this.downloadImage(url, retryCount + 1));
                        } else {
                            this.failed++;
                            this.activeDownloads.delete(downloadId);
                            this.updateButtonText();
                            resolve(false);
                        }
                    }
                });
            });
        }

        async processDownloads() {
            const queueArray = Array.from(this.queue);
            const remaining = [...queueArray];

            while (remaining.length > 0 || this.activeDownloads.size > 0) {
                while (this.activeDownloads.size < MAX_CONCURRENT_DOWNLOADS && remaining.length > 0) {
                    const batchSize = Math.min(
                        BATCH_SIZE,
                        MAX_CONCURRENT_DOWNLOADS - this.activeDownloads.size,
                        remaining.length
                    );
                    const batch = remaining.splice(0, batchSize);
                    Promise.allSettled(batch.map(url => this.downloadImage(url)));
                }
                await new Promise(resolve => setTimeout(resolve, 5)); // Giảm delay xuống 5ms để tăng tốc
            }
        }

        updateButtonText() {
            if (this.total === 0) return;
            if (this.completed + this.failed < this.total) {
                this.downloadButton.textContent = `Downloading ${this.completed}/${this.total} (Active: ${this.activeDownloads.size})`;
            } else {
                this.downloadButton.textContent = `Completed ${this.completed}/${this.total} (${this.failed} failed)`;
            }
        }

        bindEvents(button) {
            button.addEventListener('click', async () => {
                this.queue = new Set(
                    Array.from(document.getElementsByTagName('img'))
                        .map(img => img.src)
                        .filter(src => this.getHighQualityUrl(src))
                );

                if (this.queue.size === 0) return;

                this.total = this.queue.size;
                button.disabled = true;
                this.updateButtonText();

                await this.processDownloads();

                button.disabled = false;
                setTimeout(() => {
                    button.textContent = 'Download All';
                    this.completed = 0;
                    this.failed = 0;
                    this.total = 0;
                }, 2000);
            });
        }
    }

    new DownloadManager();
})();