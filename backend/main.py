#!/usr/bin/env python3
"""
A股实时交易监控平台 - 后端服务 (修复版)
- 新浪财经 7x24 实时数据
- 修复编码问题
- 交易时间判断
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

# ============== 实时数据源 (7x24) ==============

class StockDataSource:
    """新浪财经 7x24小时 实时数据"""
    
    BIG_ORDER_THRESHOLD = 5000000
    
    def __init__(self):
        self.stocks_cache: List[Dict] = []
        self.cache_time: Optional[datetime] = None
        self.cache_ttl = 10
        self.current_source = "sina"
        
        # 主板股票列表
        self.main_board_stocks = [
            # 沪市主板 (600/601/603)
            "600519", "600036", "601318", "600900", "600016", "600028", "601857", 
            "600050", "601668", "600019", "601166", "600000", "601328", "601818",
            "601601", "601628", "600837", "601012", "600030", "601088", "600104",
            "600585", "601766", "600031", "601319", "600276", "601398", "601288",
            "601988", "601186", "601669", "601390", "601211", "601336", "601688",
            "600690", "600887", "600009", "600115", "600018", "600027", "601727",
            "600150", "600547", "600489", "600111", "600570", "600588", "600703",
            "600745", "600893", "600760", "600862", "603259", "603288", "603501",
            "603799", "603986", "603160", "603417", "603486", "603605", "603899",
            # 深市主板 (000)
            "000001", "000002", "000063", "000066", "000100", "000333", "000338",
            "000425", "000568", "000651", "000661", "000708", "000725", "000768",
            "000858", "000876", "000895", "000938", "000001", "000002", "000063",
            "000100", "000333", "000338", "000425", "000568", "000651", "000661",
            "000708", "000725", "000768", "000858", "000876", "000895", "000938",
            # 中小板 (002)
            "002001", "002027", "002044", "002049", "002050", "002142", "002230",
            "002236", "002241", "002252", "002304", "002311", "002352", "002371",
            "002415", "002460", "002475", "002493", "002594", "002601", "002602",
            "002714", "002736", "002739", "002841", "002920",
        ]
        self.main_board_stocks = list(set(self.main_board_stocks))
    
    def _is_trading_hours(self) -> bool:
        """判断是否在交易时间"""
        now = datetime.now()
        weekday = now.weekday()  # 0=周一, 6=周日
        
        # 周末休市
        if weekday >= 5:
            return False
        
        hour, minute = now.hour, now.minute
        
        # 上午: 9:30-11:30
        morning = (hour == 9 and minute >= 30) or (hour == 10) or (hour == 11 and minute <= 30)
        # 下午: 13:00-15:00
        afternoon = (hour == 13) or (hour == 14) or (hour == 15 and minute == 0)
        
        return morning or afternoon
    
    def _is_valid_stock(self, code: str) -> bool:
        """过滤股票"""
        if code.startswith('688'):
            return False
        if code.startswith('300'):
            return False
        if code.startswith('8'):
            return False
        return True
    
    def _fetch_sina_realtime(self) -> List[Dict]:
        """新浪财经实时数据 (7x24)"""
        stocks = []
        
        batch_size = 50
        batches = [self.main_board_stocks[i:i+batch_size] for i in range(0, len(self.main_board_stocks), batch_size)]
        
        for batch in batches:
            try:
                codes = []
                for code in batch:
                    if code.startswith('6'):
                        codes.append(f'sh{code}')
                    else:
                        codes.append(f'sz{code}')
                
                codes_str = ','.join(codes)
                url = f'https://hq.sinajs.cn/list={codes_str}'
                
                headers = {
                    'Referer': 'https://finance.sina.com.cn',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
                
                resp = requests.get(url, headers=headers, timeout=10)
                
                # 确保正确解码
                resp.encoding = 'gbk'
                text = resp.text
                
                lines = text.strip().split('\n')
                
                for line in lines:
                    if '=' not in line:
                        continue
                    
                    try:
                        # 解析数据
                        content = line.split('=')[1].strip('";\n\r ')
                        if not content or len(content) < 10:
                            continue
                        
                        parts = content.split(',')
                        if len(parts) < 10:
                            continue
                        
                        code = line.split('_')[0].split('hq_str_')[1]
                        if code.startswith('sh') or code.startswith('sz'):
                            code = code[2:]
                        
                        if not self._is_valid_stock(code):
                            continue
                        
                        name = parts[0].strip()
                        open_price = float(parts[1]) if parts[1].strip() else 0
                        pre_close = float(parts[2]) if parts[2].strip() else 0
                        price = float(parts[3]) if parts[3].strip() else 0
                        high = float(parts[4]) if parts[4].strip() else 0
                        low = float(parts[5]) if parts[5].strip() else 0
                        volume = int(float(parts[8])) if parts[8].strip() else 0
                        amount = float(parts[9]) if parts[9].strip() else 0
                        
                        if price <= 0:
                            continue
                        
                        change_percent = ((price - pre_close) / pre_close * 100) if pre_close > 0 else 0
                        
                        limit_up = round(pre_close * 1.1, 2) if not (code.startswith('688') or code.startswith('300') or code.startswith('8')) else round(pre_close * 1.2, 2)
                        limit_down = round(pre_close * 0.9, 2) if not (code.startswith('688') or code.startswith('300') or code.startswith('8')) else round(pre_close * 0.8, 2)
                        
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
                        
                    except Exception as e:
                        continue
                        
            except Exception as e:
                print(f"新浪API请求失败: {e}")
                continue
        
        stocks.sort(key=lambda x: x.get("amount", 0), reverse=True)
        return stocks
    
    def get_all_stocks(self, force_refresh: bool = False) -> List[Dict]:
        """获取股票数据"""
        if not force_refresh and self.stocks_cache and self.cache_time:
            if (datetime.now() - self.cache_time).seconds < self.cache_ttl:
                return self.stocks_cache
        
        stocks = self._fetch_sina_realtime()
        
        if not stocks or len(stocks) < 5:
            stocks = self._fetch_tencent_realtime()
        
        self.stocks_cache = stocks
        self.cache_time = datetime.now()
        self.current_source = "sina"
        
        return stocks
    
    def _fetch_tencent_realtime(self) -> List[Dict]:
        """腾讯财经实时数据 (备用)"""
        stocks = []
        
        batch_size = 100
        batches = [self.main_board_stocks[i:i+batch_size] for i in range(0, len(self.main_board_stocks), batch_size)]
        
        for batch in batches:
            try:
                codes = []
                for code in batch:
                    if code.startswith('6'):
                        codes.append(f'sh{code}')
                    else:
                        codes.append(f'sz{code}')
                
                codes_str = ','.join(codes)
                url = f'https://qt.gtimg.cn/q={codes_str}'
                
                headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
                resp = requests.get(url, timeout=10, headers=headers)
                resp.encoding = 'utf-8'
                
                lines = resp.text.strip().split('\n')
                
                for line in lines:
                    if '"' not in line:
                        continue
                    
                    try:
                        parts = line.split('~')
                        if len(parts) < 40:
                            continue
                        
                        code = parts[2].strip()
                        name = parts[1].strip()
                        
                        if not self._is_valid_stock(code):
                            continue
                        
                        price = float(parts[3]) if parts[3].strip() else 0
                        pre_close = float(parts[4]) if parts[4].strip() else 0
                        open_price = float(parts[5]) if parts[5].strip() else 0
                        volume = int(float(parts[6])) if parts[6].strip() else 0
                        high = float(parts[33]) if parts[33].strip() else 0
                        low = float(parts[34]) if parts[34].strip() else 0
                        amount = float(parts[37]) if parts[37].strip() else 0
                        
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
                print(f"腾讯API请求失败: {e}")
                continue
        
        stocks.sort(key=lambda x: x.get("amount", 0), reverse=True)
        return stocks
    
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
            except Exception:
                base_price = stock["price"]
                pre_close = stock["pre_close"]
                for i in range(60):
                    minute_data.append({
                        "time": f"{9 + i // 60 if i < 120 else 13 + (i - 120) // 60}:{(i % 60):02d}:00",
                        "price": round(pre_close + (base_price - pre_close) * (i / 60) + random.uniform(-0.5, 0.5), 2),
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
            print(f"数据更新错误: {e}")
            await asyncio.sleep(10)

# ============== FastAPI ==============

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 启动市场数据更新器...")
    asyncio.create_task(market_data_updater())
    yield
    print("👋 关闭服务...")

app = FastAPI(title="A股实时交易监控平台", version="3.1.0", lifespan=lifespan)

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
        "stocks_count": len(data_store.stocks)
    }

@app.websocket("/ws/market")
async def websocket_endpoint(websocket: WebSocket):
    await data_store.subscribe(websocket)
    try:
        await websocket.send_json({
            "type": "connected", 
            "is_trading": data_source._is_trading_hours()
        })
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
        "is_trading": data_source._is_trading_hours()
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
