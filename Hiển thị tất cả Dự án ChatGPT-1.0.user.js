// ==UserScript==
// @name         Hiển thị tất cả Dự án ChatGPT
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Di chuyển tất cả các dự án trong 'Xem thêm' ra sidebar chính
// @author       Matthew M.
// @match        *://chat.openai.com/*
// @match        *://chatgpt.com/*
// @match        *://chat.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const delay = (ms) => new Promise((res) => setTimeout(res, ms));
  const insertedHrefs = new Set();

  function moveProjectsFromPopup(popupMenu, sidebar) {
    const projectLinks = popupMenu.querySelectorAll('a[href*="/project"]');
    let added = 0;

    projectLinks.forEach(link => {
      const href = link.getAttribute("href");
      if (insertedHrefs.has(href)) return;

      const wrapper = document.createElement('div');
      wrapper.appendChild(link.cloneNode(true));
      sidebar.insertBefore(wrapper, sidebar.lastElementChild); // trước "Xem thêm"

      insertedHrefs.add(href);
      added++;
    });

    if (added > 0) {
      console.log(`✅ Thêm ${added} project mới từ 'Xem thêm'`);
      sortProjectsAZ(sidebar);
    }
  }

  function sortProjectsAZ(sidebar) {
    // Lấy toàn bộ các div chứa project
    const projectItems = Array.from(
      sidebar.querySelectorAll('div > a[href*="/project"]')
    ).map(a => a.parentElement);

    // Loại bỏ "Xem thêm"
    const lastItem = sidebar.lastElementChild;

    // Sắp xếp theo text
    projectItems.sort((a, b) => {
      const textA = a.innerText.trim().toLowerCase();
      const textB = b.innerText.trim().toLowerCase();
      return textA.localeCompare(textB);
    });

    // Xoá các project hiện tại
    projectItems.forEach(item => item.remove());

    // Chèn lại đã sắp xếp, trước "Xem thêm"
    projectItems.forEach(item => {
      sidebar.insertBefore(item, lastItem);
    });

    console.log("🔠 Đã sắp xếp tất cả dự án theo A-Z");
  }

  async function setupObserver() {
    const sidebar = document.querySelector('ul[aria-labelledby="snorlax-heading"]');
    if (!sidebar) return console.warn("❌ Không tìm thấy sidebar");

    const xemThemButton = Array.from(document.querySelectorAll("button"))
      .find(btn => btn.textContent?.includes("Xem thêm"));

    if (!xemThemButton) return;

    const bodyObserver = new MutationObserver(() => {
      const popupMenu = document.querySelector('div[role="menu"]');
      if (popupMenu) {
        moveProjectsFromPopup(popupMenu, sidebar);

        const popupObserver = new MutationObserver(() => {
          moveProjectsFromPopup(popupMenu, sidebar);
        });

        popupObserver.observe(popupMenu, { childList: true, subtree: true });
      }
    });

    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  window.addEventListener('load', () => {
    setTimeout(setupObserver, 2000);
  });
})();
