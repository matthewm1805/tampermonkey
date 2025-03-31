// ==UserScript==
// @name         Epidemic Sound Copyright Checker
// @author       Matthew M.
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Check copyright claims & highlight non-Epidemic entries in YouTube Studio
// @match        https://studio.youtube.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const concurrencyLimit = 1;

    // Hỗ trợ các URL dạng /video/<id>/copyright
    function isOnCopyrightPage() {
        return /\/video\/[^/]+\/copyright$/.test(window.location.pathname);
    }

    function showWrongPageAlert() {
        alert("⚠️ Bạn không đang ở trang chi tiết bản quyền (URL phải có dạng: /video/<id>/copyright)");
    }

    function addCopyrightColumnHeader() {
        const headerRow = document.querySelector("ytcr-video-content-list-header");
        if (!headerRow || headerRow.querySelector(".custom-copyright-header")) return;

        const headerCell = document.createElement("div");
        headerCell.className = "custom-copyright-header";
        Object.assign(headerCell.style, {
            width: "200px",
            textAlign: "center",
            fontWeight: "bold",
            color: "#fff"
        });
        headerCell.innerText = "Copyright Info";
        headerRow.appendChild(headerCell);
    }

    async function processRow(row) {
        if (row.hasAttribute("data-processed")) return;

        const titleElement = row.querySelector("div.title-text");
        const detailsButton = row.querySelector("button[aria-label*='See details']");
        if (!titleElement || !detailsButton) return;

        await closeAndRemovePopup();
        await new Promise(r => setTimeout(r, 200));
        detailsButton.click();
        await new Promise(r => setTimeout(r, 500));

        const popup = await waitForNewPopup();
        if (!popup) return;

        const claimants = extractClaimantsFromPopup(popup);

        let copyrightCell = row.querySelector(".custom-copyright-cell");
        if (!copyrightCell) {
            copyrightCell = document.createElement("div");
            copyrightCell.className = "custom-copyright-cell";
            Object.assign(copyrightCell.style, {
                width: "200px",
                display: "flex",
                alignItems: "center",
                height: "100%",
                paddingLeft: "8px"
            });
            row.appendChild(copyrightCell);
        }

        copyrightCell.innerText = claimants;

        if (!claimants.toLowerCase().includes("epidemic")) {
            Object.assign(copyrightCell.style, {
                backgroundColor: "#3c4043",
                color: "#fff",
                border: "none",
                borderRadius: "40px",
                padding: "6px 16px",
                height: "23px",
                fontWeight: "500",
                fontSize: "13px",
                cursor: "default",
                justifyContent: "center",
                marginLeft: "8px",
                whiteSpace: "nowrap",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)"
            });
        } else {
            Object.assign(copyrightCell.style, {
                color: "#aaa",
                fontSize: "12px"
            });
        }

        row.setAttribute("data-processed", "true");
        await closeAndRemovePopup();
    }

    async function processAllRowsInParallel(rows) {
        const queue = [...rows];
        const active = [];

        while (queue.length > 0 || active.length > 0) {
            while (active.length < concurrencyLimit && queue.length > 0) {
                const row = queue.shift();
                const p = processRow(row).finally(() => {
                    const i = active.indexOf(p);
                    if (i > -1) active.splice(i, 1);
                });
                active.push(p);
            }
            await Promise.race(active);
        }
    }

    async function fetchCopyrightInfo() {
        if (!isOnCopyrightPage()) {
            showWrongPageAlert();
            return;
        }

        addCopyrightColumnHeader();
        const rows = Array.from(document.querySelectorAll("ytcr-video-content-list-row"));
        if (!rows.length) return;

        await processAllRowsInParallel(rows);
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
        for (let i = 0; i < maxAttempts; i++) {
            const popup = document.querySelector("ytcp-dialog");
            if (popup) return popup;
            await new Promise(r => setTimeout(r, 200));
        }
        return null;
    }

    function extractClaimantsFromPopup(popup) {
        const fallback = "Không tìm thấy thông tin bản quyền.";
        const dtElements = popup.querySelectorAll("dt.style-scope.ytcr-video-content-details-dialog");
        for (const dt of dtElements) {
            if (dt.innerText.trim() === "Claimants") {
                const claimants = [];
                let next = dt.nextElementSibling;
                while (next && next.tagName === "DD") {
                    let name = next.innerText.trim();
                    if (name.includes("on behalf of")) {
                        name = name.split("on behalf of")[0].trim();
                    }
                    claimants.push(name);
                    next = next.nextElementSibling;
                }
                return claimants.join("") || fallback;
            }
        }
        return fallback;
    }

    async function closeAndRemovePopup() {
        const closeButton = document.querySelector("ytcp-dialog yt-icon-button[aria-label='Close']");
        if (closeButton) closeButton.click();

        await new Promise(r => setTimeout(r, 500));

        document.querySelectorAll("ytcp-dialog, tp-yt-iron-overlay-backdrop, .backdrop, .overlay").forEach(el => {
            if (el.parentNode) el.parentNode.removeChild(el);
        });

        Object.assign(document.body.style, {
            opacity: "1",
            filter: "none",
            backgroundColor: ""
        });
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

        const observer = new MutationObserver(() => {
            document.querySelectorAll("tp-yt-iron-overlay-backdrop, .backdrop, .overlay").forEach(el => el.remove());
            document.body.style.opacity = "1";
        });
        observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    }

    function addButton() {
        const header = document.querySelector("ytcp-header .right-section");
        if (!header || header.querySelector("#custom-copyright-checker-btn")) return;

        const button = document.createElement("button");
        button.id = "custom-copyright-checker-btn";
        Object.assign(button.style, {
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 16px",
            marginRight: "1px",
            cursor: "pointer",
            backgroundColor: "transparent",
            color: "#e8eaed",
            border: "1px solid #5f6368",
            borderRadius: "24px",
            fontSize: "14px",
            fontWeight: "500",
            height: "36px",
            lineHeight: "20px",
            marginTop: "4px",
            position: "relative",
            zIndex: "9999"
        });

        const icon = document.createElement("img");
        icon.src = "https://www.svgrepo.com/show/102010/copyright-symbol.svg";
        Object.assign(icon.style, {
            width: "16px",
            height: "16px",
            filter: "invert(90%)"
        });

        const text = document.createElement("span");
        text.innerText = "Check Copyright";

        button.onclick = fetchCopyrightInfo;
        button.appendChild(icon);
        button.appendChild(text);
        header.insertBefore(button, header.firstChild);
    }

    window.addEventListener("load", () => {
        addButton();
        enforceNoDim();
    });
})();
