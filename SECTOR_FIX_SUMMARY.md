# 板块功能修复总结

## 问题
板块列表可以显示，但点击板块后成分股始终返回空 `[]`。

## 根本原因
后端 `_fetch_sector_stocks()` 函数使用了错误的 URL：
- ❌ 旧 URL：`https://vip.stock.finance.sina.com.cn/q/view/newSinaHyDetail.php?code={sector_key}`
  - 该接口已 404，新浪不再维护
- ✅ 正确 URL：`https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=500&sort=symbol&asc=1&node={sector_key}`
  - 该接口直接返回 JSON 数组，包含板块内所有股票的实时行情

## 修复内容

### 1. `backend/main.py` - `_fetch_sector_stocks()` 函数
- 替换了请求 URL
- 更换为全新 `requests.Session()`（避免 `ds.session` 潜在配置问题）
- 解析逻辑改为直接 `json.loads()`，读取 `code/name/trade/changepercent` 字段
- 增加空数据保护（返回缓存或空列表）
- 恢复 5 分钟缓存逻辑

### 2. 前端 `frontend/src/App.tsx`
- 增加了「板块」Tab 入口
- 点击后渲染 `SectorPanel` 组件

### 3. 前端 `frontend/src/components/SectorPanel.tsx`
- 左侧：板块列表（从 `/api/sectors` 获取）
- 右侧：点击板块后，调用 `/api/sector/{key}` 展示成分股
- 显示：代码、名称、最新价、涨跌幅
- 涨跌幅颜色：绿涨红跌（同花顺风格）

## 验证结果
```
=== 板块列表 ===
板块数量: 49
  new_blhy => 玻璃行业 (19只)
  new_cbzz => 船舶制造 (8只)
  ...

=== 板块成分股（new_blhy）===
板块: 玻璃行业
成分股数量: 19
  600176 中国巨石 价:38.100 涨跌幅:0.74
  600184 光电股份 价:29.120 涨跌幅:0.138
  ...
```

## 其他已修复问题（本次会话前期）
1. ✅ `DaBanPanel.tsx` 缺少 `TrendingUp` 导入 → 已添加
2. ✅ 全市场股票覆盖（3768 只主板，过滤 ST/创业板/科创板）
3. ✅ 分时数据改为获取全天（`count=500`）
4. ✅ `seal_amount` 计算逻辑已添加（非交易时段为 0，属正常）

## 重启方式
```bash
# 后端
cd D:\258\backend
$env:PYTHONIOENCODING="utf-8"
python main.py

# 前端
cd D:\258\frontend
npm run dev -- --host 0.0.0.0 --port 3000
```

访问：http://localhost:3000
