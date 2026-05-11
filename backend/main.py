#!/usr/bin/env python3
"""
A股实时交易监控平台 - 后端服务
FastAPI + WebSocket 实时推送
"""

import asyncio
import json
import webbrowser
import threading
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set
from contextlib import asynccontextmanager

import akshare as ak
import pandas as pd
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ============== 数据模型 ==============

class StockInfo(BaseModel):
    code: str
    name: str
    price: float
    change_percent: float
    volume: int
    amount: float
    high: float
    low: float
    open: float
    pre_close: float
    limit_up: float  # 涨停价
    limit_down: float  # 跌停价

class BigOrder(BaseModel):
    code: str
    name: str
    price: float
    volume: int
    amount: float
    type: str  # "buy" or "sell"
    timestamp: str
    is_bullish: bool  # 是否为主动买入

class DaBanStock(BaseModel):
    code: str
    name: str
    price: float
    change_percent: float
    volume_ratio: float  # 量比
    limit_up_price: float
    distance_to_limit: float  # 距离涨停幅度
    seal_amount: float  # 封单金额（万）
    seal_ratio: float  # 封单比
    score: float  # 打板综合评分

class MarketData(BaseModel):
    timestamp: str
    stocks: List[StockInfo]
    big_orders: List[BigOrder]
    daban_candidates: List[DaBanStock]

# ============== 全局状态 ==============

class MarketDataStore:
    def __init__(self):
        self.stocks: Dict[str, StockInfo] = {}
        self.big_orders: List[BigOrder] = []
        self.daban_candidates: List[DaBanStock] = []
        self.last_update: Optional[datetime] = None
        self.subscribers: Set[WebSocket] = set()
        self.is_trading_hours = False
        self.stock_list: List[Dict] = []
        
    async def subscribe(self, websocket: WebSocket):
        await websocket.accept()
        self.subscribers.add(websocket)
        
    async def unsubscribe(self, websocket: WebSocket):
        self.subscribers.discard(websocket)
        
    async def broadcast(self, data: dict):
        disconnected = set()
        for ws in self.subscribers:
            try:
                await ws.send_json(data)
            except Exception:
                disconnected.add(ws)
        # 清理断开的连接
        self.subscribers -= disconnected

# 全局数据存储
data_store = MarketDataStore()

# ============== 数据源 ==============

class StockDataSource:
    """A股数据源 - 使用 AKShare (支持 Mock 数据)"""
    
    BIG_ORDER_THRESHOLD = 1000000  # 大单阈值：100万
    USE_MOCK = True  # 设置为 True 使用模拟数据（演示模式）
    
    # Mock 股票数据
    MOCK_STOCKS = [
        {"code": "000001", "name": "平安银行", "price": 10.50, "change_percent": 9.95, "volume": 125000000, "amount": 1312500000, "high": 10.50, "low": 9.55, "open": 9.60, "pre_close": 9.55},
        {"code": "000002", "name": "万科A", "price": 15.20, "change_percent": -1.23, "volume": 56000000, "amount": 851200000, "high": 15.50, "low": 15.10, "open": 15.40, "pre_close": 15.39},
        {"code": "600519", "name": "贵州茅台", "price": 1688.00, "change_percent": 2.15, "volume": 2500000, "amount": 4220000000, "high": 1695.00, "low": 1650.00, "open": 1655.00, "pre_close": 1652.50},
        {"code": "000858", "name": "五粮液", "price": 145.80, "change_percent": 1.85, "volume": 8500000, "amount": 1239300000, "high": 147.00, "low": 143.00, "open": 143.50, "pre_close": 143.15},
        {"code": "002594", "name": "比亚迪", "price": 245.60, "change_percent": 5.32, "volume": 12000000, "amount": 2947200000, "high": 248.00, "low": 233.00, "open": 235.00, "pre_close": 233.20},
        {"code": "300750", "name": "宁德时代", "price": 198.50, "change_percent": 7.85, "volume": 15000000, "amount": 2977500000, "high": 201.00, "low": 184.00, "open": 185.00, "pre_close": 184.05},
        {"code": "601012", "name": "隆基绿能", "price": 22.35, "change_percent": -2.10, "volume": 45000000, "amount": 1005750000, "high": 23.00, "low": 22.10, "open": 22.80, "pre_close": 22.83},
        {"code": "000725", "name": "京东方A", "price": 4.28, "change_percent": 9.74, "volume": 380000000, "amount": 1626400000, "high": 4.28, "low": 3.90, "open": 3.92, "pre_close": 3.90},
        {"code": "600036", "name": "招商银行", "price": 32.50, "change_percent": 0.85, "volume": 28000000, "amount": 910000000, "high": 32.80, "low": 32.20, "open": 32.25, "pre_close": 32.23},
        {"code": "000568", "name": "泸州老窖", "price": 178.90, "change_percent": -0.56, "volume": 3200000, "amount": 572480000, "high": 181.00, "low": 177.50, "open": 180.00, "pre_close": 179.90},
        {"code": "002230", "name": "科大讯飞", "price": 48.60, "change_percent": 8.72, "volume": 28000000, "amount": 1360800000, "high": 49.50, "low": 44.70, "open": 45.00, "pre_close": 44.70},
        {"code": "300059", "name": "东方财富", "price": 15.88, "change_percent": 3.25, "volume": 95000000, "amount": 1508600000, "high": 16.20, "low": 15.40, "open": 15.40, "pre_close": 15.38},
        {"code": "600900", "name": "长江电力", "price": 23.45, "change_percent": 0.43, "volume": 18000000, "amount": 422100000, "high": 23.60, "low": 23.30, "open": 23.35, "pre_close": 23.35},
        {"code": "601888", "name": "中国中免", "price": 85.60, "change_percent": -1.85, "volume": 8500000, "amount": 727600000, "high": 87.50, "low": 85.00, "open": 87.00, "pre_close": 87.21},
        {"code": "002415", "name": "海康威视", "price": 32.80, "change_percent": 1.23, "volume": 22000000, "amount": 721600000, "high": 33.20, "low": 32.40, "open": 32.45, "pre_close": 32.40},
        {"code": "600276", "name": "恒瑞医药", "price": 44.50, "change_percent": -0.89, "volume": 15000000, "amount": 667500000, "high": 45.20, "low": 44.20, "open": 44.90, "pre_close": 44.90},
        {"code": "300122", "name": "智飞生物", "price": 58.30, "change_percent": 6.58, "volume": 12000000, "amount": 699600000, "high": 60.00, "low": 54.80, "open": 55.00, "pre_close": 54.70},
        {"code": "000538", "name": "云南白药", "price": 52.10, "change_percent": 0.19, "volume": 5800000, "amount": 302180000, "high": 52.80, "low": 51.80, "open": 52.05, "pre_close": 52.00},
        {"code": "601318", "name": "中国平安", "price": 42.35, "change_percent": 1.56, "volume": 35000000, "amount": 1482250000, "high": 42.80, "low": 41.80, "open": 41.85, "pre_close": 41.70},
        {"code": "600030", "name": "中信证券", "price": 21.85, "change_percent": 2.34, "volume": 42000000, "amount": 917700000, "high": 22.20, "low": 21.40, "open": 21.45, "pre_close": 21.35},
    ]
    
    def __init__(self):
        self.stock_list_cache = []
        self.last_list_update = None
        self.mock_data = self._generate_mock_data()
        
    def _generate_mock_data(self) -> List[Dict]:
        """生成模拟股票数据（用于演示）"""
        import random
        stocks = []
        for s in self.MOCK_STOCKS:
            # 添加随机波动
            price = s["price"] * (1 + random.uniform(-0.02, 0.02))
            change = ((price - s["pre_close"]) / s["pre_close"]) * 100
            stocks.append({
                **s,
                "price": round(price, 2),
                "change_percent": round(change, 2),
            })
        return stocks
    
    def get_all_stocks(self) -> List[Dict]:
        """获取所有A股列表"""
        # 使用 Mock 数据（演示模式）
        if self.USE_MOCK:
            self.mock_data = self._generate_mock_data()
            return self.mock_data
        
        try:
            # 缓存股票列表1小时
            if (self.last_list_update and 
                datetime.now() - self.last_list_update < timedelta(hours=1) and
                self.stock_list_cache):
                return self.stock_list_cache
                
            df = ak.stock_zh_a_spot_em()
            stocks = []
            for _, row in df.iterrows():
                stocks.append({
                    "code": row.get("代码", ""),
                    "name": row.get("名称", ""),
                    "price": float(row.get("最新价", 0) or 0),
                    "change_percent": float(row.get("涨跌幅", 0) or 0),
                    "volume": int(row.get("成交量", 0) or 0),
                    "amount": float(row.get("成交额", 0) or 0),
                    "high": float(row.get("最高", 0) or 0),
                    "low": float(row.get("最低", 0) or 0),
                    "open": float(row.get("今开", 0) or 0),
                    "pre_close": float(row.get("昨收", 0) or 0),
                })
            self.stock_list_cache = stocks
            self.last_list_update = datetime.now()
            return stocks
        except Exception as e:
            print(f"获取股票列表失败: {e}")
            return self.stock_list_cache or []
    
    def get_stock_detail(self, code: str) -> Optional[Dict]:
        """获取个股详情"""
        try:
            stocks = self.get_all_stocks()
            for stock in stocks:
                if stock["code"] == code:
                    # 计算涨停跌停价
                    pre_close = stock.get("pre_close", stock["price"])
                    if code.startswith("3") or code.startswith("68"):
                        limit_up = round(pre_close * 1.2, 2)
                        limit_down = round(pre_close * 0.8, 2)
                    elif code.startswith("8") or code.startswith("4"):
                        limit_up = round(pre_close * 1.3, 2)
                        limit_down = round(pre_close * 0.7, 2)
                    else:
                        limit_up = round(pre_close * 1.1, 2)
                        limit_down = round(pre_close * 0.9, 2)
                    
                    stock["limit_up"] = limit_up
                    stock["limit_down"] = limit_down
                    
                    # 获取分时数据
                    try:
                        minute_df = ak.stock_zh_a_hist_min_em(symbol=code, period="1", adjust="")
                        if not minute_df.empty:
                            stock["minute_data"] = minute_df.to_dict("records")
                    except:
                        stock["minute_data"] = []
                    
                    return stock
            return None
        except Exception as e:
            print(f"获取股票详情失败: {e}")
            return None
    
    def get_big_orders(self, top_n: int = 50) -> List[BigOrder]:
        """获取大单数据"""
        try:
            stocks = self.get_all_stocks()
            big_orders = []
            
            # 按成交额排序，取前N只
            sorted_stocks = sorted(stocks, key=lambda x: x.get("amount", 0), reverse=True)
            
            for stock in sorted_stocks[:top_n]:
                # 模拟大单数据（实际应该接入Level2数据）
                amount = stock.get("amount", 0)
                if amount > self.BIG_ORDER_THRESHOLD:
                    # 根据涨跌判断买卖方向
                    change = stock.get("change_percent", 0)
                    order_type = "buy" if change > 0 else "sell"
                    
                    big_orders.append(BigOrder(
                        code=stock["code"],
                        name=stock["name"],
                        price=stock.get("price", 0),
                        volume=stock.get("volume", 0),
                        amount=amount / 10000,  # 转换为万
                        type=order_type,
                        timestamp=datetime.now().strftime("%H:%M:%S"),
                        is_bullish=change > 0
                    ))
            
            return big_orders
        except Exception as e:
            print(f"获取大单数据失败: {e}")
            return []
    
    def calculate_daban_candidates(self) -> List[DaBanStock]:
        """计算打板候选股"""
        try:
            stocks = self.get_all_stocks()
            candidates = []
            
            for stock in stocks:
                try:
                    code = stock["code"]
                    price = stock.get("price", 0)
                    pre_close = stock.get("pre_close", price)
                    change = stock.get("change_percent", 0)
                    volume = stock.get("volume", 0)
                    
                    if price <= 0 or pre_close <= 0:
                        continue
                    
                    # 计算涨停价
                    if code.startswith("3") or code.startswith("68"):
                        limit_up = round(pre_close * 1.2, 2)
                    elif code.startswith("8") or code.startswith("4"):
                        limit_up = round(pre_close * 1.3, 2)
                    else:
                        limit_up = round(pre_close * 1.1, 2)
                    
                    # 距离涨停幅度
                    distance_to_limit = (limit_up - price) / pre_close * 100
                    
                    # 筛选条件：
                    # 1. 价格在涨停价附近 (< 5%)
                    # 2. 涨幅 > 5%
                    # 3. 有成交量
                    
                    if distance_to_limit > 5 or change < 5 or volume < 1000:
                        continue
                    
                    # 计算量比（简化版，用当日成交量/5日均量）
                    volume_ratio = 2.0  # 默认假设量比为2
                    
                    # 封单金额估算（简化）
                    seal_amount = volume * price / 10000 * 0.1  # 假设10%是封单
                    seal_ratio = seal_amount / (volume * price / 10000) if volume > 0 else 0
                    
                    # 打板评分算法
                    # 考虑：距离涨停越近越好、量比适中、封单金额大
                    score = 0
                    score += max(0, (5 - distance_to_limit)) * 10  # 距离涨停加分
                    score += min(volume_ratio, 5) * 5  # 量比加分
                    score += min(seal_amount / 1000, 20)  # 封单金额加分
                    score += change  # 涨幅加分
                    
                    candidates.append(DaBanStock(
                        code=code,
                        name=stock["name"],
                        price=price,
                        change_percent=change,
                        volume_ratio=volume_ratio,
                        limit_up_price=limit_up,
                        distance_to_limit=distance_to_limit,
                        seal_amount=seal_amount,
                        seal_ratio=seal_ratio,
                        score=round(score, 2)
                    ))
                    
                except Exception as e:
                    continue
            
            # 按评分排序
            candidates.sort(key=lambda x: x.score, reverse=True)
            return candidates[:30]  # 返回前30
            
        except Exception as e:
            print(f"计算打板候选失败: {e}")
            return []

data_source = StockDataSource()

# ============== 后台任务 ==============

async def market_data_updater():
    """市场数据更新器 - 每秒更新"""
    while True:
        try:
            # 检查是否在交易时间
            now = datetime.now()
            hour = now.hour
            minute = now.minute
            
            # A股交易时间: 9:30-11:30, 13:00-15:00
            is_morning = (hour == 9 and minute >= 30) or (hour == 10) or (hour == 11 and minute <= 30)
            is_afternoon = (hour == 13) or (hour == 14) or (hour == 15 and minute == 0)
            data_store.is_trading_hours = is_morning or is_afternoon
            
            if data_store.is_trading_hours:
                # 更新股票数据
                stocks_data = data_source.get_all_stocks()
                data_store.stocks = {s["code"]: StockInfo(
                    code=s["code"],
                    name=s["name"],
                    price=s.get("price", 0),
                    change_percent=s.get("change_percent", 0),
                    volume=s.get("volume", 0),
                    amount=s.get("amount", 0),
                    high=s.get("high", 0),
                    low=s.get("low", 0),
                    open=s.get("open", 0),
                    pre_close=s.get("pre_close", 0),
                    limit_up=round(s.get("pre_close", s.get("price", 0)) * 1.1, 2),
                    limit_down=round(s.get("pre_close", s.get("price", 0)) * 0.9, 2)
                ) for s in stocks_data[:100]}  # 只取前100只减少数据量
                
                # 更新大单数据
                data_store.big_orders = data_source.get_big_orders(20)
                
                # 更新打板候选
                data_store.daban_candidates = data_source.calculate_daban_candidates()
                data_store.last_update = now
                
                # 广播给所有订阅者
                await data_store.broadcast({
                    "type": "market_update",
                    "data": {
                        "timestamp": now.strftime("%H:%M:%S"),
                        "stocks": [s.model_dump() for s in data_store.stocks.values()][:50],
                        "big_orders": [o.model_dump() for o in data_store.big_orders[:10]],
                        "daban_candidates": [d.model_dump() for d in data_store.daban_candidates[:10]]
                    }
                })
            
            await asyncio.sleep(1)  # 每秒更新
            
        except Exception as e:
            print(f"数据更新错误: {e}")
            await asyncio.sleep(5)

# ============== FastAPI 应用 ==============

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    print("🚀 启动市场数据更新器...")
    asyncio.create_task(market_data_updater())
    yield
    # 关闭时
    print("👋 关闭服务...")

app = FastAPI(
    title="A股实时交易监控平台",
    description="实时大单监控 + 打板筛选",
    version="1.0.0",
    lifespan=lifespan
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============== API 路由 ==============

@app.get("/api/stocks")
async def get_stocks(search: Optional[str] = None, limit: int = 100):
    """获取股票列表"""
    stocks = data_source.get_all_stocks()
    
    if search:
        search = search.upper()
        stocks = [s for s in stocks if search in s["code"] or search in s["name"]]
    
    return {"stocks": stocks[:limit], "total": len(stocks)}

@app.get("/api/stock/{code}")
async def get_stock(code: str):
    """获取个股详情"""
    detail = data_source.get_stock_detail(code)
    if not detail:
        raise HTTPException(status_code=404, detail="股票不存在")
    return detail

@app.get("/api/big-orders")
async def get_big_orders(limit: int = 50):
    """获取大单数据"""
    orders = data_source.get_big_orders(limit)
    return {"orders": orders, "count": len(orders)}

@app.get("/api/daban")
async def get_daban_candidates():
    """获取打板候选股"""
    candidates = data_source.calculate_daban_candidates()
    return {"candidates": candidates, "count": len(candidates)}

@app.get("/api/market/status")
async def get_market_status():
    """获取市场状态"""
    return {
        "is_trading_hours": data_store.is_trading_hours,
        "last_update": data_store.last_update.strftime("%H:%M:%S") if data_store.last_update else None,
        "subscribers": len(data_store.subscribers)
    }

# ============== WebSocket ==============

@app.websocket("/ws/market")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 实时行情推送"""
    await data_store.subscribe(websocket)
    try:
        # 发送初始数据
        await websocket.send_json({
            "type": "connected",
            "message": "已连接到实时行情服务器"
        })
        
        # 保持连接
        while True:
            try:
                data = await websocket.receive_text()
                msg = json.loads(data)
                
                if msg.get("action") == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg.get("action") == "subscribe_stock":
                    code = msg.get("code")
                    detail = data_source.get_stock_detail(code)
                    await websocket.send_json({
                        "type": "stock_detail",
                        "data": detail
                    })
                    
            except json.JSONDecodeError:
                pass
            except asyncio.TimeoutError:
                break
                
    except WebSocketDisconnect:
        pass
    finally:
        await data_store.unsubscribe(websocket)

# ============== 静态文件 ==============

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

# ============== 启动 ==============

def open_browser():
    """延迟打开浏览器"""
    time.sleep(2)
    webbrowser.open("http://localhost:8080")

# ============== 静态文件 (放在最后，避免覆盖API) ==============

from fastapi.responses import FileResponse
import os

frontend_dist = os.path.join(os.path.dirname(__file__), "../frontend/dist")

@app.get("/")
async def root():
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "A股实时交易监控平台 API"}

@app.get("/{path:path}")
async def catch_all(path: str):
    # API 路由已经被处理，这里处理前端路由
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not Found")
    
    # 尝试返回对应的静态文件
    file_path = os.path.join(frontend_dist, path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)
    
    # 否则返回 index.html (前端路由)
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    return {"message": "A股实时交易监控平台 API"}

if __name__ == "__main__":
    # 启动浏览器
    threading.Thread(target=open_browser, daemon=True).start()
    
    # 启动服务
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8080,
        reload=False,
        log_level="info"
    )
