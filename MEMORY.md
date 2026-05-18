# MEMORY.md - 长期记忆

## 用户偏好

- 中文简洁交流，发简短指令，期望快速修复
- 迭代式开发，改完立即预览测试结果
- 遇不熟悉术语会追问含义

## 工作流程约定

### 代码修改后自动提交推送
**重要：每次修改工作区代码文件后，必须主动执行：**
```bash
cd D:/258
git add <修改的文件>
git commit -m "简洁的中文提交信息"
git push origin main
```
**不需要用户手动操作，不需要定时任务，改完就推。**
忽略文件（node_modules、dist、.env.local 等）不提交。

### 前端开发规范
- UI 和颜色保持现有风格不变
- 先看 UI 效果再迭代
- 提供详细分步执行计划
- 用户可随时发指令中断

## 项目信息

### A股复盘分析系统
- 路径：`D:\258`
- 前端：React/TypeScript，端口 8000
- 后端：Python FastAPI，端口 8001
- 数据源：AKShare + 新浪财经
- 前端 API 地址通过 `.env.development` / `.env.production` 区分

### 关键文件
- `backend/hot_trend.py`：最强风口页面后端逻辑（v2 分层评分）
- `backend/main.py`：后端主入口，端口 8001
- `frontend/src/components/HotTrendPage.tsx`：最强风口前端页面 v2
- `frontend/src/components/ReviewPanel.tsx`：复盘分析页面

## 近期关注

- 最强风口 v2：分层评分逻辑（政策20分、行业15分、资金15分、业绩15分、国际15分、通用10分）
- 政策力度分级：国家级×2.5、部位级×2.0、地方级×1.0、行业级×0.5
- 个股精准匹配 + 自上而下板块传导
- 复盘分析功能真实数据对接（`/api/review/stocks`）
- 连板数据（`b_count`、`c_count`、`depth`）准确性
- 评分规则与"连板质量矩阵评分规则.md"一致
