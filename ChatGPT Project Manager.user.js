// ==UserScript==
// @name         ChatGPT Project Manager
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Hiển thị tất cả dự án từ "Xem thêm", sắp xếp A-Z, thêm tìm kiếm thông minh
// @author       Matthew M.
// @match        *://chatgpt.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const delay = (ms) => new Promise(res => setTimeout(res, ms));
  const insertedHrefs = new Set();

  function moveProjectsFromPopup(popupMenu, sidebar) {
    const projectLinks = popupMenu.querySelectorAll('a[href*="/project"]');
    let added = 0;

    projectLinks.forEach(link => {
      const href = link.getAttribute("href");
      if (insertedHrefs.has(href)) return;

      const wrapper = document.createElement('div');
      wrapper.appendChild(link.cloneNode(true));
      sidebar.insertBefore(wrapper, sidebar.lastElementChild);
      insertedHrefs.add(href);
      added++;
    });

    if (added > 0) {
      console.log(`✅ Đã thêm ${added} dự án mới`);
      sortProjectsAZ(sidebar);
    }
  }

  function sortProjectsAZ(sidebar) {
    const items = Array.from(sidebar.querySelectorAll('div > a[href*="/project"]'))
      .map(a => a.parentElement);

    const lastItem = sidebar.lastElementChild;
    items.sort((a, b) => a.innerText.trim().localeCompare(b.innerText.trim()));
    items.forEach(el => el.remove());
    items.forEach(el => sidebar.insertBefore(el, lastItem));

    console.log("🔠 Dự án đã được sắp xếp A-Z");
  }

  function addSearchBox() {
    const heading = document.getElementById("snorlax-heading");
    if (!heading || document.getElementById("project-search-box-wrapper")) return;

    const wrapper = document.createElement("div");
    wrapper.id = "project-search-box-wrapper";
    wrapper.style.position = "relative";
    wrapper.style.marginLeft = "6px";
    wrapper.style.flex = "1";
    wrapper.style.maxWidth = "160px";
    wrapper.style.height = "24px";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Tìm dự án...";
    Object.assign(input.style, {
      width: "100%",
      height: "100%",
      padding: "3px 8px 3px 26px",
      fontSize: "11px",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      borderRadius: "6px",
      backgroundColor: "#2A2B32",
      color: "#ffffff",
      outline: "none",
      boxShadow: "none",
      transition: "all 0.2s ease"
    });

    input.addEventListener("focus", () => {
      input.style.borderColor = "#ffffff";
      input.style.boxShadow = "0 0 0 1px rgba(255, 255, 255, 0.3)";
    });
    input.addEventListener("blur", () => {
      input.style.borderColor = "rgba(255, 255, 255, 0.1)";
      input.style.boxShadow = "none";
    });

    const icon = document.createElement("div");
    icon.innerHTML = `
      <svg width="14" height="14" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" stroke="currentColor"/>
        <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor"/>
      </svg>
    `;
    Object.assign(icon.style, {
      position: "absolute",
      left: "7px",
      top: "50%",
      transform: "translateY(-50%)",
      opacity: "0.6",
      pointerEvents: "none"
    });

    wrapper.appendChild(icon);
    wrapper.appendChild(input);
    heading.appendChild(wrapper);

    input.addEventListener("input", () => {
      const keyword = input.value.trim().toLowerCase();
      const sidebar = document.querySelector('ul[aria-labelledby="snorlax-heading"]');
      if (!sidebar) return;

      const projects = sidebar.querySelectorAll('div > a[href*="/project"]');
      projects.forEach(a => {
        const parent = a.parentElement;
        const text = a.textContent.trim().toLowerCase();
        parent.style.display = text.includes(keyword) ? "" : "none";
      });
    });
  }

  async function waitForElement(selector, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await delay(300);
    }
    return null;
  }

  async function initEnhancements() {
    const sidebar = await waitForElement('ul[aria-labelledby="snorlax-heading"]');
    if (!sidebar) return console.warn("❌ Không tìm thấy sidebar");

    const xemThemButton = Array.from(document.querySelectorAll("button"))
      .find(btn => btn.textContent?.includes("Xem thêm"));

    if (!xemThemButton) return console.warn("⚠️ Không tìm thấy nút 'Xem thêm'");

    addSearchBox();

    xemThemButton.addEventListener("click", async () => {
      console.log("👆 Nhấn 'Xem thêm'...");
      await delay(500);

      const popupMenu = document.querySelector('div[role="menu"]');
      if (popupMenu) {
        moveProjectsFromPopup(popupMenu, sidebar);

        const popupObserver = new MutationObserver(() => {
          moveProjectsFromPopup(popupMenu, sidebar);
        });

        popupObserver.observe(popupMenu, { childList: true, subtree: true });

        // Dọn sau 3s để tránh rò rỉ
        setTimeout(() => popupObserver.disconnect(), 3000);
      }
    });
  }

  // Theo dõi thay đổi giao diện
  const mainObserver = new MutationObserver(() => {
    const sidebar = document.querySelector('ul[aria-labelledby="snorlax-heading"]');
    if (sidebar && !document.getElementById("project-search-box-wrapper")) {
      initEnhancements();
    }
  });

  window.addEventListener("load", () => {
    mainObserver.observe(document.body, { childList: true, subtree: true });
    initEnhancements(); // chạy ngay nếu đã sẵn sàng
  });
})();
