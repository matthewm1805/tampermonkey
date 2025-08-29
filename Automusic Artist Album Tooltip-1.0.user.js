// ==UserScript==
// @name         Automusic - Smart Loader & Artist Statistics
// @namespace    http://tampermonkey.net/
// @version      5.1
// @description  Tự động tải nhanh tất cả album, cuộn lên đầu trang và cung cấp pop-up thống kê nghệ sĩ.
// @author       Gemini
// @match        https://automusic.win/album*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- CSS ---
    GM_addStyle(`
        /* Hộp thông báo */
        #auto-loader-status {
            position: fixed; bottom: 20px; left: 20px;
            background-color: rgba(40, 40, 40, 0.85); color: #E0E0E0;
            padding: 12px 18px; border-radius: 8px; z-index: 9999;
            font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            transition: opacity 0.5s ease, transform 0.3s ease;
            opacity: 0; transform: translateY(10px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.4);
            backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
        }
        #auto-loader-status.visible { opacity: 1; transform: translateY(0); }

        /* Nút Thống kê */
        #stats-button {
            position: fixed; bottom: 20px; right: 20px;
            background-color: #007bff; color: white;
            padding: 12px 20px; border-radius: 25px; z-index: 9998;
            font-size: 16px; font-weight: bold; cursor: pointer;
            border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: all 0.3s ease; display: none;
        }
        #stats-button:hover { background-color: #0056b3; transform: scale(1.05); }

        /* Pop-up Thống kê */
        #stats-modal-overlay {
            position: fixed; top: 0; left: 0;
            width: 100%; height: 100%;
            background-color: rgba(0,0,0,0.6);
            z-index: 10000; display: flex;
            align-items: center; justify-content: center;
        }
        #stats-modal-content {
            background: #2c2c2c; color: #f1f1f1;
            padding: 25px; border-radius: 10px;
            width: 90%; max-width: 800px;
            max-height: 85vh; overflow-y: auto;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            position: relative;
        }
        #stats-modal-close {
            position: absolute; top: 15px; right: 20px;
            font-size: 28px; font-weight: bold;
            color: #aaa; cursor: pointer;
        }
        #stats-modal-close:hover { color: #fff; }

        /* Bảng Thống kê */
        #stats-table {
            width: 100%; border-collapse: collapse; margin-top: 20px;
        }
        #stats-table th, #stats-table td {
            padding: 12px; text-align: left;
            border-bottom: 1px solid #444;
        }
        #stats-table th { background-color: #383838; }
        #stats-table tr:hover { background-color: #404040; }
        #stats-table .genre-list { display: flex; flex-wrap: wrap; gap: 5px; }
        #stats-table .genre-tag {
            background-color: #007bff; color: white;
            padding: 3px 8px; border-radius: 12px;
            font-size: 12px;
        }
    `);

    // --- LOGIC ---

    // 1. Chức năng hiển thị thông báo
    const statusBox = document.createElement('div');
    statusBox.id = 'auto-loader-status';
    document.body.appendChild(statusBox);

    let statusTimeout;
    function updateStatus(message, permanent = false) {
        clearTimeout(statusTimeout);
        statusBox.textContent = message;
        statusBox.classList.add('visible');
        if (!permanent) {
            statusTimeout = setTimeout(() => statusBox.classList.remove('visible'), 3500);
        }
    }

    // 2. Chức năng thống kê
    function showStatistics() {
        // Thu thập và xử lý dữ liệu
        const artistStats = {};
        document.querySelectorAll('.album-row').forEach(row => {
            const subtitleClone = row.querySelector('.album-subtitle').cloneNode(true);
            subtitleClone.querySelectorAll('span').forEach(span => span.remove());
            const artistName = subtitleClone.textContent.trim();

            if (!artistName) return;

            const genre = row.querySelector('.genre-pill').textContent.trim();
            const releaseDateStr = row.querySelector('.release-date').textContent.trim();
            const releaseDate = new Date(releaseDateStr);

            if (!artistStats[artistName]) {
                artistStats[artistName] = {
                    genres: new Set(),
                    latestDate: new Date(0)
                };
            }

            artistStats[artistName].genres.add(genre);
            if (releaseDate > artistStats[artistName].latestDate) {
                artistStats[artistName].latestDate = releaseDate;
            }
        });

        // Tạo nội dung bảng
        let tableRows = '';
        for (const artist in artistStats) {
            const stats = artistStats[artist];
            const genresHTML = [...stats.genres].map(g => `<span class="genre-tag">${g}</span>`).join('');
            const latestDateFormatted = stats.latestDate.toLocaleDateString('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            });

            tableRows += `
                <tr>
                    <td>${artist}</td>
                    <td><div class="genre-list">${genresHTML}</div></td>
                    <td>${latestDateFormatted}</td>
                </tr>
            `;
        }

        // Tạo và hiển thị pop-up
        const modalHTML = `
            <div id="stats-modal-overlay">
                <div id="stats-modal-content">
                    <span id="stats-modal-close">&times;</span>
                    <h2>Thống Kê Nghệ Sĩ</h2>
                    <table id="stats-table">
                        <thead>
                            <tr>
                                <th>Tên Artist</th>
                                <th>Tất cả các Genre</th>
                                <th>Ngày Release gần nhất</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Thêm sự kiện để đóng pop-up
        const overlay = document.getElementById('stats-modal-overlay');
        document.getElementById('stats-modal-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }

    // 3. Chức năng tự động tải
    function autoLoadAll() {
        const albumContainer = document.getElementById('albums-list');
        if (!albumContainer) return;

        updateStatus('🚀 Bắt đầu quá trình tải nhanh...', true);

        // Hàm kích hoạt tải tiếp theo
        const triggerNextLoad = () => {
            const endMessage = document.querySelector('#end-message .text-muted');
            if (endMessage && endMessage.innerText.includes("You've reached the end!")) {
                observer.disconnect(); // Ngừng theo dõi
                const finalCount = document.querySelectorAll('.album-row, .album-card').length;
                updateStatus(`✅ Hoàn tất! Đã tải ${finalCount} albums. Đang cuộn lên...`, true);

                // Tự động cuộn lên đầu trang
                setTimeout(() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    updateStatus(`Tải xong! Sẵn sàng để thống kê.`, false);
                    // Hiển thị nút Thống kê
                    const statsButton = document.createElement('button');
                    statsButton.id = 'stats-button';
                    statsButton.textContent = '📊 Thống kê';
                    statsButton.onclick = showStatistics;
                    document.body.appendChild(statsButton);
                    statsButton.style.display = 'block';
                }, 500);
                return;
            }
            // Cuộn xuống để tải tiếp
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
        };

        // Theo dõi khi có nội dung mới được tải
        const observer = new MutationObserver((mutations) => {
            if (mutations.some(m => m.type === 'childList' && m.addedNodes.length > 0)) {
                const albumCount = document.querySelectorAll('.album-row, .album-card').length;
                updateStatus(`Đã tải ${albumCount} albums...`, true);
                // Chờ một chút rồi mới kích hoạt lần tải tiếp theo
                setTimeout(triggerNextLoad, 300);
            }
        });

        // Bắt đầu theo dõi
        observer.observe(albumContainer, { childList: true, subtree: true });

        // Kích hoạt lần tải đầu tiên
        triggerNextLoad();
    }

    // Chờ trang tải xong rồi chạy
    setTimeout(autoLoadAll, 1500);

})();
