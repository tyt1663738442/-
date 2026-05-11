# 🚀 在线部署指南

## 方式一：Render（推荐，最简单）

### 步骤

1. **Fork/上传代码到 GitHub**
   ```bash
   # 在 GitHub 创建新仓库，然后推送代码
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/你的用户名/a-stock-monitor.git
   git push -u origin main
   ```

2. **登录 Render**
   - 访问 https://render.com
   - 用 GitHub 账号登录

3. **一键部署**
   - 点击 **"New +"** → **"Blueprint"**
   - 选择你的 GitHub 仓库
   - Render 会自动读取 `render.yaml` 配置
   - 点击 **"Apply"**

4. **等待部署完成**
   - 大约 3-5 分钟
   - 会自动分配域名，如 `https://a-stock-monitor-xxx.onrender.com`

---

## 方式二：Railway

### 步骤

1. **登录 Railway**
   - 访问 https://railway.app
   - 用 GitHub 账号登录

2. **新建项目**
   - 点击 **"New Project"**
   - 选择 **"Deploy from GitHub repo"**
   - 选择你的仓库

3. **自动部署**
   - Railway 会读取 `railway.json`
   - 自动构建并部署

---

## 方式三：Fly.io（国内访问快）

### 步骤

1. **安装 flyctl**
   ```bash
   # Mac/Linux
curl -L https://fly.io/install.sh | sh

   # Windows (PowerShell)
   iwr https://fly.io/install.ps1 -useb | iex
   ```

2. **登录并部署**
   ```bash
   # 登录
   flyctl auth login
   
   # 进入项目目录
   cd a-stock-monitor
   
   # 创建应用（会自动读取 fly.toml）
   flyctl launch
   
   # 部署
   flyctl deploy
   ```

3. **查看网站**
   ```bash
   flyctl open
   ```

---

## 方式四：VPS/云服务器（如果你有）

### 使用 Docker 部署

```bash
# 1. 安装 Docker
# https://docs.docker.com/get-docker/

# 2. 构建镜像
cd a-stock-monitor
docker build -t a-stock-monitor .

# 3. 运行容器
docker run -d -p 8080:8080 --name stock-monitor a-stock-monitor

# 4. 访问
# http://你的服务器IP:8080
```

### 使用 Nginx 反向代理（推荐生产环境）

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 📊 各平台对比

| 平台 | 免费额度 | 国内访问 | 自定义域名 | 难度 |
|------|---------|---------|-----------|------|
| Render | 每月 750 小时 | 较慢 | 支持 | ⭐ 简单 |
| Railway | $5/月信用额度 | 一般 | 支持 | ⭐ 简单 |
| Fly.io | 每月 $5 额度 | 快（新加坡节点） | 支持 | ⭐⭐ 中等 |
| Vercel | 仅前端 | 快 | 支持 | ⭐ 简单 |

---

## ⚠️ 注意事项

1. **免费额度限制**
   - Render：15 分钟无访问会自动休眠，首次访问需等待启动（约 30 秒）
   - Railway：每月 $5 额度，足够个人使用
   - Fly.io：每月 $5 额度，超出后按量付费

2. **数据更新**
   - 使用 Mock 数据时，数据是模拟的
   - 如需真实数据，需配置 AKShare，但部分平台可能无法访问国内数据源

3. **WebSocket 支持**
   - 所有平台都支持 WebSocket
   - 如果用了 CDN/代理，确保支持 WebSocket

---

## 🆘 常见问题

### 部署失败怎么办？

1. **检查日志**
   - Render: Dashboard → Service → Logs
   - Railway: 项目页面 → Deployments → Logs
   - Fly.io: `flyctl logs`

2. **常见错误**
   - **端口问题**：确保使用 8080 或 `$PORT` 环境变量
   - **构建失败**：检查 Dockerfile 是否有语法错误
   - **内存不足**：免费套餐内存有限，可优化代码

### 如何更新网站？

```bash
# 修改代码后，推送到 GitHub
git add .
git commit -m "更新功能"
git push origin main

# 平台会自动重新部署
```

---

## 🎉 部署完成！

部署成功后，你会得到一个类似这样的地址：
- `https://a-stock-monitor.onrender.com`
- `https://a-stock-monitor.up.railway.app`
- `https://a-stock-monitor.fly.dev`

把这个链接分享给朋友，或者在手机浏览器打开，就可以随时随地看盘了！

需要帮助的话随时告诉我 🚀
