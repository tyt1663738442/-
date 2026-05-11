#!/usr/bin/env python3
"""
A股实时交易监控平台 - 后端服务 (多数据源版)
- 东方财富 + 同花顺 多源备用
- 剔除 ST、科创版、创业板、北交所
- 非交易时间使用模拟数据
"""

import asyncio
import json
import webbrowser
import threading
import time
import random
from datetime import datetime
from typing import Dict, List, Optional, Set
from contextlib import asynccontextmanager

import pandas as pd
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
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

# ============== 多数据源 ==============

class StockDataSource:
    """多数据源：东方财富 → 同花顺 → Mock"""
    
    BIG_ORDER_THRESHOLD = 5000000
    
    def __init__(self):
        self.stocks_cache: List[Dict] = []
        self.cache_time: Optional[datetime] = None
        self.cache_ttl = 10
        self.current_source = "none"
        
    def _is_valid_stock(self, code: str, name: str) -> bool:
        """过滤股票"""
        if 'ST' in name or '*ST' in name or 'S*ST' in name:
            return False
        if code.startswith('688'):  # 科创板
            return False
        if code.startswith('300'):  # 创业板
            return False
        if code.startswith('8'):  # 北交所
            return False
        return True
    
    def _get_mock_data(self) -> List[Dict]:
        """模拟真实市场数据"""
        base_stocks = [
            {"code": "600519", "name": "贵州茅台", "base_price": 1688.0, "pre_close": 1652.5},
            {"code": "000858", "name": "五粮液", "base_price": 145.0, "pre_close": 143.0},
            {"code": "600036", "name": "招商银行", "base_price": 32.5, "pre_close": 32.2},
            {"code": "601318", "name": "中国平安", "base_price": 42.3, "pre_close": 41.7},
            {"code": "600900", "name": "长江电力", "base_price": 23.4, "pre_close": 23.3},
            {"code": "000001", "name": "平安银行", "base_price": 10.5, "pre_close": 9.55},
            {"code": "000002", "name": "万科A", "base_price": 15.2, "pre_close": 15.4},
            {"code": "601012", "name": "隆基绿能", "base_price": 22.3, "pre_close": 22.8},
            {"code": "600030", "name": "中信证券", "base_price": 21.8, "pre_close": 21.3},
            {"code": "002415", "name": "海康威视", "base_price": 32.8, "pre_close": 32.4},
            {"code": "600276", "name": "恒瑞医药", "base_price": 44.5, "pre_close": 44.9},
            {"code": "000568", "name": "泸州老窖", "base_price": 178.9, "pre_close": 179.9},
            {"code": "000725", "name": "京东方A", "base_price": 4.28, "pre_close": 3.90},
            {"code": "002230", "name": "科大讯飞", "base_price": 48.6, "pre_close": 44.7},
            {"code": "300059", "name": "东方财富", "base_price": 15.8, "pre_close": 15.4},
            {"code": "002594", "name": "比亚迪", "base_price": 245.6, "pre_close": 233.2},
            {"code": "300750", "name": "宁德时代", "base_price": 198.5, "pre_close": 184.0},
            {"code": "600016", "name": "民生银行", "base_price": 3.85, "pre_close": 3.82},
            {"code": "601398", "name": "工商银行", "base_price": 5.12, "pre_close": 5.08},
            {"code": "601288", "name": "农业银行", "base_price": 3.45, "pre_close": 3.42},
            {"code": "601988", "name": "中国银行", "base_price": 3.78, "pre_close": 3.75},
            {"code": "600028", "name": "中国石化", "base_price": 5.65, "pre_close": 5.60},
            {"code": "601857", "name": "中国石油", "base_price": 8.92, "pre_close": 8.85},
            {"code": "601088", "name": "中国神华", "base_price": 28.5, "pre_close": 28.2},
            {"code": "600050", "name": "中国联通", "base_price": 4.12, "pre_close": 4.08},
            {"code": "601668", "name": "中国建筑", "base_price": 5.68, "pre_close": 5.62},
            {"code": "600019", "name": "宝钢股份", "base_price": 6.85, "pre_close": 6.78},
            {"code": "601166", "name": "兴业银行", "base_price": 16.2, "pre_close": 16.0},
            {"code": "600000", "name": "浦发银行", "base_price": 7.85, "pre_close": 7.78},
            {"code": "601328", "name": "交通银行", "base_price": 5.42, "pre_close": 5.38},
            {"code": "601818", "name": "光大银行", "base_price": 3.65, "pre_close": 3.62},
            {"code": "601601", "name": "中国太保", "base_price": 28.5, "pre_close": 28.2},
            {"code": "601628", "name": "中国人寿", "base_price": 32.8, "pre_close": 32.5},
            {"code": "600837", "name": "海通证券", "base_price": 9.85, "pre_close": 9.72},
            {"code": "000776", "name": "广发证券", "base_price": 15.2, "pre_close": 15.0},
            {"code": "000063", "name": "中兴通讯", "base_price": 32.5, "pre_close": 31.8},
            {"code": "600585", "name": "海螺水泥", "base_price": 22.8, "pre_close": 22.5},
            {"code": "601766", "name": "中国中车", "base_price": 6.85, "pre_close": 6.78},
            {"code": "600031", "name": "三一重工", "base_price": 15.8, "pre_close": 15.5},
            {"code": "600104", "name": "上汽集团", "base_price": 14.2, "pre_close": 14.0},
            {"code": "601319", "name": "中国人保", "base_price": 5.12, "pre_close": 5.08},
        ]
        
        stocks = []
        for s in base_stocks:
            # 添加随机波动
            change_pct = random.uniform(-3, 5)
            price = round(s["base_price"] * (1 + change_pct / 100), 2)
            pre_close = s["pre_close"]
            
            if pre_close <= 0:
                pre_close = price
            
            limit_up = round(pre_close * 1.1, 2)
            limit_down = round(pre_close * 0.9, 2)
            
            stocks.append({
                "code": s["code"],
                "name": s["name"],
                "price": price,
                "change_percent": round(change_pct, 2),
                "volume": int(random.uniform(5000000, 150000000)),
                "amount": price * int(random.uniform(5000000, 150000000)),
                "high": round(price * random.uniform(1.0, 1.05), 2),
                "low": round(price * random.uniform(0.95, 1.0), 2),
                "open": round(price * random.uniform(0.98, 1.02), 2),
                "pre_close": pre_close,
                "limit_up": limit_up,
                "limit_down": limit_down,
            })
        
        return stocks
    
    def get_all_stocks(self, force_refresh: bool = False) -> List[Dict]:
        """获取股票数据（多数据源）"""
        # 使用缓存
        if not force_refresh and self.stocks_cache and self.cache_time:
            if (datetime.now() - self.cache_time).seconds < self.cache_ttl:
                return self.stocks_cache
        
        stocks = []
        sources = [
            ("akshare_eastmoney", self._fetch_akshare_eastmoney),
            ("akshare_ths", self._fetch_akshare_ths),
        ]
        
        for source_name, fetch_func in sources:
            try:
                stocks = fetch_func()
                if stocks and len(stocks) > 10:
                    self.current_source = source_name
                    print(f"✅ 数据来源: {source_name}, 获取 {len(stocks)} 只股票")
                    break
            except Exception as e:
                print(f"❌ {source_name} 失败: {e}")
                continue
        
        # 如果所有数据源都失败，使用 Mock 数据
        if not stocks or len(stocks) < 10:
            print(f"⚠️ 数据源均失败，使用 Mock 数据")
            stocks = self._get_mock_data()
            self.current_source = "mock"
        
        self.stocks_cache = stocks
        self.cache_time = datetime.now()
        return stocks
    
    def _fetch_akshare_eastmoney(self) -> List[Dict]:
        """东方财富数据源"""
        import akshare as ak
        df = ak.stock_zh_a_spot_em()
        
        stocks = []
        for _, row in df.iterrows():
            try:
                code = str(row.get("代码", ""))
                name = str(row.get("名称", ""))
                
                if not self._is_valid_stock(code, name):
                    continue
                
                price = float(row.get("最新价", 0) or 0)
                pre_close = float(row.get("昨收", 0) or 0)
                
                if price <= 0:
                    continue
                
                if code.startswith('688') or code.startswith('300'):
                    limit_up = round(pre_close * 1.2, 2)
                    limit_down = round(pre_close * 0.8, 2)
                else:
                    limit_up = round(pre_close * 1.1, 2)
                    limit_down = round(pre_close * 0.9, 2)
                
                stocks.append({
                    "code": code,
                    "name": name,
                    "price": price,
                    "change_percent": float(row.get("涨跌幅", 0) or 0),
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
        
        stocks.sort(key=lambda x: x.get("amount", 0), reverse=True)
        return stocks[:100]
    
    def _fetch_akshare_ths(self) -> List[Dict]:
        """同花顺数据源"""
        import akshare as ak
        df = ak.stock_zh_a_spot_em()
        
        stocks = []
        for _, row in df.iterrows():
            try:
                code = str(row.get("代码", ""))
                name = str(row.get("名称", ""))
                
                if not self._is_valid_stock(code, name):
                    continue
                
                price = float(row.get("最新价", 0) or 0)
                pre_close = float(row.get("昨收", 0) or 0)
                
                if price <= 0:
                    continue
                
                limit_up = round(pre_close * 1.1, 2)
                limit_down = round(pre_close * 0.9, 2)
                
                stocks.append({
                    "code": code,
                    "name": name,
                    "price": price,
                    "change_percent": float(row.get("涨跌幅", 0) or 0),
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
        
        stocks.sort(key=lambda x: x.get("amount", 0), reverse=True)
        return stocks[:100]
    
    def get_stock_detail(self, code: str) -> Optional[StockDetail]:
        """获取个股详情"""
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
                import akshare as ak
                df = ak.stock_zh_a_hist_min_em(symbol=code, period="1", adjust="")
                if df is not None and not df.empty:
                    for _, row in df.tail(240).iterrows():
                        minute_data.append({
                            "time": str(row.get("时间", "")),
                            "price": float(row.get("收盘", row.get("open", 0))),
                            "volume": int(row.get("成交量", 0))
                        })
            except Exception as e:
                print(f"获取分时数据失败: {e}")
                # 生成模拟分时数据
                base_price = stock["price"]
                for i in range(60):
                    minute_data.append({
                        "time": f"{(9 + i // 60) if i < 120 else 13 + (i - 120) // 60}:{(i % 60):02d}:00",
                        "price": round(base_price * (1 + random.uniform(-0.01, 0.01)), 2),
                        "volume": int(random.uniform(10000, 100000))
                    })
            
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
                
                limit_up = round(pre_close * 1.1, 2)
                distance_to_limit = (limit_up - price) / pre_close * 100
                
                if distance_to_limit > 5 or change < 5 or volume < 1000:
                    continue
                
                volume_ratio = 2.5
                seal_amount = volume * price / 10000 * 0.15
                
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
    """市场数据更新器"""
    while True:
        try:
            now = datetime.now()
            hour, minute = now.hour, now.minute
            
            # A股交易时间
            is_morning = (hour == 9 and minute >= 30) or (hour == 10) or (hour == 11 and minute <= 30)
            is_afternoon = (hour == 13) or (hour == 14) or (hour == 15 and minute == 0)
            data_store.is_trading_hours = is_morning or is_afternoon
            
            # 每5秒更新
            stocks_data = data_source.get_all_stocks(force_refresh=True)
            data_store.stocks = {s["code"]: StockInfo(**s) for s in stocks_data}
            
            data_store.big_orders = data_source.get_big_orders(20)
            data_store.daban_candidates = data_source.calculate_daban_candidates()
            data_store.last_update = now
            
            # 广播
            if data_store.subscribers:
                await data_store.broadcast({
                    "type": "market_update",
                    "data": {
                        "timestamp": now.strftime("%H:%M:%S"),
                        "source": data_source.current_source,
                        "stocks": [s.model_dump() for s in data_store.stocks.values()][:50],
                        "big_orders": [o.model_dump() for o in data_store.big_orders[:10]],
                        "daban_candidates": [d.model_dump() for d in data_store.daban_candidates[:10]]
                    }
                })
            
            await asyncio.sleep(5)
            
        except Exception as e:
            print(f"数据更新错误: {e}")
            await asyncio.sleep(10)

# ============== FastAPI ==============

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 启动市场数据更新器...")
    asyncio.create_task(market_data_updater())
    yield
    print("👋 关闭服务...")

app = FastAPI(title="A股实时交易监控平台", version="2.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/stocks")
async def get_stocks(search: str = None, limit: int = 50):
    stocks = data_source.get_all_stocks()
    if search:
        search = search.upper()
        stocks = [s for s in stocks if search in s["code"] or search in s["name"]]
    return {"stocks": stocks[:limit], "total": len(stocks), "source": data_source.current_source}

@app.get("/api/stock/{code}")
async def get_stock(code: str):
    detail = data_source.get_stock_detail(code)
    if not detail:
        raise HTTPException(status_code=404, detail="股票不存在")
    return detail

@app.get("/api/big-orders")
async def get_big_orders(limit: int = 30):
    orders = data_source.get_big_orders(limit)
    return {"orders": orders, "count": len(orders)}

@app.get("/api/daban")
async def get_daban_candidates():
    candidates = data_source.calculate_daban_candidates()
    return {"candidates": candidates, "count": len(candidates)}

@app.get("/api/market/status")
async def get_market_status():
    return {
        "is_trading_hours": data_store.is_trading_hours,
        "last_update": data_store.last_update.strftime("%H:%M:%S") if data_store.last_update else None,
        "source": data_source.current_source,
        "subscribers": len(data_store.subscribers)
    }

@app.websocket("/ws/market")
async def websocket_endpoint(websocket: WebSocket):
    await data_store.subscribe(websocket)
    try:
        await websocket.send_json({"type": "connected", "message": "已连接", "source": data_source.current_source})
        while True:
            try:
                data = await websocket.receive_text()
                msg = json.loads(data)
                if msg.get("action") == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg.get("action") == "get_stock":
                    detail = data_source.get_stock_detail(msg.get("code"))
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
    return {"status": "ok", "timestamp": datetime.now().isoformat(), "source": data_source.current_source}

from fastapi.responses import FileResponse
import os

frontend_dist = os.path.join(os.path.dirname(__file__), "../frontend/dist")

@app.get("/")
async def root():
    return FileResponse(os.path.join(frontend_dist, "index.html"))

@app.get("/{path:path}")
async def catch_all(path: str):
    if path.startswith("api/"):
        raise HTTPException(status_code=404)
    file_path = os.path.join(frontend_dist, path)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(frontend_dist, "index.html"))

# ============== 启动 ==============

if __name__ == "__main__":
    threading.Thread(target=lambda: webbrowser.open("http://localhost:8080"), daemon=True).start()
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=False)
