const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// --- CONFIGURATION (CLIENT) ---
const CREDENTIALS = {
    username: "Kami520",
    password: "Kami526"
};

const BASE_URL = "http://51.89.99.105/NumberPanel";
const STATS_PAGE_URL = `${BASE_URL}/client/SMSCDRStats`;

const COMMON_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": BASE_URL,
    "Accept-Language": "en-US,en;q=0.9,ur-PK;q=0.8,ur;q=0.7"
};

// --- GLOBAL STATE ---
let STATE = {
    cookie: null,
    sessKey: null,
    isLoggingIn: false
};

// --- HELPER: GET TODAY DATE ---
function getTodayDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// --- HELPER: EXTRACT SESSKEY ---
function extractKey(html) {
    let match = html.match(/sesskey=([^&"']+)/);
    if (match) return match[1];
    match = html.match(/sesskey\s*[:=]\s*["']([^"']+)["']/);
    if (match) return match[1];
    return null;
}

// --- LOGIN & FETCH COOKIE + SESSKEY ---
async function performLogin() {
    if (STATE.isLoggingIn) return;
    STATE.isLoggingIn = true;

    console.log("🔄 Logging in...");
    try {
        const instance = axios.create({ headers: COMMON_HEADERS, timeout: 15000, withCredentials:true });
        const r1 = await instance.get(`${BASE_URL}/login`);

        let tempCookie = "";
        if (r1.headers['set-cookie']) {
            const c = r1.headers['set-cookie'].find(x => x.includes('PHPSESSID'));
            if (c) tempCookie = c.split(';')[0];
        }

        const match = r1.data.match(/What is (\d+) \+ (\d+) = \?/);
        const ans = match ? parseInt(match[1])+parseInt(match[2]) : 0;

        const r2 = await instance.post(`${BASE_URL}/signin`, new URLSearchParams({
            username: CREDENTIALS.username,
            password: CREDENTIALS.password,
            capt: ans
        }), {
            headers: { "Content-Type": "application/x-www-form-urlencoded", "Cookie": tempCookie, "Referer": `${BASE_URL}/login` },
            maxRedirects:0,
            validateStatus:()=>true
        });

        // Save cookie
        if (r2.headers['set-cookie']) {
            const newC = r2.headers['set-cookie'].find(x => x.includes('PHPSESSID'));
            STATE.cookie = newC ? newC.split(';')[0] : tempCookie;
        } else {
            STATE.cookie = tempCookie;
        }

        // Get sesskey
        const r3 = await axios.get(STATS_PAGE_URL, { headers:{ ...COMMON_HEADERS, "Cookie": STATE.cookie, "Referer": `${BASE_URL}/client/SMSDashboard` } });
        const key = extractKey(r3.data);
        if (key) STATE.sessKey = key;

        console.log("✅ Login success. SessKey:", STATE.sessKey);

    } catch(e) {
        console.error("❌ Login failed:", e.message);
    } finally {
        STATE.isLoggingIn = false;
    }
}

// --- AUTO REFRESH LOGIN EVERY 2 MINUTES ---
setInterval(() => performLogin(), 120000);

// --- API ENDPOINT ---
app.get('/api', async (req,res)=>{
    const { type } = req.query;
    if (!STATE.cookie || !STATE.sessKey) {
        await performLogin();
        if (!STATE.sessKey) return res.status(500).json({ error:"Waiting for login..." });
    }

    const ts = Date.now();
    const today = getTodayDate();
    let targetUrl = "", referer="";

    if(type==='numbers') {
        referer = `${BASE_URL}/client/MySMSNumbers`;
        targetUrl = `${BASE_URL}/client/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iColumns=6&sColumns=%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=${ts}`;
    } else if(type==='sms') {
        referer = `${BASE_URL}/client/SMSCDRStats`;
        targetUrl = `${BASE_URL}/client/res/data_smscdr.php?fdate1=${today}%2000:00:00&fdate2=2099-12-31%2023:59:59&frange=&fnum=&fcli=&fgdate=&fgmonth=&fgrange=&fgnumber=&fgcli=&fg=0&sesskey=${STATE.sessKey}&sEcho=2&iColumns=7&sColumns=%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=5000&iSortCol_0=0&sSortDir_0=desc&iSortingCols=1&_=${ts}`;
    } else {
        return res.status(400).json({ error:"Invalid type. Use ?type=numbers or ?type=sms" });
    }

    try {
        const response = await axios.get(targetUrl, {
            headers: { ...COMMON_HEADERS, "Cookie": STATE.cookie, "Referer": referer }
        });

        // If HTML returned → sesskey expired
        if(typeof response.data === 'string' && (response.data.includes('<html') || response.data.includes('login'))) {
            console.log("⚠️ SessKey expired. Re-login...");
            STATE.cookie = null;
            STATE.sessKey = null;
            await performLogin();
            return res.status(503).send("Session refreshed. Try again.");
        }

        res.set('Content-Type','application/json');
        res.send(response.data);

    } catch(e) {
        // 403 or network error → retry login automatically
        if(e.response && e.response.status===403){
            console.log("⚠️ 403 detected → Retry login");
            STATE.cookie=null; STATE.sessKey=null;
            await performLogin();
            return res.redirect(req.originalUrl);
        }
        res.status(500).json({ error:e.message });
    }
});

// --- START SERVER ---
app.listen(PORT, async ()=>{
    console.log(`🚀 Server running on port ${PORT}`);
    await performLogin();
});
