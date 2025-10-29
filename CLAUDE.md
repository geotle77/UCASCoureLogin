# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

UCASCoureLogin 是一个基于Go语言开发的UCAS（中国科学院大学）课程登录和课程信息管理系统。该项目作为代理服务器，连接到UCAS的iclass平台，提供用户登录和课程查询功能。

## 技术栈

- **后端语言**: Go 1.21+
- **前端**: 纯HTML/CSS/JavaScript（无框架）
- **模块名**: LoginTest
- **依赖**: 无外部依赖库，仅使用Go标准库

### 新的会话与API规范（已实现）
- Cookie 会话：登录成功后服务端生成会话并通过 `Set-Cookie: sid=<token>; HttpOnly; SameSite=Lax` 下发，后续请求无需再次提交学号
- 关键端点：
  - `POST /login`：登录并建立会话，返回用户基础信息
  - `GET /me`：返回当前会话用户信息
  - `POST /courses/today`：根据会话与日期获取当日课表（JSON: `{ "dateStr": "YYYYMMDD" }`）
  - `POST /sign`：根据会话与 `timeTableId` 完成签到（JSON: `{ "timeTableId": "..." }`）

## 常用开发命令

### 运行服务
```bash
# 直接运行
go run server.go

# 编译后运行
go build && ./LoginTest

# 使用自定义端口
PORT=8080 go run server.go
```

### 项目结构
```
/data/Project/UCASCoureLogin/
├── auth/                    # 认证相关模块
│   └── login.go            # 登录参数和响应结构体定义
├── models/                  # 数据模型
│   └── course.go           # 课程相关数据结构定义
├── web/                    # 前端静态文件
│   ├── index.html          # 主页面（包含登录和课程显示界面）
│   ├── main.css            # 样式文件
│   └── main.js             # 前端JavaScript逻辑
├── server.go               # 主服务器文件
├── go.mod                  # Go模块配置
└── data/                   # 课程数据存储目录（运行时创建）
```

## 核心架构

### 1. 服务器入口 (server.go)
- **监听端口**: 8081（可通过PORT环境变量配置）
- **主要路由**:
  - `POST /login` - 登录并创建本地会话，返回用户信息
  - `GET /me` - 获取当前会话用户信息
  - `POST /courses/today` - 根据会话获取今日课程（可选参数：dateStr）
  - `POST /sign` - 根据会话完成课程签到（参数：timeTableId）
  - `POST /logout` - 注销当前会话
  - `POST /getTodayCourse` - 旧版课程查询接口（保留以兼容）
  - `GET /web/` - 静态文件服务
  - `GET /data/` - 数据文件服务

### 2. 会话管理设计
**核心思路**：服务端维护会话，客户端通过 HttpOnly Cookie 保持登录态

**会话存储** (server.go:35-40):
- `Session` 结构体包含：
  - `UID`: 用户ID（用于课程和签到API）
  - `UpstreamSessionID`: 上游UCAS API所需的sessionId
  - `User`: 完整用户信息
  - `ExpiresAt`: 会话过期时间（24小时TTL）
- 内存存储 `map[string]*Session`（开发环境），生产环境建议使用 Redis

**会话流程**:
1. 用户登录 → 后端调用上游API → 提取用户ID和sessionId → 生成本地token → 设置Cookie
2. 后续请求 → 读取Cookie中的token → 验证并获取会话 → 使用会话中的UID和sessionId调用上游API
3. 登出 → 清除服务端会话记录 → 过期Cookie

**安全特性**:
- Cookie 使用 `HttpOnly` 防止 XSS
- Cookie 使用 `SameSite=Lax` 防止 CSRF
- 会话token使用 crypto/rand 生成（32字节十六进制）
- 会话自动过期（24小时）
- 支持会话续期（touchSession）

### 3. 代理模式设计
项目作为代理服务器运行，主要工作流程：
1. 前端发送请求到本地服务器
2. 本地服务器从会话中提取用户信息
3. 使用会话中的UID和上游sessionId代理请求到UCAS API
4. 处理响应并保存数据到本地文件
5. 返回处理后的响应给前端

**优势**：
- 前端无需管理用户ID和sessionId
- 统一的错误处理和日志
- 本地数据缓存（data/目录）
- 支持离线查看历史课程数据

### 4. 数据流
- **登录**: 前端 → `POST /login` → UCAS登录API → 创建本地会话 → 返回用户信息 + 设置Cookie
- **获取课程**: 前端 → `POST /courses/today` → 验证会话 → UCAS课程API → 保存到data/ → 返回课程列表
- **签到**: 前端 → `POST /sign` → 验证会话 → UCAS签到API → 返回状态
- **注销**: 前端 → `POST /logout` → 清除会话 → 过期Cookie

## 关键配置

### UCAS API端点
- 登录API: `https://iclass.ucas.edu.cn:8181/app/user/login.action`
- 课程API: `https://iclass.ucas.edu.cn:8181/evaluation/course/getTodayCourse.action`

### 固定配置
- sessionId: "220B4BF64B92633F236393F811A8586A"（硬编码在代码中）
- 默认端口: 8081

## 开发注意事项

### 后端开发
- 会话管理使用内存存储，重启服务器会清空所有会话
- 生产环境建议使用 Redis 等持久化存储替代内存map
- 会话token生成使用 crypto/rand，保证安全性
- 所有需要登录的接口都应调用 getSession() 验证会话
- 上游sessionId可能为空，代码已做兼容处理（回退到legacySessionID）

### 前端开发
- 前端采用原生JavaScript，无框架依赖
- 支持响应式设计，包含移动端适配
- 二维码签到功能使用qrcode.js库（CDN引入）
- **核心交互流程**:
  1. 页面加载时调用 `GET /me` 检查登录态
  2. 未登录显示登录表单，已登录直接显示课程页面
  3. 登录成功后服务端自动设置Cookie，前端无需手动管理
  4. 所有API调用会自动携带Cookie，无需在请求中添加认证信息
  5. 点击退出登录调用 `POST /logout` 清除服务端会话

### 前端API使用示例
```javascript
// 登录
const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password, userLevel: '1', ... })
});

// 获取课程（会自动携带Cookie）
const res = await fetch('/courses/today', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateStr: '20250129' })
});

// 签到（会自动携带Cookie）
const res = await fetch('/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeTableId: 'xxx' })
});
```

### 数据模型
- `auth.LoginParams`: 登录请求参数
- `auth.LoginResponse`: 登录响应结构
- `auth.UserInfo`: 用户信息（保存在会话中）
- `models.CourseRecord`: 课程记录结构
- `models.TodayCoursesResponse`: 课程查询响应

### 错误处理
- 当前项目错误处理较为简单，建议增强
- 未登录访问需要认证的接口会返回 401 Unauthorized
- 前端应捕获 401 并跳转到登录页
- 建议添加更详细的日志记录和错误响应

## 部署和运维

### 环境要求
- Go 1.21+运行环境
- 无需外部数据库
- 需要访问UCAS API的网络连接

### 数据持久化
- 课程数据自动保存到 `data/courses_<日期>.json`
- 使用格式化JSON存储，便于调试
- 数据目录通过Git忽略（.gitignore中忽略data/）

### 安全考虑
- 当前硬编码sessionId存在安全风险
- 建议将敏感配置移至环境变量
- 考虑添加HTTPS支持
- 密码传输需要加强保护
- to memorize