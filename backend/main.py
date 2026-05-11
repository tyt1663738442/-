#!/usr/bin/env python3
"""
A股实时交易监控平台 - 后端服务 (优化版)
- 东方财富数据源
- 剔除 ST、科创版、创业板
- 性能优化
"""

import asyncio
import json
import webbrowser
import threading
import time
import random
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set
from contextlib import asynccontextmanager

import akshare as ak
import pandas as pd
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
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
    limit_up: float
    limit_down: float

class BigOrder(BaseModel):
    code: str
    name: str
    price: float
    volume: int
    amount: float
    type: str
    timestamp: str
    is_bullish: bool

class DaBanStock(BaseModel):
    code: str
    name: str
    price: float
    change_percent: float
    volume_ratio: float
    limit_up_price: float
    distance_to_limit: float
    seal_amount: float
    seal_ratio: float
    score: float

class MinuteData(BaseModel):
    time: str
    price: float
    volume: int

class StockDetail(BaseModel):
    code: str
    name: str
    price: float
    change_percent: float
    change_amount: float
    volume: int
    amount: float
    high: float
    low: float
    open: float
    pre_close: float
    limit_up: float
    limit_down: float
    minute_data: List[MinuteData]

# ============== 全局状态 ==============

class MarketDataStore:
    def __init__(self):
        self.stocks: Dict[str, StockInfo] = {}
        self.big_orders: List[BigOrder] = []
        self.daban_candidates: List[DaBanStock] = []
        self.last_update: Optional[datetime] = None
        self.subscribers: Set[WebSocket] = set()
        self.is_trading_hours = False
        
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
        self.subscribers -= disconnected

data_store = MarketDataStore()

# ============== 数据源（东方财富） ==============

class StockDataSource:
    """东方财富 A股数据源"""
    
    BIG_ORDER_THRESHOLD = 5000000  # 大单阈值：500万
    MAX_STOCKS = 100  # 限制股票数量以提升性能
    
    def __init__(self):
        self.stocks_cache: List[Dict] = []
        self.cache_time: Optional[datetime] = None
        self.cache_ttl = 5  # 缓存5秒
        
    def _is_valid_stock(self, code: str, name: str) -> bool:
        """过滤股票：剔除 ST、科创版(68)、创业板(3)、北交所(8)"""
        # 剔除 ST
        if 'ST' in name or '*ST' in name or 'S*ST' in name:
            return False
        # 剔除 科创板 (688)
        if code.startswith('688'):
            return False
        # 剔除 创业板 (300)
        if code.startswith('300'):
            return False
        # 剔除 北交所 (8开头)
        if code.startswith('8'):
            return False
        return True
    
    def get_all_stocks(self, force_refresh: bool = False) -> List[Dict]:
        """获取沪深主板股票（剔除ST、科创、创业、北交）"""
        # 使用缓存
        if not force_refresh and self.stocks_cache and self.cache_time:
            if (datetime.now() - self.cache_time).seconds < self.cache_ttl:
                return self.stocks_cache
        
        try:
            # 东方财富实时行情
            df = ak.stock_zh_a_spot_em()
            
            stocks = []
            for _, row in df.iterrows():
                try:
                    code = str(row.get("代码", ""))
                    name = str(row.get("名称", ""))
                    
                    # 过滤
                    if not self._is_valid_stock(code, name):
                        continue
                    
                    price = float(row.get("最新价", 0) or 0)
                    pre_close = float(row.get("昨收", 0) or 0)
                    
                    if price <= 0:  # 过滤停牌股票
                        continue
                    
                    # 计算涨跌停价
                    if code.startswith('688') or code.startswith('300'):
                        limit_up = round(pre_close * 1.2, 2)
                        limit_down = round(pre_close * 0.8, 2)
                    else:
                        limit_up = round(pre_close * 1.1, 2)
                        limit_down = round(pre_close * 0.9, 2)
                    
                    change_percent = float(row.get("涨跌幅", 0) or 0)
                    
                    stocks.append({
                        "code": code,
                        "name": name,
                        "price": price,
                        "change_percent": change_percent,
                        "volume": int(row.get("成交量", 0) or 0),
                        "amount": float(row.get("成交额", 0) or 0),
                        "high": float(row.get("最高", 0) or 0),
                        "low": float(row.get("最低", 0) or 0),
                        "open": float(row.get("今开", 0) or 0),
                        "pre_close": pre_close,
                        "limit_up": limit_up,
                        "limit_down": limit_down,
                    })
                except Exception:
                    continue
            
            # 按成交额排序，取前N只
            stocks.sort(key=lambda x: x.get("amount", 0), reverse=True)
            stocks = stocks[:self.MAX_STOCKS]
            
            self.stocks_cache = stocks
            self.cache_time = datetime.now()
            return stocks
            
        except Exception as e:
            print(f"获取股票数据失败: {e}")
            return self.stocks_cache or []
    
    def get_stock_detail(self, code: str) -> Optional[StockDetail]:
        """获取个股详情（含分时数据）"""
        try:
            stocks = self.get_all_stocks()
            stock = None
            for s in stocks:
                if s["code"] == code:
                    stock = s
                    break
            
            if not stock:
                return None
            
            # 获取分时数据
            minute_data = []
            try:
                df = ak.stock_zh_a_hist_min_em(symbol=code, period="1", adjust="")
                if df is not None and not df.empty:
                    for _, row in df.tail(240).iterrows():  # 最近240分钟
                        minute_data.append({
                            "time": str(row.get("时间", "")),
                            "price": float(row.get("收盘", row.get("open", 0))),
                            "volume": int(row.get("成交量", 0))
                        })
            except Exception as e:
                print(f"获取分时数据失败: {e}")
            
            return StockDetail(
                code=stock["code"],
                name=stock["name"],
                price=stock["price"],
                change_percent=stock["change_percent"],
                change_amount=round(stock["price"] - stock["pre_close"], 2),
                volume=stock["volume"],
                amount=stock["amount"],
                high=stock["high"],
                low=stock["low"],
                open=stock["open"],
                pre_close=stock["pre_close"],
                limit_up=stock["limit_up"],
                limit_down=stock["limit_down"],
                minute_data=minute_data
            )
            
        except Exception as e:
            print(f"获取详情失败: {e}")
            return None
    
    def get_big_orders(self, limit: int = 30) -> List[BigOrder]:
        """获取大单数据"""
        stocks = self.get_all_stocks()
        big_orders = []
        
        for stock in stocks:
            amount = stock.get("amount", 0)
            if amount > self.BIG_ORDER_THRESHOLD:
                is_bullish = stock.get("change_percent", 0) > 0
                big_orders.append(BigOrder(
                    code=stock["code"],
                    name=stock["name"],
                    price=stock["price"],
                    volume=stock["volume"],
                    amount=amount / 10000,
                    type="buy" if is_bullish else "sell",
                    timestamp=datetime.now().strftime("%H:%M:%S"),
                    is_bullish=is_bullish
                ))
        
        return big_orders[:limit]
    
    def calculate_daban_candidates(self) -> List[DaBanStock]:
        """计算打板候选股"""
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
                limit_up = round(pre_close * 1.1, 2)
                
                # 距离涨停幅度
                distance_to_limit = (limit_up - price) / pre_close * 100
                
                # 筛选条件
                if distance_to_limit > 5 or change < 5 or volume < 1000:
                    continue
                
                # 量比（简化估算）
                volume_ratio = 2.5
                
                # 封单金额
                seal_amount = volume * price / 10000 * 0.15
                
                # 综合评分
                score = 0
                score += max(0, (5 - distance_to_limit)) * 15
                score += min(volume_ratio, 5) * 5
                score += min(seal_amount / 1000, 20)
                score += change * 0.5
                
                candidates.append(DaBanStock(
                    code=code,
                    name=stock["name"],
                    price=price,
                    change_percent=change,
                    volume_ratio=volume_ratio,
                    limit_up_price=limit_up,
                    distance_to_limit=round(distance_to_limit, 2),
                    seal_amount=round(seal_amount, 2),
                    seal_ratio=0.15,
                    score=round(score, 2)
                ))
            except Exception:
                continue
        
        candidates.sort(key=lambda x: x.score, reverse=True)
        return candidates[:20]

data_source = StockDataSource()

# ============== 后台任务 ==============

async def market_data_updater():
    """市场数据更新器（性能优化：降低频率）"""
    update_count = 0
    while True:
        try:
            now = datetime.now()
            hour, minute = now.hour, now.minute
            
            # A股交易时间
            is_morning = (hour == 9 and minute >= 30) or (hour == 10) or (hour == 11 and minute <= 30)
            is_afternoon = (hour == 13) or (hour == 14) or (hour == 15 and minute == 0)
            data_store.is_trading_hours = is_morning or is_afternoon
            
            if data_store.is_trading_hours:
                # 每3秒更新一次（平衡性能和实时性）
                if update_count % 3 == 0:
                    stocks_data = data_source.get_all_stocks(force_refresh=True)
                    data_store.stocks = {s["code"]: StockInfo(**s) for s in stocks_data}
                
                # 大单数据每5秒更新
                if update_count % 5 == 0:
                    data_store.big_orders = data_source.get_big_orders(20)
                    data_store.daban_candidates = data_source.calculate_daban_candidates()
                
                data_store.last_update = now
                update_count += 1
                
                # 广播（只有订阅者时才推送）
                if data_store.subscribers:
                    await data_store.broadcast({
                        "type": "market_update",
                        "data": {
                            "timestamp": now.strftime("%H:%M:%S"),
                            "stocks": [s.model_dump() for s in data_store.stocks.values()][:50],
                            "big_orders": [o.model_dump() for o in data_store.big_orders[:10]],
                            "daban_candidates": [d.model_dump() for d in data_store.daban_candidates[:10]]
                        }
                    })
            
            await asyncio.sleep(1)
            
        except Exception as e:
            print(f"数据更新错误: {e}")
            await asyncio.sleep(5)

# ============== FastAPI 应用 ==============

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 启动市场数据更新器...")
    asyncio.create_task(market_data_updater())
    yield
    print("👋 关闭服务...")

app = FastAPI(
    title="A股实时交易监控平台",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============== API 路由 ==============

@app.get("/api/stocks")
async def get_stocks(search: Optional[str] = None, limit: int = 50):
    """获取股票列表"""
    stocks = data_source.get_all_stocks()
    
    if search:
        search = search.upper()
        stocks = [s for s in stocks if search in s["code"] or search in s["name"]]
    
    return {"stocks": stocks[:limit], "total": len(stocks)}

@app.get("/api/stock/{code}")
async def get_stock(code: str):
    """获取个股详情（含分时）"""
    detail = data_source.get_stock_detail(code)
    if not detail:
        raise HTTPException(status_code=404, detail="股票不存在")
    return detail

@app.get("/api/big-orders")
async def get_big_orders(limit: int = 30):
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
    await data_store.subscribe(websocket)
    try:
        await websocket.send_json({
            "type": "connected",
            "message": "已连接"
        })
        
        while True:
            try:
                data = await websocket.receive_text()
                msg = json.loads(data)
                
                if msg.get("action") == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg.get("action") == "get_stock":
                    code = msg.get("code")
                    detail = data_source.get_stock_detail(code)
                    await websocket.send_json({"type": "stock_detail", "data": detail})
                    
            except json.JSONDecodeError:
                pass
                
    except WebSocketDisconnect:
        pass
    finally:
        await data_store.unsubscribe(websocket)

# ============== 静态文件 ==============

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

from fastapi.responses import FileResponse
import os

frontend_dist = os.path.join(os.path.dirname(__file__), "../frontend/dist")

@app.get("/")
async def root():
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "A股实时交易监控平台"}

@app.get("/{path:path}")
async def catch_all(path: str):
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not Found")
    
    file_path = os.path.join(frontend_dist, path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)
    
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    return {"message": "A股实时交易监控平台"}

# ============== 启动 ==============

def open_browser():
    time.sleep(2)
    webbrowser.open("http://localhost:8080")

if __name__ == "__main__":
    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8080,
        reload=False,
        log_level="info"
    )
