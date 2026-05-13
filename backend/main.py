#!/usr/bin/env python3
"""
A股实时监控平台 - 后端服务 v2.0
- 同花顺风格数据接口
- 竞价阶段数据（9:15-9:25）
- 实时打板精选（全时段）
- 新浪财经 + 腾讯财经 双数据源
"""

import asyncio
import json
import time
import random
import re
from datetime import datetime, time as dtime
from typing import Dict, List, Optional, Set
from collections import defaultdict

import uvicorn
import requests
import pandas as pd
import akshare as ak
from fastapi import FastAPI, WebSocket, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from concurrent.futures import ThreadPoolExecutor

# ============== 配置 ==============

class Config:
    BIG_ORDER_THRESHOLD = 5000000  # 大单阈值500万
    REFRESH_INTERVAL = 3  # 交易时段3秒刷新
    CACHE_TTL = 5
    # 同花顺配色（绿涨红跌）
    THS_COLORS = {
        'up': '#15b755',      # 上涨-绿
        'down': '#f23645',    # 下跌-红
        'flat': '#8a8d93',    # 平盘-灰
    }

# ============== 数据模型 ==============

class StockInfo(BaseModel):
    code: str           # 股票代码
    name: str           # 股票名称
    price: float        # 现价
    change: float       # 涨跌额
    change_pct: float   # 涨跌幅（%）
    volume: int         # 成交量（手）
    amount: float       # 成交额（元）
    turnover: float     # 换手率（%）
    high: float         # 最高
    low: float          # 最低
    open: float         # 今开
    pre_close: float    # 昨收
    bid1: float         # 买一价
    ask1: float         # 卖一价
    bid_vol1: int       # 买一量
    ask_vol1: int       # 卖一量
    volume_ratio: float # 量比
    pb: float           # 市净率
    pe: float           # 市盈率
    mkt_cap: float      # 总市值（亿）
    float_cap: float    # 流通市值（亿）
    limit_up: float     # 涨停价
    limit_down: float   # 跌停价
    seal_amount: float  # 涨停封单金额（万）
    seal_ratio: float   # 封单占比（%）
    phase: str          # 交易阶段: 集合竞价/连续竞价/午间休市/已休市/待开盘

class MinuteTick(BaseModel):
    time: str           # 时间 HH:MM:SS
    price: float        # 价格
    volume: int         # 成交量累计
    amount: float       # 成交额累计
    change_pct: float   # 涨跌幅
    avg_price: float    # 均价

class DaBanStock(BaseModel):
    code: str
    name: str
    price: float
    change_pct: float
    distance_to_limit: float  # 距涨停（%）
    seal_amount: float         # 封单金额（万）
    seal_ratio: float          # 封单/成交比
    volume_ratio: float         # 量比
    turnover: float             # 换手率
    speed_score: float          # 涨停速度评分
    follow_score: float         # 跟风强度评分
    seal_score: float           # 封单质量评分
    total_score: float          # 综合评分
    reason: str                 # 打板理由
    phase: str                  # 所处阶段: 竞价/一板/二板/妖股
    time_to_seal: str           # 封板时间（如 9:32）
    board_count: int            # 连板数
    sector: str                 # 所属板块
    is_sealed: bool             # 是否封板

class MarketStatus(BaseModel):
    phase: str            # 市场阶段
    time: str             # 当前时间
    is_trading: bool      # 是否交易中
    auction_status: str    # 竞价状态: 未开始/竞价中/竞价结束
    index_data: Dict       # 主要指数

# ============== 数据源 ==============

class THSDataSource:
    """
    同花顺风格数据源
    - 新浪财经（主）：实时分时+K线
    - 腾讯财经（备）：实时快照
    - 同花顺（备）：板块数据
    """

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://finance.sina.com.cn',
        })
        self._cache: Dict = {}
        self._cache_time: float = 0
        self.executor = ThreadPoolExecutor(max_workers=4)

    def _get_market_phase(self) -> str:
        """判断当前市场阶段"""
        now = datetime.now()
        weekday = now.weekday()
        if weekday >= 5:
            return '周末休市'

        t = now.time()
        # 竞价阶段
        if dtime(9, 15) <= t < dtime(9, 25):
            return '集合竞价'
        # 连续竞价
        elif dtime(9, 25) <= t < dtime(11, 30):
            return '连续竞价'
        elif dtime(11, 30) <= t < dtime(13, 0):
            return '午间休市'
        elif dtime(13, 0) <= t < dtime(15, 0):
            return '连续竞价'
        elif dtime(15, 0) <= t < dtime(15, 30):
            return '盘后定价'
        else:
            return '已休市'

    def fetch_batch_realtime(self, codes: List[str]) -> Dict[str, StockInfo]:
        """批量获取实时数据"""
        result = {}
        # 分批请求新浪
        batches = [codes[i:i+50] for i in range(0, len(codes), 50)]

        for batch in batches:
            try:
                symbols = ','.join([f'sh{c}' if c.startswith(('6', '5')) else f'sz{c}' for c in batch])
                url = f'https://hq.sinajs.cn/list={symbols}'
                resp = self.session.get(url, timeout=8)
                resp.encoding = 'gbk'
                lines = resp.text.strip().split('\n')

                for line in lines:
                    if '=' not in line or 'hq_str' not in line:
                        continue
                    try:
                        info = self._parse_sina_line(line)
                        if info:
                            result[info['code']] = StockInfo(**info)
                    except Exception as e:
                        continue
            except Exception as e:
                print(f"批量获取失败: {e}")
                continue

        return result

    def _parse_sina_line(self, line: str) -> Optional[Dict]:
        """解析新浪行情行"""
        try:
            key = line.split('hq_str_')[1].split('=')[0]
            prefix = 'sh' if key.startswith('sh') else 'sz'
            code = key[2:]
            if not code.isdigit():
                return None

            parts = line.split('"')[1].split(',')
            if len(parts) < 32:
                return None

            price = float(parts[3]) if parts[3] else 0
            pre_close = float(parts[2]) if parts[2] else 0
            change = price - pre_close
            change_pct = (change / pre_close * 100) if pre_close else 0
            high = float(parts[4]) if parts[4] else price
            low = float(parts[5]) if parts[5] else price
            volume = int(float(parts[8])) if parts[8] else 0  # 成交量（股）
            amount = float(parts[9]) if parts[9] else 0  # 成交额（元）
            open = float(parts[1]) if parts[1] else price
            bid1 = float(parts[11]) if parts[11] else price
            ask1 = float(parts[19]) if parts[19] else price
            bid_vol1 = int(parts[10]) if parts[10] else 0
            ask_vol1 = int(parts[20]) if parts[20] else 0
            turnover = float(parts[38]) if len(parts) > 38 and parts[38] else 0
            pe = float(parts[39]) if len(parts) > 39 and parts[39] else 0
            pb = float(parts[46]) if len(parts) > 46 and parts[46] else 0
            mkt_cap = float(parts[44]) / 100000000 if len(parts) > 44 and parts[44] else 0
            float_cap = float(parts[45]) / 100000000 if len(parts) > 45 and parts[45] else 0

            # 计算涨跌停价（同花顺精确算法）
            if pre_close > 0:
                if 'ST' not in parts[0]:
                    limit_up = round(pre_close * 1.10, 2)
                    limit_down = round(pre_close * 0.90, 2)
                else:
                    limit_up = round(pre_close * 1.05, 2)
                    limit_down = round(pre_close * 0.95, 2)
            else:
                limit_up = limit_down = price

            # 封单金额（买一价 * 买一量）
            seal_amount = bid1 * bid_vol1 / 10000  # 转换为万元

            phase = self._get_market_phase()

            return {
                'code': code,
                'name': parts[0],
                'price': price,
                'change': round(change, 2),
                'change_pct': round(change_pct, 2),
                'volume': volume // 100,  # 转手
                'amount': amount,
                'turnover': round(turnover, 2),
                'high': high,
                'low': low,
                'open': open,
                'pre_close': pre_close,
                'bid1': bid1,
                'ask1': ask1,
                'bid_vol1': bid_vol1,
                'ask_vol1': ask_vol1,
                'volume_ratio': 0,  # 需计算
                'pb': round(pb, 2),
                'pe': round(pe, 2) if pe and pe > 0 else 0,
                'mkt_cap': round(mkt_cap, 2),
                'float_cap': round(float_cap, 2),
                'limit_up': limit_up,
                'limit_down': limit_down,
                'seal_amount': round(seal_amount, 0),
                'seal_ratio': 0,
                'phase': phase,
            }
        except Exception:
            return None

    def fetch_index_data(self) -> Dict:
        """获取主要指数（上证、深证、创业板、科创50）"""
        try:
            url = 'https://hq.sinajs.cn/list=s_sh000001,s_sz399001,s_sz399006,s_sh000688'
            resp = self.session.get(url, timeout=5)
            resp.encoding = 'gbk'
            result = {}
            name_map = {
                's_sh000001': ('上证指数', 'sh'),
                's_sz399001': ('深证成指', 'sz'),
                's_sz399006': ('创业板指', 'cyb'),
                's_sh000688': ('科创50', 'kc'),
            }
            for line in resp.text.strip().split('\n'):
                for key, (name, prefix) in name_map.items():
                    if key in line and '"' in line:
                        parts = line.split('"')[1].split(',')
                        if len(parts) > 4:
                            price = float(parts[1])
                            pre = float(parts[3])
                            chg = price - pre
                            pct = (chg / pre * 100) if pre else 0
                            result[prefix] = {
                                'name': name,
                                'price': round(price, 2),
                                'change': round(chg, 2),
                                'change_pct': round(pct, 2),
                                'high': float(parts[4]) if parts[4] else price,
                                'low': float(parts[5]) if parts[5] else price,
                            }
                        break
            return result
        except Exception as e:
            return {}

    def fetch_tencent_realtime(self, code: str) -> Optional[Dict]:
        """腾讯财经实时数据（备用）"""
        try:
            prefix = 'sh' if code.startswith(('6', '5')) else 'sz'
            url = f'https://qt.gtimg.cn/q={prefix}{code}'
            resp = self.session.get(url, timeout=5)
            resp.encoding = 'gbk'
            if 'var v_' not in resp.text:
                return None
            parts = resp.text.split('~')
            if len(parts) < 40:
                return None
            return {
                'price': float(parts[3]),
                'high': float(parts[33]),
                'low': float(parts[34]),
                'volume': int(parts[6]),
                'pe': float(parts[39]) if parts[39] else 0,
            }
        except:
            return None

    def fetch_auction_data(self, codes: List[str]) -> Dict[str, Dict]:
        """
        获取竞价数据（9:15-9:25）
        返回每只股票竞价阶段的买卖盘口数据
        """
        # 新浪提供竞价数据
        result = {}
        try:
            symbols = ','.join([f'sh{c}' if c.startswith(('6','5')) else f'sz{c}' for c in codes])
            url = f'https://hq.sinajs.cn/list={symbols}'
            resp = self.session.get(url, timeout=8)
            resp.encoding = 'gbk'

            for line in resp.text.strip().split('\n'):
                if '=' not in line or 'hq_str' not in line:
                    continue
                key = line.split('hq_str_')[1].split('=')[0]
                prefix = 'sh' if key.startswith('sh') else 'sz'
                code = key[2:]
                if not code.isdigit():
                    continue
                try:
                    parts = line.split('"')[1].split(',')
                    if len(parts) < 10:
                        continue
                    # 竞价数据：昨收、开盘价、成交量
                    result[code] = {
                        'auction_open': float(parts[1]) if parts[1] else 0,  # 竞价开盘价
                        'auction_vol': int(float(parts[8])) if parts[8] else 0,
                        'pre_close': float(parts[2]) if parts[2] else 0,
                        'current_price': float(parts[3]) if parts[3] else 0,
                    }
                except:
                    continue
        except Exception as e:
            print(f"竞价数据获取失败: {e}")
        return result


# ============== 打板精选引擎 ==============

class DaBanEngine:
    """
    打板精选引擎 v2.0
    全时段策略：竞价 → 早盘 → 午盘 → 尾盘
    """

    def __init__(self, data_source: THSDataSource):
        self.ds = data_source
        self.history: Dict[str, List[Dict]] = defaultdict(list)  # 记录每小时数据

    def calculate(self, stocks: Dict[str, StockInfo], phase: str) -> List[DaBanStock]:
        """计算打板候选"""
        candidates = []

        for code, stock in stocks.items():
            # 过滤条件（同花顺标准）
            if not self._filter_stock(stock):
                continue

            try:
                # 计算各项评分
                speed_score = self._calc_speed_score(stock, phase)
                follow_score = self._calc_follow_score(stock)
                seal_score = self._calc_seal_score(stock)
                total = round((speed_score * 0.4 + follow_score * 0.3 + seal_score * 0.3), 1)

                if total < 40:
                    continue

                # 距涨停距离
                if stock.limit_up > 0:
                    dist = (stock.limit_up - stock.price) / stock.limit_up * 100
                else:
                    dist = 100

                # 封板判断
                is_sealed = abs(dist) < 0.3 and stock.change_pct > 9.5

                # 打板理由
                reason = self._generate_reason(stock, phase, speed_score, follow_score)

                # 所处阶段
                board_phase = self._judge_phase(stock, phase)

                candidates.append(DaBanStock(
                    code=code,
                    name=stock.name,
                    price=stock.price,
                    change_pct=stock.change_pct,
                    distance_to_limit=round(dist, 2),
                    seal_amount=stock.seal_amount,
                    seal_ratio=round(stock.seal_ratio, 2),
                    volume_ratio=stock.volume_ratio,
                    turnover=stock.turnover,
                    speed_score=speed_score,
                    follow_score=follow_score,
                    seal_score=seal_score,
                    total_score=total,
                    reason=reason,
                    phase=board_phase,
                    time_to_seal=self._estimate_seal_time(stock),
                    board_count=self._count_boards(stock),
                    sector=self._guess_sector(code),
                    is_sealed=is_sealed,
                ))

                # 记录历史
                self.history[code].append({
                    'time': datetime.now().strftime('%H:%M'),
                    'score': total,
                    'change_pct': stock.change_pct,
                    'seal_amount': stock.seal_amount,
                })

            except Exception as e:
                continue

        # 按综合评分排序
        candidates.sort(key=lambda x: x.total_score, reverse=True)
        return candidates[:30]

    def _filter_stock(self, stock: StockInfo) -> bool:
        """过滤股票"""
        # 排除条件
        if stock.price <= 0:
            return False
        if stock.pre_close <= 0:
            return False
        if 'ST' in stock.name or '*' in stock.name:
            return False
        # 排除科创、创业板（按用户需求，这里保留主板）
        if stock.code.startswith('688'):
            return False
        # 排除北交所
        if stock.code.startswith('8'):
            return False
        # 基本条件：涨幅>=3%或距涨停<=5%
        dist_to_limit = (stock.limit_up - stock.price) / stock.limit_up * 100 if stock.limit_up > 0 else 100
        if stock.change_pct < 3 and dist_to_limit > 5:
            return False
        return True

    def _calc_speed_score(self, stock: StockInfo, phase: str) -> float:
        """涨停速度评分（0-100）"""
        score = 50
        # 涨幅越接近涨停越高
        dist = (stock.limit_up - stock.price) / stock.limit_up * 100 if stock.limit_up > 0 else 100
        if dist < 1:
            score += 30
        elif dist < 3:
            score += 20
        elif dist < 5:
            score += 10
        # 换手率
        if stock.turnover > 15:
            score += 15
        elif stock.turnover > 8:
            score += 8
        # 竞价阶段额外加分
        if phase == '集合竞价':
            if stock.change_pct >= 9.5:
                score += 20
            elif stock.change_pct >= 5:
                score += 10
        return min(score, 100)

    def _calc_follow_score(self, stock: StockInfo) -> float:
        """跟风强度评分（0-100）"""
        score = 50
        # 量比
        if stock.volume_ratio > 5:
            score += 25
        elif stock.volume_ratio > 3:
            score += 15
        elif stock.volume_ratio > 2:
            score += 8
        # 封单金额
        if stock.seal_amount > 10000:  # 1亿
            score += 20
        elif stock.seal_amount > 5000:
            score += 12
        elif stock.seal_amount > 1000:
            score += 5
        return min(score, 100)

    def _calc_seal_score(self, stock: StockInfo) -> float:
        """封单质量评分（0-100）"""
        score = 50
        # 封单/成交比
        if stock.seal_ratio > 100:
            score += 30
        elif stock.seal_ratio > 50:
            score += 20
        elif stock.seal_ratio > 20:
            score += 10
        # 封单稳定性（这里简化）
        if stock.seal_amount > 5000:
            score += 15
        return min(score, 100)

    def _generate_reason(self, stock: StockInfo, phase: str, speed: float, follow: float) -> str:
        """生成打板理由"""
        reasons = []
        dist = (stock.limit_up - stock.price) / stock.limit_up * 100 if stock.limit_up > 0 else 100

        if dist < 1:
            reasons.append('即将涨停')
        elif dist < 3:
            reasons.append('逼近涨停')

        if stock.volume_ratio > 3:
            reasons.append(f'量比{s}')

        if stock.seal_amount > 5000:
            reasons.append('封单强势')

        if phase == '集合竞价':
            reasons.append('竞价抢筹')
        elif phase == '连续竞价' and datetime.now().hour < 10:
            reasons.append('早盘强势')

        return ' | '.join(reasons) if reasons else '热门标的'

    def _judge_phase(self, stock: StockInfo, phase: str) -> str:
        """判断所处阶段"""
        if phase == '集合竞价':
            return '竞价'
        hist = self.history.get(stock.code, [])
        if len(hist) >= 5:
            # 有历史记录且涨幅稳定在高位
            recent_scores = [h['score'] for h in hist[-5:]]
            if all(s >= 70 for s in recent_scores):
                return '妖股'
            count = sum(1 for h in hist if h['change_pct'] > 9.5)
            if count == 1:
                return '一板'
            elif count >= 2:
                return '二板+'
        return '首板'

    def _estimate_seal_time(self, stock: StockInfo) -> str:
        """估算封板时间"""
        dist = (stock.limit_up - stock.price) / stock.limit_up * 100 if stock.limit_up > 0 else 100
        now = datetime.now().strftime('%H:%M')
        if dist < 1:
            return now
        elif dist < 5:
            return f'预计{now[:5]}内'
        return '--'

    def _count_boards(self, stock: StockInfo) -> int:
        """计算连板数（简化版，需历史数据）"""
        hist = self.history.get(stock.code, [])
        return sum(1 for h in hist if h['change_pct'] > 9.5)

    def _guess_sector(self, code: str) -> str:
        """猜测所属板块（同花顺有精确数据，这里简化）"""
        return '未知'


# ============== FastAPI 应用 ==============

app = FastAPI(title='A股监控平台 v2.0', version='2.0.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

ds = THSDataSource()
daban_engine = DaBanEngine(ds)

# 监控股票池
MONITOR_STOCKS = [
    # 主板权重股
    '600519', '600036', '601318', '600900', '600016', '600028', '601857',
    '600050', '601668', '600019', '601166', '600000', '601328', '601818',
    '601601', '601628', '600837', '601012', '600030', '601088', '600104',
    '000001', '000002', '000063', '000066', '000100', '000333', '000338',
    '000858', '002594', '300750', '002415', '002460', '601888',
    # 今日热门
    '002418', '600152', '600673', '600821', '000720', '600433',
]

# WebSocket订阅
subscribers: Set[WebSocket] = set()

@app.websocket('/ws/market')
async def ws_market(ws: WebSocket):
    await ws.accept()
    subscribers.add(ws)
    try:
        while True:
            data = await ws.receive_text()
            # 心跳
            if data == 'ping':
                await ws.send_text('pong')
    except Exception:
        subscribers.discard(ws)

@app.get('/api/market/status')
def market_status():
    """市场状态"""
    phase = ds._get_market_phase()
    return MarketStatus(
        phase=phase,
        time=datetime.now().strftime('%H:%M:%S'),
        is_trading=phase in ('集合竞价', '连续竞价'),
        auction_status='竞价中' if phase == '集合竞价' else ('已结束' if phase in ('连续竞价', '午间休市') else '未开始'),
        index_data=ds.fetch_index_data(),
    )

@app.get('/api/stocks')
def get_stocks(
    limit: int = Query(100),
    search: str = Query(''),
    sort_by: str = Query('change_pct'),
    ascending: bool = Query(False),
):
    """获取股票列表"""
    stocks = ds.fetch_batch_realtime(MONITOR_STOCKS)

    if search:
        stocks = {k: v for k, v in stocks.items() if search in v.name or search in k}

    stock_list = list(stocks.values())

    # 排序
    if sort_by == 'change_pct':
        stock_list.sort(key=lambda x: x.change_pct, reverse=not ascending)
    elif sort_by == 'volume':
        stock_list.sort(key=lambda x: x.volume, reverse=True)
    elif sort_by == 'amount':
        stock_list.sort(key=lambda x: x.amount, reverse=True)
    elif sort_by == 'seal_amount':
        stock_list.sort(key=lambda x: x.seal_amount, reverse=True)
    elif sort_by == 'name':
        stock_list.sort(key=lambda x: x.name)

    return {
        'stocks': [s.model_dump() for s in stock_list[:limit]],
        'total': len(stock_list),
        'time': datetime.now().strftime('%H:%M:%S'),
        'phase': ds._get_market_phase(),
    }

@app.get('/api/daban')
def get_daban():
    """打板精选"""
    stocks = ds.fetch_batch_realtime(MONITOR_STOCKS)
    phase = ds._get_market_phase()
    candidates = daban_engine.calculate(stocks, phase)
    return {
        'candidates': [c.model_dump() for c in candidates],
        'time': datetime.now().strftime('%H:%M:%S'),
        'phase': phase,
    }

@app.get('/api/auction')
def get_auction():
    """竞价数据（9:15-9:25有效）"""
    phase = ds._get_market_phase()
    auction_data = ds.fetch_auction_data(MONITOR_STOCKS)
    return {
        'data': auction_data,
        'phase': phase,
        'time': datetime.now().strftime('%H:%M:%S'),
    }

@app.get('/api/stock/{code}')
def get_stock_detail(code: str):
    """个股详情"""
    stock_list = ds.fetch_batch_realtime([code])
    stock = stock_list.get(code)

    if not stock:
        return {'error': '股票不存在'}

    # 获取K线数据
    try:
        prefix = 'sh' if code.startswith(('6', '5')) else 'sz'
        market = 'sh' if code.startswith(('6', '5')) else 'sz'
        df_daily = ak.stock_zh_a_hist(symbol=code, period='daily', adjust='qfq')
        df_weekly = ak.stock_zh_a_hist(symbol=code, period='weekly', adjust='qfq')
        daily_k = df_daily.tail(60).to_dict('records')
        weekly_k = df_weekly.tail(52).to_dict('records')
    except Exception as e:
        daily_k = []
        weekly_k = []

    # 分时数据（腾讯）
    minute_data = []
    try:
        url = f'https://ifzq.gtimg.cn/appstock/app/kline/mkline?param={prefix}{code},m1,,100'
        resp = requests.get(url, timeout=5)
        data = resp.json()
        items = data.get('data', {}).get(f'{prefix}{code}', {}).get('m1', [])
        for item in items[-100:]:
            if len(item) >= 4:
                minute_data.append({
                    'time': item[0],
                    'price': float(item[1]),
                    'volume': int(float(item[4])) if item[4] else 0,
                    'amount': 0,
                    'change_pct': 0,
                    'avg_price': 0,
                })
    except:
        pass

    return {
        **stock.model_dump(),
        'daily_data': daily_k,
        'weekly_data': weekly_k,
        'minute_data': minute_data,
    }

@app.get('/api/big-orders')
def get_big_orders():
    """大单追踪"""
    stocks = ds.fetch_batch_realtime(MONITOR_STOCKS)
    orders = []
    for code, stock in stocks.items():
        if stock.amount >= Config.BIG_ORDER_THRESHOLD:
            orders.append({
                'code': code,
                'name': stock.name,
                'price': stock.price,
                'volume': stock.volume,
                'amount': stock.amount,
                'change_pct': stock.change_pct,
                'is_up': stock.change_pct > 0,
                'time': datetime.now().strftime('%H:%M:%S'),
            })
    orders.sort(key=lambda x: x['amount'], reverse=True)
    return {'orders': orders[:30], 'time': datetime.now().strftime('%H:%M:%S')}

# ============== 启动 ==============

if __name__ == '__main__':
    print('🚀 A股监控平台 v2.0 启动中...')
    print('📊 数据源: 新浪财经 + 腾讯财经')
    print('🎨 风格: 同花顺（绿涨红跌）')
    uvicorn.run(app, host='0.0.0.0', port=8000)
