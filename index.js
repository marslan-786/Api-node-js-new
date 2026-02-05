const express = require('express');
const got = require('got');
const moment = require('moment-timezone');
const { parsePhoneNumber } = require('libphonenumber-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ================== CONSTANTS ==================
const TARGET_HOST = 'http://51.89.99.105';

const NUMBERS_URL =
`${TARGET_HOST}/NumberPanel/agent/res/data_smsnumbers2.php` +
`?frange=&fclient=&fallocated=&sEcho=2&iColumns=8&sColumns=%2C%2C%2C%2C%2C%2C%2C` +
`&iDisplayStart=0&iDisplayLength=-1&sSearch=&bRegex=false` +
`&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=`;

// 🔒 session cookie (NO LOGIN CODE)
const SESSION_COOKIE = process.env.PHPSESSID;

// SMS API (UNCHANGED)
const SMS_API_URL =
'http://147.135.212.197/crapi/st/viewstats?token=RVZUQ0pBUzR5d3NZgYuPiEN0hkRoYpVXiE6BVnJRiVtIlohqU4hmaw==&records=10';

// ================== HELPERS ==================
function getCountryFromNumber(number) {
    try {
        const phone = parsePhoneNumber('+' + number);
        const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
        return regionNames.of(phone.country) || "Unknown";
    } catch {
        return "Unknown";
    }
}

// ================== ROUTES ==================

app.get('/', (req, res) => {
    res.send('✅ NumberPanel Proxy Running');
});

// ---------- NUMBERS (NEW SYSTEM, NO LOGIN CODE) ----------
app.get('/api/numbers', async (req, res) => {
    try {
        const response = await got.get(
            NUMBERS_URL + Date.now(),
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `${TARGET_HOST}/NumberPanel/agent/MySMSNumbers2`,
                    'Cookie': `PHPSESSID=${SESSION_COOKIE}`
                },
                responseType: 'json'
            }
        );

        res.json(response.body);

    } catch (err) {
        console.error('Numbers Error:', err.message);
        res.status(500).json({ error: 'Failed to fetch numbers' });
    }
});

// ---------- SMS (UNCHANGED) ----------
app.get('/api/sms', async (req, res) => {
    try {
        const { body } = await got.get(SMS_API_URL, { responseType: 'json' });

        const data = body.map(item => ([
            item[3],                       // Date
            getCountryFromNumber(item[1]), // Country
            item[1],                       // Number
            item[0],                       // Service
            item[2],                       // Message
            "$", "€", 0.005
        ]));

        res.json({
            sEcho: 1,
            iTotalRecords: data.length,
            iTotalDisplayRecords: data.length,
            aaData: data
        });

    } catch (err) {
        console.error('SMS Error:', err.message);
        res.status(500).json({ error: 'Failed to fetch SMS' });
    }
});

// ================== START ==================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
