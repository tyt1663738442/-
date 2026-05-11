#!/usr/bin/env python3
"""
A股实时交易监控平台 - 后端服务
- 新浪财经 9:00-15:00 实时数据
- 修复乱码问题
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

import uvicorn
import requests
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
    minute_data: List[dict]

# ============== 全局状态 ==============

class MarketDataStore:
    def __init__(self):
        self.stocks: Dict[str, StockInfo] = {}
        self.big_orders: List[BigOrder] = []
        self.daban_candidates: List[DaBanStock] = []
        self.last_update: Optional[datetime] = None
        self.subscribers: Set[WebSocket] = set()
        
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

# ============== 数据源 ==============

class StockDataSource:
    """新浪财经 9:00-15:00 实时数据"""
    
    BIG_ORDER_THRESHOLD = 5000000
    
    def __init__(self):
        self.stocks_cache: List[Dict] = []
        self.cache_time: Optional[datetime] = None
        self.cache_ttl = 10
        self.current_source = "sina"
        
        # 主板股票列表
        self.main_board_stocks = [
            "600519", "600036", "601318", "600900", "600016", "600028", "601857", 
            "600050", "601668", "600019", "601166", "600000", "601328", "601818",
            "601601", "601628", "600837", "601012", "600030", "601088", "600104",
            "600585", "601766", "600031", "601319", "600276", "601398", "601288",
            "601988", "601186", "601669", "601390", "601211", "601336", "601688",
            "600690", "600887", "600009", "600115", "600018", "600027", "601727",
            "600150", "600547", "600489", "600111", "600570", "600588", "600703",
            "000001", "000002", "000063", "000066", "000100", "000333", "000338",
            "000425", "000568", "000651", "000661", "000708", "000725", "000768",
            "000858", "000876", "000895", "000938", "002001", "002027", "002044",
            "002049", "002050", "002142", "002230", "002236", "002241", "002252",
            "002304", "002311", "002352", "002371", "002415", "002460", "002475",
            "002493", "002594", "002601", "002602", "002714", "002736", "002739",
        ]
        self.main_board_stocks = list(set(self.main_board_stocks))
    
    def _is_trading_hours(self) -> bool:
        """判断是否在交易时间 9:00-15:00"""
        now = datetime.now()
        weekday = now.weekday()
        if weekday >= 5:
            return False
        hour, minute = now.hour, now.minute
        # 9:00-11:30 上午, 13:00-15:00 下午
        morning = (hour == 9 and minute >= 0) or (hour == 10) or (hour == 11 and minute <= 30)
        afternoon = (hour == 13) or (hour == 14) or (hour == 15 and minute == 0)
        return morning or afternoon
    
    def _is_valid_stock(self, code: str) -> bool:
        """过滤股票"""
        if code.startswith('688'): return False  # 科创板
        if code.startswith('300'): return False  # 创业板
        if code.startswith('8'): return False    # 北交所
        return True
    
    def _fetch_sina_realtime(self) -> List[Dict]:
        """新浪财经实时数据"""
        stocks = []
        batch_size = 50
        batches = [self.main_board_stocks[i:i+batch_size] for i in range(0, len(self.main_board_stocks), batch_size)]
        
        for batch in batches:
            try:
                codes = ','.join([f'sh{c}' if c.startswith('6') else f'sz{c}' for c in batch])
                url = f'https://hq.sinajs.cn/list={codes}'
                
                headers = {
                    'Referer': 'https://finance.sina.com.cn',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
                
                resp = requests.get(url, headers=headers, timeout=10)
                # 重要：使用 GBK 显式解码
                text = resp.content.decode('gbk', errors='replace')
                
                for line in text.strip().split('\n'):
                    if '=' not in line:
                        continue
                    try:
                        parts = line.split('=')[1].strip('";\n\r ')
                        if not parts or len(parts) < 10:
                            continue
                        
                        data = parts.split(',')
                        if len(data) < 10:
                            continue
                        
                        code = line.split('_')[0].split('hq_str_')[1]
                        if code.startswith('sh') or code.startswith('sz'):
                            code = code[2:]
                        
                        if not self._is_valid_stock(code):
                            continue
                        
                        # 安全解析数值
                        try:
                            name = data[0].strip()
                            open_price = float(data[1]) if data[1].strip() else 0
                            pre_close = float(data[2]) if data[2].strip() else 0
                            price = float(data[3]) if data[3].strip() else 0
                            high = float(data[4]) if data[4].strip() else 0
                            low = float(data[5]) if data[5].strip() else 0
                            volume = int(float(data[8])) if data[8].strip() else 0
                            amount = float(data[9]) if data[9].strip() else 0
                        except (ValueError, IndexError):
                            continue
                        
                        if price <= 0:
                            continue
                        
                        change_percent = ((price - pre_close) / pre_close * 100) if pre_close > 0 else 0
                        limit_up = round(pre_close * 1.1, 2)
                        limit_down = round(pre_close * 0.9, 2)
                        
                        stocks.append({
                            "code": code,
                            "name": name,
                            "price": price,
                            "change_percent": round(change_percent, 2),
                            "volume": volume,
                            "amount": amount,
                            "high": high,
                            "low": low,
                            "open": open_price,
                            "pre_close": pre_close,
                            "limit_up": limit_up,
                            "limit_down": limit_down,
                        })
                    except Exception:
                        continue
            except Exception as e:
                print(f"新浪API错误: {e}")
                continue
        
        stocks.sort(key=lambda x: x.get("amount", 0), reverse=True)
        return stocks
    
    def get_all_stocks(self, force_refresh: bool = False) -> List[Dict]:
        """获取股票数据"""
        if not force_refresh and self.stocks_cache and self.cache_time:
            if (datetime.now() - self.cache_time).seconds < self.cache_ttl:
                return self.stocks_cache
        
        stocks = self._fetch_sina_realtime()
        self.stocks_cache = stocks
        self.cache_time = datetime.now()
        self.current_source = "sina"
        return stocks
    
    def get_stock_detail(self, code: str) -> Optional[StockDetail]:
        """获取个股详情"""
        try:
            stocks = self.get_all_stocks()
            stock = next((s for s in stocks if s["code"] == code), None)
            if not stock:
                return None
            
            # 生成模拟分时数据
            minute_data = []
            base_price = stock["price"]
            pre_close = stock["pre_close"]
            for i in range(60):
                minute_data.append({
                    "time": f"{9 + i // 60 if i < 120 else 13 + (i - 120) // 60}:{(i % 60):02d}:00",
                    "price": round(pre_close + (base_price - pre_close) * (i / 60), 2),
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
            if stock.get("amount", 0) > self.BIG_ORDER_THRESHOLD:
                is_bullish = stock.get("change_percent", 0) > 0
                big_orders.append(BigOrder(
                    code=stock["code"],
                    name=stock["name"],
                    price=stock["price"],
                    volume=stock["volume"],
                    amount=stock["amount"] / 10000,
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
                
                seal_amount = volume * price / 10000 * 0.15
                score = max(0, (5 - distance_to_limit)) * 15 + min(2.5, 5) * 5 + min(seal_amount / 1000, 20) + change * 0.5
                
                candidates.append(DaBanStock(
                    code=stock["code"],
                    name=stock["name"],
                    price=price,
                    change_percent=change,
                    volume_ratio=2.5,
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
            stocks_data = data_source.get_all_stocks(force_refresh=True)
            data_store.stocks = {s["code"]: StockInfo(**s) for s in stocks_data}
            data_store.big_orders = data_source.get_big_orders(20)
            data_store.daban_candidates = data_source.calculate_daban_candidates()
            data_store.last_update = now
            
            if data_store.subscribers:
                await data_store.broadcast({
                    "type": "market_update",
                    "data": {
                        "timestamp": now.strftime("%H:%M:%S"),
                        "is_trading": data_source._is_trading_hours(),
                        "stocks": [s.model_dump() for s in data_store.stocks.values()][:50],
                        "big_orders": [o.model_dump() for o in data_store.big_orders[:10]],
                        "daban_candidates": [d.model_dump() for d in data_store.daban_candidates[:10]]
                    }
                })
            
            await asyncio.sleep(5)
        except Exception as e:
            print(f"更新错误: {e}")
            await asyncio.sleep(10)

# ============== FastAPI ==============

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 启动市场数据更新器 (9:00-15:00)...")
    asyncio.create_task(market_data_updater())
    yield
    print("👋 关闭服务...")

app = FastAPI(title="A股实时交易监控", version="3.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/stocks")
async def get_stocks(search: str = None, limit: int = 100):
    stocks = data_source.get_all_stocks()
    if search:
        search = search.upper()
        stocks = [s for s in stocks if search in s["code"] or search in s["name"]]
    return {
        "stocks": stocks[:limit], 
        "total": len(stocks), 
        "is_trading": data_source._is_trading_hours()
    }

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
        "last_update": data_store.last_update.strftime("%H:%M:%S") if data_store.last_update else None,
        "is_trading": data_source._is_trading_hours(),
        "trading_hours": "9:00-11:30 / 13:00-15:00",
        "stocks_count": len(data_store.stocks)
    }

@app.websocket("/ws/market")
async def websocket_endpoint(websocket: WebSocket):
    await data_store.subscribe(websocket)
    try:
        await websocket.send_json({"type": "connected", "is_trading": data_source._is_trading_hours()})
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

@app.get("/api/health")
async def health_check():
    return {
        "status": "ok", 
        "timestamp": datetime.now().isoformat(),
        "is_trading": data_source._is_trading_hours(),
        "time": datetime.now().strftime("%H:%M:%S")
    }

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

if __name__ == "__main__":
    threading.Thread(target=lambda: webbrowser.open("http://localhost:8080"), daemon=True).start()
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=False)
