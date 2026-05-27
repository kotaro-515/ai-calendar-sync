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

// Settings Elements
const clientIdInput = document.getElementById('client-id-input');
const geminiKeyInput = document.getElementById('gemini-key-input');
const autoAddToggle = document.getElementById('auto-add-toggle');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsDetails = document.getElementById('settings-details');

// Initialize Settings UI
clientIdInput.value = GOOGLE_CLIENT_ID;
geminiKeyInput.value = GEMINI_API_KEY;
autoAddToggle.checked = AUTO_ADD;

if (GOOGLE_CLIENT_ID && GEMINI_API_KEY) {
    settingsDetails.removeAttribute('open');
} else {
    settingsDetails.setAttribute('open', '');
}

// Initialize Google Identity Services
function initializeGis() {
    console.log('Initializing GIS...');
    if (typeof google === 'undefined') {
        console.warn('Google script not yet loaded.');
        return;
    }
    if (!GOOGLE_CLIENT_ID) {
        console.log('No Client ID found. Skipping GIS initialization.');
        return;
    }

    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/calendar.events',
            callback: (response) => {
                console.log('GIS Callback:', response);
                if (response.error !== undefined) {
                    alert('ログインエラー: ' + response.error);
                    return;
                }
                accessToken = response.access_token;
                showUploadSection();
            },
        });
        console.log('GIS initialized.');
    } catch (err) {
        console.error('GIS Init Error:', err);
    }
}

window.onload = () => {
    setTimeout(initializeGis, 1000);
};

// Settings Save Logic
saveSettingsBtn.addEventListener('click', () => {
    GOOGLE_CLIENT_ID = clientIdInput.value.trim();
    GEMINI_API_KEY = geminiKeyInput.value.trim();
    AUTO_ADD = autoAddToggle.checked;

    localStorage.setItem('GOOGLE_CLIENT_ID', GOOGLE_CLIENT_ID);
    localStorage.setItem('GEMINI_API_KEY', GEMINI_API_KEY);
    localStorage.setItem('AUTO_ADD', AUTO_ADD);

    alert('設定を保存しました。');
    initializeGis();
});

// Auth Logic
authBtn.addEventListener('click', () => {
    if (!GOOGLE_CLIENT_ID) {
        alert('先に「API設定」でGoogle Client IDを入力して保存してください。');
        settingsDetails.setAttribute('open', '');
        return;
    }

    if (!tokenClient) {
        initializeGis();
    }

    if (tokenClient) {
        console.log('Requesting access token...');
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        alert('Googleの認証ライブラリを読み込み中です。数秒待ってからやり直してください。');
    }
});

function showUploadSection() {
    authSection.style.display = 'none';
    uploadSection.style.display = 'block';
}

// Drag and Drop Logic
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
});

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
});

async function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('画像ファイルを選択してください。');
        return;
    }

    if (!GEMINI_API_KEY) {
        alert('API設定でGemini API Keyを入力してください。');
        settingsDetails.setAttribute('open', '');
        return;
    }

    // UI Feedback
    uploadSection.style.display = 'none';
    loader.style.display = 'block';

    try {
        const base64Image = await fileToBase64(file);
        const eventData = await analyzeImageWithGemini(base64Image);

        fillResultForm(eventData);
        loader.style.display = 'none';

        if (AUTO_ADD) {
            console.log('Auto-adding event to calendar...');
            await addToCalendar();
        } else {
            resultContainer.style.display = 'block';
        }
    } catch (err) {
        console.error('Process Error:', err);
        alert('エラーが発生しました: ' + err.message);
        loader.style.display = 'none';
        uploadSection.style.display = 'block';
    }
}

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

async function analyzeImageWithGemini(base64Image) {
    const prompt = `この画像から予定（イベント）の情報を抽出してください。
    以下のJSON形式でのみ回答してください。
    {
        "title": "イベント名",
        "start": "YYYY-MM-DDTHH:mm:SS",
        "end": "YYYY-MM-DDTHH:mm:SS",
        "location": "場所",
        "description": "詳細説明"
    }
    日付は2026年として推測してください。終了時間が不明なら開始から1時間後。`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: "image/jpeg", data: base64Image } }
                ]
            }]
        })
    });

    if (!response.ok) throw new Error('Gemini API call failed');
    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch[0]);
}

function fillResultForm(data) {
    document.getElementById('event-title').value = data.title || '';
    document.getElementById('event-start').value = data.start || '';
    document.getElementById('event-end').value = data.end || '';
    document.getElementById('event-location').value = data.location || '';
    document.getElementById('event-desc').value = data.description || '';
}

async function addToCalendar() {
    const title = document.getElementById('event-title').value;
    const event = {
        'summary': title,
        'location': document.getElementById('event-location').value,
        'description': document.getElementById('event-desc').value,
        'start': {
            'dateTime': new Date(document.getElementById('event-start').value).toISOString(),
            'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        'end': {
            'dateTime': new Date(document.getElementById('event-end').value).toISOString(),
            'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone
        }
    };

    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
    });

    if (response.ok) {
        alert(`カレンダーに登録しました: ${title}`);
        resetUI();
    } else {
        const errorData = await response.json();
        console.error('Calendar API Error:', errorData);
        alert('カレンダーへの登録に失敗しました。');
        resultContainer.style.display = 'block';
    }
}

addBtn.addEventListener('click', addToCalendar);
resetBtn.addEventListener('click', resetUI);

function resetUI() {
    resultContainer.style.display = 'none';
    uploadSection.style.display = 'block';
    fileInput.value = '';
}
