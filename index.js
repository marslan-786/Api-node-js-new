const express = require('express');
const got = require('got');
const { CookieJar } = require('tough-cookie');
const moment = require('moment-timezone');
const { parsePhoneNumber } = require('libphonenumber-js');

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= CONFIG ================= */

const TARGET_HOST = 'http://51.89.99.105';
const NUMBERS2_URL = `${TARGET_HOST}/NumberPanel/agent/res/data_smsnumbers2.php`;
const SMS_API_URL =
  'http://147.135.212.197/crapi/st/viewstats?token=RVZUQ0pBUzR5d3NZgYuPiEN0hkRoYpVXiE6BVnJRiVtIlohqU4hmaw==&dt1=2026-02-04 05:18:03&dt2=2126-05-09 05:18:16&records=10';
const PHPSESSID = process.env.PHPSESSID || 'nus523do9hbsiakb3f28jqtjc5';

/* ================= CLIENT ================= */

const cookieJar = new CookieJar();
const client = got.extend({
  cookieJar,
  timeout: 20000,
  retry: { limit: 0 },
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 13; V2040) AppleWebKit/537.36 Chrome/144 Mobile Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': `${TARGET_HOST}/NumberPanel/agent/MySMSNumbers2`,
    'Cookie': `PHPSESSID=${PHPSESSID}`
  }
});

/* ================= CACHE ================= */

let cachedNumbers = null;
let cachedSms = null;
let lastNumberFetch = 0;
let lastSmsFetch = 0;

const NUMBER_CACHE = 5 * 60 * 1000; // 5 min
const SMS_COOLDOWN = 5000; // 5 sec

/* ================= HELPERS ================= */

function getCountryFromNumber(number) {
  try {
    const num = number.toString().startsWith('+') ? number : '+' + number;
    const phone = parsePhoneNumber(num);
    if (!phone || !phone.country) return 'International';
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(phone.country);
  } catch {
    return 'Unknown';
  }
}

/* ================= ROUTES ================= */

app.get('/', (_, res) => {
  res.send('✅ NumberPanel Proxy Running');
});

/* =====================================================
   🔢 NUMBERS API (NO LOGIN)
===================================================== */
app.get('/api/numbers', async (_, res) => {
  try {
    if (cachedNumbers && Date.now() - lastNumberFetch < NUMBER_CACHE) {
      return res.json(cachedNumbers);
    }

    const params = new URLSearchParams({
      frange: '',
      fclient: '',
      fallocated: '',
      sEcho: 2,
      iColumns: 8,
      sColumns: ',,,,,,,',
      iDisplayStart: 0,
      iDisplayLength: -1,
      iSortCol_0: 0,
      sSortDir_0: 'asc',
      iSortingCols: 1,
      _: Date.now()
    });

    const r = await client.get(`${NUMBERS2_URL}?${params.toString()}`, { responseType: 'json' });
    cachedNumbers = r.body;
    lastNumberFetch = Date.now();

    res.json(cachedNumbers);
  } catch (e) {
    console.error('❌ Numbers error:', e.message);
    if (cachedNumbers) return res.json(cachedNumbers);
    res.status(500).json({ error: 'Failed to fetch numbers (no-login)' });
  }
});

/* =====================================================
   ✉️ SMS API (WITH EXTRA FIELDS)
===================================================== */
app.get('/api/sms', async (_, res) => {
  try {
    const now = Date.now();
    if (cachedSms && now - lastSmsFetch < SMS_COOLDOWN) return res.json(cachedSms);

    lastSmsFetch = now;
    const r = await got.get(SMS_API_URL, { timeout: 20000 });
    const raw = r.body.toString().trim();

    if (raw.includes('Please wait') || raw.includes('accessed this site too many times')) {
      if (cachedSms) return res.json(cachedSms);
      return res.json({ sEcho: 1, iTotalRecords: 0, iTotalDisplayRecords: 0, aaData: [] });
    }

    if (!raw.startsWith('[')) {
      if (cachedSms) return res.json(cachedSms);
      throw new Error('Invalid SMS JSON');
    }

    const data = JSON.parse(raw);

    const aaData = data.map(row => {
      const msg = row[2]; // full message
      const cost = 0.005; // example cost, you can calculate dynamically if needed

      return [
        row[0],       // Date
        getCountryFromNumber(row[1]), // Country
        row[1],       // Number
        row[3],       // Service / Sender
        msg,          // Full Message
        row[5],       // Currency ($)
        cost          // Cost
      ];
    });

    cachedSms = { sEcho: 1, iTotalRecords: aaData.length, iTotalDisplayRecords: aaData.length, aaData };
    res.json(cachedSms);
  } catch (e) {
    console.error('❌ SMS error:', e.message);
    if (cachedSms) return res.json(cachedSms);
    res.status(500).json({ error: 'Failed to fetch SMS data' });
  }
});

/* ================= START ================= */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
