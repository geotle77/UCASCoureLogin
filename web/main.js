// ========================================
// Constants & Helper Functions
// ========================================
const LEGACY_SESSION_ID = '220B4BF64B92633F236393F811A8586A';
const DEFAULT_VERIFICATION_URL = 'http://iclass.ucas.edu.cn:88/ve/webservices/mobileCheck.shtml?method=mobileLogin&username=${0}&password=${1}&lx=${2}';
const SIGN_BASE_URL = 'https://iclass.ucas.edu.cn:8181';
const QR_BASE_URL = 'http://124.16.75.106:8081';

function jsArg(value) {
    return JSON.stringify(value === undefined || value === null ? '' : value);
}

function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^| )' + name + '=([^;]+)'));
    return m ? m[1] : null;
}

function pickTimeTableId(course) {
    if (!course) return '';
    return course.uuid || course.timeTableId || course.id || course.UUID || course.ID || '';
}

function pickRowId(course) {
    if (!course) {
        return `course-${Math.random().toString(36).slice(2)}`;
    }
    return course.uuid || course.id || course.timeTableId || `course-${Math.random().toString(36).slice(2)}`;
}

function showLoginForm() {
    document.getElementById("loginView").classList.add("active");
    document.getElementById("dashboardView").classList.remove("active");
}

function showCourseContainer() {
    document.getElementById("loginView").classList.remove("active");
    document.getElementById("dashboardView").classList.add("active");
    // Update date badge
    const d = new Date();
    document.getElementById("currentDate").textContent = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
// Toast Notification
// ========================================
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}

// ========================================
// Login & Logout
// ========================================
let currentUser = null;

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
        currentUser = data.user; // Store user info
        document.cookie = `user_id=${data.user.id}; path=/; max-age=86400`; // Set cookie for 1 day
        // Login successful, show course container
        showToast('登录成功', 'success');
        showCourseContainer();
        await fetchCourses(true);
    } catch (err) {
        showToast('登录失败或网络异常', 'error');
        msg.textContent = '登录失败，请检查账号密码';
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.classList.remove("button-loading");
    }
}

async function logout() {
    if (!confirm('确定要退出登录吗？')) return;

    try {
        await fetch('/logout', { method: 'POST' });
    } catch (e) {
        console.error('Logout error:', e);
    }
    currentUser = null; // Clear user info
    document.getElementById("courseMessage").textContent = "";
    document.getElementById("courseList").innerHTML = "";
    lastFetchTime = 0;
    showLoginForm();
    showToast('已退出登录', 'info');
}

// ========================================
// Page Load: Check Session
// ========================================
window.onload = async function() {
    try {
        const res = await fetch('/me', { method: 'GET' });
        if (res.ok) {
            const data = await res.json();
            currentUser = data.user; // Store user info
            document.cookie = `user_id=${data.user.id}; path=/; max-age=86400`; // Set cookie for 1 day
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
let timeDelta = 0;

async function fetchCourses(force = false) {
    const now = Date.now();
    if (!force && now - lastFetchTime < FETCH_COOLDOWN) return;
    lastFetchTime = now;

    const msg = document.getElementById('courseMessage');
    const list = document.getElementById('courseList');
    list.innerHTML = '';
    msg.textContent = '正在加载课程...';
    msg.style.color = 'var(--text-muted)';

    const dateStr = todayStr();

    try {
        const res = await fetch('/courses/today', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dateStr })
        });

        if (!res.ok) throw new Error('Failed to fetch courses');

        const data = await res.json();
        if (data.delta !== undefined) {
            timeDelta = data.delta;
        }
        const count = renderCourses(data.result || data.Result || []);
        if (count === 0) {
            msg.textContent = '今日暂无课程';
        } else {
            msg.textContent = '';
        }
    } catch (err) {
        msg.textContent = '拉取失败';
        msg.style.color = 'var(--error)';
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
    card.className = "course-card fade-in-up";
    const timeTableId = pickTimeTableId(course);
    
    const now = Date.now();
    const begin = new Date(course.classBeginTime).getTime();
    const end = new Date(course.classEndTime).getTime();

    let btnClass = "btn-sign";
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
        btnText = "未开始";
        disabled = true;
    } else if (now > end) {
        // Too late
        btnClass += " signed";
        btnText = "已结束";
        disabled = true;
    } else {
        canShowQR = !!timeTableId;
    }
    if (!timeTableId) {
        btnClass += " signed";
        btnText = "无编号";
        disabled = true;
    }

    const qrButton = canShowQR ? `
        <button
            onclick='showQRCode(${jsArg(timeTableId)}, ${jsArg(course.courseName)})'
            class="btn-qr"
            title="显示签到二维码"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><path d="M3 14h7v7H3z"></path></svg>
        </button>
    ` : "";

    card.innerHTML = `
        <div class="course-header-row">
            <div class="course-info">
                <div class="course-title">${course.courseName}</div>
                <div class="course-meta">
                    <div class="meta-item">
                        <svg class="meta-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        <span>${course.teacherName}</span>
                    </div>
                    <div class="meta-item">
                        <svg class="meta-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        <span>${course.classroomName}</span>
                    </div>
                    <div class="meta-item">
                        <svg class="meta-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        <span>${formatTime(course.classBeginTime)} - ${formatTime(course.classEndTime)}</span>
                    </div>
                </div>
            </div>
        </div>
        <div class="course-actions">
            ${qrButton}
            <button
                onclick='signCourse(${jsArg(timeTableId)})'
                class="${btnClass}"
                id="sign-btn-${timeTableId}"
                ${disabled ? "disabled" : ""}
            >
                ${btnText}
            </button>
        </div>
    `;

    return card;
}

// ========================================
// Sign Course
// ========================================
async function signCourse(timeTableId) {
    const btn = document.getElementById(`sign-btn-${timeTableId}`);

    if (btn) {
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = "签到中...";
    }

    try {
        // 添加随机偏移
        const timestamp = Date.now() + 1000 * timeDelta - Math.floor(2000 * Math.random() + 1000);
        const res = await fetch('/api/sign-in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeTableId, timestamp })
        });

        if (!res.ok) {
            throw new Error('Sign-in failed');
        }

        showToast('签到成功', 'success');
        // Refresh the course list after successful sign-in
        setTimeout(() => {
            fetchCourses(true);
        }, 1000);

    } catch (err) {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "签到";
        }
        showToast('签到失败，请重试', 'error');
        console.error("Error:", err);
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
    
    document.getElementById("qrcodeModal").classList.add("active");
    document.getElementById("qrcodeTitle").textContent = `${courseName}`;
    
    generateQRCode();
    startQRCodeRefresh();
}

function closeQRCode() {
    document.getElementById("qrcodeModal").classList.remove("active");

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
    if (!currentUser || !currentUser.id) {
        console.error('Cannot generate QR code without user ID');
        const canvas = document.getElementById("qrcodeCanvas");
        canvas.innerHTML = "<p style='color:var(--error)'>无法生成二维码，请重新登录。</p>";
        return;
    }

    const timestamp = Date.now() + 1000 * timeDelta - Math.floor(1700 * Math.random() + 300);
    const qrUrl = `${SIGN_BASE_URL}/app/course/stu_scan_sign.action?${new URLSearchParams({
        timeTableId: currentTimeTableId,
        timestamp: timestamp,
        id: currentUser.id
    }).toString()}`;

    const canvas = document.getElementById("qrcodeCanvas");
    canvas.innerHTML = "";
    try {
        qrCodeInstance = new QRCode(canvas, {
            text: qrUrl,
            width: 260,
            height: 260,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
        
        setTimeout(() => {
            if (!canvas.querySelector('img,canvas')) {
                canvas.innerHTML = `<a href="${qrUrl}" target="_blank" style="word-break:break-all; color:var(--primary)">${qrUrl}</a>`;
            }
        }, 0);
    } catch (e) {
        console.error('二维码生成失败', e);
        canvas.innerHTML = `<a href="${qrUrl}" target="_blank" style="word-break:break-all; color:var(--primary)">${qrUrl}</a>`;
    }
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
