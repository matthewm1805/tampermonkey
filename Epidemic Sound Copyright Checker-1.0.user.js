// ==UserScript==
// @name         Epidemic Sound Copyright Checker
// @author       Matthew M.
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Epidemic Copyright Checker
// @match        https://studio.youtube.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function addCopyrightColumnHeader() {
        const headerRow = document.querySelector("ytcr-video-content-list-header");
        if (!headerRow || headerRow.querySelector(".custom-copyright-header")) return;

        const headerCell = document.createElement("div");
        headerCell.className = "custom-copyright-header";
        headerCell.style.width = "200px";
        headerCell.style.textAlign = "center";
        headerCell.style.fontWeight = "bold";
        headerCell.style.color = "#fff";
        headerCell.innerText = "Copyright Info";
        headerRow.appendChild(headerCell);
    }

    async function fetchCopyrightInfo() {
        addCopyrightColumnHeader();

        const rows = Array.from(document.querySelectorAll("ytcr-video-content-list-row"));
        if (!rows.length) return;

        for (const row of rows) {
            if (row.hasAttribute("data-processed")) continue;

            const titleElement = row.querySelector("div.title-text");
            const detailsButton = row.querySelector("button[aria-label*='See details']");
            if (!titleElement || !detailsButton) continue;

            await closeAndRemovePopup();
            await new Promise(r => setTimeout(r, 200));

            detailsButton.click();
            await new Promise(r => setTimeout(r, 500));

            const popup = await waitForNewPopup();
            if (!popup) continue;

            const claimants = extractClaimantsFromPopup(popup);

            let copyrightCell = row.querySelector(".custom-copyright-cell");
            if (!copyrightCell) {
                copyrightCell = document.createElement("div");
                copyrightCell.className = "custom-copyright-cell";
                copyrightCell.style.width = "200px";
                copyrightCell.style.textAlign = "left";
                copyrightCell.style.display = "flex";
                copyrightCell.style.alignItems = "center";
                copyrightCell.style.height = "100%";
                copyrightCell.style.color = "#888";
                copyrightCell.style.fontSize = "14px";
                copyrightCell.style.paddingLeft = "8px";
                row.appendChild(copyrightCell);
            }
            copyrightCell.innerText = claimants;

            if (!claimants.toLowerCase().includes("epidemic")) {
                copyrightCell.style.backgroundColor = "#ff0000";
                copyrightCell.style.color = "#fff";
                copyrightCell.style.borderRadius = "18px";
                copyrightCell.style.padding = "8px 16px";
                copyrightCell.style.height = "36px";
                copyrightCell.style.display = "flex";
                copyrightCell.style.alignItems = "center";
                copyrightCell.style.justifyContent = "center";
                copyrightCell.style.textAlign = "center";
                copyrightCell.style.fontWeight = "500";

                const textLength = claimants.length;
                let fontSize;
                if (textLength <= 20) fontSize = 14;
                else if (textLength <= 30) fontSize = 12;
                else fontSize = 10;
                copyrightCell.style.fontSize = `${fontSize}px`;
            }

            row.setAttribute("data-processed", "true");
            await closeAndRemovePopup();
        }

        await autoClickSeeDetailsToRemoveDim();
        enforceNoDim();
    }

    async function autoClickSeeDetailsToRemoveDim() {
        const detailsButton = document.querySelector("button[aria-label*='See details']");
        if (detailsButton) {
            detailsButton.click();
            await new Promise(r => setTimeout(r, 500));
            await closeAndRemovePopup();
        }
    }

    async function waitForNewPopup() {
        const maxAttempts = 5;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const popup = document.querySelector("ytcp-dialog");
            if (popup) return popup;
            await new Promise(r => setTimeout(r, 200)); //
        }
        return null;
    }

    function extractClaimantsFromPopup(popup) {
        const claimantsText = "Không tìm thấy thông tin bản quyền.";
        const dtElements = popup.querySelectorAll("dt.style-scope.ytcr-video-content-details-dialog");
        for (const dt of dtElements) {
            if (dt.innerText.trim() === "Claimants") {
                const claimants = [];
                let next = dt.nextElementSibling;
                while (next && next.tagName === "DD") {
                    claimants.push(next.innerText.trim());
                    next = next.nextElementSibling;
                }
                return claimants.join(" - ") || claimantsText;
            }
        }
        return claimantsText;
    }

    async function closeAndRemovePopup() {
        const closeButton = document.querySelector("ytcp-dialog yt-icon-button[aria-label='Close']");
        if (closeButton) closeButton.click();

        await new Promise(r => setTimeout(r, 500));

        let popup = document.querySelector("ytcp-dialog");
        while (popup && popup.parentNode) {
            popup.parentNode.removeChild(popup);
            popup = document.querySelector("ytcp-dialog");
        }

        const overlays = document.querySelectorAll("tp-yt-iron-overlay-backdrop, .backdrop, .overlay");
        overlays.forEach(overlay => {
            overlay.removeAttribute("opened");
            overlay.classList.remove("opened");
            overlay.style.opacity = "0";
            overlay.style.display = "none";
            overlay.style.zIndex = "-1";
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        });

        document.body.style.opacity = "1";
        document.body.style.filter = "none";
        document.body.style.backgroundColor = "";
    }

    function enforceNoDim() {
        const style = document.createElement("style");
        style.innerHTML = `
            body, html, ytcp-app, tp-yt-iron-overlay-backdrop {
                opacity: 1 !important;
                filter: none !important;
                background-color: transparent !important;
                display: block !important;
            }
            tp-yt-iron-overlay-backdrop.opened {
                display: none !important;
            }
        `;
        document.head.appendChild(style);

        const overlays = document.querySelectorAll("tp-yt-iron-overlay-backdrop, .backdrop, .overlay");
        overlays.forEach(overlay => overlay.remove());

        const observer = new MutationObserver(() => {
            const newOverlays = document.querySelectorAll("tp-yt-iron-overlay-backdrop, .backdrop, .overlay");
            newOverlays.forEach(overlay => {
                overlay.style.display = "none";
                overlay.remove();
            });
            document.body.style.opacity = "1";
        });
        observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    }

    function addButton() {
        const header = document.querySelector("ytcp-header .right-section");
        if (!header) return;

        const button = document.createElement("button");
        button.innerText = "Fetch Copyright Info";
        button.style.padding = "8px 12px";
        button.style.marginLeft = "10px";
        button.style.cursor = "pointer";
        button.style.backgroundColor = "#ff0000";
        button.style.color = "white";
        button.style.border = "none";
        button.style.borderRadius = "5px";
        button.style.position = "relative";
        button.style.zIndex = "9999";
        button.onclick = fetchCopyrightInfo;

        header.appendChild(button);
    }

    window.addEventListener("load", () => {
        addButton();
        enforceNoDim();
    });
})();