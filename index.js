const express = require('express');
const got = require('got'); 
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const moment = require('moment-timezone');
const { parsePhoneNumber } = require('libphonenumber-js');

const app = express();
const PORT = process.env.PORT || 3000;

const cookieJar = new CookieJar();
const client = got.extend({
    cookieJar,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36'
    },
    retry: {
        limit: 2 
    }
});

const TARGET_HOST = 'http://51.89.99.105';
const LOGIN_URL = `${TARGET_HOST}/NumberPanel/login`;
const SIGNIN_URL = `${TARGET_HOST}/NumberPanel/signin`;
const DATA_URL = `${TARGET_HOST}/NumberPanel/agent/res/data_smsnumberstats.php`;
const SMS_API_URL = 'http://147.135.212.197/crapi/st/viewstats?token=RVZUQ0pBUzR5d3NZgYuPiEN0hkRoYpVXiE6BVnJRiVtIlohqU4hmaw==&records=100';

const USERNAME = process.env.PANEL_USER || 'Broken007';
const PASSWORD = process.env.PANEL_PASS || 'Broken007';

let cachedNumberData = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; 

// --- Helper Functions ---

function getCountryFromNumber(number) {
    if (!number) return "Unknown";
    try {

        const strNum = number.toString().startsWith('+') ? number.toString() : '+' + number.toString();

        const phoneNumber = parsePhoneNumber(strNum);

        if (phoneNumber && phoneNumber.country) {

            const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
            return regionNames.of(phoneNumber.country);
        }
        return "International";
    } catch (error) {

        return "Unknown";
    }
}

async function ensureLoggedIn() {
    try {
        console.log('Fetching Login Page...');
        const loginPage = await client.get(LOGIN_URL);

        const $ = cheerio.load(loginPage.body);
        const labelText = $('label:contains("What is")').text();
        const match = labelText.match(/(\d+)\s*\+\s*(\d+)/);
        
        let captchaAnswer = 0;
        if (match) {
            captchaAnswer = parseInt(match[1]) + parseInt(match[2]);
            console.log(`Captcha Solved: ${match[1]} + ${match[2]} = ${captchaAnswer}`);
        }

        console.log('Logging in...');
        
        await client.post(SIGNIN_URL, {
            form: {
                username: USERNAME,
                password: PASSWORD,
                capt: captchaAnswer
            },
            headers: {
                'Referer': LOGIN_URL
            }
        });
        console.log('Login successful.');
        
    } catch (error) {
        console.error('Login Failed:', error.message);
    }
}

// --- Routes ---

app.get('/', (req, res) => {
    res.send('Number Panel Proxy (Powered by LibPhoneNumber) is Running!');
});

// 1. Numbers API
app.get('/api/numbers', async (req, res) => {
    try {
        const currentTime = Date.now();

        if (cachedNumberData && (currentTime - lastFetchTime < CACHE_DURATION)) {
            console.log('Serving Cached Data');
            return res.json(cachedNumberData);
        }

        console.log('Cache Expired. Fetching fresh data...');
        await ensureLoggedIn();

        const fdate1 = '2026-01-01 00:00:00';
        const fdate2 = moment().tz("Asia/Karachi").format('YYYY-MM-DD 23:59:59');

        const searchParams = new URLSearchParams({
            fdate1: fdate1,
            fdate2: fdate2,
            sEcho: 4, iColumns: 5, sColumns: ',,,,',
            iDisplayStart: 0, iDisplayLength: -1,
            sSearch: '', bRegex: false, iSortCol_0: 0,
            sSortDir_0: 'desc', iSortingCols: 1,
            _: Date.now()
        });
        
        const response = await client.get(`${DATA_URL}?${searchParams.toString()}`, {
            headers: {
                'Referer': `${TARGET_HOST}/NumberPanel/agent/SMSNumberStats`,
                'X-Requested-With': 'XMLHttpRequest'
            },
            responseType: 'json' 
        });

        cachedNumberData = response.body;
        lastFetchTime = currentTime;
        res.json(cachedNumberData);

    } catch (error) {
        console.error('Error fetching numbers:', error.message);
        res.status(500).json({ error: 'Failed to fetch number stats' });
    }
});

// 2. SMS API (With Library Logic)
app.get('/api/sms', async (req, res) => {
    try {
        const response = await got.get(SMS_API_URL, { responseType: 'json' });
        const rawData = response.body;

        // 1. Map Data
        const formattedData = rawData.map(item => {
            return [
                item[3],                          // 0. Date
                getCountryFromNumber(item[1]),    // 1. Country Name (Library generated)
                item[1],                          // 2. Phone Number
                item[0],                          // 3. Service Name (e.g. WhatsApp)
                item[2],                          // 4. Message Content
                "$",                              // 5. Currency 1
                "€",                              // 6. Currency 2
                0.005                             // 7. Price
            ];
        });

        const totalRecords = formattedData.length;

        // 2. Add the Summary/Footer Row
        formattedData.push([
            "0,0.05,0,0,0,0,0,0.05,0,0,100%,0,9",
            0, 0, 0, "", "$", 0, 0
        ]);

        // 3. Send Response
        res.json({
            "sEcho": 1,
            "iTotalRecords": totalRecords.toString(), 
            "iTotalDisplayRecords": totalRecords.toString(),
            "aaData": formattedData
        });

    } catch (error) {
        console.error('Error fetching SMS:', error.message);
        res.status(500).json({ error: 'Failed to fetch SMS data' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
