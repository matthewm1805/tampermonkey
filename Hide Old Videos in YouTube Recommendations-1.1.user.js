// ==UserScript==
// @name         Hide Old Videos in YouTube Recommendations
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Hide videos older than a specified number of days in YouTube's recommendations sidebar.
// @author       Matthew M.
// @match        *://www.youtube.com/watch*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const MAX_DAYS = 30; // Chỉnh số ngày tối đa ở đây

    function hideOldVideos() {
        let recommendationItems = document.querySelectorAll("ytd-compact-video-renderer");

        recommendationItems.forEach(item => {
            let metadata = item.querySelector("#metadata-line");
            if (metadata) {
                let timeText = metadata.innerText.match(/(\d+) (day|days|week|weeks|month|months|year|years) ago/);
                if (timeText) {
                    let value = parseInt(timeText[1]);
                    let unit = timeText[2];
                    let daysAgo = 0;

                    if (unit.includes("day")) daysAgo = value;
                    else if (unit.includes("week")) daysAgo = value * 7;
                    else if (unit.includes("month")) daysAgo = value * 30;
                    else if (unit.includes("year")) daysAgo = value * 365;

                    if (daysAgo >= MAX_DAYS) {
                        item.style.display = "none";
                    }
                }
            }
        });
    }

    // Fetch
    let observer = new MutationObserver(hideOldVideos);
    observer.observe(document.body, { childList: true, subtree: true });
    hideOldVideos();
})();
