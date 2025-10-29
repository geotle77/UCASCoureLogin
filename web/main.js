// ========================================
// Helper Functions
// ========================================
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
                verificationUrl: ''
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error('Login failed: ' + errText);
        }

        const data = await res.json();
        // Login successful, show course container
        showCourseContainer();
        await fetchCourses();
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
            await fetchCourses();
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

async function fetchCourses() {
    const now = Date.now();
    if (now - lastFetchTime < FETCH_COOLDOWN) return;
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
        renderCourses(data.result || data.Result || []);
        msg.textContent = '';
    } catch (err) {
        // Fallback to local data
        try {
            const local = await fetch(`/data/courses_${dateStr}.json`);
            const data = await local.json();
            renderCourses(data.result || data.Result || []);
            msg.textContent = '已从本地数据加载';
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
}

function createCourseCard(course) {
    const card = document.createElement("div");
    card.className = "course-card";

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
        canShowQR = now >= begin - 30*60*1000 && now <= end;
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
        canShowQR = true;
    }

    const qrButton = canShowQR ? `
        <button
            onclick="showQRCode('${course.uuid}', '${course.courseName}')"
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
                    onclick="signCourse('${course.uuid}')"
                    class="${btnClass}"
                    id="sign-btn-${course.uuid}"
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
async function signCourse(uuid) {
    const msg = document.getElementById("courseMessage");
    const btn = document.getElementById(`sign-btn-${uuid}`);

    if (btn) {
        btn.disabled = true;
        btn.classList.add("button-loading");
    }

    try {
        const res = await fetch('/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeTableId: uuid })
        });

        if (!res.ok) throw new Error('Sign failed');

        await fetchCourses();
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
let currentCourseUuid = null;
let currentCourseName = null;

function showQRCode(uuid, courseName) {
    currentCourseUuid = uuid;
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
    currentCourseUuid = null;
    currentCourseName = null;
}

function generateQRCode() {
    const timestamp = Date.now() - Math.floor(1700 * Math.random() + 300);
    const qrUrl = `http://124.16.75.106:8081/app/course/stu_scan_sign.action?${new URLSearchParams({
        timeTableId: currentCourseUuid,
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

function manualRefreshQRCode() {
    event.stopPropagation();

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
