// ==UserScript==
// @name         Smart Auto Scroll & Click-to-Export Data
// @namespace    http://tampermonkey.net/
// @version      2.8
// @description  Auto page down with improved stop detection + Click on an element to export refined data
// @author       Mattthew M.
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let isScrolling = false;
    let loadingCheckInterval;
    let lastHeight = 0;
    let stoppedManually = false;
    let selecting = false;
    let reachedEndCounter = 0;

    let scrollButton = document.createElement("button");
    scrollButton.innerText = "Auto Page Down";
    styleButton(scrollButton, "60px");
    document.body.appendChild(scrollButton);

    let dataButton = document.createElement("button");
    dataButton.innerText = "Get Data";
    styleButton(dataButton, "20px");
    document.body.appendChild(dataButton);

    dataButton.addEventListener('click', () => {
        selecting = true;
        document.body.style.cursor = 'crosshair';
    });

    document.addEventListener('click', (event) => {
        if (!selecting) return;
        event.preventDefault();
        event.stopPropagation();
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
        if (element.id) return `#${element.id}`;
        if (element.className) return '.' + element.className.split(' ').filter(Boolean).join('.');
        return element.tagName.toLowerCase();
    }

    function isPageLoading() {
        return document.readyState !== 'complete' || document.querySelector("[aria-busy='true'], .loading, .spinner, .loader");
    }

    function hasReachedPageEnd() {
        let currentHeight = document.documentElement.scrollHeight;
        let scrolledHeight = window.scrollY + window.innerHeight;

        if (currentHeight === lastHeight && scrolledHeight >= currentHeight - 2) {
            reachedEndCounter++;
        } else {
            reachedEndCounter = 0;
        }
        lastHeight = currentHeight;
        return reachedEndCounter > 10;
    }

    function autoPageDown() {
        if (isScrolling) return;

        isScrolling = true;
        stoppedManually = false;
        scrollButton.innerText = "Stop";
        scrollButton.style.background = "#FF0000";
        scrollButton.style.opacity = "1";

        lastHeight = document.documentElement.scrollHeight;

        function scrollStep() {
            if (!isScrolling) return;

            if (!isPageLoading()) {
                window.scrollBy(0, window.innerHeight * 0.9);
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', keyCode: 34, bubbles: true }));
            }
        }

        function startScrolling() {
            clearInterval(loadingCheckInterval);
            loadingCheckInterval = setInterval(() => {
                if (!isPageLoading()) {
                    scrollStep();
                }
                if (hasReachedPageEnd()) {
                    stopScrolling();
                    console.log("Reached the end of the page.");
                }
            }, 200);
        }

        startScrolling();
    }

    function resetScrollButton() {
        scrollButton.innerText = "Auto Page Down";
        scrollButton.style.background = "#008000";
        scrollButton.style.opacity = "0.5";
    }

    scrollButton.addEventListener("click", () => {
        if (!isScrolling) {
            autoPageDown();
        } else {
            stopScrolling();
        }
    });

    function stopScrolling() {
        clearInterval(loadingCheckInterval);
        isScrolling = false;
        stoppedManually = true;
        resetScrollButton();
        console.log("Scrolling stopped.");
    }

    let currentUrl = location.href;

    const urlObserver = new MutationObserver(() => {
        if (location.href !== currentUrl) {
            console.log("URL changed, stopping script...");
            stopScrolling();
            currentUrl = location.href;
        }
    });

    urlObserver.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("beforeunload", stopScrolling);

    function styleButton(button, bottomValue) {
        button.style.position = "fixed";
        button.style.bottom = bottomValue;
        button.style.right = "20px";
        button.style.background = "#008000";
        button.style.border = "none";
        button.style.color = "white";
        button.style.padding = "6px 10px";
        button.style.fontSize = "12px";
        button.style.borderRadius = "15px";
        button.style.cursor = "pointer";
        button.style.boxShadow = "0px 2px 5px rgba(0, 0, 0, 0.2)";
        button.style.opacity = "0.5";
        button.style.zIndex = "9999";
        button.style.transition = "all 0.3s ease";

        button.addEventListener("mouseenter", () => {
            button.style.transform = "scale(1.05)";
            button.style.boxShadow = "0px 4px 10px rgba(0, 0, 0, 0.3)";
            button.style.opacity = "1";
        });

        button.addEventListener("mouseleave", () => {
            if (!isScrolling) {
                button.style.opacity = "0.5";
            }
            button.style.transform = "scale(1)";
            button.style.boxShadow = "0px 2px 5px rgba(0, 0, 0, 0.2)";
        });
    }
})();