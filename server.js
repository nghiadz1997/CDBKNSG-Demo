const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const BASE_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const https = require('https');

// CẤU HÌNH TELEGRAM BOT TRÊN SERVER (ẨN HOÀN TOÀN KHỎI TRÌNH DUYỆT)
let TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8802090121:AAEFH7voU175nYdfIogikOhFXaRK9zwvHgQ";
let TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "6159104725";

// BỘ NHỚ ĐỆM CHỐNG SPAM & RATE LIMITING THEO IP
const ipRateLimits = new Map(); // ip -> { lastSent: timestamp, countHour: number, hourWindow: number }
const recentRoutesCache = new Map(); // routeKey -> timestamp
let isTelegramGloballyEnabled = true;

// Dọn dẹp cache rác mỗi 15 phút
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of recentRoutesCache.entries()) {
        if (now - timestamp > 15 * 60 * 1000) recentRoutesCache.delete(key);
    }
    for (const [ip, data] of ipRateLimits.entries()) {
        if (now - data.lastSent > 60 * 60 * 1000) ipRateLimits.delete(ip);
    }
}, 15 * 60 * 1000);

function sendTelegramMessageServer(text, callback) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !isTelegramGloballyEnabled) {
        return callback(null, { skipped: true, reason: 'Disabled or missing token' });
    }
    const postData = JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'Markdown',
        disable_notification: false
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                callback(null, parsed);
            } catch (e) {
                callback(null, { success: res.statusCode === 200 });
            }
        });
    });

    req.on('error', (err) => {
        console.error('[Telegram Error]:', err.message);
        callback(err);
    });

    req.write(postData);
    req.end();
}

const server = http.createServer((req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    let reqUrl = decodeURIComponent(req.url.split('?')[0]);

    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // API ENDPOINT: GỬI THÔNG BÁO TRA CỨU TUYẾN ĐƯỜNG VỚI RATE LIMIT
    if (req.method === 'POST' && reqUrl === '/api/notify-route') {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 10240) req.destroy(); // Chống payload quá lớn
        });

        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { startId, endId, startLabel, endLabel } = data;

                if (!startId || !endId || !startLabel || !endLabel) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing required parameters' }));
                    return;
                }

                // 1. KIỂM TRA BẬT/TẮT TOÀN CỤC
                if (!isTelegramGloballyEnabled) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'ignored', reason: 'Telegram notifications currently muted' }));
                    return;
                }

                // 2. CHỐNG LẶP TUYẾN ĐƯỜNG (Deduplication trong 15 phút)
                const routeKey = `${startId}->${endId}`;
                const now = Date.now();
                const lastRouteTime = recentRoutesCache.get(routeKey);
                if (lastRouteTime && (now - lastRouteTime < 15 * 60 * 1000)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'ignored', reason: 'Duplicate route within 15 minutes' }));
                    return;
                }

                // 3. RATE LIMIT THEO IP (Tối đa 1 request / 60s, tối đa 8 request / giờ / IP)
                let ipData = ipRateLimits.get(clientIp);
                const currentHour = Math.floor(now / (60 * 60 * 1000));

                if (!ipData) {
                    ipData = { lastSent: 0, countHour: 0, hourWindow: currentHour };
                    ipRateLimits.set(clientIp, ipData);
                }

                if (ipData.hourWindow !== currentHour) {
                    ipData.countHour = 0;
                    ipData.hourWindow = currentHour;
                }

                // Cooldown 60 giây giữa 2 lần gửi từ cùng 1 IP
                if (now - ipData.lastSent < 60 * 1000) {
                    const waitSec = Math.ceil((60 * 1000 - (now - ipData.lastSent)) / 1000);
                    res.writeHead(429, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `Rate limited. Vui lòng đợi ${waitSec}s.`, retryAfter: waitSec }));
                    return;
                }

                // Giới hạn 8 thông báo/giờ/IP
                if (ipData.countHour >= 8) {
                    res.writeHead(429, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Đã vượt quá hạn mức thông báo trong giờ (tối đa 8 lần/giờ).' }));
                    return;
                }

                // Cập nhật bộ đếm IP & Cache
                ipData.lastSent = now;
                ipData.countHour += 1;
                recentRoutesCache.set(routeKey, now);

                // Soạn nội dung tin nhắn Telegram
                const d = new Date();
                const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')} ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
                const msg = `🗺️ 📍 Người Dùng Tra Cứu Tuyến Đường\n⏱️ Thời gian: ${timeStr}\n📍 Xuất phát: *${startLabel.toUpperCase()}*\n🎯 Điểm đến: *${endLabel.toUpperCase()}*`;

                sendTelegramMessageServer(msg, (err, teleRes) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: !err, teleRes }));
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
            }
        });
        return;
    }

    // API ENDPOINT: ADMIN QUẢN TRỊ BẬT TẮT TELEGRAM
    if (req.method === 'POST' && reqUrl === '/api/admin/telegram-toggle') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (typeof data.enabled === 'boolean') {
                    isTelegramGloballyEnabled = data.enabled;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ isTelegramGloballyEnabled }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid payload' }));
            }
        });
        return;
    }

    // PHỤC VỤ STATIC FILES
    if (reqUrl === '/') reqUrl = '/index.html';
    const filePath = path.join(BASE_DIR, reqUrl);

    // Prevent directory traversal
    if (!filePath.startsWith(BASE_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        const isStaticAsset = ['.png', '.jpg', '.jpeg', '.svg', '.js', '.css', '.ico'].includes(ext);
        const cacheControl = isStaticAsset ? 'public, max-age=86400' : 'no-cache';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': cacheControl
        });

        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`CDBKNSG Maps Server running at: http://localhost:${PORT}`);
});

