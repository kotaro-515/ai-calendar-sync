// Configuration - 本来は環境変数などで管理すべきですが、デモのために入力可能にします
let GEMINI_API_KEY = '';
let GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'; // ユーザーが設定する必要があります

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

// Initialize Google Identity Services
window.onload = () => {
    // 実際にはユーザーが Client ID を入力できるようにするのが親切ですが、
    // ここでは初期化ロジックを準備しておきます。
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/calendar.events',
            callback: (response) => {
                if (response.error !== undefined) {
                    throw (response);
                }
                accessToken = response.access_token;
                showUploadSection();
            },
        });
    } catch (err) {
        console.error('GIS Error:', err);
    }
};

authBtn.addEventListener('click', () => {
    if (GOOGLE_CLIENT_ID.includes('YOUR_GOOGLE')) {
        const id = prompt('Google Cloud Consoleで作成した Client ID を入力してください:');
        if (!id) return;
        GOOGLE_CLIENT_ID = id;
        // 再初期化
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/calendar.events',
            callback: (response) => {
                accessToken = response.access_token;
                showUploadSection();
            },
        });
    }
    tokenClient.requestAccessToken({ prompt: 'consent' });
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
        const key = prompt('Gemini API Keyを入力してください（Google AI Studioで取得可能）:');
        if (!key) return;
        GEMINI_API_KEY = key;
    }

    // UI Feedback
    uploadSection.style.display = 'none';
    loader.style.display = 'block';

    try {
        const base64Image = await fileToBase64(file);
        const eventData = await analyzeImageWithGemini(base64Image);

        fillResultForm(eventData);
        loader.style.display = 'none';
        resultContainer.style.display = 'block';
    } catch (err) {
        console.error('Analysis Error:', err);
        alert('解析に失敗しました。APIキーまたはネットワークを確認してください。');
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
    日付は現在の年(2026年)として推測してください。もし終了時間が不明なら開始から1時間後をセットしてください。`;

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

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;
    // JSON部分のみを抽出
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

// Google Calendar API Integration
addBtn.addEventListener('click', async () => {
    const event = {
        'summary': document.getElementById('event-title').value,
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

    try {
        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
        });

        if (response.ok) {
            alert('カレンダーに追加されました！');
            resetUI();
        } else {
            throw new Error('Calendar API failed');
        }
    } catch (err) {
        console.error('Calendar Error:', err);
        alert('カレンダーへの追加に失敗しました。アクセスの許可を確認してください。');
    }
});

resetBtn.addEventListener('click', resetUI);

function resetUI() {
    resultContainer.style.display = 'none';
    uploadSection.style.display = 'block';
    fileInput.value = '';
}
