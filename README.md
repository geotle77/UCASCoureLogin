# UCASCoureLogin

## 项目简介
UCASCoureLogin 是一个以 Go 实现的轻量级代理服务，用于对接中国科学院大学线上教学平台的登录、课程查询与签到接口，同时提供一个简易的 Web 前端便于本地调试。服务通过转发表单请求到官方接口并在本地维护会话，方便开发者测试移动端 API 或构建自己的自动化脚本。

## 目录结构
- `server.go`：HTTP 入口与路由注册，负责会话管理、上游请求代理以及静态资源托管。
- `auth/`：登录与课表请求的参数、响应结构体定义（`LoginParams`、`LoginResponse`、`TodayCourseParams` 等）。
- `models/`：课程与签到相关的数据模型（`CourseRecord` 等）。
- `web/`：内置的调试前端（`index.html`、`main.js`、`main.css`），可直接访问 `http://localhost:8081/web/`。

## 核心功能
- 代理登录：将学号、密码等字段转发到上游 `login.action` 接口，并在本地保存 `sessionId`。
- 会话管理：为客户端颁发 `sid` Cookie，内存中维护 24 小时 TTL，可随时扩展为 Redis 等外部存储。
- 课程查询：`/courses/today` 与 `/getTodayCourse` 返回今日课表，同时支持读取 `data/` 中的缓存文件以便离线演示。
- 签到转发：`/sign` 路由用于调度签到请求（可结合 `CourseRecord` 字段二次开发）。

## 快速开始
1. 安装 Go 1.21+。
2. 克隆仓库并进入 `UCASCoureLogin` 目录。
3. 运行 `go run ./server.go`（默认监听 `:8081`，可通过 `PORT=9090 go run .` 自定义端口）。
4. 浏览器访问 `http://localhost:8081/web/` 或使用 curl 调用 API：
   ```bash
   curl -X POST http://localhost:8081/login \
     -H 'Content-Type: application/json' \
     -d '{"phone":"13800000000","password":"demo","userLevel":"1"}'
   ```

## 常用开发命令
- `go build ./...`：快速编译并进行静态检查。
- `go test ./...`：执行所有单元测试；推荐按文件就近创建 `*_test.go`。
- `gofmt -w auth/*.go models/*.go server.go`：保持格式一致，提交前必须运行。

## API 概览
| 路径 | 方法 | 功能 |
| --- | --- | --- |
| `/login` | POST | 代理上游登录，返回用户信息并写入 `sid` Cookie |
| `/me` | GET | 返回当前会话中的 `auth.UserInfo` |
| `/courses/today` | GET | 从上游或本地缓存获取今日课程 |
| `/getTodayCourse` | GET | 与旧版客户端兼容的课表接口 |
| `/sign` | POST | 协助课程签到（需根据业务自定义请求体） |
| `/logout` | POST | 清理本地会话并删除 Cookie |

## 配置与安全提示
- 默认会向上游发送 `legacySessionID`（见 `server.go`）；若官方限制变动，请替换并记录来源。
- 勿在日志中打印明文密码、手机号或 `sessionId`；调试时可使用掩码。
