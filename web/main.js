// ========================================
// Constants & Helper Functions
// ========================================
const LEGACY_SESSION_ID = '220B4BF64B92633F236393F811A8586A';
const DEFAULT_VERIFICATION_URL = 'http://iclass.ucas.edu.cn:88/ve/webservices/mobileCheck.shtml?method=mobileLogin&username=${0}&password=${1}&lx=${2}';
const SIGN_BASE_URL = 'https://iclass.ucas.edu.cn:8181';

function jsArg(value) {
    return JSON.stringify(value === undefined || value === null ? '' : value);
}

function pickTimeTableId(course) {
    if (!course) return '';
    return course.timeTableId || course.id || course.uuid || course.UUID || course.ID || '';
}

function pickRowId(course) {
    if (!course) {
        return `course-${Math.random().toString(36).slice(2)}`;
    }
    return course.uuid || course.id || course.timeTableId || `course-${Math.random().toString(36).slice(2)}`;
}

function showLoginForm() {
    document.getElementById("loginForm").style.display = "block";
    document.getElementById("courseContainer").style.display = "none";
}

function showCourseContainer() {
    document.getElementById("loginForm").style.display = "none";
    document.getElementById("courseContainer").style.display = "block";
}

function formatTime(timeStr) {
    return timeStr;
}

function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${dd}`;
}

// ========================================
// Login & Logout
// ========================================
async function login() {
    const phone = document.getElementById("student_id").value.trim();
    const password = document.getElementById("password").value.trim();
    const msg = document.getElementById("loginMessage");
    const btn = document.getElementById("loginButton");

    if (!phone) {
        msg.textContent = "请输入学号";
        return;
    }
    if (!password) {
        msg.textContent = "请输入密码";
        return;
    }

    msg.textContent = "";
    btn.disabled = true;
    btn.classList.add("button-loading");

    try {
        const res = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone,
                password,
                userLevel: '1',
                verificationType: '1',
                verificationUrl: DEFAULT_VERIFICATION_URL,
                sessionId: LEGACY_SESSION_ID
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error('Login failed: ' + errText);
        }

        const data = await res.json();
        // Login successful, show course container
        showCourseContainer();
        await fetchCourses(true);
    } catch (err) {
        msg.textContent = '登录失败或网络异常';
        msg.style.color = 'red';
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.classList.remove('button-loading');
    }
}

async function logout() {
    try {
        await fetch('/logout', { method: 'POST' });
    } catch (e) {
        console.error('Logout error:', e);
    }
    document.getElementById("courseMessage").textContent = "";
    document.getElementById("courseList").innerHTML = "";
    lastFetchTime = 0;
    showLoginForm();
}

// ========================================
// Page Load: Check Session
// ========================================
window.onload = async function() {
    try {
        const res = await fetch('/me', { method: 'GET' });
        if (res.ok) {
            const data = await res.json();
            showCourseContainer();
            await fetchCourses(true);
            return;
        }
    } catch (e) {
        console.error('Session check error:', e);
    }
    showLoginForm();
}

// ========================================
// Fetch Courses
// ========================================
let lastFetchTime = 0;
const FETCH_COOLDOWN = 1000;

async function fetchCourses(force = false) {
    const now = Date.now();
    if (!force && now - lastFetchTime < FETCH_COOLDOWN) return;
    lastFetchTime = now;

    const msg = document.getElementById('courseMessage');
    const list = document.getElementById('courseList');
    list.innerHTML = '';
    msg.textContent = '正在加载课程...';
    msg.style.color = '#666';

    const dateStr = todayStr();

    try {
        const res = await fetch('/courses/today', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dateStr })
        });

        if (!res.ok) throw new Error('Failed to fetch courses');

        const data = await res.json();
        const count = renderCourses(data.result || data.Result || []);
        if (count === 0) {
            msg.textContent = '今日暂无课程';
            msg.style.color = '#666';
        } else {
            msg.textContent = '';
        }
    } catch (err) {
        // Fallback to local data
        try {
            const local = await fetch(`/data/courses_${dateStr}.json`);
            const data = await local.json();
            const count = renderCourses(data.result || data.Result || []);
            msg.textContent = count === 0 ? '本地无课程数据' : '已从本地数据加载';
            msg.style.color = '#666';
        } catch (e2) {
            msg.textContent = '拉取失败';
            msg.style.color = 'red';
        }
    }
}

function renderCourses(arr) {
    const list = document.getElementById('courseList');
    list.innerHTML = '';
    arr.forEach(course => {
        const card = createCourseCard(course);
        list.appendChild(card);
    });
    return arr.length;
}

function createCourseCard(course) {
    const card = document.createElement("div");
    card.className = "course-card";
    const timeTableId = pickTimeTableId(course);
    const rowId = pickRowId(course);

    const now = Date.now();
    const begin = new Date(course.classBeginTime).getTime();
    const end = new Date(course.classEndTime).getTime();

    let btnClass = "sign-button";
    let btnText = "签到";
    let disabled = false;
    let canShowQR = false;

    if (String(course.signStatus) === "1") {
        // Already signed
        btnClass += " signed";
        btnText = "已签到";
        disabled = true;
        canShowQR = now >= begin - 30*60*1000 && now <= end && !!timeTableId;
    } else if (now < begin - 30*60*1000) {
        // Too early
        btnClass += " signed";
        btnText = "课程未开始";
        disabled = true;
    } else if (now > end) {
        // Too late
        btnClass += " signed";
        btnText = "课程已结束";
        disabled = true;
    } else {
        canShowQR = !!timeTableId;
    }

    if (!timeTableId) {
        btnClass += " signed";
        btnText = "缺少签到编号";
        disabled = true;
    }

    const qrButton = canShowQR ? `
        <button
            onclick='showQRCode(${jsArg(timeTableId)}, ${jsArg(course.courseName)})'
            class="qrcode-button"
            title="显示签到二维码"
            aria-label="显示签到二维码"
        ></button>
    ` : "";

    card.innerHTML = `
        <div class="course-header">
            <div class="course-info">
                <div class="course-name">${course.courseName}</div>
                <div class="course-details">
                    <div>教师: ${course.teacherName}</div>
                    <div>地点: ${course.classroomName}</div>
                    <div>时间: ${formatTime(course.classBeginTime)} - ${formatTime(course.classEndTime)}</div>
                </div>
            </div>
            <div class="course-buttons">
                ${qrButton}
                <button
                    onclick='signCourse(${jsArg(timeTableId)}, ${jsArg(rowId)})'
                    class="${btnClass}"
                    id="sign-btn-${rowId}"
                    ${disabled ? "disabled" : ""}
                >
                    ${btnText}
                </button>
            </div>
        </div>
    `;

    return card;
}

// ========================================
// Sign Course
// ========================================
async function signCourse(timeTableId, domId = timeTableId) {
    const msg = document.getElementById("courseMessage");
    const btn = document.getElementById(`sign-btn-${domId}`);

    if (btn) {
        btn.disabled = true;
        btn.classList.add("button-loading");
    }

    try {
        const res = await fetch('/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeTableId })
        });

        if (!res.ok) throw new Error('Sign failed');

        await fetchCourses(true);
    } catch (err) {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove("button-loading");
        }
        msg.textContent = '网络错误，请重试';
        msg.style.color = 'red';
        setTimeout(() => { msg.textContent = ''; }, 3000);
        console.error(err);
    }
}

// ========================================
// QR Code Functions
// ========================================
let qrCodeInstance = null;
let qrRefreshTimer = null;
let qrUpdateTimer = null;
let currentTimeTableId = null;
let currentCourseName = null;

function showQRCode(timeTableId, courseName) {
    if (!timeTableId) {
        console.warn('缺少 timeTableId，无法生成二维码');
        return;
    }
    currentTimeTableId = timeTableId;
    currentCourseName = courseName;
    document.getElementById("qrcodeOverlay").classList.add("active");
    document.getElementById("qrcodeContainer").classList.add("active");
    document.getElementById("qrcodeTitle").textContent = `${courseName} - 签到二维码`;
    generateQRCode();
    startQRCodeRefresh();
}

function closeQRCode() {
    document.getElementById("qrcodeOverlay").classList.remove("active");
    document.getElementById("qrcodeContainer").classList.remove("active");

    if (qrRefreshTimer) {
        clearTimeout(qrRefreshTimer);
        qrRefreshTimer = null;
    }
    if (qrUpdateTimer) {
        clearInterval(qrUpdateTimer);
        qrUpdateTimer = null;
    }

    document.getElementById("qrcodeCanvas").innerHTML = "";
    qrCodeInstance = null;
    currentTimeTableId = null;
    currentCourseName = null;
}

function generateQRCode() {
    if (!currentTimeTableId) return;
    const timestamp = Date.now() - Math.floor(1700 * Math.random() + 300);
    const qrUrl = `${SIGN_BASE_URL}/app/course/stu_scan_sign.action?${new URLSearchParams({
        timeTableId: currentTimeTableId,
        timestamp: timestamp
    }).toString()}`;

    const canvas = document.getElementById("qrcodeCanvas");
    canvas.innerHTML = "";
    qrCodeInstance = new QRCode(canvas, {
        text: qrUrl,
        width: 256,
        height: 256,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
}

function manualRefreshQRCode(ev) {
    if (ev) ev.stopPropagation();

    if (qrRefreshTimer) {
        clearTimeout(qrRefreshTimer);
        qrRefreshTimer = null;
    }
    if (qrUpdateTimer) {
        clearInterval(qrUpdateTimer);
        qrUpdateTimer = null;
    }

    generateQRCode();
    startQRCodeRefresh();
}

function startQRCodeRefresh() {
    const refreshTime = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes
    updateRefreshTimeDisplay(refreshTime);

    qrUpdateTimer = setInterval(() => {
        updateRefreshTimeDisplay(refreshTime);
    }, 1000);

    qrRefreshTimer = setTimeout(() => {
        generateQRCode();
        startQRCodeRefresh();
    }, 3 * 60 * 1000);
}

function updateRefreshTimeDisplay(refreshTime) {
    const remaining = refreshTime - Date.now();

    if (remaining <= 0) {
        document.getElementById("qrcodeRefreshInfo").textContent = "正在刷新...";
        return;
    }

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    document.getElementById("qrcodeRefreshInfo").textContent = `下次刷新时间: ${timeStr}`;
}
