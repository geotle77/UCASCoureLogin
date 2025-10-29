package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"LoginTest/auth"
	"LoginTest/models"
)

func main() {
	http.HandleFunc("/login", handleLogin)
	http.HandleFunc("/getTodayCourse", handleGetTodayCourse)

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

	// 目标登录 URL（来自 example.txt 第一行）
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
	// 固定 sessionId
	req.Header.Set("sessionId", "220B4BF64B92633F236393F811A8586A")
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

	// 透传状态码与响应体
	for k, vs := range resp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	if _, err := io.Copy(w, resp.Body); err != nil {
		log.Printf("write response error: %v", err)
	}
}

// handleGetTodayCourse 代理获取今日课程
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
	// 固定 sessionId
	req.Header.Set("sessionId", "220B4BF64B92633F236393F811A8586A")
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
