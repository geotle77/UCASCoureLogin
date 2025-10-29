function getCookie(e) {
    const t = document.cookie.match(new RegExp("(^| )" + e + "=([^;]+)"));
    return t ? t[2] : null
}
function deleteAllCookies() {
    const e = document.cookie.split(";");
    for (const t of e) {
        const e = t.indexOf("=")
          , n = e > -1 ? t.substr(0, e).trim() : t.trim();
        document.cookie = n + "=; Max-Age=-99999999; path=/"
    }
}
function showLoginForm() {
    document.getElementById("loginForm").style.display = "block",
    document.getElementById("courseContainer").style.display = "none"
}
function showCourseContainer() {
    document.getElementById("loginForm").style.display = "none",
    document.getElementById("courseContainer").style.display = "block"
}
async function login() {
    const e = document.getElementById("student_id").value
      , t = document.getElementById("password").value
      , n = document.getElementById("loginMessage")
      , o = document.getElementById("loginButton");
    if (!e || !e.trim())
        return void (n.textContent = "请输入学号");
    if (!t || !t.trim())
        return void (n.textContent = "请输入密码");
    n.textContent = "",
    o.disabled = !0,
    o.classList.add("button-loading");
    // 这里前端登录仅作为导航使用，真实登录已由后端 "/login" 提供
    try {
        // 直接进入课程容器，并加载当天课程（使用学号作为 userId）
        showCourseContainer();
        await fetchCourses();
    } catch (e) {
        n.textContent = "网络错误，请重试",
        n.style.color = "red",
        console.error("Error:", e)
    }
    o.disabled = !1,
    o.classList.remove("button-loading")
}
function logout() {
    deleteAllCookies(),
    document.getElementById("courseMessage").textContent = "",
    document.getElementById("courseList").innerHTML = "",
    showLoginForm()
}
window.onload = function() {
    getCookie("user_id") ? (showCourseContainer(),
    fetchCourses()) : showLoginForm()
}

let lastFetchTime = 0;
const FETCH_COOLDOWN = 1000;
function formatTime(e){ return e }
function todayStr(){ const d=new Date();const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const dd=String(d.getDate()).padStart(2,'0');return `${y}${m}${dd}`; }

async function fetchCourses() {
    const e = Date.now();
    if (e - lastFetchTime < FETCH_COOLDOWN) return;
    lastFetchTime = e;

    const msg = document.getElementById('courseMessage');
    const list = document.getElementById('courseList');
    list.innerHTML = '';
    msg.textContent = '正在加载课程...';
    msg.style.color = '#666';

    const userId = document.getElementById('student_id').value.trim();
    const dateStr = todayStr();

    try{
      const res = await fetch('/getTodayCourse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, dateStr })
      });
      const data = await res.json();
      renderCourses(data.result||[]);
      msg.textContent = '';
    }catch(err){
      try{
        const local = await fetch(`/data/courses_${dateStr}.json`);
        const data = await local.json();
        renderCourses(data.result||[]);
        msg.textContent = '已从本地数据加载';
        msg.style.color = '#666';
      }catch(e2){
        msg.textContent = '拉取失败';
        msg.style.color = 'red';
      }
    }
}

function renderCourses(arr){
  const list = document.getElementById('courseList');
  list.innerHTML = '';
  arr.forEach(e=>{
    const card = createCourseCard(e);
    list.appendChild(card);
  });
}

function createCourseCard(e) {
    const t = document.createElement("div");
    t.className = "course-card";
    const n = Date.now()
      , o = new Date(e.classBeginTime).getTime()
      , r = new Date(e.classEndTime).getTime();
    let s = "sign-button"
      , i = "签到"
      , a = !1
      , c = !1;
    "1" === e.signStatus ? (s += " signed",
    i = "已签到",
    a = !0,
    n >= o - 18e5 && n <= r && (c = !0)) : n < o - 18e5 ? (s += " signed",
    i = "课程未开始",
    a = !0) : n > r ? (s += " signed",
    i = "课程已结束",
    a = !0) : c = !0;
    const d = c ? `
        <button 
            onclick="showQRCode('${e.uuid}', '${e.courseName}')"
            class="qrcode-button"
            title="显示签到二维码"
            aria-label="显示签到二维码"
        >
        </button>
    ` : "";
    t.innerHTML = `
        <div class="course-header">
            <div class="course-info">
                <div class="course-name">${e.courseName}</div>
                <div class="course-details">
                    <div>教师: ${e.teacherName}</div>
                    <div>地点: ${e.classroomName}</div>
                    <div>时间: ${formatTime(e.classBeginTime)} - ${formatTime(e.classEndTime)}</div>
                </div>
            </div>
            <div class="course-buttons">
                ${d}
                <button 
                    onclick="signCourse('${e.uuid}')"
                    class="${s}"
                    id="sign-btn-${e.uuid}"
                    ${a ? "disabled" : ""}
                >
                    ${i}
                </button>
            </div>
        </div>
    `;
    return t
}

let qrCodeInstance = null
  , qrRefreshTimer = null
  , qrUpdateTimer = null
  , currentCourseUuid = null
  , currentCourseName = null;

function showQRCode(e, t) {
    currentCourseUuid = e,
    currentCourseName = t,
    document.getElementById("qrcodeOverlay").classList.add("active"),
    document.getElementById("qrcodeContainer").classList.add("active"),
    document.getElementById("qrcodeTitle").textContent = `${t} - 签到二维码`,
    generateQRCode(),
    startQRCodeRefresh()
}

function closeQRCode() {
    document.getElementById("qrcodeOverlay").classList.remove("active"),
    document.getElementById("qrcodeContainer").classList.remove("active"),
    qrRefreshTimer && (clearTimeout(qrRefreshTimer),
    qrRefreshTimer = null),
    qrUpdateTimer && (clearInterval(qrUpdateTimer),
    qrUpdateTimer = null),
    document.getElementById("qrcodeCanvas").innerHTML = "",
    qrCodeInstance = null,
    currentCourseUuid = null,
    currentCourseName = null
}

function generateQRCode() {
    const e = Date.now() - Math.floor(1700 * Math.random() + 300)
      , t = `http://124.16.75.106:8081/app/course/stu_scan_sign.action?${new URLSearchParams({
        timeTableId: currentCourseUuid,
        timestamp: e
    }).toString()}`
      , n = document.getElementById("qrcodeCanvas");
    n.innerHTML = "",
    qrCodeInstance = new QRCode(n,{
        text: t,
        width: 256,
        height: 256,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    })
}

function manualRefreshQRCode() {
    event.stopPropagation(),
    qrRefreshTimer && (clearTimeout(qrRefreshTimer),
    qrRefreshTimer = null),
    qrUpdateTimer && (clearInterval(qrUpdateTimer),
    qrUpdateTimer = null),
    generateQRCode(),
    startQRCodeRefresh()
}

function startQRCodeRefresh() {
    const e = new Date(Date.now() + 18e4);
    updateRefreshTimeDisplay(e),
    qrUpdateTimer = setInterval( () => {
        updateRefreshTimeDisplay(e)
    }
    , 1e3),
    qrRefreshTimer = setTimeout( () => {
        generateQRCode(),
        startQRCodeRefresh()
    }
    , 18e4)
}

function updateRefreshTimeDisplay(e) {
    const t = e - Date.now();
    if (t <= 0)
        return void (document.getElementById("qrcodeRefreshInfo").textContent = "正在刷新...");
    const n = Math.floor(t / 6e4)
      , o = Math.floor(t % 6e4 / 1e3)
      , r = `${String(n).padStart(2, "0")}:${String(o).padStart(2, "0")}`;
    document.getElementById("qrcodeRefreshInfo").textContent = `下次刷新时间: ${r}`
}

async function signCourse(e) {
    const t = document.getElementById("userId").value.trim()
      , n = document.getElementById("courseMessage")
      , o = document.getElementById(`sign-btn-${e}`);
    o && (o.disabled = !0,
    o.classList.add("button-loading"));
    const r = `https://iclass.ucas.edu.cn:8181/app/course/stu_scan_sign.action?timeTableId=${e}&timestamp=${Date.now() - Math.floor(1700 * Math.random() + 300)}&id=${t}`;
    try {
        await fetch(r, { method: "GET", mode: "no-cors", referrerPolicy: "no-referrer", headers: { "Content-Type": "application/x-www-form-urlencoded" } })
        await fetchCourses()
    } catch (e) {
        o && (o.disabled = !1,
        o.classList.remove("button-loading")),
        n.textContent = "网络错误，请重试",
        n.style.color = "red",
        setTimeout( () => { n.textContent = "" }, 3e3),
        console.error("Error:", e)
    }
}


