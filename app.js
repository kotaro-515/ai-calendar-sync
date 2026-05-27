// Configuration
let GEMINI_API_KEY = localStorage.getItem('GEMINI_API_KEY') || '';
let GOOGLE_CLIENT_ID = localStorage.getItem('GOOGLE_CLIENT_ID') || '';
let AUTO_ADD = localStorage.getItem('AUTO_ADD') === 'true';

// Google Auth State
let tokenClient;
let accessToken = null;

// DOM Elements
const authSection = document.getElementById('auth-section');
const uploadSection = document.getElementById('upload-section');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const resultContainer = document.getElementById('result-container');
const loader = document.getElementById('loader');
const authBtn = document.getElementById('auth-btn');
const addBtn = document.getElementById('add-btn');
const resetBtn = document.getElementById('reset-btn');

// Modal Elements
const settingsToggle = document.getElementById('settings-toggle');
const settingsModal = document.getElementById('settings-modal');
const closeModal = document.getElementById('close-modal');
const clientIdInput = document.getElementById('client-id-input');
const geminiKeyInput = document.getElementById('gemini-key-input');
const autoAddToggle = document.getElementById('auto-add-toggle');
const saveSettingsBtn = document.getElementById('save-settings-btn');

// Initialize UI State
clientIdInput.value = GOOGLE_CLIENT_ID;
geminiKeyInput.value = GEMINI_API_KEY;
autoAddToggle.checked = AUTO_ADD;

// Settings Modal Control
settingsToggle.addEventListener('click', () => settingsModal.style.display = 'flex');
closeModal.addEventListener('click', () => settingsModal.style.display = 'none');
window.addEventListener('click', (e) => { if (e.target == settingsModal) settingsModal.style.display = 'none'; });

// Initialize Google Identity Services
function initializeGis() {
    console.log('Initializing GIS...');
    if (typeof google === 'undefined' || !GOOGLE_CLIENT_ID) return;

    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/calendar.events',
            callback: (response) => {
                if (response.error !== undefined) {
                    alert('ログインエラー: ' + response.error);
                    return;
                }
                accessToken = response.access_token;
                showUploadSection();
            },
        });
    } catch (err) {
        console.error('GIS Init Error:', err);
    }
}

window.onload = () => setTimeout(initializeGis, 1000);

// Save Settings
saveSettingsBtn.addEventListener('click', () => {
    GOOGLE_CLIENT_ID = clientIdInput.value.trim();
    GEMINI_API_KEY = geminiKeyInput.value.trim();
    AUTO_ADD = autoAddToggle.checked;

    localStorage.setItem('GOOGLE_CLIENT_ID', GOOGLE_CLIENT_ID);
    localStorage.setItem('GEMINI_API_KEY', GEMINI_API_KEY);
    localStorage.setItem('AUTO_ADD', AUTO_ADD);

    alert('設定を保存しました。');
    settingsModal.style.display = 'none';
    initializeGis();
});

// Auth Logic
authBtn.addEventListener('click', () => {
    if (!GOOGLE_CLIENT_ID) {
        alert('右上の設定アイコンをクリックして、Google Client IDを入力してください。');
        settingsModal.style.display = 'flex';
        return;
    }
    if (!tokenClient) initializeGis();
    if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        alert('認証ライブラリの読み込みを待っています...');
    }
});

function showUploadSection() {
    authSection.style.display = 'none';
    uploadSection.style.display = 'block';
}

// Drag and Drop
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFile(e.target.files[0]); });

async function handleFile(file) {
    if (!file.type.startsWith('image/')) return alert('画像のみ対応しています。');
    if (!GEMINI_API_KEY) {
        alert('Gemini API Keyを設定してください。');
        settingsModal.style.display = 'flex';
        return;
    }

    uploadSection.style.display = 'none';
    loader.style.display = 'block';

    try {
        const base64Image = await fileToBase64(file);
        const eventData = await analyzeImageWithGemini(base64Image);
        fillResultForm(eventData);
        loader.style.display = 'none';

        if (AUTO_ADD) {
            await addToCalendar();
        } else {
            resultContainer.style.display = 'block';
        }
    } catch (err) {
        console.error(err);
        alert('エラーが発生しました。');
        loader.style.display = 'none';
        uploadSection.style.display = 'block';
    }
}

async function fileToBase64(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
    });
}

async function analyzeImageWithGemini(base64Image) {
    const prompt = `この画像から予定の情報を抽出し、以下のフォーマットでJSONのみ返して。
    {"title": "名", "start": "YYYY-MM-DDTHH:mm:SS", "end": "YYYY-MM-DDTHH:mm:SS", "location": "所", "description": "詳細"}
    年は2026、終了不明なら1時間後。`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: base64Image } }] }] })
    });

    const data = await res.json();
    const text = data.candidates[0].content.parts[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match[0]);
}

function fillResultForm(data) {
    document.getElementById('event-title').value = data.title || '';
    document.getElementById('event-start').value = data.start || '';
    document.getElementById('event-end').value = data.end || '';
    document.getElementById('event-location').value = data.location || '';
    document.getElementById('event-desc').value = data.description || '';
}

async function addToCalendar() {
    const event = {
        'summary': document.getElementById('event-title').value,
        'location': document.getElementById('event-location').value,
        'description': document.getElementById('event-desc').value,
        'start': { 'dateTime': new Date(document.getElementById('event-start').value).toISOString(), 'timeZone': 'Asia/Tokyo' },
        'end': { 'dateTime': new Date(document.getElementById('event-end').value).toISOString(), 'timeZone': 'Asia/Tokyo' }
    };

    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
    });

    if (res.ok) {
        alert('カレンダーに登録しました！');
        resetUI();
    } else {
        alert('カレンダー登録に失敗しました。');
    }
}

addBtn.addEventListener('click', addToCalendar);
resetBtn.addEventListener('click', resetUI);
function resetUI() { resultContainer.style.display = 'none'; uploadSection.style.display = 'block'; fileInput.value = ''; }
