package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"LoginTest/auth"
	"LoginTest/models"
)

// ------------------------------
// In-memory session store
// ------------------------------
// Session keeps minimal state for a logged-in user.
// We store:
// - UID: user id returned from upstream (used for course/sign APIs)
// - UpstreamSessionID: session token required by upstream in header "sessionId"
// - User: full user info to return from /me
// - ExpiresAt: simple TTL expiration to avoid unbounded growth
// NOTE: This is a simple in-memory store suitable for demo/dev.
// In production, use a persistent store (Redis) and secure cookies.

type Session struct {
	UID               string
	UpstreamSessionID string
	User              auth.UserInfo
	ExpiresAt         time.Time
}

var (
	sessions   = map[string]*Session{}
	sessionsMu sync.RWMutex
)

const (
	// Fallback hardcoded session id (legacy behavior). Will be used only if upstream did not return one.
	legacySessionID = "220B4BF64B92633F236393F811A8586A"
	// Default values required by upstream login API
	defaultUserLevel        = "1"
	defaultVerificationType = "1"
	defaultVerificationURL  = "http://iclass.ucas.edu.cn:88/ve/webservices/mobileCheck.shtml?method=mobileLogin&username=${0}&password=${1}&lx=${2}"
	// Cookie name for our session id
	cookieName = "sid"
	// Session TTL
	sessionTTL = 24 * time.Hour
)

// genToken generates a cryptographically-secure random session token.
func genToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// setSessionCookie writes the sid cookie to client.
func setSessionCookie(w http.ResponseWriter, sid string) {
	cookie := &http.Cookie{
		Name:     cookieName,
		Value:    sid,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(sessionTTL),
	}
	http.SetCookie(w, cookie)
}

// getSession returns active session from request cookie and cleans expired ones.
func getSession(r *http.Request) (*Session, string, bool) {
	c, err := r.Cookie(cookieName)
	if err != nil || c.Value == "" {
		return nil, "", false
	}
	sid := c.Value
	sessionsMu.RLock()
	sess, ok := sessions[sid]
	sessionsMu.RUnlock()
	if !ok {
		return nil, "", false
	}
	if time.Now().After(sess.ExpiresAt) {
		sessionsMu.Lock()
		delete(sessions, sid)
		sessionsMu.Unlock()
		return nil, "", false
	}
	return sess, sid, true
}

// touchSession extends session expiration.
func touchSession(sid string) {
	sessionsMu.Lock()
	if sess, ok := sessions[sid]; ok {
		sess.ExpiresAt = time.Now().Add(sessionTTL)
	}
	sessionsMu.Unlock()
}

func main() {
	http.HandleFunc("/login", handleLogin)
	http.HandleFunc("/me", handleMe)
	http.HandleFunc("/courses/today", handleCoursesToday)
	http.HandleFunc("/get_courses", handleGetCourses)
	http.HandleFunc("/api/sign-in", handleSignIn)

	// Backward-compatible legacy endpoint
	http.HandleFunc("/getTodayCourse", handleGetTodayCourse)
	http.HandleFunc("/logout", handleLogout)

	// 提供静态文件：/web 与 /data
	http.Handle("/web/", http.StripPrefix("/web/", http.FileServer(http.Dir("web"))))
	http.Handle("/data/", http.StripPrefix("/data/", http.FileServer(http.Dir("data"))))
	http.HandleFunc("/web/main.css", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "web/main.css")
	})

	addr := ":8081"
	if fromEnv := os.Getenv("PORT"); fromEnv != "" {
		addr = ":" + fromEnv
	}
	log.Printf("listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

// handleSignIn proxies the sign-in request to the upstream service.
// Request: JSON { timeTableId: "...", timestamp: optional number }
func handleSignIn(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sess, sid, ok := getSession(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	touchSession(sid)

	var body struct {
		TimeTableID string `json:"timeTableId"`
		Timestamp   int64  `json:"timestamp"` // 添加 timestamp
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}
	timeTableID := strings.TrimSpace(body.TimeTableID)
	if timeTableID == "" {
		http.Error(w, "timeTableId is required", http.StatusBadRequest)
		return
	}

	// 使用提供的 timestamp，如果没有则生成毫秒级
	timestamp := body.Timestamp
	if timestamp == 0 {
		timestamp = time.Now().UnixMilli()
	}

	// Construct the upstream URL
	target, _ := url.Parse("https://iclass.ucas.edu.cn:8181/app/course/stu_scan_sign.action")
	q := target.Query()
	q.Set("id", sess.UID)
	q.Set("timeTableId", timeTableID)
	q.Set("timestamp", fmt.Sprintf("%d", timestamp))
	target.RawQuery = q.Encode()

	req, err := http.NewRequest(http.MethodGet, target.String(), nil)
	if err != nil {
		http.Error(w, "build request failed", http.StatusInternalServerError)
		return
	}

	// Set headers similar to refs
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari MicroMessenger")
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Referer", "https://servicewechat.com/wxdd3bd7d4acf54723/56/page-frame.html")
	req.Header.Set("sessionId", sess.UpstreamSessionID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Proxy headers
	for k, vs := range resp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)

	// Proxy body
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("error reading upstream response body: %v", err)
		http.Error(w, "read upstream failed", http.StatusBadGateway)
		return
	}

	// Log the upstream response for debugging
	log.Printf("Upstream sign-in response for timeTableId %s: %s", timeTableID, string(bodyBytes))

	w.Write(bodyBytes)
}

// handleLogin proxies login to upstream, creates a local session, and returns basic user info.
// Request: JSON { phone, password, userLevel, verificationType, verificationUrl }
// Response: 200 JSON { user: auth.UserInfo }
func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var params auth.LoginParams
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}
	params.Phone = strings.TrimSpace(params.Phone)
	params.Password = strings.TrimSpace(params.Password)
	params.UserLevel = strings.TrimSpace(params.UserLevel)
	params.VerificationType = strings.TrimSpace(params.VerificationType)
	params.VerificationURL = strings.TrimSpace(params.VerificationURL)
	if params.Phone == "" || params.Password == "" {
		http.Error(w, "phone and password required", http.StatusBadRequest)
		return
	}
	if params.UserLevel == "" {
		params.UserLevel = defaultUserLevel
	}
	if params.VerificationType == "" {
		params.VerificationType = defaultVerificationType
	}
	if params.VerificationURL == "" {
		params.VerificationURL = defaultVerificationURL
	}
	sessionHeader := strings.TrimSpace(params.SessionID)
	if sessionHeader == "" {
		sessionHeader = legacySessionID
	}

	target := "https://iclass.ucas.edu.cn:8181/app/user/login.action"

	form := url.Values{}
	form.Set("phone", params.Phone)
	form.Set("password", params.Password)
	form.Set("userLevel", params.UserLevel)
	form.Set("verificationType", params.VerificationType)
	form.Set("verificationUrl", params.VerificationURL)

	req, err := http.NewRequest(http.MethodPost, target, bytes.NewBufferString(form.Encode()))
	if err != nil {
		http.Error(w, "build request failed", http.StatusInternalServerError)
		return
	}

	// 按示例设置请求头
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("sessionId", sessionHeader)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari MicroMessenger")
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Referer", "https://servicewechat.com/wxdd3bd7d4acf54723/56/page-frame.html")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "read upstream failed", http.StatusBadGateway)
		return
	}

	// 解析上游响应
	var loginResp auth.LoginResponse
	if err := json.Unmarshal(bodyBytes, &loginResp); err != nil {
		// 登录响应不是预期结构，透传原始响应
		for k, vs := range resp.Header {
			for _, v := range vs {
				w.Header().Add(k, v)
			}
		}
		w.WriteHeader(resp.StatusCode)
		_, _ = w.Write(bodyBytes)
		return
	}

	// 从响应中提取用户与上游会话ID
	uid := strings.TrimSpace(loginResp.Result.ID)
	upSess := strings.TrimSpace(loginResp.Result.SessionID)
	if uid == "" {
		http.Error(w, "login failed: empty user id", http.StatusBadGateway)
		return
	}
	if upSess == "" {
		// 某些环境可能不回传 sessionId，则回退到 legacy（不推荐，仅为兼容）
		upSess = legacySessionID
	}

	// 创建本地会话
	sid, err := genToken()
	if err != nil {
		http.Error(w, "create session failed", http.StatusInternalServerError)
		return
	}
	sessionsMu.Lock()
	sessions[sid] = &Session{
		UID:               uid,
		UpstreamSessionID: upSess,
		User:              loginResp.Result,
		ExpiresAt:         time.Now().Add(sessionTTL),
	}
	sessionsMu.Unlock()

	// 设置 Cookie 并返回用户信息
	setSessionCookie(w, sid)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"user": loginResp.Result,
	})
}

// handleMe returns current user info for active session.
func handleMe(w http.ResponseWriter, r *http.Request) {
	sess, sid, ok := getSession(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	// 延长会话有效期
	touchSession(sid)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"user": sess.User,
	})
}

// handleCoursesToday gets today's courses by session and date.
// Request: JSON { dateStr: "YYYYMMDD" } (dateStr optional -> defaults to today)
func handleCoursesToday(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	sess, sid, ok := getSession(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	touchSession(sid)
	var body struct {
		DateStr string `json:"dateStr"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	dateStr := strings.TrimSpace(body.DateStr)
	if dateStr == "" {
		dateStr = time.Now().Format("20060102")
	}
	if len(dateStr) != 8 {
		http.Error(w, "invalid date format", http.StatusBadRequest)
		return
	}
	if _, err := time.Parse("20060102", dateStr); err != nil {
		http.Error(w, "invalid date value", http.StatusBadRequest)
		return
	}

	target := "https://iclass.ucas.edu.cn:8181/app/course/get_stu_course_sched.action"
	form := url.Values{}
	form.Set("id", sess.UID)
	form.Set("dateStr", dateStr)

	req, err := http.NewRequest(http.MethodPost, target, bytes.NewBufferString(form.Encode()))
	if err != nil {
		http.Error(w, "build request failed", http.StatusInternalServerError)
		return
	}
	upSess := sess.UpstreamSessionID
	if upSess == "" {
		upSess = legacySessionID
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("sessionId", upSess)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari MicroMessenger")
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Referer", "https://servicewechat.com/wxdd3bd7d4acf54723/56/page-frame.html")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Calculate delta from upstream Date header
	var delta int64
	if dateHeader := resp.Header.Get("Date"); dateHeader != "" {
		if upstreamTime, err := http.ParseTime(dateHeader); err == nil {
			delta = upstreamTime.Unix() - time.Now().Unix()
		}
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "read upstream failed", http.StatusBadGateway)
		return
	}

	// 尝试解析为结构体
	var today models.TodayCoursesResponse
	if err := json.Unmarshal(bodyBytes, &today); err != nil {
		// 解析失败则透传原始
		for k, vs := range resp.Header {
			for _, v := range vs {
				w.Header().Add(k, v)
			}
		}
		w.WriteHeader(resp.StatusCode)
		_, _ = w.Write(bodyBytes)
		return
	}

	// 添加 delta 到响应
	response := map[string]any{
		"result": today.Result,
		"delta":  delta,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_ = json.NewEncoder(w).Encode(response)
}

// handleGetCourses 兼容旧版前端：GET /get_courses
// 响应格式：{ STATUS:"0"|"2", delta:int, result:[...] }
func handleGetCourses(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	sess, sid, ok := getSession(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	touchSession(sid)
	dateStr := strings.TrimSpace(r.URL.Query().Get("dateStr"))
	if dateStr == "" {
		dateStr = time.Now().Format("20060102")
	}
	_, statusCode, today, delta, err := fetchCourses(sess, dateStr)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	payload := map[string]any{
		"STATUS": "0",
		"delta":  delta,
		"result": today.Result,
	}
	if len(today.Result) == 0 {
		payload["STATUS"] = "2"
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

// fetchCourses 调用上游接口并返回格式化后的 JSON 字节、状态码、结构体和时间差
func fetchCourses(sess *Session, dateStr string) ([]byte, int, models.TodayCoursesResponse, int64, error) {
	target := "https://iclass.ucas.edu.cn:8181/app/course/get_stu_course_sched.action"
	// Cache-busting parameter
	target = fmt.Sprintf("%s?_cb=%d", target, time.Now().UnixMilli())

	form := url.Values{}
	form.Set("id", sess.UID)
	form.Set("dateStr", dateStr)

	req, err := http.NewRequest(http.MethodPost, target, bytes.NewBufferString(form.Encode()))
	if err != nil {
		return nil, http.StatusInternalServerError, models.TodayCoursesResponse{}, 0, fmt.Errorf("build request failed")
	}
	upSess := sess.UpstreamSessionID
	if upSess == "" {
		upSess = legacySessionID
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("sessionId", upSess)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari MicroMessenger")
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Referer", "https://servicewechat.com/wxdd3bd7d4acf54723/56/page-frame.html")

	myTime := time.Now()
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, http.StatusBadGateway, models.TodayCoursesResponse{}, 0, fmt.Errorf("upstream request failed")
	}
	defer resp.Body.Close()

	// Calculate time delta
	var delta int64
	if dateHeader := resp.Header.Get("Date"); dateHeader != "" {
		if upstreamTime, err := http.ParseTime(dateHeader); err == nil {
			delta = upstreamTime.Unix() - myTime.Unix()
		}
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, http.StatusBadGateway, models.TodayCoursesResponse{}, 0, fmt.Errorf("read upstream failed")
	}

	var today models.TodayCoursesResponse
	if err := json.Unmarshal(bodyBytes, &today); err != nil {
		return bodyBytes, resp.StatusCode, today, delta, nil
	}

	if err := os.MkdirAll("data", 0755); err != nil {
		log.Printf("mkdir data failed: %v", err)
	}
	filePath := filepath.Join("data", "courses_"+dateStr+".json")
	pretty, _ := json.MarshalIndent(today, "", "  ")
	if err := os.WriteFile(filePath, pretty, 0644); err != nil {
		log.Printf("write file failed: %v", err)
	}

	return pretty, resp.StatusCode, today, delta, nil
}

// handleLogout clears current session cookie and memory record.
func handleLogout(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie(cookieName)
	if err == nil {
		sessionsMu.Lock()
		delete(sessions, c.Value)
		sessionsMu.Unlock()
		// expire cookie
		http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", Expires: time.Unix(0, 0), MaxAge: -1})
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------------------------------
// Legacy endpoint kept for backward
// ---------------------------------
// handleGetTodayCourse 代理获取今日课程（旧接口，仍保留以兼容旧前端）
func handleGetTodayCourse(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var params auth.TodayCourseParams
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	target := "https://iclass.ucas.edu.cn:8181/app/course/get_stu_course_sched.action"

	form := url.Values{}
	form.Set("id", params.ID)
	form.Set("dateStr", params.DateStr)

	req, err := http.NewRequest(http.MethodPost, target, bytes.NewBufferString(form.Encode()))
	if err != nil {
		http.Error(w, "build request failed", http.StatusInternalServerError)
		return
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	// 固定 sessionId（旧逻辑）
	req.Header.Set("sessionId", legacySessionID)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari MicroMessenger")
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Referer", "https://servicewechat.com/wxdd3bd7d4acf54723/56/page-frame.html")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// 读取上游响应
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "read upstream failed", http.StatusBadGateway)
		return
	}

	// 尝试解析为结构体
	var today models.TodayCoursesResponse
	if err := json.Unmarshal(bodyBytes, &today); err != nil {
		// 解析失败则透传原始
		for k, vs := range resp.Header {
			for _, v := range vs {
				w.Header().Add(k, v)
			}
		}
		w.WriteHeader(resp.StatusCode)
		if _, copyErr := w.Write(bodyBytes); copyErr != nil {
			log.Printf("write raw response error: %v", copyErr)
		}
		return
	}

	// 保存到本地 data/courses_<dateStr>.json
	dateStr := params.DateStr
	if dateStr == "" {
		dateStr = time.Now().Format("20060102")
	}
	if err := os.MkdirAll("data", 0755); err != nil {
		log.Printf("mkdir data failed: %v", err)
	}
	filePath := filepath.Join("data", "courses_"+dateStr+".json")
	pretty, _ := json.MarshalIndent(today, "", "  ")
	if err := os.WriteFile(filePath, pretty, 0644); err != nil {
		log.Printf("write file failed: %v", err)
	}

	// 返回规范化 JSON
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	if _, err := w.Write(pretty); err != nil {
		log.Printf("write normalized response error: %v", err)
	}
}
