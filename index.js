const express = require('express');
const got = require('got');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const moment = require('moment-timezone');
const { parsePhoneNumber } = require('libphonenumber-js');

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= CONFIG ================= */

const TARGET_HOST = 'http://51.89.99.105';

/* 🔹 NUMBERS (NO LOGIN) */
const NUMBERS_URL =
  `${TARGET_HOST}/NumberPanel/agent/res/data_smsnumbers.php` +
  `?frange=&fclient=&sEcho=2&iColumns=6&sColumns=%2C%2C%2C%2C%2C` +
  `&iDisplayStart=0&iDisplayLength=-1` +
  `&mDataProp_0=0&mDataProp_1=1&mDataProp_2=2` +
  `&mDataProp_3=3&mDataProp_4=4&mDataProp_5=5` +
  `&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=asc` +
  `&iSortingCols=1&_=`;

/* 🔹 SMS (AS IT IS – NO CHANGE) */
const SMS_API_URL =
  'http://147.135.212.197/crapi/st/viewstats?token=RVZUQ0pBUzR5d3NZgYuPiEN0hkRoYpVXiE6BVnJRiVtIlohqU4hmaw==&dt1=2026-02-04 05:18:03&dt2=2126-05-09 05:18:16&records=10';

/* ================= CLIENT ================= */

const cookieJar = new CookieJar();

const client = got.extend({
  cookieJar,
  timeout: 20000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/144 Mobile Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest'
  },
  retry: { limit: 0 }
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
   🔢 NUMBERS API (WITHOUT LOGIN – DIRECT PANEL RESPONSE)
   ===================================================== */

app.get('/api/numbers', async (_, res) => {
  try {
    if (cachedNumbers && Date.now() - lastNumberFetch < NUMBER_CACHE) {
      return res.json(cachedNumbers);
    }

    const ts = Date.now();

    const r = await client.get(NUMBERS_URL + ts, {
      responseType: 'json',
      headers: {
        Referer: `${TARGET_HOST}/NumberPanel/client/MySMSNumbers`
      }
    });

    /* ✅ SAME RESPONSE AS PANEL (sEcho, aaData, etc) */
    cachedNumbers = r.body;
    lastNumberFetch = Date.now();

    res.json(cachedNumbers);
  } catch (e) {
    console.error('❌ Numbers error:', e.message);
    if (cachedNumbers) return res.json(cachedNumbers);
    res.status(500).json({ error: 'Failed to fetch numbers' });
  }
});

/* =====================================================
   💬 SMS API (NO CHANGE – AS YOU SAID)
   ===================================================== */

app.get('/api/sms', async (_, res) => {
  try {
    const now = Date.now();

    if (cachedSms && now - lastSmsFetch < SMS_COOLDOWN) {
      return res.json(cachedSms);
    }

    lastSmsFetch = now;

    const r = await got.get(SMS_API_URL, { timeout: 20000 });
    const raw = r.body.toString().trim();

    if (
      raw.includes('Please wait') ||
      raw.includes('accessed this site too many times')
    ) {
      if (cachedSms) return res.json(cachedSms);
      return res.json({
        sEcho: 1,
        iTotalRecords: 0,
        iTotalDisplayRecords: 0,
        aaData: []
      });
    }

    if (!raw.startsWith('[')) {
      if (cachedSms) return res.json(cachedSms);
      throw new Error('Invalid JSON');
    }

    const data = JSON.parse(raw);

    const aaData = data.map(i => [
      i[3],
      getCountryFromNumber(i[1]),
      i[1],
      i[0],
      i[2],
      '$',
      '€',
      0.005
    ]);

    cachedSms = {
      sEcho: 1,
      iTotalRecords: aaData.length,
      iTotalDisplayRecords: aaData.length,
      aaData
    };

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
});    console.error('❌ Numbers error:', e.message);
    if (cachedNumbers) return res.json(cachedNumbers);
    res.status(500).json({
      error: 'Failed to fetch numbers (no-login)'
    });
  }
});

/* =====================================================
   ✉️ SMS API (UNCHANGED – FINAL)
===================================================== */

app.get('/api/sms', async (_, res) => {
  try {
    const now = Date.now();

    if (cachedSms && now - lastSmsFetch < SMS_COOLDOWN) {
      return res.json(cachedSms);
    }

    lastSmsFetch = now;

    const r = await got.get(SMS_API_URL, { timeout: 20000 });
    const raw = r.body.toString().trim();

    if (
      raw.includes('Please wait') ||
      raw.includes('accessed this site too many times')
    ) {
      if (cachedSms) return res.json(cachedSms);
      return res.json({
        sEcho: 1,
        iTotalRecords: 0,
        iTotalDisplayRecords: 0,
        aaData: []
      });
    }

    if (!raw.startsWith('[')) {
      if (cachedSms) return res.json(cachedSms);
      throw new Error('Invalid SMS JSON');
    }

    const data = JSON.parse(raw);

    const aaData = data.map(i => [
      i[3],                          // Date
      getCountryFromNumber(i[1]),    // Country
      i[1],                          // Number
      i[0],                          // Service
      i[2],                          // Message
      '$',
      '€',
      0.005
    ]);

    cachedSms = {
      sEcho: 1,
      iTotalRecords: aaData.length,
      iTotalDisplayRecords: aaData.length,
      aaData
    };

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
