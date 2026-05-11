# A股实时交易监控平台 - Docker 部署
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 安装 Node.js 18
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# 复制项目文件
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY start.sh ./

# 安装 Python 依赖
RUN pip install --no-cache-dir -r backend/requirements.txt

# 构建前端
WORKDIR /app/frontend
RUN npm install && npm run build

# 返回工作目录
WORKDIR /app

# 暴露端口
EXPOSE 8080

# 启动命令
CMD ["python3", "backend/main.py"]
