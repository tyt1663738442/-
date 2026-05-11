#!/bin/bash

# A股实时交易监控平台 - 一键启动脚本

echo "🚀 启动 A股实时交易监控平台..."
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "${RED}错误: 未找到 Python3${NC}"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "${RED}错误: 未找到 Node.js${NC}"
    exit 1
fi

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "📦 步骤 1/4: 安装 Python 依赖..."
cd backend
pip3 install -q -r requirements.txt
if [ $? -ne 0 ]; then
    echo "${YELLOW}警告: pip3 安装失败，尝试使用 pip...${NC}"
    pip install -q -r requirements.txt
fi
cd ..

echo "📦 步骤 2/4: 安装前端依赖..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "   依赖已安装，跳过..."
fi
cd ..

echo "🔨 步骤 3/4: 构建前端..."
cd frontend
npm run build
cd ..

echo "🚀 步骤 4/4: 启动服务..."
echo ""
echo "${GREEN}服务将在以下地址运行:${NC}"
echo "   网站: http://localhost:8080"
echo "   API:  http://localhost:8080/api"
echo "   WS:   ws://localhost:8080/ws/market"
echo ""
echo "${YELLOW}按 Ctrl+C 停止服务${NC}"
echo ""

# 启动后端（会自动打开浏览器）
cd backend
python3 main.py
