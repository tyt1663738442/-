# A股实时交易监控平台

## 功能特性

- 📊 **实时大单监控**: 每秒推送全市场大单买卖数据
- 🔍 **个股查询**: 支持股票代码/名称搜索，查看详细交易数据
- 🎯 **打板筛选**: 开盘自动筛选涨停潜力股（涨停价附近、量比、封单金额）
- ⚡ **WebSocket 实时推送**: 低延迟数据更新
- 📱 **响应式设计**: 支持桌面和移动端

## 技术栈

- **后端**: Python + FastAPI + WebSocket
- **前端**: React + TypeScript + Tailwind CSS + Recharts
- **数据**: AKShare (A股免费数据源)

## 快速启动

```bash
# 安装依赖并启动
./start.sh
```

服务启动后自动打开浏览器访问: http://localhost:8080

## 项目结构

```
a-stock-monitor/
├── backend/          # Python 后端
├── frontend/         # React 前端
├── start.sh          # 一键启动脚本
└── README.md
```

## API 接口

- `GET /api/stocks` - 获取所有股票列表
- `GET /api/stock/{code}` - 获取个股详情
- `GET /api/big-orders` - 获取大单数据
- `GET /api/daban` - 获取打板候选股
- `WS /ws/market` - WebSocket 实时行情推送
