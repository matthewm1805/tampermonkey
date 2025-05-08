// ==UserScript==
// @name         Lummi.ai Enhancer
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  Hides Pro/Preview elements, adds direct download (keeps API params, prioritizes BG removed) with progress cue.
// @author       Matthew M.
// @match        https://www.lummi.ai/*
// @grant        GM_addStyle
// @grant        GM_download
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const logPrefix = '[LummiEnhancer]';
    let initialRunDone = false;

    // --- CSS Section ---
    const styles = `
        /* Hide Original Hover Buttons Immediately */
        div.relative.overflow-hidden.group\\/item > div.absolute.inset-0.pointer-events-none.z-20 button:not(.userscript-download-btn) {
           display: none !important;
           visibility: hidden !important;
           pointer-events: none !important;
        }

        /* Hide Pro Header Button */
         header button:has(span.text-yellow.font-semibold) {
             display: none !important;
         }

         /* Hide Modal Attempt */
         div.absolute.w-full.flex.items-center.justify-center[style*="height:calc(100vh - 116px)"][style*="margin-top:100vh"],
         div.absolute.w-full.flex.items-center.justify-center:has(div.text-h3:contains("Get full access to Lummi")) {
             display: none !important;
             visibility: hidden !important;
             opacity: 0 !important;
         }

         /* Hide "Previewing Pro" Banner Attempt */
         div.bg-background.backdrop-blur-xl.absolute[class*="top-"][style*="max-width: 360px"]:has(p:contains("You are previewing Lummi Pro")) {
             display: none !important;
             visibility: hidden !important;
             opacity: 0 !important;
         }

         /* Style for Added Download Button */
         .userscript-download-btn {
            position: absolute;
            bottom: 10px;
            right: 10px;
            z-index: 30;
            background-color: rgba(0, 0, 0, 0.7) !important;
            color: white !important;
            border: none !important;
            border-radius: 50% !important;
            width: 32px !important;
            height: 32px !important;
            min-width: 32px !important;
            padding: 0 !important;
            cursor: pointer;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            opacity: 0.7;
            transition: opacity 0.2s ease-in-out;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            visibility: visible !important;
            pointer-events: auto !important;
            overflow: hidden;
         }
         .userscript-download-btn:hover {
            opacity: 1;
            background-color: rgba(0, 0, 0, 0.9) !important;
         }
         .userscript-download-btn svg {
            width: 16px;
            height: 16px;
            fill: currentColor;
            transition: opacity 0.2s ease;
         }

        /* Spinner Animation Styles (Simulated Progress Cue) */
        .userscript-download-btn::after {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
            top: 0;
            left: 0;
            border: 3px solid transparent;
            border-top-color: white;
            border-radius: 50%;
            box-sizing: border-box;
            opacity: 0;
            transition: opacity 0.2s ease;
            animation: userscript-spin 0.8s linear infinite;
            pointer-events: none;
        }

        .userscript-download-btn.loading svg {
             opacity: 0.2;
        }

        .userscript-download-btn.loading::after {
            opacity: 1;
        }

        @keyframes userscript-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `;

    if (typeof GM_addStyle !== "undefined") {
        GM_addStyle(styles);
    } else {
        const styleEl = document.createElement('style');
        styleEl.textContent = styles;
        (document.head || document.documentElement).appendChild(styleEl);
    }
    // --- End CSS Section ---

    function processUndesiredElements() {
        // Upgrade Modal Div
        const modalCandidates = document.querySelectorAll(
             'div.absolute.w-full.flex.items-center.justify-center:has(div[class*="text-h3"]:first-child)'
        );
         modalCandidates.forEach(modal => {
             if (!modal.parentElement || modal.dataset.lummiProcessedModal) return;
             const titleElement = modal.querySelector('div.text-h3, div.sm\\:text-h2');
             const styleAttribute = modal.getAttribute('style');
             if ((titleElement && titleElement.textContent.includes('Get full access to Lummi')) ||
                 (styleAttribute && styleAttribute.includes('calc(100vh - 116px)')))
             {
                 try { modal.remove(); console.log(logPrefix, 'Removed upgrade modal:', modal); }
                 catch (e) { console.error(logPrefix, 'Error removing modal:', e); }
                 modal.dataset.lummiProcessedModal = 'true';
             }
         });

         // "Previewing Lummi Pro" Banner
         const previewBanners = document.querySelectorAll(
             'div.absolute[class*="backdrop-blur"]:has(p.font-medium)'
         );
         previewBanners.forEach(banner => {
             if (!banner.parentElement || banner.dataset.lummiProcessedBanner) return;
             const pElement = banner.querySelector('p.font-medium');
             if (pElement && pElement.textContent.includes('You are previewing Lummi Pro') && banner.style.maxWidth === '360px') {
                 try { banner.remove(); console.log(logPrefix, 'Removed "Previewing Pro" banner:', banner); }
                 catch (e) { console.error(logPrefix, 'Error removing preview banner:', e); }
                 banner.dataset.lummiProcessedBanner = 'true';
             }
         });
    }

    function processImageItems() {
        const imageContainers = document.querySelectorAll('div.relative.overflow-hidden.group\\/item');

        imageContainers.forEach(container => {
            // Remove Original Lummi Hover Buttons
            const hoverOverlay = container.querySelector('div.absolute.inset-0.pointer-events-none.z-20');
            if (hoverOverlay && !hoverOverlay.dataset.lummiProcessedOverlay) {
                 const originalButtons = hoverOverlay.querySelectorAll('button:not(.userscript-download-btn)');
                 originalButtons.forEach(btn => btn.remove());
                 hoverOverlay.dataset.lummiProcessedOverlay = 'true';
            }

            // Add Custom Download Button
            if (container.querySelector('.userscript-download-btn')) {
                return;
            }

            const imageWrapper = container.querySelector('div.h-min.w-auto.relative.z-10');
            if (!imageWrapper) return;

            const linkElement = imageWrapper.querySelector('a[href^="/photo/"], a[href^="/illustration/"], a[href^="/3d/"]');
            if (!linkElement) return;

            let rawImageUrl = null;
            let imageUrlSource = null;
            let isBgRemovedVersion = false;
            let isApiProUrl = false;

            // --- URL Prioritization Logic ---
            // 1. Check SVG image with bg-remove=true
            const bgRemoveSvgImageElement = imageWrapper.querySelector('svg > image[href*="bg-remove=true"]');
            if (bgRemoveSvgImageElement) {
                rawImageUrl = bgRemoveSvgImageElement.getAttribute('href');
                isBgRemovedVersion = true;
                imageUrlSource = 'SVG (bg-remove)';
            }

            // 2. Check IMG with /api/pro/image/
            if (!rawImageUrl) {
                const proApiImgElement = imageWrapper.querySelector('img[src^="https://www.lummi.ai/api/pro/image/"]');
                if (proApiImgElement) {
                     rawImageUrl = proApiImgElement.getAttribute('src');
                     imageUrlSource = 'IMG (API)';
                     isApiProUrl = true; // Mark as API URL
                }
            }

            // 3. Check any SVG image (assets)
            if (!rawImageUrl) {
                const anySvgImageElement = imageWrapper.querySelector('svg > image[href^="https://assets.lummi.ai/assets/"]');
                if (anySvgImageElement) {
                    rawImageUrl = anySvgImageElement.getAttribute('href');
                    imageUrlSource = 'SVG (assets)';
                }
            }

            // 4. Check any standard IMG tag (assets)
            if (!rawImageUrl) {
                const imgElement = imageWrapper.querySelector('img[src^="https://assets.lummi.ai/assets/"]');
                if (imgElement) {
                    rawImageUrl = imgElement.getAttribute('src');
                    imageUrlSource = 'IMG (assets)';
                }
            }
            // --- End URL Prioritization Logic ---


            if (rawImageUrl) {
                 // Process the found URL based on its type
                 let downloadUrl;
                 const baseUrl = rawImageUrl.split('?')[0];

                 if (isApiProUrl) {
                     // ** Keep the full API URL **
                     downloadUrl = rawImageUrl;
                     console.log(logPrefix, `Using full API URL: ${downloadUrl}`);
                     imageUrlSource = 'API (full)'; // Update source description
                 } else if (isBgRemovedVersion) {
                     // Keep the bg-remove parameter if found in SVG
                     downloadUrl = baseUrl + '?bg-remove=true';
                     console.log(logPrefix, "Using BG-Removed URL:", downloadUrl);
                     imageUrlSource = 'Assets (bg-remove)'; // Update source description
                 } else {
                     // Otherwise, use the base URL (strip query params) for assets links
                     downloadUrl = baseUrl;
                     // console.log(logPrefix, "Using base assets URL:", downloadUrl);
                     imageUrlSource = 'Assets (original)'; // Update source description
                 }

                 const photoPageUrl = linkElement.getAttribute('href');
                 let filename = 'lummi-image.jpg';
                 try {
                     const urlParts = photoPageUrl.split('/');
                     const slugWithQuery = urlParts[urlParts.length - 1];
                     const slug = slugWithQuery.split('?')[0];
                     if (slug) {
                          const sanitizedSlug = slug.replace(/[^a-zA-Z0-9_-]/g, '_');
                          // Determine extension: default png for bg-removed, else jpg
                          const defaultExt = isBgRemovedVersion ? 'png' : 'jpg';
                          // For API URLs, we can't easily determine extension from URL, stick to default
                          const extension = isApiProUrl ? defaultExt : (baseUrl.match(/\.(jpe?g|png|webp|gif)/i)?.[1]?.toLowerCase() ?? defaultExt);
                          filename = `${sanitizedSlug}${isBgRemovedVersion ? '_bg_removed' : ''}.${extension}`;
                     }
                 } catch (e) {
                     console.error(logPrefix, "Error parsing filename from link", photoPageUrl, e);
                 }

                 const downloadBtn = document.createElement('button');
                 downloadBtn.className = 'userscript-download-btn';
                 downloadBtn.title = `Download ${filename} (Source: ${imageUrlSource})`;
                 downloadBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z"></path></svg>`;

                 downloadBtn.addEventListener('click', (event) => {
                     event.preventDefault();
                     event.stopPropagation();
                     downloadBtn.classList.add('loading');
                     downloadBtn.disabled = true;
                     console.log(logPrefix, `Downloading (${imageUrlSource}): ${downloadUrl} as ${filename}`);
                     const downloadOptions = { url: downloadUrl, name: filename, onerror: (err) => { console.error(logPrefix,'GM_download error:', err); downloadBtn.classList.remove('loading'); downloadBtn.disabled = false; }, ontimeout: () => { console.error(logPrefix,'GM_download timeout'); downloadBtn.classList.remove('loading'); downloadBtn.disabled = false; }, };
                     if (typeof GM_download !== "undefined") {
                         try { GM_download(downloadOptions); }
                         catch (e) { console.error(logPrefix, "Error calling GM_download:", e); downloadFallback(downloadUrl, filename); }
                     } else { downloadFallback(downloadUrl, filename); }
                     setTimeout(() => { downloadBtn.classList.remove('loading'); downloadBtn.disabled = false; }, 1500);
                 });

                 imageWrapper.appendChild(downloadBtn);
                 container.dataset.downloadBtnAdded = 'true';

            } else {
                 // console.warn(logPrefix, "Could not find any image URL in container:", container);
            }
        });
    }

    function downloadFallback(url, filename) {
         console.log(logPrefix, `Using fallback download method for: ${filename}`);
         const link = document.createElement('a');
         link.href = url;
         link.download = filename;
         link.style.display = 'none';
         document.body.appendChild(link);
         try { link.click(); }
         catch(e) { console.error(logPrefix, "Fallback click failed:", e); window.open(url, '_blank'); }
         setTimeout(() => { if (link.parentElement) { document.body.removeChild(link); } }, 100);
    }

    // --- Combined Execution Logic ---
    function runEnhancements(isCalledFromObserver = false) {
        const callSource = isCalledFromObserver ? "Observer" : (initialRunDone ? "Scheduled" : "Initial");
        processUndesiredElements();
        processImageItems();
        if (!initialRunDone && !isCalledFromObserver) initialRunDone = true;
    }

    // --- Initial Run ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => runEnhancements(false));
    } else {
        setTimeout(() => runEnhancements(false), 50);
        setTimeout(() => runEnhancements(false), 500); // Re-run shortly after initial load
    }

    // --- Mutation Observer ---
    const observer = new MutationObserver((mutationsList) => {
        let relevantChange = false;
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                     if (node.nodeType === Node.ELEMENT_NODE) {
                           const addedNodeSelector = 'div.relative.overflow-hidden.group\\/item, div.absolute.w-full.flex.items-center.justify-center, div.absolute[class*="backdrop-blur"]';
                           if ( (node.matches && node.matches(addedNodeSelector)) || (node.querySelector && node.querySelector(addedNodeSelector)) ) { relevantChange = true; break; }
                     }
                }
            }
            if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class' || mutation.attributeName === 'src' || mutation.attributeName === 'href')) {
                 const target = mutation.target;
                 const targetSelector = 'div.absolute.w-full.flex.items-center.justify-center, div.absolute[class*="backdrop-blur"]';
                 if (target && target.matches && (target.matches(targetSelector) || target.closest(targetSelector) || target.closest('div.relative.overflow-hidden.group\\/item'))) {
                      relevantChange = true;
                 }
            }
            if (relevantChange) break;
        }
        if (relevantChange) {
            setTimeout(() => runEnhancements(true), 250);
        }
    });

    observer.observe(document.documentElement || document.body, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'src', 'href']
    });

    console.log(logPrefix, 'Script active, enhancements enabled.');

})();