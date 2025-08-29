// ==UserScript==
// @name         Automusic Artist Album Tooltip
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Hiển thị thông tin các album và ngày phát hành của một nghệ sĩ khi di chuột qua tên của họ.
// @author       Matthew M.
// @match        https://automusic.win/album*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // CSS cho tooltip
    GM_addStyle(`
        .artist-tooltip {
            position: absolute;
            background-color: #333;
            color: #fff;
            padding: 10px;
            border-radius: 5px;
            z-index: 1000;
            font-size: 14px;
            width: 300px; /* Tăng chiều rộng để có thêm không gian */
            box-shadow: 0 4px 8px rgba(0,0,0,0.3); /* Thêm bóng đổ để nổi bật */
        }
        .artist-tooltip ul {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .artist-tooltip li {
            margin-bottom: 5px;
            display: flex;
            justify-content: space-between; /* Căn chỉnh nội dung hai bên */
            border-bottom: 1px solid #555; /* Thêm đường kẻ phân cách */
            padding-bottom: 5px;
        }
        .artist-tooltip li:last-child {
            margin-bottom: 0;
            border-bottom: none; /* Bỏ đường kẻ cho mục cuối */
        }
        .album-release-date {
            font-style: italic;
            color: #ccc;
            white-space: nowrap; /* Ngăn ngày tháng xuống dòng */
            margin-left: 10px; /* Tạo khoảng cách với tên album */
        }
    `);

    // Hàm chính để khởi chạy tập lệnh
    function run_script() {
        // Lắng nghe sự kiện di chuột vào phần tử có class 'album-subtitle'
        document.body.addEventListener('mouseover', function(event) {
            const subtitleElement = event.target.closest('.album-subtitle');

            if (subtitleElement) {
                // Trích xuất tên nghệ sĩ từ nội dung của phần tử, loại bỏ các phần tử con
                const artistName = subtitleElement.cloneNode(true);
                // Loại bỏ các thẻ span con để chỉ lấy tên
                artistName.querySelectorAll('span').forEach(span => span.remove());
                const artist = artistName.textContent.trim();

                // Lấy tất cả các album của nghệ sĩ
                const albums = [];
                document.querySelectorAll('.album-row').forEach(row => {
                    const albumSubtitle = row.querySelector('.album-subtitle');
                    if (albumSubtitle && albumSubtitle.textContent.includes(artist)) {
                        const albumTitle = row.querySelector('.album-title-cell').textContent.trim();
                        const releaseDate = row.querySelector('.release-date').textContent.trim();
                        albums.push({ title: albumTitle, date: releaseDate });
                    }
                });

                // Tạo tooltip nếu có album
                if (albums.length > 0) {
                    const tooltip = document.createElement('div');
                    tooltip.className = 'artist-tooltip';
                    let content = `<h5>${artist} - ${albums.length} Album(s)</h5><ul>`;
                    albums.forEach(album => {
                        content += `<li>${album.title} <span class="album-release-date">${album.date}</span></li>`;
                    });
                    content += '</ul>';
                    tooltip.innerHTML = content;
                    document.body.appendChild(tooltip);

                    // tracking tooltip
                    const rect = subtitleElement.getBoundingClientRect();
                    tooltip.style.left = `${rect.left + window.scrollX}px`;
                    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;

                    // di chuột ra để xóa tooltip
                    subtitleElement.addEventListener('mouseout', () => {
                        if (document.body.contains(tooltip)) {
                            document.body.removeChild(tooltip);
                        }
                    }, { once: true });
                }
            }
        });
    }

    // Chờ load trang
    setTimeout(run_script, 1000);

})();