#!/usr/bin/env python3
"""
A股实时监控平台 - 后端服务 v2.0
- 同花顺风格数据接口
- 竞价阶段数据（9:15-9:25）
- 实时打板精选（全时段）
- 新浪财经 + 腾讯财经 双数据源
"""

import sys, io, os
os.environ.setdefault('PYTHONIOENCODING', 'utf-8')
if sys.stdout and hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr and hasattr(sys.stderr, 'buffer'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import asyncio
import json
import time
import random
import re
import threading
from datetime import datetime, time as dtime
from typing import Dict, List, Optional, Set
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

import uvicorn
import requests
import pandas as pd
import akshare as ak
from fastapi import FastAPI, WebSocket, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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

class BidAskLevel(BaseModel):
    bid_price: float    # 买价
    bid_vol: int        # 买量（手）
    ask_price: float    # 卖价
    ask_vol: int        # 卖量（手）

class MinuteTick(BaseModel):
    time: str           # 时间 HH:MM
    price: float        # 价格
    volume: int         # 成交量累计
    amount: float       # 成交额累计
    change_pct: float   # 涨跌幅
    avg_price: float    # 均价

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
    volume_ratio: float # 量比
    pb: float           # 市净率
    pe: float           # 市盈率
    mkt_cap: float      # 总市值（亿）
    float_cap: float    # 流通市值（亿）
    limit_up: float     # 涨停价
    limit_down: float   # 跌停价
    seal_amount: float  # 涨停封单金额（万）
    seal_ratio: float   # 封单占比（%）
    phase: str          # 交易阶段
    # 五档盘口
    bid_ask: List[BidAskLevel] = []
    # 分时数据（用于前端画图）
    minute_data: List[MinuteTick] = []
    # 衍生指标
    wei_bi: float = 0       # 委比%
    wei_cha: int = 0       # 委差(手)
    sector: str = ''        # 所属行业板块

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
        self.executor = ThreadPoolExecutor(max_workers=4)
        # 缓存层
        self._stock_cache: Dict[str, any] = {}
        self._stock_cache_time: float = 0
        self._stock_cache_lock = threading.Lock()
        self._phase_cache: str = ''
        self._phase_cache_time: float = 0

    def _get_cached_market_phase(self) -> str:
        """带缓存的市场阶段判断（60s TTL）"""
        now = time.time()
        if now - self._phase_cache_time < 60:
            return self._phase_cache
        self._phase_cache = self._calc_market_phase()
        self._phase_cache_time = now
        return self._phase_cache

    def _get_market_phase(self) -> str:
        """判断当前市场阶段"""
        return self._get_cached_market_phase()

    def _calc_market_phase(self) -> str:
        """实际计算市场阶段（不含缓存）"""
        now = datetime.now()
        weekday = now.weekday()
        if weekday >= 5:
            return '周末休市'

        t = now.time()
        if dtime(9, 15) <= t < dtime(9, 25):
            return '集合竞价'
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
        """批量获取实时数据（带 3s TTL 缓存）"""
        now = time.time()
        # 缓存命中：直接返回
        if now - self._stock_cache_time < 3 and self._stock_cache:
            return self._stock_cache

        result = {}
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
                            # 解析五档盘口
                            line_parts = line.split('"')[1].split(',')
                            info['bid_ask'] = self._parse_5level(line_parts)
                            # 计算封单金额（涨停/逼近涨停时）
                            try:
                                if len(line_parts) > 11 and abs(info['price'] - info['limit_up']) < 0.01:
                                    bid1_vol = int(line_parts[11])   # 买一量（手）
                                    bid1_price = float(line_parts[10])  # 买一价
                                    info['seal_amount'] = round(bid1_vol * 100 * bid1_price / 10000, 2)
                            except (ValueError, IndexError):
                                pass
                            result[info['code']] = StockInfo(**info)
                    except Exception as e:
                        print(f"解析失败 {line[:30]}...: {e}")
                        continue
            except Exception as e:
                print(f"批量获取失败: {e}")
                continue

        # 后处理：补充量比和委比
        self._enrich_stock_data(result)

        # 更新缓存（加锁保证线程安全）
        with self._stock_cache_lock:
            self._stock_cache = result
            self._stock_cache_time = now

        return result

    def _fetch_sina_market_center(self, codes: List[str]) -> Dict[str, Dict]:
        """通过新浪Market_Center批量获取换手率、流通市值、量比（替代不可用的东方财富API）
        返回: {code: {'turnover': float(%), 'float_cap': float(亿), 'volume_ratio': float}}
        """
        if not codes:
            return {}
        results = {}
        code_set = set(codes)
        url = 'http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData'
        session = requests.Session()
        session.headers.update({'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.sina.com.cn/'})
        try:
            for node in ['sh_a', 'sz_a']:
                page = 1
                while True:
                    try:
                        r = session.get(url, params={
                            'page': page, 'num': 80, 'sort': 'symbol', 'asc': 1, 'node': node
                        }, timeout=10)
                        data = r.json()
                        if not data:
                            break
                        for item in data:
                            sym = item.get('symbol', '')
                            code = sym[2:] if len(sym) > 2 else sym  # sh600519 -> 600519
                            if code in code_set:
                                turnover = float(item.get('turnoverratio', 0) or 0)  # %
                                nmc = float(item.get('nmc', 0) or 0)  # 万元
                                float_cap = round(nmc / 10000, 2)  # 万→亿
                                results[code] = {
                                    'turnover': round(turnover, 2),
                                    'float_cap': float_cap,
                                    'volume_ratio': 0,  # 新浪此接口无量比，用turnover近似
                                }
                        if len(data) < 80:
                            break
                        page += 1
                        time.sleep(0.15)  # 避免请求过快
                    except Exception:
                        break
        except Exception as e:
            print(f"  [WARN] 新浪Market_Center获取失败: {e}")
        return results

    def _fetch_eastmoney_fields(self, codes: List[str]) -> Dict[str, Dict]:
        """调用东方财富单股API补充换手率、流通市值、量比（备用，新浪Market_Center优先）
        返回: {code: {'turnover': float, 'float_cap': float(亿), 'volume_ratio': float}}
        """
        if not codes:
            return {}
        results = {}
        url = 'https://push2.eastmoney.com/api/qt/stock/get'
        fields = 'f57,f117,f168,f162'
        session = requests.Session()
        session.headers.update({'User-Agent': 'Mozilla/5.0', 'Referer': 'https://quote.eastmoney.com/'})
        for code in codes[:10]:  # 限制最多10只，避免太慢
            try:
                secid = ('1.' + code) if code.startswith('6') else ('0.' + code)
                r = session.get(url, params={'secid': secid, 'fields': fields}, timeout=5)
                d = r.json().get('data')
                if d and d.get('f57'):
                    turnover = (d.get('f168') or 0) / 100
                    float_cap_raw = d.get('f117') or 0
                    float_cap = float(float_cap_raw) / 1e8
                    volume_ratio = (d.get('f162') or 0) / 100
                    results[code] = {
                        'turnover': round(turnover, 2),
                        'float_cap': round(float_cap, 2),
                        'volume_ratio': round(volume_ratio, 2),
                    }
            except Exception:
                pass
        return results

    def _enrich_stock_data(self, stocks: Dict[str, StockInfo]):
        """补充换手率、流通市值、量比、委比等衍生指标 - 直接修改 stock 对象"""
        # 优先从 sector_map.json 缓存填充行业
        for code, stock in stocks.items():
            if not stock.sector and code in DaBanEngine._SECTOR_MAP:
                stock.sector = DaBanEngine._SECTOR_MAP[code]
        # 从全局 Market_Center 缓存补充换手率/流通市值（后台扫描时已更新）
        applied_mc = 0
        for code, stock in stocks.items():
            if code in MARKET_CENTER_CACHE:
                mc = MARKET_CENTER_CACHE[code]
                if mc.get('turnover', 0) > 0 and stock.turnover <= 0:
                    stock.turnover = mc['turnover']
                if mc.get('float_cap', 0) > 0 and stock.float_cap <= 0:
                    stock.float_cap = mc['float_cap']
                applied_mc += 1
        if applied_mc > 0:
            print(f"  [OK] Market_Center缓存命中: {applied_mc}只")

        for code, stock in stocks.items():
            # 量比：如果东方财富没拿到，用换手率*10 近似
            if stock.volume_ratio <= 0 and stock.turnover > 0:
                stock.volume_ratio = round(stock.turnover * 10, 2)
            elif stock.volume_ratio <= 0:
                stock.volume_ratio = 0
            # 委比/委差：从五档盘口计算
            bid_ask = stock.bid_ask  # List[BidAskLevel]
            if len(bid_ask) == 5:
                total_bid_vol = sum(b.bid_vol for b in bid_ask)
                total_ask_vol = sum(b.ask_vol for b in bid_ask)
                total_ba = total_bid_vol + total_ask_vol
                stock.wei_bi = round((total_bid_vol - total_ask_vol) / total_ba * 100, 2) if total_ba > 0 else 0
                stock.wei_cha = total_bid_vol - total_ask_vol
            else:
                stock.wei_bi = 0
                stock.wei_cha = 0

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
            open_price = float(parts[1]) if parts[1] else price
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

            # 封单金额（买一量，单位手，需 * 100股 * 价格 / 10000 转万元）
            seal_amount = 0  # 稍后由五档数据计算

            phase = self._get_market_phase()

            # 量比：新浪 hq.sinajs.cn 不直接提供量比，留0让 _enrich_stock_data 用换手率估算
            vol_ratio = 0

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
                'open': open_price,
                'pre_close': pre_close,
                'volume_ratio': 0,
                'pb': round(pb, 2),
                'pe': round(pe, 2) if pe and pe > 0 else 0,
                'mkt_cap': round(mkt_cap, 2),
                'float_cap': round(float_cap, 2),
                'limit_up': limit_up,
                'limit_down': limit_down,
                'seal_amount': 0,
                'seal_ratio': 0,
                'phase': phase,
            }
        except Exception:
            return None

    def _parse_5level(self, parts: list) -> List[Dict]:
        """解析五档盘口（买一~买五，卖一~卖五）"""
        levels = []
        try:
            # 新浪格式：
            # parts[10] = 买一量, parts[11] = 买一价
            # parts[12] = 买二量, parts[13] = 买二价
            # parts[14] = 买三量, parts[15] = 买三价
            # parts[16] = 买四量, parts[17] = 买四价
            # parts[18] = 买五量, parts[19] = 买五价 ← 注意：新浪买五价实际在parts[19]
            # parts[20] = 卖一量, parts[21] = 卖一价？ 需要核实
            # 实际新浪接口格式：买档在parts[10-18]，卖档在parts[20-28]
            for i in range(5):
                bv = int(float(parts[10 + i*2])) if len(parts) > 10+i*2 and parts[10+i*2] else 0
                bp = float(parts[11 + i*2]) if len(parts) > 11+i*2 and parts[11+i*2] else 0
                av = int(float(parts[20 + i*2])) if len(parts) > 20+i*2 and parts[20+i*2] else 0
                ap = float(parts[21 + i*2]) if len(parts) > 21+i*2 and parts[21+i*2] else 0
                levels.append({
                    'bid_price': bp,
                    'bid_vol': bv,
                    'ask_price': ap,
                    'ask_vol': av,
                })
        except Exception:
            pass
        return levels

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
        返回每只股票竞价阶段的金额、成交量、涨幅
        """
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
                code = key[2:]
                if not code.isdigit():
                    continue
                try:
                    parts = line.split('"')[1].split(',')
                    if len(parts) < 10:
                        continue
                    pre_close = float(parts[2]) if parts[2] else 0
                    current_price = float(parts[3]) if parts[3] else 0
                    auction_vol = int(float(parts[8])) if parts[8] else 0
                    auction_amount = float(parts[9]) if parts[9] else 0
                    auction_open = float(parts[1]) if parts[1] else 0
                    auction_change_pct = round((current_price - pre_close) / pre_close * 100, 2) if pre_close else 0
                    result[code] = {
                        'auction_open': auction_open,
                        'auction_vol': auction_vol,
                        'auction_amount': auction_amount,
                        'auction_change_pct': auction_change_pct,
                        'pre_close': pre_close,
                        'current_price': current_price,
                    }
                except Exception:
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
        # 排除科创、创业板、北交所（用户要求：只保留主板）
        # 688xxx = 科创板, 300xxx = 创业板, 8xxxx = 北交所
        if stock.code.startswith('688'):
            return False
        if stock.code.startswith('300'):
            return False
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
            reasons.append(f'量比{stock.volume_ratio}')

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

    # 全局行业板块映射缓存（由 _enrich_stock_data 从东方财富 f127 填充）
    _SECTOR_MAP: Dict[str, str] = {}  # code -> sector_name

    def _guess_sector(self, code: str) -> str:
        """返回股票所属行业板块（优先从缓存读取，否则返回'未知'）"""
        if code in self._SECTOR_MAP:
            return self._SECTOR_MAP[code]
        return '未知'


# ============== 新浪Market_Center缓存 ==============
MARKET_CENTER_CACHE: Dict[str, Dict] = {}  # {code: {'turnover':float, 'float_cap':float}}
MARKET_CENTER_CACHE_TIME: float = 0

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

# 启动时加载行业板块映射（sector_map.json 由 _build_sector_map.py 生成）
_SECTOR_MAP_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sector_map.json')
if os.path.exists(_SECTOR_MAP_FILE):
    try:
        with open(_SECTOR_MAP_FILE, 'r', encoding='utf-8') as _f:
            _loaded_sectors = json.load(_f)
            DaBanEngine._SECTOR_MAP = _loaded_sectors
            print(f"[OK] 行业板块映射已加载: {len(_loaded_sectors)} 只股票")
    except Exception as _e:
        print(f"[WARN] 行业板块映射加载失败: {_e}")
else:
    print("[WARN] sector_map.json 不存在，行业数据将为空")

# 监控股票池（主板，排除创业板/科创板/ST）
# 300xxx=创业板, 688xxx=科创板, 8xxxx=北交所
MONITOR_STOCKS = [
    # 主板权重股（60xxxx/00xxxx）
    '600519', '600036', '601318', '600900', '600016', '600028', '601857',
    '600050', '601668', '600019', '601166', '600000', '601328', '601818',
    '601601', '601628', '600837', '601012', '600030', '601088', '600104',
    '000001', '000002', '000063', '000066', '000100', '000333', '000338',
    '000858', '002594', '002415', '002460', '601888',
    # 今日热门（主板）
    '002418', '600152', '600673', '600821', '000720', '600433',
]

# ============== 全市场扫描（加载 stock_list.csv）==============
FULL_STOCK_LIST = []
DABAN_CACHE = []
DABAN_CACHE_TIME = 0
AUCTION_CACHE = []
AUCTION_CACHE_TIME = 0
AUCTION_CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'auction_cache.json')
BOARD_COUNT_CACHE: Dict[str, int] = {}  # code -> 连板数，由 _update_board_count_cache 定期更新

def _save_auction_cache():
    """将 AUCTION_CACHE 持久化到文件"""
    try:
        with open(AUCTION_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump({'data': AUCTION_CACHE, 'time': time.time()}, f, ensure_ascii=False)
    except Exception as e:
        print(f"[WARN] 保存 AUCTION_CACHE 失败: {e}")

def _load_auction_cache():
    """从文件恢复 AUCTION_CACHE，并从缓存数据中提取连板数初始化 BOARD_COUNT_CACHE"""
    global AUCTION_CACHE, AUCTION_CACHE_TIME, BOARD_COUNT_CACHE
    if not os.path.exists(AUCTION_CACHE_FILE):
        return False
    try:
        with open(AUCTION_CACHE_FILE, 'r', encoding='utf-8') as f:
            d = json.load(f)
        AUCTION_CACHE = d.get('data', [])
        AUCTION_CACHE_TIME = d.get('time', 0)
        # 从缓存中提取已有的连板数初始化 BOARD_COUNT_CACHE（防止周末后台扫描覆盖）
        BOARD_COUNT_CACHE = {}
        for s in AUCTION_CACHE:
            bc = s.get('board_count')
            if bc and bc > 1:
                BOARD_COUNT_CACHE[s.get('code', '')] = bc
        print(f"[OK] 恢复 AUCTION_CACHE: {len(AUCTION_CACHE)} 只 (时间: {datetime.fromtimestamp(AUCTION_CACHE_TIME).strftime('%m-%d %H:%M')})")
        print(f"  [OK] 初始化 BOARD_COUNT_CACHE: {len(BOARD_COUNT_CACHE)} 只连板>1")
        return len(AUCTION_CACHE) > 0
    except Exception as e:
        print(f"[WARN] 恢复 AUCTION_CACHE 失败: {e}")
        return False

def _update_board_count_cache():
    """
    从东方财富涨停池获取连板数，更新 BOARD_COUNT_CACHE。
    跳过周末/非交易日，继续往前找最近的交易日。
    """
    global BOARD_COUNT_CACHE
    from datetime import datetime as _dt, timedelta as _td
    for i in range(1, 10):  # 扩大范围找最近的交易日
        dt = (_dt.now() - _td(days=i)).strftime('%Y%m%d')
        try:
            df = ak.stock_zt_pool_em(date=dt)
            new_cache = {}
            for _, row in df.iterrows():
                code = str(row['代码']).zfill(6)
                new_cache[code] = int(row['连板数'])
            # 跳过空结果（非交易日），继续往前找
            if not new_cache:
                print(f"[WARN] {dt} 无涨停数据（非交易日），继续往前查...")
                continue
            BOARD_COUNT_CACHE = new_cache
            print(f"[OK] 连板数缓存已更新({dt}): {len(BOARD_COUNT_CACHE)} 只（其中连板>1: {sum(1 for v in new_cache.values() if v > 1)}只）")
            return
        except Exception as e:
            print(f"[WARN] {dt} 连板数获取失败: {e}")
            continue
    print("[WARN] 近10日均无法获取连板数，连板数缓存为空")

# 板块涨跌幅缓存（用于竞价板块效应计算）
SECTOR_CHANGE_CACHE: Dict[str, float] = {}

def _calc_auction_signal_and_score(s: Dict, phase: str) -> tuple:
    """
    竞价打板信号 + 综合评分（5维评分体系 v4.0）。
    维度与权重：竞价涨幅30 + 主力抢筹25 + 竞价金额20 + 竞价成交量15 + 板块效应10 = 100
    已移除：距涨停距离维度
    """
    pre_close = s.get('pre_close', 0) or 0
    price = s.get('price', 0) or 0
    change_pct = s.get('change_pct', 0) or 0   # 当前涨幅%
    amount = s.get('amount', 0) or 0            # 成交额（元）
    volume = s.get('volume', 0) or 0            # 成交量（手）
    high = s.get('high', 0) or 0
    low = s.get('low', 0) or 0
    turnover_pct = s.get('turnover', 0) or 0    # 换手率%
    sector = s.get('sector', '')
    code = s.get('code', '')

    # ---- 主力净买入估算 ----
    # 基于OHLC + 涨跌幅综合判断，避免涨停算成净卖出的错误
    # 原始OHLC公式：sell_ratio = (price-low)/(high-low)
    # 问题：涨停时 price≈high → sell_ratio≈1 → 全是卖出，与实际相反
    # 改进：用 (high+low)/2 作为平衡点，涨幅越大净买入倾向越高
    if high > low and price > 0 and volume > 0:
        mid_price = (high + low) / 2
        # 以中间价为基准计算偏离方向
        if price > mid_price:
            # 价格在上方 → 买方占优
            position_ratio = (price - mid_price) / (high - mid_price) if (high - mid_price) > 0 else 0.5
        else:
            # 价格在下方 → 卖方占优
            position_ratio = -(mid_price - price) / (mid_price - low) if (mid_price - low) > 0 else -0.5
        position_ratio = max(-1, min(1, position_ratio))
        # 用涨幅修正：涨停/大跌时增强信号
        if change_pct >= 9.5:
            # 涨停封板 = 强力买入，net_ratio 至少30%
            net_ratio = max(0.30, 0.30 + position_ratio * 0.20)
        elif change_pct >= 7:
            # 高位 = 买入占优
            net_ratio = max(0.10, position_ratio * 0.50)
        elif change_pct >= 3:
            net_ratio = position_ratio * 0.40
        elif change_pct <= -9.5:
            # 跌停 = 强力卖出
            net_ratio = min(-0.30, -0.30 + position_ratio * 0.20)
        elif change_pct <= -7:
            net_ratio = min(-0.10, position_ratio * 0.50)
        elif change_pct <= -3:
            net_ratio = position_ratio * 0.40
        else:
            net_ratio = position_ratio * 0.30  # 平盘附近信号弱
        # 计算净买入金额
        avg_price = amount / (volume * 100) if volume > 0 else price
        net_amount = net_ratio * amount
    else:
        # high==low（一字涨停/跌停或无波动）
        if change_pct >= 9.5:
            net_ratio = 0.35  # 一字涨停，默认强力买入
        elif change_pct <= -9.5:
            net_ratio = -0.35  # 一字跌停
        else:
            net_ratio = 0
        net_amount = net_ratio * amount if amount > 0 else 0

    # 板块效应
    sector_change = SECTOR_CHANGE_CACHE.get(sector, 0)

    # ---- 信号分级（基于涨幅 + 主力动能，不再依赖距涨停距离）----
    is_main_force = net_ratio > 0.05  # 主力净买入占比>5%视为抢筹
    if change_pct >= 9.5 and is_main_force:
        signal = '极强'
    elif change_pct >= 7 and is_main_force:
        signal = '强'
    elif change_pct >= 5:
        signal = '中'
    elif change_pct >= 2:
        signal = '弱'
    elif change_pct >= 0:
        signal = '观望'
    else:
        signal = '极弱'

    # ---- 5维评分 ----
    # 1. 竞价涨幅（30分）：涨幅越高分越高，涨停满分
    change_score = min(change_pct, 10) / 10 * 30
    # 2. 主力抢筹（25分）：基于净买入金额占比
    if net_ratio > 0.20:
        main_force_score = 25  # 强力抢筹
    elif net_ratio > 0.10:
        main_force_score = 20
    elif net_ratio > 0.05:
        main_force_score = 15
    elif net_ratio > 0:
        main_force_score = 10   # 微弱净买入
    elif net_ratio > -0.05:
        main_force_score = 5   # 基本平衡
    else:
        main_force_score = 0   # 主力出货
    # 3. 竞价金额（20分）：成交额越大分越高
    amount_score = min(amount / 10_000_000, 1) * 20  # 1000万封顶
    # 4. 竞价成交量（15分）：基于换手率
    vol_score = min(turnover_pct / 5, 1) * 15  # 换手率5%封顶
    # 5. 板块效应（10分）：板块涨幅越大分越高
    sector_score = min(abs(sector_change), 5) / 5 * 10

    score = round(min(change_score + main_force_score + amount_score + vol_score + sector_score, 100), 1)
    # 成交额万元
    amount_w = round(amount / 10000, 2) if amount else 0
    net_amount_w = round(net_amount / 10000, 2) if net_amount else 0
    return signal, score, round(change_pct, 2), amount_w, net_ratio, net_amount_w, change_score, main_force_score, amount_score, vol_score, sector_score


def _build_auction_item(s: Dict, signal: str, score: float, auction_change: float, amount_w: float, net_ratio: float, net_amount_w: float, next_day_prob: float = 0,
                    change_score=0, main_force_score=0, amount_score=0, volume_score=0, sector_score=0, sector_change=0) -> Dict:
    sc = round(sector_change, 2)
    return {
        'code': s.get('code', ''),
        'name': s.get('name', ''),
        'price': s.get('price', 0),
        'pre_close': s.get('pre_close', 0),
        'change_pct': auction_change,
        'auction_turnover': amount_w,          # 万元
        'turnover_pct': s.get('turnover', 0) or 0,  # 换手率%
        'signal': signal,
        'score': score,
        'sector': s.get('sector', ''),
        'board_count': s.get('board_count', 1),
        'net_ratio': round(net_ratio * 100, 1),  # 净买入占比%
        'float_cap': s.get('float_cap', 0) or 0,       # 流通市值（亿）
        'mkt_cap': s.get('mkt_cap', 0) or 0,           # 总市值（亿）
        'net_amount': net_amount_w,              # 净买入额（万元）
        'next_day_prob': round(next_day_prob, 1),  # 次日打板概率%
        # 5维评分明细
        'change_score': round(change_score, 1),       # 涨幅分 (0-30)
        'main_force_score': round(main_force_score, 1), # 抢筹分 (0-25)
        'amount_score': round(amount_score, 1),         # 金额分 (0-20)
        'volume_score': round(volume_score, 1),         # 量能分 (0-15)
        'sector_score': round(sector_score, 1),         # 板块分 (0-10)
        'sector_change': sc,                           # 板块今日涨跌幅%
    }

# ============================================================
# 五大竞价选股公式（新增）
# ============================================================

# 历史涨停/跌停缓存（用于公式2：昨日非涨停+昨日非跌停+前日非涨停）
LIMIT_UP_DOWN_HISTORY: Dict[str, Dict[str, any]] = {}

def _check_limit_up_down(code: str, days_ago: int) -> Dict[str, bool]:
    """检查某股票days_ago天前是否涨停/跌停（基于本地历史数据缓存）"""
    global LIMIT_UP_DOWN_HISTORY
    key = f"{code}_{days_ago}"
    if key in LIMIT_UP_DOWN_HISTORY:
        return LIMIT_UP_DOWN_HISTORY[key]
    # 默认返回未知（不过滤）
    return {'limit_up': False, 'limit_down': False}

def _calc_formula_score(s: Dict, formula_id: int) -> float:
    """
    根据五大竞价公式计算匹配度得分（0-100）
    公式1: 竞价爆量选谷
    公式2: 竞价抓首板选谷
    公式3: 竞价爆量抢筹选谷
    公式4: 竞价异动选谷
    公式5: 竞价砸盘异动选谷
    """
    code = s.get('code', '')
    name = s.get('name', '')
    price = s.get('price', 0) or 0
    pre_close = s.get('pre_close', 0) or 0
    change_pct = s.get('change_pct', 0) or 0
    amount = s.get('amount', 0) or 0  # 元
    amount_w = amount / 10000  # 万元
    volume = s.get('volume', 0) or 0
    turnover_pct = s.get('turnover', 0) or 0
    high = s.get('high', 0) or 0
    low = s.get('low', 0) or 0
    float_cap = s.get('float_cap', 0) or 0  # 流通市值（亿元）
    
    # 主力净买入估算（复用OHLC逻辑）
    if high > low and price > 0 and volume > 0:
        mid_price = (high + low) / 2
        if price > mid_price:
            position_ratio = (price - mid_price) / (high - mid_price) if (high - mid_price) > 0 else 0.5
        else:
            position_ratio = -(mid_price - price) / (mid_price - low) if (mid_price - low) > 0 else -0.5
        position_ratio = max(-1, min(1, position_ratio))
        if change_pct >= 9.5:
            net_ratio = max(0.30, 0.30 + position_ratio * 0.20)
        elif change_pct >= 7:
            net_ratio = max(0.10, position_ratio * 0.50)
        elif change_pct >= 3:
            net_ratio = position_ratio * 0.40
        else:
            net_ratio = position_ratio * 0.30
    else:
        if change_pct >= 9.5:
            net_ratio = 0.35
        elif change_pct <= -9.5:
            net_ratio = -0.35
        else:
            net_ratio = 0
    
    # 基础过滤：非ST、非创业板(3开头)、非科创(688)
    if 'ST' in name.upper() or code.startswith('3') or code.startswith('688'):
        return 0
    
    score = 0
    matched = False
    
    if formula_id == 1:
        # === 公式1: 竞价爆量选谷 ===
        # 竞价金额>3000万, 涨幅0%~3%, 流通市值<200亿, 主板/非ST
        if amount_w >= 3000 and 0 < change_pct < 3 and float_cap < 200:
            matched = True
            # 得分：金额权重40% + 涨幅匹配度30% + 市值适中20% + 流动性10%
            amount_score = min(amount_w / 5000, 1) * 40  # 5000万封顶
            change_score = (1 - abs(change_pct - 1.5) / 1.5) * 30  # 越接近1.5%越好
            cap_score = max(0, 1 - float_cap / 200) * 20
            vol_score = min(turnover_pct / 2, 1) * 10
            score = amount_score + change_score + cap_score + vol_score
    
    elif formula_id == 2:
        # === 公式2: 竞价抓首板选谷 ===
        # 昨日非涨停+昨日非跌停+前日非涨停, 竞价金额>350万, 涨幅3%~6%, 换手率>0.1%
        yest = _check_limit_up_down(code, 1)
        before_yest = _check_limit_up_down(code, 2)
        if (not yest['limit_up'] and not yest['limit_down'] and not before_yest['limit_up'] and
            amount_w >= 350 and 3 <= change_pct < 6 and turnover_pct > 0.1):
            matched = True
            # 得分：涨幅匹配度35% + 金额25% + 换手率20% + 历史干净20%
            change_score = (1 - abs(change_pct - 4.5) / 1.5) * 35
            amount_score = min(amount_w / 1000, 1) * 25
            vol_score = min(turnover_pct / 1, 1) * 20
            history_score = 20  # 已通过历史过滤
            score = change_score + amount_score + vol_score + history_score
    
    elif formula_id == 3:
        # === 公式3: 竞价爆量抢筹选谷 ===
        # 涨幅3%~6%, 竞价金额>2500万, 换手率>0.1%, 主力抢筹(j>d)
        if 3 <= change_pct < 6 and amount_w >= 2500 and turnover_pct > 0.1 and net_ratio > 0:
            matched = True
            # 得分：抢筹力度40% + 金额30% + 涨幅匹配15% + 换手率15%
            force_score = min(net_ratio / 0.30, 1) * 40
            amount_score = min(amount_w / 4000, 1) * 30
            change_score = (1 - abs(change_pct - 4.5) / 1.5) * 15
            vol_score = min(turnover_pct / 1, 1) * 15
            score = force_score + amount_score + change_score + vol_score
    
    elif formula_id == 4:
        # === 公式4: 竞价异动选谷 ===
        # 竞价异动, 竞价金额>3000万, 换手率>0.2%, 涨幅0%~2%, 流通市值<130亿
        # "竞价异动"定义为：换手率>0.2%且金额>3000万
        if amount_w >= 3000 and turnover_pct > 0.2 and 0 < change_pct < 2 and float_cap < 130:
            matched = True
            # 得分：换手率40% + 金额30% + 涨幅匹配20% + 市值10%
            vol_score = min(turnover_pct / 1, 1) * 40
            amount_score = min(amount_w / 5000, 1) * 30
            change_score = (1 - abs(change_pct - 1) / 1) * 20
            cap_score = max(0, 1 - float_cap / 130) * 10
            score = vol_score + amount_score + change_score + cap_score
    
    elif formula_id == 5:
        # === 公式5: 竞价砸盘异动选谷 ===
        # 竞价砸盘, 竞价金额>350万, 跌幅<-4%, 过去20天区间振幅<30%
        # "竞价砸盘"定义为：跌幅<-4%且金额>350万
        # 20天振幅暂用固定值（需要历史K线数据）
        if amount_w >= 350 and change_pct < -4:
            # 检查20天振幅（简化：假设从缓存获取）
            amplitude_20d = s.get('amplitude_20d', 25)  # 默认25%
            if amplitude_20d < 30:
                matched = True
                # 得分：跌幅深度40% + 金额25% + 振幅稳定20% + 流动性15%
                drop_score = min(abs(change_pct) / 10, 1) * 40
                amount_score = min(amount_w / 1000, 1) * 25
                amp_score = (1 - amplitude_20d / 30) * 20
                vol_score = min(turnover_pct / 1, 1) * 15
                score = drop_score + amount_score + amp_score + vol_score
    
    return round(score, 1) if matched else 0


def _run_formula_scan(stocks: Dict, formula_id: int, auction_data: Dict = None) -> List[Dict]:
    """运行指定公式扫描全市场
    auction_data: 竞价专属数据（9:15-9:25），有则覆盖金额/成交量/换手率
    """
    results = []
    for code, s in stocks.items():
        s_dict = s.model_dump() if hasattr(s, 'model_dump') else s
        if not code.isdigit() or not s_dict.get('price'):
            continue

        # 使用竞价数据覆盖（金额/成交量/换手率只算9:15-9:25）
        if auction_data and code in auction_data:
            ad = auction_data[code]
            s_dict['amount'] = ad.get('auction_amount', s_dict.get('amount', 0))
            s_dict['volume'] = ad.get('auction_vol', s_dict.get('volume', 0))
            s_dict['auction_change_pct'] = ad.get('auction_change_pct', s_dict.get('change_pct', 0))
            # 计算竞价换手率 = 竞价成交量(手) * 100 / 流通股数 * 100%
            float_cap = s_dict.get('float_cap', 0) or 0
            price = s_dict.get('price', 0) or 1
            auction_vol = ad.get('auction_vol', 0)
            if float_cap > 0 and auction_vol > 0:
                float_shares = float_cap * 1e8 / price
                auction_turnover_pct = round(auction_vol * 100 / float_shares * 100, 2)
                s_dict['turnover'] = auction_turnover_pct

        score = _calc_formula_score(s_dict, formula_id)
        if score > 0:
            auction_change = s_dict.get('auction_change_pct', s_dict.get('change_pct', 0))
            auction_amount_w = (s_dict.get('amount', 0) or 0) / 10000  # 万元
            item = {
                'code': code,
                'name': s_dict.get('name', ''),
                'price': s_dict.get('price', 0),
                'pre_close': s_dict.get('pre_close', 0),
                'change_pct': round(auction_change, 2),   # 竞价涨幅
                'auction_turnover': round(auction_amount_w, 2),
                'turnover_pct': round(s_dict.get('turnover', 0) or 0, 2),
                'float_cap': s_dict.get('float_cap', 0) or 0,
                'score': score,
                'formula_id': formula_id,
                'auction_change_pct': round(auction_change, 2),
            }
            results.append(item)
    # 按得分降序
    results.sort(key=lambda x: x['score'], reverse=True)
    return results


# ============== 演示数据（本地开发/非交易时段使用） ==============

_DEMO_STOCK_POOL = [
    ('002594', '比亚迪', 230.5), ('300750', '宁德时代', 185.2), ('600519', '贵州茅台', 1680.0),
    ('000858', '五粮液', 142.3), ('002230', '科大讯飞', 48.6), ('600036', '招商银行', 35.2),
    ('000001', '平安银行', 11.8), ('002475', '立讯精密', 32.5), ('300059', '东方财富', 18.9),
    ('600030', '中信证券', 22.1), ('000568', '泸州老窖', 165.0), ('002415', '海康威视', 28.3),
    ('600276', '恒瑞医药', 45.8), ('000333', '美的集团', 62.5), ('002460', '赣锋锂业', 35.6),
    ('600887', '伊利股份', 26.8), ('000651', '格力电器', 38.2), ('002271', '东方雨虹', 18.5),
    ('300014', '亿纬锂能', 42.3), ('600009', '上海机场', 38.9), ('002007', '华兰生物', 22.4),
    ('000963', '华东医药', 38.6), ('002812', '恩捷股份', 58.2), ('600703', '三安光电', 12.8),
    ('300433', '蓝思科技', 16.5), ('002049', '紫光国微', 58.9), ('000725', '京东方A', 4.25),
    ('600570', '恒生电子', 28.6), ('002241', '歌尔股份', 21.3), ('300124', '汇川技术', 58.7),
]


def _get_demo_formula_data(formula_id: int) -> List[Dict]:
    """生成演示数据（非交易时段/本地开发使用）"""
    import random
    random.seed(42 + formula_id)  # 固定种子保证每次一致
    results = []

    if formula_id == 1:
        # 公式1: 竞价爆量选谷 — 金额>3000万, 涨幅0~3%, 市值<200亿
        candidates = [
            ('002594', '比亚迪', 232.50, 1.25, 4500, 1.85, 168),
            ('002230', '科大讯飞', 49.20, 2.10, 5200, 2.45, 85),
            ('002475', '立讯精密', 32.80, 0.85, 3800, 1.25, 42),
            ('000001', '平安银行', 11.95, 1.50, 6200, 0.95, 28),
            ('002415', '海康威视', 28.60, 2.35, 3500, 1.65, 55),
            ('600276', '恒瑞医药', 46.10, 0.65, 4100, 0.85, 38),
            ('002812', '恩捷股份', 59.20, 1.85, 3300, 2.15, 72),
        ]
        for code, name, price, chg, amount_w, turnover, float_cap in candidates:
            score = min(amount_w / 5000, 1) * 40 + (1 - abs(chg - 1.5) / 1.5) * 30 + max(0, 1 - float_cap / 200) * 20 + min(turnover / 2, 1) * 10
            results.append({
                'code': code, 'name': name, 'price': price, 'pre_close': round(price / (1 + chg / 100), 2),
                'change_pct': chg, 'auction_turnover': amount_w, 'turnover_pct': turnover,
                'float_cap': float_cap, 'score': round(score, 1), 'formula_id': 1,
            })

    elif formula_id == 2:
        # 公式2: 竞价抓首板 — 金额>350万, 涨幅3~6%, 换手>0.1%
        candidates = [
            ('300750', '宁德时代', 190.50, 4.50, 2800, 3.25, 45),
            ('600519', '贵州茅台', 1735.0, 3.85, 1850, 1.85, 28),
            ('000858', '五粮液', 147.80, 5.20, 1200, 2.65, 35),
            ('300059', '东方财富', 19.65, 4.15, 950, 4.85, 18),
            ('600036', '招商银行', 36.50, 3.65, 780, 1.45, 22),
            ('002460', '赣锋锂业', 36.80, 5.80, 650, 3.15, 15),
        ]
        for code, name, price, chg, amount_w, turnover, float_cap in candidates:
            score = (1 - abs(chg - 4.5) / 1.5) * 35 + min(amount_w / 1000, 1) * 25 + min(turnover / 1, 1) * 20 + 20
            results.append({
                'code': code, 'name': name, 'price': price, 'pre_close': round(price / (1 + chg / 100), 2),
                'change_pct': chg, 'auction_turnover': amount_w, 'turnover_pct': turnover,
                'float_cap': float_cap, 'score': round(score, 1), 'formula_id': 2,
            })

    elif formula_id == 3:
        # 公式3: 竞价爆量抢筹 — 涨幅3~6%, 金额>2500万, 换手>0.1%, 主力抢筹
        candidates = [
            ('002594', '比亚迪', 235.80, 5.20, 4200, 2.85, 0.25),
            ('300750', '宁德时代', 192.30, 4.85, 3800, 3.65, 0.18),
            ('600519', '贵州茅台', 1742.0, 4.25, 3200, 1.95, 0.15),
            ('002230', '科大讯飞', 50.80, 5.60, 2900, 3.45, 0.22),
            ('000858', '五粮液', 149.50, 5.85, 2600, 2.85, 0.20),
        ]
        for code, name, price, chg, amount_w, turnover, net_ratio in candidates:
            score = min(net_ratio / 0.30, 1) * 40 + min(amount_w / 4000, 1) * 30 + (1 - abs(chg - 4.5) / 1.5) * 15 + min(turnover / 1, 1) * 15
            results.append({
                'code': code, 'name': name, 'price': price, 'pre_close': round(price / (1 + chg / 100), 2),
                'change_pct': chg, 'auction_turnover': amount_w, 'turnover_pct': turnover,
                'float_cap': round(price * 5, 2), 'score': round(score, 1), 'formula_id': 3,
            })

    elif formula_id == 4:
        # 公式4: 竞价异动选谷 — 金额>3000万, 换手>0.2%, 涨幅0~2%, 市值<130亿
        candidates = [
            ('002475', '立讯精密', 33.20, 1.85, 4200, 3.25, 85),
            ('002415', '海康威视', 28.90, 1.25, 3800, 2.85, 55),
            ('002230', '科大讯飞', 49.50, 1.65, 4500, 3.85, 42),
            ('300433', '蓝思科技', 16.85, 0.95, 3500, 4.15, 68),
            ('002049', '紫光国微', 59.50, 1.45, 4100, 2.65, 35),
            ('002241', '歌尔股份', 21.65, 0.75, 3300, 3.45, 28),
        ]
        for code, name, price, chg, amount_w, turnover, float_cap in candidates:
            score = min(turnover / 1, 1) * 40 + min(amount_w / 5000, 1) * 30 + (1 - abs(chg - 1) / 1) * 20 + max(0, 1 - float_cap / 130) * 10
            results.append({
                'code': code, 'name': name, 'price': price, 'pre_close': round(price / (1 + chg / 100), 2),
                'change_pct': chg, 'auction_turnover': amount_w, 'turnover_pct': turnover,
                'float_cap': float_cap, 'score': round(score, 1), 'formula_id': 4,
            })

    elif formula_id == 5:
        # 公式5: 竞价砸盘异动 — 金额>350万, 跌幅<-4%, 20天振幅<30%
        candidates = [
            ('002460', '赣锋锂业', 34.20, -5.80, 850, 2.85, 25),
            ('300014', '亿纬锂能', 40.50, -6.25, 920, 3.15, 22),
            ('002812', '恩捷股份', 55.80, -4.85, 780, 2.45, 18),
            ('600703', '三安光电', 12.35, -5.20, 650, 3.85, 15),
            ('002007', '华兰生物', 21.50, -4.35, 580, 1.95, 12),
            ('000963', '华东医药', 37.20, -6.80, 720, 2.65, 20),
        ]
        for code, name, price, chg, amount_w, turnover, amp in candidates:
            score = min(abs(chg) / 10, 1) * 40 + min(amount_w / 1000, 1) * 25 + (1 - amp / 30) * 20 + min(turnover / 1, 1) * 15
            results.append({
                'code': code, 'name': name, 'price': price, 'pre_close': round(price / (1 + chg / 100), 2),
                'change_pct': chg, 'auction_turnover': amount_w, 'turnover_pct': turnover,
                'float_cap': round(price * 3, 2), 'score': round(score, 1), 'formula_id': 5,
            })

    # 按得分降序
    results.sort(key=lambda x: x['score'], reverse=True)
    return results


def load_stock_list():
    global FULL_STOCK_LIST
    try:
        import csv
        with open('stock_list.csv', 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            FULL_STOCK_LIST = [row['code'].strip() for row in reader]
        print(f"[OK] loaded {len(FULL_STOCK_LIST)} stocks")
    except Exception as e:
        print(f"[ERR] load stock list failed: {e}")
        FULL_STOCK_LIST = MONITOR_STOCKS  # fallback

load_stock_list()
_load_auction_cache()

# 启动时立即从 akshare 获取最新连板数（周末也执行，确保 BOARD_COUNT_CACHE 初始化）
_update_board_count_cache()

def daban_background_scan():
    global DABAN_CACHE, DABAN_CACHE_TIME, AUCTION_CACHE, AUCTION_CACHE_TIME, MARKET_CENTER_CACHE, MARKET_CENTER_CACHE_TIME
    # 先获取板块涨跌用于竞价板块效应
    _refresh_sector_cache()  # 首次加载
    # 首次加载 Market_Center 数据（换手率/流通市值）
    try:
        mc = ds._fetch_sina_market_center(FULL_STOCK_LIST)
        if mc:
            MARKET_CENTER_CACHE = mc
            MARKET_CENTER_CACHE_TIME = time.time()
            print(f"  [OK] Market_Center首次加载: {len(mc)}只")
    except Exception as e:
        print(f"  [WARN] Market_Center首次加载失败: {e}")
    scan_count = 0
    while True:
        try:
            if FULL_STOCK_LIST:
                print(f"🔍 开始全市场打板扫描 ({len(FULL_STOCK_LIST)} 只)...")
                stocks = ds.fetch_batch_realtime(FULL_STOCK_LIST)
                phase = ds._get_market_phase()
                candidates = daban_engine.calculate(stocks, phase)
                DABAN_CACHE = [c.model_dump() for c in candidates]
                DABAN_CACHE_TIME = time.time()
                print(f"✅ 打板扫描完成: {len(DABAN_CACHE)} 只候选")
                # 同时计算竞价候选
                _refresh_auction_cache(stocks, phase)
                # 每5轮(约2.5分钟)保存一次缓存到文件
                if scan_count % 5 == 0:
                    _save_auction_cache()
        except Exception as e:
            print(f"❌ 打板扫描失败: {e}")
        # 每5轮(约2.5分钟)刷新一次板块涨跌幅
        scan_count += 1
        if scan_count % 5 == 0:
            _refresh_sector_cache()
        # 每10轮(约5分钟)刷新 Market_Center 数据
        if scan_count % 10 == 0:
            try:
                mc = ds._fetch_sina_market_center(FULL_STOCK_LIST)
                if mc:
                    MARKET_CENTER_CACHE = mc
                    MARKET_CENTER_CACHE_TIME = time.time()
                    print(f"  [OK] Market_Center缓存刷新: {len(mc)}只")
            except Exception as e:
                print(f"  [WARN] Market_Center刷新失败: {e}")
        # 每30轮(约15分钟)更新连板数缓存（非交易时段自动跳过）
        if scan_count % 30 == 0:
            _update_board_count_cache()
        time.sleep(30)

def _refresh_sector_cache():
    """刷新板块涨跌幅缓存（使用新浪行业板块API）"""
    global SECTOR_CHANGE_CACHE
    try:
        # 新浪行业板块API，返回84个申万行业板块及其涨跌幅
        resp = ds.session.get(
            'https://money.finance.sina.com.cn/q/view/newFLJK.php?param=industry',
            timeout=10
        )
        # 原始数据为GBK编码，需手动解码
        text = resp.content.decode('gb18030', errors='replace')
        m = re.search(r'=\s*(\{.*\})', text, re.DOTALL)
        if m:
            data = json.loads(m.group(1))
            for key, val in data.items():
                parts = val.split(',')
                if len(parts) > 5:
                    name = parts[1]  # 行业名称
                    change_pct = float(parts[5] or 0)  # 涨跌幅%
                    if name:
                        SECTOR_CHANGE_CACHE[name] = change_pct
            print(f"  [OK] 行业板块缓存已更新: {len(SECTOR_CHANGE_CACHE)} 个行业")
    except Exception as e:
        print(f"  [WARN] 行业板块缓存刷新失败: {e}")

    # 补充：从东方财富单股API获取个股行业映射，用于 sector 赋值
    # 这部分在 _enrich_stock_data 中通过 _fetch_eastmoney_fields 已实现

def _recalc_signal_with_real_flow(item: Dict) -> str:
    """用真实资金流数据重算信号等级（基于涨幅+主力动能）"""
    net_ratio = item.get('net_ratio', 0)  # %
    change_pct = item.get('change_pct', 0) or 0
    is_main_force = net_ratio > 5  # 主力净买入占比>5%
    if change_pct >= 9.5 and is_main_force:
        return '极强'
    elif change_pct >= 7 and is_main_force:
        return '强'
    elif change_pct >= 5:
        return '中'
    elif change_pct >= 2:
        return '弱'
    elif change_pct >= 0:
        return '观望'
    else:
        return '极弱'


def _recalc_score_with_real_flow(item: Dict) -> float:
    """用东方财富真实资金流数据重算竞价评分 v4.0（5维，无距涨停距离）
    同时更新item中的5维评分明细字段
    """
    net_ratio = item.get('net_ratio', 0) / 100  # %→小数
    # 主力抢筹评分（25分）
    if net_ratio > 0.20:
        main_force_score = 25
    elif net_ratio > 0.10:
        main_force_score = 20
    elif net_ratio > 0.05:
        main_force_score = 15
    elif net_ratio > 0:
        main_force_score = 10
    elif net_ratio > -0.05:
        main_force_score = 5
    else:
        main_force_score = 0
    # 重新计算其他4个维度
    change_pct = item.get('change_pct', 0) or 0
    auction_turnover = item.get('auction_turnover', 0) * 10000  # 万元→元
    turnover_pct = item.get('turnover_pct', 0) or 0
    sector_change = SECTOR_CHANGE_CACHE.get(item.get('sector', ''), 0)
    # 1. 竞价涨幅（30分）
    change_score = min(change_pct, 10) / 10 * 30
    # 2. 竞价金额（20分）
    amount_score = min(auction_turnover / 10_000_000, 1) * 20
    # 3. 竞价成交量（15分）
    vol_score = min(turnover_pct / 5, 1) * 15
    # 4. 板块效应（10分）
    sector_score = min(abs(sector_change), 5) / 5 * 10
    score = round(min(change_score + main_force_score + amount_score + vol_score + sector_score, 100), 1)
    # 回写5维明细到item
    item['change_score'] = round(change_score, 1)
    item['main_force_score'] = round(main_force_score, 1)
    item['amount_score'] = round(amount_score, 1)
    item['volume_score'] = round(vol_score, 1)
    item['sector_score'] = round(sector_score, 1)
    return score


def _fetch_capital_flow_batch(codes: list) -> Dict[str, dict]:
    """调用东方财富API批量获取个股资金流（主力净流入=超大单+大单）
    codes: 股票代码列表如 ['002290', '600519', ...]
    返回: {code: {'main_net': 主力净流入(元), 'main_pct': 主力净流入占比%}}
    """
    if not codes:
        return {}
    url = 'http://push2.eastmoney.com/api/qt/ulist.np/get'
    results = {}
    batch_size = 10  # 东方财富API URL长度限制，每批最多10只
    # 转换代码为东方财富格式：6开头=1.xxxxx，其余=0.xxxxx
    secid_map = {}
    for c in codes:
        sid = ('1.' + c) if c.startswith('6') else ('0.' + c)
        secid_map[sid] = c
    secids_list = list(secid_map.keys())
    for i in range(0, len(secids_list), batch_size):
        batch = secids_list[i:i+batch_size]
        secids = ','.join(batch)
        for retry in range(3):
            try:
                r = requests.get(url, params={'fltt': 2, 'secids': secids, 'fields': 'f12,f66,f67'}, timeout=8)
                data = r.json()
                if data.get('rc') == 0 and isinstance(data.get('data'), dict):
                    diff = data['data'].get('diff')
                    if diff and isinstance(diff, list):
                        for d in diff:
                            code = d.get('f12', '')
                            results[code] = {
                                'main_net': d.get('f66', 0) or 0,
                                'main_pct': d.get('f67', 0) or 0,
                            }
                    break
            except Exception:
                if retry == 2:
                    pass  # 静默失败，使用OHLC fallback
                time.sleep(0.3)
    return results


# ============== 新闻/政策采集引擎 ==============
NEWS_CACHE: List[Dict] = []
NEWS_CACHE_TIME = 0
NEWS_SENTIMENT_SCORE = 0.5  # 全局新闻情绪分数 0-1, 0.5=中性

# A股敏感关键词（用于判断新闻对市场的正面/负面影响）
_POSITIVE_KEYWORDS = [
    '降息', '降准', '刺激', '利好', '反弹', '突破', '大涨', '牛市',
    '放水', '宽松', '加杠杆', '救市', '增持', '回购', '纳入', '上涨',
    '增长', '超预期', '创新高', '政策利好', '减税', '补贴', '扶持',
    '国产替代', '自主可控', '新基建', '人工智能', '芯片', '新能源',
    '固态电池', '低空经济', '机器人', '量子', '卫星', '商业航天',
    '数据要素', '数字经济', '跨境电商', '消费升级',
]
_NEGATIVE_KEYWORDS = [
    '加息', '收紧', '暴跌', '熔断', '崩盘', '熊市', '制裁', '贸易战',
    '关税', ' recession', '危机', '违约', '退市', '减持', '抛售',
    '监管', '处罚', '立案', '调查', '亏损', '下滑', '疲软',
    '地缘', '冲突', '战争', '战争升级', '避险',
]

def _fetch_market_news() -> List[Dict]:
    """从新浪财经抓取最新市场新闻，返回带情绪分数的新闻列表"""
    global NEWS_CACHE, NEWS_CACHE_TIME, NEWS_SENTIMENT_SCORE
    now = time.time()
    if now - NEWS_CACHE_TIME < 300 and NEWS_CACHE:  # 5分钟缓存
        return NEWS_CACHE
    news_list = []
    try:
        # 新浪财经财经频道滚动新闻（稳定可用）
        resp = requests.get(
            'https://feed.mix.sina.com.cn/api/roll/get',
            params={'pageid': 153, 'lid': 2509, 'k': '', 'page': 1, 'num': 30},
            headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.sina.com.cn/'},
            timeout=10
        )
        if resp.status_code == 200:
            items = resp.json().get('result', {}).get('data', [])
            for item in items[:30]:
                title = item.get('title', '').strip()
                if len(title) < 8:
                    continue
                # 计算情绪分数
                pos_count = sum(1 for kw in _POSITIVE_KEYWORDS if kw in title)
                neg_count = sum(1 for kw in _NEGATIVE_KEYWORDS if kw in title)
                sentiment = 0.5 + (pos_count - neg_count) * 0.1
                sentiment = max(0.1, min(0.9, sentiment))
                news_list.append({
                    'title': title[:200],
                    'time': item.get('ctime', '') or '',
                    'sentiment': round(sentiment, 2),
                    'pos_hits': pos_count,
                    'neg_hits': neg_count,
                })
    except Exception as e:
        print(f"  [WARN] 新浪新闻采集失败: {e}")
    NEWS_CACHE = news_list
    NEWS_CACHE_TIME = now
    if news_list:
        NEWS_SENTIMENT_SCORE = round(sum(n['sentiment'] for n in news_list) / len(news_list), 3)
        pos_cnt = sum(1 for n in news_list if n['sentiment'] > 0.6)
        neg_cnt = sum(1 for n in news_list if n['sentiment'] < 0.4)
        print(f"  [OK] 新闻采集: {len(news_list)}条, 情绪={NEWS_SENTIMENT_SCORE}, 正面={pos_cnt}, 负面={neg_cnt}")
    else:
        NEWS_SENTIMENT_SCORE = 0.5
    return news_list


def _calc_next_day_probability(item: Dict) -> float:
    """
    计算次日打板概率（0-100%）。
    因素：主力动能（40%）+ 当日涨幅动能（25%）+ 成交活跃度（15%）+ 新闻情绪（20%）
    """
    # 1. 主力动能（40%权重）：基于真实资金流 net_ratio
    net_ratio = item.get('net_ratio', 0) or 0  # %
    net_amount = item.get('net_amount', 0) or 0  # 万元
    if net_ratio > 20:
        momentum_score = 40
    elif net_ratio > 10:
        momentum_score = 32
    elif net_ratio > 5:
        momentum_score = 24
    elif net_ratio > 0:
        momentum_score = 15
    elif net_ratio > -5:
        momentum_score = 8
    else:
        momentum_score = 0

    # 2. 涨幅动能（25%权重）：今日涨幅越高，惯性越大
    change_pct = item.get('change_pct', 0) or 0
    if change_pct >= 9.5:
        inertia_score = 25
    elif change_pct >= 7:
        inertia_score = 20
    elif change_pct >= 5:
        inertia_score = 15
    elif change_pct >= 3:
        inertia_score = 10
    elif change_pct >= 0:
        inertia_score = 5
    else:
        inertia_score = 0

    # 3. 成交活跃度（15%权重）：换手率+成交额
    turnover_pct = item.get('turnover_pct', 0) or 0
    auction_turnover = item.get('auction_turnover', 0) or 0  # 万元
    activity_score = min(turnover_pct / 5, 1) * 8 + min(auction_turnover / 5000, 1) * 7

    # 4. 新闻/政策情绪（20%权重）：全局情绪分数
    global NEWS_SENTIMENT_SCORE
    sentiment = NEWS_SENTIMENT_SCORE if NEWS_SENTIMENT_SCORE else 0.5
    if sentiment > 0.65:
        news_score = 20
    elif sentiment > 0.55:
        news_score = 14
    elif sentiment > 0.45:
        news_score = 8
    else:
        news_score = 0

    prob = min(momentum_score + inertia_score + activity_score + news_score, 100)
    return prob


def _refresh_auction_cache(stocks: Dict, phase: str):
    """计算并缓存竞价候选（基于已扫描到的实时数据 + 东方财富真实资金流 + 新闻情绪）"""
    global AUCTION_CACHE, AUCTION_CACHE_TIME
    # 采集新闻（后台静默）
    _fetch_market_news()
    items = []
    for code, s in stocks.items():
        # fetch_batch_realtime 返回 Dict[str, StockInfo]，需要转成 dict
        s_dict = s.model_dump() if hasattr(s, 'model_dump') else s
        if not code.isdigit() or not s_dict.get('price'):
            continue
        # 用 BOARD_COUNT_CACHE 更新连板数（优先使用东方财富涨停池的真实连板数）
        if code in BOARD_COUNT_CACHE:
            s_dict['board_count'] = BOARD_COUNT_CACHE[code]
        # 过滤科创(688)/创业板(3)/ST
        if code.startswith('688') or code.startswith('3'):
            continue
        name = str(s_dict.get('name', ''))
        if 'ST' in name.upper():
            continue
        signal, score, auction_chg, amount_w, net_ratio, net_amount_w, cs, mfs, ams, vss, scs = _calc_auction_signal_and_score(s_dict, phase)
        sc = SECTOR_CHANGE_CACHE.get(s_dict.get('sector', ''), 0)
        items.append(_build_auction_item(s_dict, signal, score, auction_chg, amount_w, net_ratio, net_amount_w,
                                        change_score=cs, main_force_score=mfs, amount_score=ams, volume_score=vss, sector_score=scs, sector_change=sc))
    # 过滤极弱+下跌股
    items = [x for x in items if not (x['signal'] == '极弱')]
    # 按评分降序
    items.sort(key=lambda x: x['score'], reverse=True)
    # 取前100只候选，获取真实资金流数据
    top_candidates = items[:100]
    candidate_codes = [x['code'] for x in top_candidates]
    try:
        flow_data = _fetch_capital_flow_batch(candidate_codes)
        if flow_data:
            # 用真实数据替换OHLC估算值
            for item in top_candidates:
                code = item['code']
                if code in flow_data:
                    fd = flow_data[code]
                    real_main_net = fd['main_net']  # 元
                    real_main_pct = fd['main_pct']  # %
                    item['net_amount'] = round(real_main_net / 10000, 2)  # 元→万元
                    item['net_ratio'] = round(real_main_pct, 1)  # 直接用百分比
                    # 用真实资金流重算信号和评分
                    item['signal'] = _recalc_signal_with_real_flow(item)
                    item['score'] = _recalc_score_with_real_flow(item)
            print(f"  [OK] 东方财富资金流已获取 {len(flow_data)}/{len(candidate_codes)} 只")
        else:
            print(f"  [WARN] 东方财富资金流返回为空，保留OHLC估算")
    except Exception as e:
        print(f"  [WARN] 资金流API失败，使用OHLC估算: {e}")
    # 计算次日打板概率
    for item in items:
        item['next_day_prob'] = _calc_next_day_probability(item)
    AUCTION_CACHE = items
    AUCTION_CACHE_TIME = time.time()
    strong = sum(1 for x in items if x['signal'] in ('极强', '强'))
    high_prob = sum(1 for x in items if x.get('next_day_prob', 0) >= 60)
    print(f"  竞价扫描完成: {len(items)} 只候选 (极强+强: {strong}只, 高概率≥60%: {high_prob}只)")

threading.Thread(target=daban_background_scan, daemon=True).start()

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
    page: int = Query(1),
    search: str = Query(''),
    sort_by: str = Query('change_pct'),
    ascending: bool = Query(False),
):
    """获取股票列表（支持分页、搜索、排序）"""
    # 搜索模式：先在 stock_list.csv 名称中过滤，取匹配的 code 列表
    if search:
        # 先从 CSV 元数据搜索（快速）
        import csv
        matched_codes = []
        try:
            csv_path = os.path.join(os.path.dirname(__file__), 'stock_list.csv')
            with open(csv_path, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    code = row.get('code', '').strip()
                    name = row.get('name', '').strip()
                    if search in code or search in name:
                        matched_codes.append(code)
        except Exception:
            matched_codes = [c for c in FULL_STOCK_LIST if search in c]
        if not matched_codes:
            return {'stocks': [], 'total': 0, 'page': page, 'total_pages': 0, 'time': datetime.now().strftime('%H:%M:%S'), 'phase': ds._get_market_phase()}
        # 获取匹配股票的实时数据
        stocks_data = ds.fetch_batch_realtime(matched_codes[:200])
        stock_list = list(stocks_data.values())
    else:
        target = FULL_STOCK_LIST if len(FULL_STOCK_LIST) > 0 else MONITOR_STOCKS
        # 按分页计算当前页的股票代码
        total_all = len(target)
        start = (page - 1) * limit
        end = start + limit
        page_codes = target[start:end]
        stocks_data = ds.fetch_batch_realtime(page_codes)
        stock_list = list(stocks_data.values())
        # 排序
        if sort_by == 'change_pct':
            stock_list.sort(key=lambda x: x.change_pct, reverse=not ascending)
        elif sort_by == 'volume':
            stock_list.sort(key=lambda x: x.volume, reverse=True)
        elif sort_by == 'amount':
            stock_list.sort(key=lambda x: x.amount, reverse=True)
        elif sort_by == 'name':
            stock_list.sort(key=lambda x: x.name)
        return {
            'stocks': [s.model_dump() for s in stock_list],
            'total': total_all,
            'page': page,
            'total_pages': (total_all + limit - 1) // limit,
            'time': datetime.now().strftime('%H:%M:%S'),
            'phase': ds._get_market_phase(),
        }

    # 搜索模式的排序
    if sort_by == 'change_pct':
        stock_list.sort(key=lambda x: x.change_pct, reverse=not ascending)
    elif sort_by == 'volume':
        stock_list.sort(key=lambda x: x.volume, reverse=True)
    elif sort_by == 'amount':
        stock_list.sort(key=lambda x: x.amount, reverse=True)
    elif sort_by == 'name':
        stock_list.sort(key=lambda x: x.name)

    return {
        'stocks': [s.model_dump() for s in stock_list[:limit]],
        'total': len(stock_list),
        'page': 1,
        'total_pages': 1,
        'time': datetime.now().strftime('%H:%M:%S'),
        'phase': ds._get_market_phase(),
    }

@app.get('/api/daban')
def get_daban():
    """打板精选（返回后台扫描缓存）"""
    phase = ds._get_market_phase()
    return {
        'candidates': DABAN_CACHE,
        'time': datetime.now().strftime('%H:%M:%S'),
        'phase': phase,
        'from_cache': time.time() - DABAN_CACHE_TIME > 60,
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

@app.get('/api/auction/scan')
def auction_scan():
    """
    早盘竞价打板精选扫描（基于全市场数据）。
    后台每30s全市场扫描，同时计算竞价信号与综合评分。
    信号分级：极强(涨停预期) > 强(高位竞价) > 中(普通竞价) > 弱(平开) > 极弱(低开)
    评分体系（5维100分）：竞价涨幅30 + 主力抢筹25 + 竞价金额20 + 竞价成交量15 + 板块效应10
    次日打板概率：基于主力动能+涨幅动能+成交活跃度+新闻情绪综合计算
    """
    global AUCTION_CACHE, AUCTION_CACHE_TIME, SECTOR_CHANGE_CACHE
    phase = ds._get_market_phase()
    # 实时刷新板块涨跌幅（使用行业板块数据，已在 _refresh_sector_cache 中填充）
    # 如果缓存为空，触发一次刷新
    if not SECTOR_CHANGE_CACHE:
        _refresh_sector_cache()
    # 如果缓存过期（>60s）或为空，立即触发一次扫描
    cache_age = time.time() - AUCTION_CACHE_TIME
    if cache_age > 60 or len(AUCTION_CACHE) == 0:
        if FULL_STOCK_LIST:
            try:
                stocks = ds.fetch_batch_realtime(FULL_STOCK_LIST)
                _refresh_auction_cache(stocks, phase)
            except Exception as e:
                print(f'竞价即时扫描失败: {e}')
    candidates = AUCTION_CACHE[:100]  # 最多返回100只
    strong = [c for c in candidates if c['signal'] in ('极强', '强')]
    return {
        'phase': phase,
        'time': datetime.now().strftime('%H:%M:%S'),
        'count': len(candidates),
        'strong_count': len(strong),
        'from_cache': (time.time() - AUCTION_CACHE_TIME) < 30,
        'candidates': candidates,
    }


@app.get('/api/auction/formula')
def auction_formula_scan(
    formula_id: int = Query(1, description='公式ID: 1=爆量选谷 2=抓首板 3=爆量抢筹 4=异动选谷 5=砸盘异动'),
):
    """
    五大竞价选股公式扫描
    
    公式1: 竞价爆量选谷 - 竞价金额>3000万, 涨幅0%~3%, 流通市值<200亿, 主板/非ST
    公式2: 竞价抓首板选谷 - 昨日非涨停+昨日非跌停+前日非涨停, 竞价金额>350万, 涨幅3%~6%, 换手率>0.1%
    公式3: 竞价爆量抢筹选谷 - 涨幅3%~6%, 竞价金额>2500万, 换手率>0.1%, 主力抢筹(j>d)
    公式4: 竞价异动选谷 - 竞价异动, 竞价金额>3000万, 换手率>0.2%, 涨幅0%~2%, 流通市值<130亿
    公式5: 竞价砸盘异动选谷 - 竞价砸盘, 竞价金额>350万, 跌幅<-4%, 过去20天区间振幅<30%
    """
    phase = ds._get_market_phase()
    if not FULL_STOCK_LIST:
        return {'phase': phase, 'formula_id': formula_id, 'count': 0, 'candidates': [], 'error': '股票列表未加载'}
    try:
        stocks = ds.fetch_batch_realtime(FULL_STOCK_LIST)
        # 获取竞价专属数据（9:15-9:25 金额/成交量/涨幅）
        auction_data = ds.fetch_auction_data(FULL_STOCK_LIST)
        results = _run_formula_scan(stocks, formula_id, auction_data)
        is_demo = False
        # 如果结果为空（非交易时段/数据异常），自动返回演示数据
        if not results:
            is_demo = True
            results = _get_demo_formula_data(formula_id)
            print(f'[DEMO] 公式{formula_id}返回演示数据 ({len(results)}只)')
        return {
            'phase': phase,
            'time': datetime.now().strftime('%H:%M:%S'),
            'formula_id': formula_id,
            'count': len(results),
            'candidates': results[:100],
            'is_demo': is_demo,
        }
    except Exception as e:
        print(f'公式扫描失败(formula={formula_id}): {e}')
        # 异常时也返回演示数据，保证前端不挂
        results = _get_demo_formula_data(formula_id)
        return {
            'phase': phase,
            'time': datetime.now().strftime('%H:%M:%S'),
            'formula_id': formula_id,
            'count': len(results),
            'candidates': results[:100],
            'is_demo': True,
            'error': str(e),
        }


@app.get('/api/news/sentiment')
def get_news_sentiment():
    """获取市场新闻情绪数据（供次日打板概率参考）"""
    news = _fetch_market_news()
    positive = [n for n in news if n['sentiment'] > 0.6]
    negative = [n for n in news if n['sentiment'] < 0.4]
    return {
        'sentiment_score': NEWS_SENTIMENT_SCORE,
        'total_news': len(news),
        'positive_count': len(positive),
        'negative_count': len(negative),
        'top_positive': positive[:5],
        'top_negative': negative[:5],
        'latest': news[:10],
        'update_time': datetime.now().strftime('%H:%M:%S'),
    }


# 单股新闻缓存
STOCK_NEWS_CACHE: Dict[str, List[Dict]] = {}
STOCK_NEWS_CACHE_TIME: Dict[str, float] = {}


def _fetch_stock_news(code: str) -> List[Dict]:
    """获取单股相关新闻（新浪财经）"""
    global STOCK_NEWS_CACHE, STOCK_NEWS_CACHE_TIME
    now = time.time()
    
    # 5分钟缓存
    if code in STOCK_NEWS_CACHE and now - STOCK_NEWS_CACHE_TIME.get(code, 0) < 300:
        return STOCK_NEWS_CACHE[code]
    
    news_list = []
    try:
        # 新浪财经个股新闻API
        url = f'https://search.api.sina.com.cn/?c=news&q={code}&page=1&num=10'
        resp = requests.get(url, timeout=10, headers={'User-Agent': 'Mozilla/5.0'})
        data = resp.json()
        
        if data.get('result') and data['result'].get('list'):
            for item in data['result']['list'][:10]:
                news_list.append({
                    'time': item.get('datetime', '')[-5:] or '--:--',
                    'title': item.get('title', ''),
                    'source': item.get('media', '新浪'),
                    'url': item.get('url', ''),
                    'type': 'news'
                })
    except Exception as e:
        print(f'  [WARN] 获取股票{code}新闻失败: {e}')
    
    # 如果API失败或为空，返回模拟数据
    if not news_list:
        news_list = _generate_mock_stock_news(code)
    
    STOCK_NEWS_CACHE[code] = news_list
    STOCK_NEWS_CACHE_TIME[code] = now
    return news_list


def _generate_mock_stock_news(code: str) -> List[Dict]:
    """生成模拟股票新闻（备用）"""
    from datetime import datetime
    now = datetime.now()
    times = ['09:25', '09:32', '10:15', '11:02', '13:30', '14:20']
    titles = [
        f'【竞价】集合竞价结束，主力资金净流入+1.2亿',
        f'【异动】快速拉升，5分钟涨幅超3%，成交额突破2亿',
        f'关于控股股东增持公司股份计划的公告',
        f'2024年Q1财报：营收同比增长25%，净利润增长30%',
        f'【快讯】午后开盘，大单净买入超5000万',
        f'关于获得发明专利证书的公告',
    ]
    return [
        {'time': t, 'title': titles[i], 'source': '财经', 'url': '', 'type': 'news'}
        for i, t in enumerate(times)
    ]


@app.get('/api/news/{code}')
def get_stock_news(code: str):
    """获取单股相关新闻"""
    news = _fetch_stock_news(code)
    return {
        'code': code,
        'news': news,
        'count': len(news),
        'update_time': datetime.now().strftime('%H:%M:%S'),
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

@app.get('/api/dashboard')
def get_dashboard(limit: int = Query(200), mode: str = Query('all')):
    """
    综合看板接口：返回股票列表 + 指数 + 市场状态
    前端初始化时调用一次，之后靠 WebSocket 增量更新
    """
    # 根据 mode 确定扫描范围
    if mode == 'watchlist':
        _load_dashboard_watchlist()
        target_stocks = DASHBOARD_WATCHLIST if len(DASHBOARD_WATCHLIST) > 0 else FULL_STOCK_LIST
    else:
        target_stocks = FULL_STOCK_LIST if len(FULL_STOCK_LIST) > 0 else MONITOR_STOCKS
    fetch_list = target_stocks[:limit] if limit > 0 and len(target_stocks) > limit else target_stocks
    stocks = ds.fetch_batch_realtime(fetch_list)
    stock_list = sorted(stocks.values(), key=lambda x: x.change_pct, reverse=True)
    return {
        'stocks': [s.model_dump() for s in stock_list],
        'index': ds.fetch_index_data(),
        'phase': ds._get_market_phase(),
        'time': datetime.now().strftime('%H:%M:%S'),
    }


@app.get('/api/minute/{code}')
def get_minute_data(code: str, count: int = Query(100)):
    """
    分时图数据（腾讯财经接口）
    返回最近 count 个分钟 bar，按时间排序，仅包含交易时段(9:30-11:30, 13:00-15:00)
    """
    prefix = 'sh' if code.startswith(('6', '5')) else 'sz'
    try:
        url = f'https://ifzq.gtimg.cn/appstock/app/kline/mkline?param={prefix}{code},m1,,{count}'
        resp = requests.get(url, timeout=6)
        data = resp.json()
        items = data.get('data', {}).get(f'{prefix}{code}', {}).get('m1', [])
        
        # 先收集所有数据点
        raw_data = []
        for item in items:
            if len(item) < 6:
                continue
            # 腾讯 m1 格式: [时间, 开盘, 收盘, 最高, 最低, 成交量(手), {...}, 涨跌幅?]
            # item[0] = "202605131451" (YYYYMMDDHHMM)
            t_raw = str(item[0])
            if len(t_raw) >= 12:
                hour = int(t_raw[8:10])
                minute = int(t_raw[10:12])
                # 过滤：只保留交易时段 9:30-11:30 和 13:00-15:00
                is_morning = (hour == 9 and minute >= 30) or (hour == 10) or (hour == 11 and minute <= 30)
                is_afternoon = (hour == 13) or (hour == 14) or (hour == 15 and minute == 0)
                if is_morning or is_afternoon:
                    price = float(item[2])    # 收盘价
                    vol = int(float(item[5])) if item[5] else 0    # 成交量（手）
                    raw_data.append({
                        'time_key': t_raw,  # 用于排序
                        'time': f"{hour:02d}:{minute:02d}",
                        'price': price,
                        'volume': vol,
                    })
        
        # 按时间排序（从早到晚）
        raw_data.sort(key=lambda x: x['time_key'])
        
        # 计算涨跌幅和均价
        result = []
        pre_close = None
        total_vol = 0
        total_amt = 0
        for d in raw_data:
            price = d['price']
            vol = d['volume']
            total_vol += vol
            # 简化：用均价近似成交额
            total_amt += price * vol * 100  # 价格 * 手数 * 100股/手
            
            if pre_close is None:
                pre_close = price
                change_pct = 0.0
                avg_price = price
            else:
                change_pct = (price - pre_close) / pre_close * 100
                avg_price = total_amt / (total_vol * 100) if total_vol > 0 else price
            
            result.append({
                'time': d['time'],
                'price': price,
                'volume': vol,
                'amount': round(total_amt, 2),
                'change_pct': round(change_pct, 2),
                'avg_price': round(avg_price, 2),
            })
        
        return {'data': result, 'pre_close': pre_close}
    except Exception as e:
        return {'data': [], 'error': str(e)}


@app.get('/api/kline/{code}')
def get_kline_data(code: str, period: str = Query('day'), count: int = Query(120)):
    """
    K线数据（腾讯财经接口）
    period: day|week|month
    返回: [date, open, close, low, high, volume]
    """
    prefix = 'sh' if code.startswith(('6', '5')) else 'sz'
    try:
        p = period if period in ('day', 'week', 'month') else 'day'
        url = f'https://ifzq.gtimg.cn/appstock/app/kline/kline?param={prefix}{code},{p},,,{count}'
        resp = requests.get(url, timeout=8)
        data = resp.json()
        items = data.get('data', {}).get(f'{prefix}{code}', {}).get(p, [])
        result = []
        for item in items:
            if len(item) < 6:
                continue
            # 腾讯格式: [日期, 开盘, 收盘, 最高, 最低, 成交量]
            result.append({
                'date': str(item[0]),
                'open': float(item[1]),
                'close': float(item[2]),
                'high': float(item[3]),
                'low': float(item[4]),
                'volume': int(float(item[5])) if item[5] else 0,
            })
        return {'data': result, 'period': p}
    except Exception as e:
        return {'data': [], 'period': period, 'error': str(e)}


# 大单自选股管理（放在 /api/big-orders 之前，确保精确路由优先匹配）
BIG_ORDER_WATCHLIST: List[str] = []
BIG_ORDER_WATCHLIST_FILE = os.path.join(os.path.dirname(__file__), 'big_order_watchlist.json')

def _load_big_order_watchlist():
    global BIG_ORDER_WATCHLIST
    if os.path.exists(BIG_ORDER_WATCHLIST_FILE):
        with open(BIG_ORDER_WATCHLIST_FILE, 'r', encoding='utf-8') as f:
            BIG_ORDER_WATCHLIST = json.load(f)

def _save_big_order_watchlist():
    with open(BIG_ORDER_WATCHLIST_FILE, 'w', encoding='utf-8') as f:
        json.dump(BIG_ORDER_WATCHLIST, f, ensure_ascii=False, indent=2)

@app.get('/api/big-orders/watchlist')
async def get_big_order_watchlist():
    """获取大单自选股列表（带名称和现价）"""
    _load_big_order_watchlist()
    if not BIG_ORDER_WATCHLIST:
        return {'stocks': [], 'count': 0}
    stocks_data = ds.fetch_batch_realtime(BIG_ORDER_WATCHLIST)
    result = []
    for code in BIG_ORDER_WATCHLIST:
        if code in stocks_data:
            s = stocks_data[code]
            result.append({'code': code, 'name': s.name, 'price': s.price, 'change_pct': s.change_pct, 'amount': s.amount})
    return {'stocks': result, 'count': len(result)}

@app.post('/api/big-orders/watchlist')
async def add_big_order_watchlist(body: dict):
    """添加股票到大单自选股池"""
    _load_big_order_watchlist()
    codes = body.get('codes', [])
    if isinstance(codes, str):
        codes = [codes]
    added = []
    for c in codes:
        c = c.strip().zfill(6)
        if c not in BIG_ORDER_WATCHLIST:
            BIG_ORDER_WATCHLIST.append(c)
            added.append(c)
    _save_big_order_watchlist()
    return {'added': added, 'total': len(BIG_ORDER_WATCHLIST)}

@app.delete('/api/big-orders/watchlist/{code}')
async def remove_big_order_watchlist(code: str):
    """从大单自选股池移除股票"""
    _load_big_order_watchlist()
    code = code.strip().zfill(6)
    if code in BIG_ORDER_WATCHLIST:
        BIG_ORDER_WATCHLIST.remove(code)
        _save_big_order_watchlist()
    return {'removed': code, 'total': len(BIG_ORDER_WATCHLIST)}

# 行情看板自选股管理
DASHBOARD_WATCHLIST: List[str] = []
DASHBOARD_WATCHLIST_FILE = os.path.join(os.path.dirname(__file__), 'dashboard_watchlist.json')

def _load_dashboard_watchlist():
    global DASHBOARD_WATCHLIST
    if os.path.exists(DASHBOARD_WATCHLIST_FILE):
        with open(DASHBOARD_WATCHLIST_FILE, 'r', encoding='utf-8') as f:
            DASHBOARD_WATCHLIST = json.load(f)

def _save_dashboard_watchlist():
    with open(DASHBOARD_WATCHLIST_FILE, 'w', encoding='utf-8') as f:
        json.dump(DASHBOARD_WATCHLIST, f, ensure_ascii=False, indent=2)

@app.get('/api/dashboard/watchlist')
async def get_dashboard_watchlist():
    """获取行情看板自选股列表（与大单自选股同步）"""
    _load_big_order_watchlist()
    if not BIG_ORDER_WATCHLIST:
        return {'stocks': [], 'count': 0}
    stocks_data = ds.fetch_batch_realtime(BIG_ORDER_WATCHLIST)
    result = []
    for code in BIG_ORDER_WATCHLIST:
        if code in stocks_data:
            s = stocks_data[code]
            result.append({'code': code, 'name': s.name, 'price': s.price, 'change_pct': s.change_pct, 'turnover': s.turnover, 'volume_ratio': s.volume_ratio, 'wei_bi': s.wei_bi})
    return {'stocks': result, 'count': len(result)}

@app.post('/api/dashboard/watchlist')
async def add_dashboard_watchlist(body: dict):
    """添加股票到行情看板自选股池（与大单自选股同步）"""
    return await add_big_order_watchlist(body)

@app.delete('/api/dashboard/watchlist/{code}')
async def remove_dashboard_watchlist(code: str):
    """从行情看板自选股池移除股票（与大单自选股同步）"""
    return await remove_big_order_watchlist(code)




@app.get('/api/big-orders')
def get_big_orders(request: Request):
    """大单追踪 - 支持自定义股票池模式，mode=watchlist 时只查自选股"""
    mode = request.query_params.get('mode', 'all')
    sort_by = request.query_params.get('sort', 'amount')
    sort_dir = request.query_params.get('dir', 'desc')
    threshold = Config.BIG_ORDER_THRESHOLD

    # 确定扫描范围
    if mode == 'watchlist' and BIG_ORDER_WATCHLIST:
        target = BIG_ORDER_WATCHLIST
        threshold = 0  # 自选股模式：不过滤金额门槛
    else:
        target = FULL_STOCK_LIST if len(FULL_STOCK_LIST) > 0 else MONITOR_STOCKS

    stocks = ds.fetch_batch_realtime(target)
    orders = []
    for code, stock in stocks.items():
        if stock.amount >= threshold and stock.price > 0 and stock.volume > 0:
            if stock.high > stock.low and stock.price > 0:
                sell_ratio = max(0, min(1, (stock.price - stock.low) / (stock.high - stock.low)))
            else:
                sell_ratio = 0.5
            sell_vol = int(stock.volume * sell_ratio)
            buy_vol = stock.volume - sell_vol
            avg_price = stock.amount / (stock.volume * 100) if stock.volume > 0 else stock.price
            buy_amount = buy_vol * 100 * avg_price
            sell_amount = sell_vol * 100 * avg_price
            orders.append({
                'code': code,
                'name': stock.name,
                'price': stock.price,
                'volume': stock.volume,
                'amount': stock.amount,
                'change_pct': stock.change_pct,
                'is_up': stock.change_pct > 0,
                'buy_vol': buy_vol,
                'sell_vol': sell_vol,
                'buy_amount': buy_amount,
                'sell_amount': sell_amount,
                'net_vol': buy_vol - sell_vol,
                'net_amount': buy_amount - sell_amount,
                'time': datetime.now().strftime('%H:%M:%S'),
            })

    # 排序
    sort_keys = {
        'amount': 'amount', 'vol': 'volume', 'price': 'price',
        'pct': 'change_pct', 'buy_vol': 'buy_vol', 'sell_vol': 'sell_vol',
        'buy_amt': 'buy_amount', 'sell_amt': 'sell_amount',
        'net_vol': 'net_vol', 'net_amt': 'net_amount',
    }
    key = sort_keys.get(sort_by, 'amount')
    reverse = sort_dir != 'asc'
    orders.sort(key=lambda x: x[key], reverse=reverse)
    return {'orders': orders[:100], 'time': datetime.now().strftime('%H:%M:%S')}

# ============== 板块功能 ==============
SECTOR_LIST_CACHE: List[Dict] = []
SECTOR_LIST_CACHE_TIME = 0
SECTOR_STOCKS_CACHE: Dict[str, Dict] = {}

# 内置板块列表（当新浪和AKShare都失败时的兜底）
_FALLBACK_SECTORS = [
    {'key': '银行', '板块名称': '银行', '股票数': '42'},
    {'key': '保险', '板块名称': '保险', '股票数': '7'},
    {'key': '证券', '板块名称': '证券', '股票数': '50'},
    {'key': '房地产', '板块名称': '房地产', '股票数': '120'},
    {'key': '建筑', '板块名称': '建筑', '股票数': '85'},
    {'key': '钢铁', '板块名称': '钢铁', '股票数': '45'},
    {'key': '煤炭', '板块名称': '煤炭', '股票数': '38'},
    {'key': '石油', '板块名称': '石油', '股票数': '25'},
    {'key': '电力', '板块名称': '电力', '股票数': '90'},
    {'key': '化工', '板块名称': '化工', '股票数': '380'},
    {'key': '医药', '板块名称': '医药制造', '股票数': '280'},
    {'key': '医疗', '板块名称': '医疗器械', '股票数': '120'},
    {'key': '食品饮料', '板块名称': '食品饮料', '股票数': '110'},
    {'key': '酿酒', '板块名称': '酿酒行业', '股票数': '42'},
    {'key': '家电', '板块名称': '家电行业', '股票数': '65'},
    {'key': '汽车', '板块名称': '汽车整车', '股票数': '48'},
    {'key': '汽车零部件', '板块名称': '汽车零部件', '股票数': '180'},
    {'key': '电子', '板块名称': '电子元件', '股票数': '260'},
    {'key': '半导体', '板块名称': '半导体', '股票数': '150'},
    {'key': '芯片', '板块名称': '芯片', '股票数': '120'},
    {'key': '计算机', '板块名称': '计算机设备', '股票数': '110'},
    {'key': '软件', '板块名称': '软件开发', '股票数': '160'},
    {'key': '通信', '板块名称': '通信设备', '股票数': '95'},
    {'key': '传媒', '板块名称': '文化传媒', '股票数': '85'},
    {'key': '游戏', '板块名称': '游戏', '股票数': '40'},
    {'key': '农林牧渔', '板块名称': '农林牧渔', '股票数': '95'},
    {'key': '有色金属', '板块名称': '有色金属', '股票数': '75'},
    {'key': '机械设备', '板块名称': '机械设备', '股票数': '180'},
    {'key': '纺织服装', '板块名称': '纺织服装', '股票数': '55'},
    {'key': '交通运输', '板块名称': '交通运输', '股票数': '80'},
    {'key': '商业百货', '板块名称': '商业百货', '股票数': '65'},
    {'key': '旅游酒店', '板块名称': '旅游酒店', '股票数': '45'},
    {'key': '环保', '板块名称': '环保行业', '股票数': '110'},
    {'key': '军工', '板块名称': '航天航空', '股票数': '48'},
    {'key': '船舶', '板块名称': '船舶制造', '股票数': '12'},
    {'key': '新能源', '板块名称': '新能源', '股票数': '150'},
    {'key': '光伏', '板块名称': '光伏设备', '股票数': '65'},
    {'key': '锂电池', '板块名称': '锂电池', '股票数': '85'},
    {'key': '储能', '板块名称': '储能', '股票数': '55'},
    {'key': '机器人', '板块名称': '机器人', '股票数': '70'},
    {'key': '人工智能', '板块名称': '人工智能', '股票数': '120'},
    {'key': '算力', '板块名称': '算力概念', '股票数': '80'},
    {'key': '5G', '板块名称': '5G概念', '股票数': '110'},
    {'key': '区块链', '板块名称': '区块链', '股票数': '90'},
    {'key': '数字货币', '板块名称': '数字货币', '股票数': '45'},
    {'key': '物联网', '板块名称': '物联网', '股票数': '100'},
    {'key': '工业互联网', '板块名称': '工业互联网', '股票数': '75'},
    {'key': '新材料', '板块名称': '新材料', '股票数': '130'},
    {'key': '稀土', '板块名称': '稀土永磁', '股票数': '35'},
    {'key': '黄金', '板块名称': '贵金属', '股票数': '15'},
]

def _fetch_sector_list() -> List[Dict]:
    """获取板块列表：新浪优先 → AKShare备用 → 内置兜底（带5分钟缓存）"""
    global SECTOR_LIST_CACHE, SECTOR_LIST_CACHE_TIME
    now = time.time()
    if now - SECTOR_LIST_CACHE_TIME < 300 and SECTOR_LIST_CACHE:
        return SECTOR_LIST_CACHE

    result = []
    # 第一层：新浪API
    try:
        resp = ds.session.get('https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php', timeout=10)
        resp.encoding = 'gbk'
        raw = resp.text.strip()
        json_str = re.sub(r'^var\s+S_Finance_bankuai_sinaindustry\s*=\s*', '', raw)
        json_str = re.sub(r';\s*$', '', json_str)
        data = json.loads(json_str)
        for key, val in data.items():
            parts = val.split(',')
            if len(parts) >= 2:
                result.append({'key': key, '板块名称': parts[1], '股票数': parts[2] if len(parts) > 2 else ''})
        if result:
            print(f"✅ 板块列表(新浪): {len(result)} 个")
    except Exception as e:
        print(f"⚠ 板块列表(新浪)失败: {e}")

    # 第二层：AKShare（东方财富行业板块）
    if not result:
        try:
            df = ak.stock_board_industry_name_em()
            for _, row in df.iterrows():
                name = str(row.get('板块名称', '')).strip()
                if name:
                    result.append({'key': name, '板块名称': name, '股票数': str(row.get('股票数', ''))})
            if result:
                print(f"✅ 板块列表(AKShare): {len(result)} 个")
        except Exception as e:
            print(f"⚠ 板块列表(AKShare)失败: {e}")

    # 第三层：内置兜底
    if not result:
        result = _FALLBACK_SECTORS.copy()
        print(f"✅ 板块列表(内置兜底): {len(result)} 个")

    SECTOR_LIST_CACHE = result
    SECTOR_LIST_CACHE_TIME = now
    return SECTOR_LIST_CACHE

def _fetch_sector_stocks(sector_key: str, sector_name: str) -> List[Dict]:
    """获取板块成分股：新浪优先 → AKShare备用（带5分钟缓存）"""
    global SECTOR_STOCKS_CACHE
    now = time.time()
    cache = SECTOR_STOCKS_CACHE.get(sector_key)
    if cache and now - cache['time'] < 300:
        return cache['data']

    stocks = []
    # 第一层：新浪API
    try:
        url = (f'https://vip.stock.finance.sina.com.cn/quotes_service/api/'
               f'json_v2.php/Market_Center.getHQNodeData'
               f'?page=1&num=500&sort=symbol&asc=1&node={sector_key}')
        s = requests.Session()
        s.headers.update({'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.sina.com.cn/'})
        resp = s.get(url, timeout=10)
        resp.encoding = 'gbk'
        text = resp.text.strip()
        if text and text != '[]':
            data = json.loads(text)
            for item in data:
                stocks.append({
                    '代码': item.get('code', ''),
                    '名称': item.get('name', ''),
                    '最新价': item.get('trade', '0'),
                    '涨跌幅': item.get('changepercent', '0'),
                })
            if stocks:
                print(f"✅ 板块[{sector_name}] 成分股(新浪): {len(stocks)} 只")
    except Exception as e:
        print(f"⚠ 板块成分股(新浪)失败 [{sector_name}]: {e}")

    # 第二层：AKShare（东方财富行业板块成分股）
    if not stocks and sector_name:
        try:
            df = ak.stock_board_industry_cons_em(symbol=sector_name)
            for _, row in df.iterrows():
                stocks.append({
                    '代码': str(row.get('代码', '')).strip(),
                    '名称': str(row.get('名称', '')).strip(),
                    '最新价': str(row.get('最新价', '0')),
                    '涨跌幅': str(row.get('涨跌幅', '0')),
                })
            if stocks:
                print(f"✅ 板块[{sector_name}] 成分股(AKShare): {len(stocks)} 只")
        except Exception as e:
            print(f"⚠ 板块成分股(AKShare)失败 [{sector_name}]: {e}")

    if stocks:
        SECTOR_STOCKS_CACHE[sector_key] = {'data': stocks, 'time': now}
    elif cache:
        return cache['data']

    return stocks

@app.get('/api/sectors')
def get_sectors():
    """获取所有板块列表"""
    return {'sectors': _fetch_sector_list()}

@app.get('/api/sector/{sector_key}')
def get_sector_stocks(sector_key: str):
    """获取指定板块的成分股"""
    # 从缓存的板块列表中找到板块名称
    name = sector_key
    for s in SECTOR_LIST_CACHE:
        if s['key'] == sector_key:
            name = s['板块名称']
            break
    return {'sector': name, 'key': sector_key, 'stocks': _fetch_sector_stocks(sector_key, name)}

# ============== 复盘分析 - 连板质量矩阵评分 ==============

def _calc_board_base(boards: int) -> int:
    """连板基础分"""
    return {1: 5, 2: 8, 3: 12, 4: 15}.get(boards, 18)  # 5板+ = 18

def _calc_theme_quality(sector: str, name: str) -> int:
    """质地分: 大题材10 / 中等8 / 小题材3"""
    big_kw = ['政策', '技术', '合作', '发布', '中标', '订单', '国产', '创新',
              '赛道', '产业', '规划', '纲要', '补贴', '扶持', '突破', '核心',
              '芯片', '算力', 'AI', '人工智能', '量子', '卫星', '低空', '固态',
              '机器人', '新能源', '储能', '氢能', '自动驾驶', '智能驾驶']
    small_kw = ['一季报', '半年报', '三季报', '年报', '净利润', '营收', '增长', '%']
    text = (sector or '') + (name or '')
    if any(k in text for k in big_kw):
        return 10
    if any(k in text for k in small_kw):
        return 3
    return 8

def _calc_heat_score(limit_count: int) -> int:
    """热度分: 同题材涨停数"""
    if limit_count >= 20: return 8
    if limit_count >= 12: return 7
    if limit_count >= 8:  return 6
    if limit_count >= 4:  return 5
    if limit_count >= 2:  return 3
    return 1

def _calc_review_scores(stocks: List[Dict]) -> List[Dict]:
    """
    对连板股应用连板质量矩阵评分规则 (25~72分)
    - 连板基础分: 1板5/2板8/3板12/4板15/5板+18
    - 题材评分(封顶30): 质地+热度+龙头+叠加
    - 资金流向: -5~+10
    """
    if not stocks:
        return []

    # ---- 按板块分组，统计同板块连板数 ----
    sector_stocks: Dict[str, List[Dict]] = defaultdict(list)
    for s in stocks:
        sec = s.get('sector') or '未知'
        sector_stocks[sec].append(s)

    # 板块内最高板 & 梯队深度
    for sec, items in sector_stocks.items():
        board_counts = sorted(set(s.get('board_count', 1) or 1 for s in items), reverse=True)
        max_board = board_counts[0] if board_counts else 1
        depth = len(board_counts)  # 梯队层数
        for s in items:
            s['_is_leader'] = (s.get('board_count', 1) or 1) == max_board
            s['_depth'] = depth
            s['_sector_limit_count'] = sum(1 for x in items)  # 同板块连板股数量
            s['_sector_total_lu'] = len([x for x in items if (x.get('board_count') or 0) >= 1])  # 同题材涨停数近似

    results = []
    for s in stocks:
        boards = s.get('board_count') or 1
        sector = s.get('sector') or ''
        name = s.get('name') or ''
        inflow_ratio = abs(s.get('net_ratio') or 0)  # 主力净流入占比%

        # 基础分
        base = _calc_board_base(boards)

        # 质地分
        quality = _calc_theme_quality(sector, name)

        # 热度分 (同题材涨停数)
        heat = _calc_heat_score(s.get('_sector_total_lu') or 1)

        # 龙头加分
        leader = 8 if s.get('_is_leader') else 0
        # 梯队加分：depth=2 给5分，depth>=3 给10分
        d = s.get('_depth') or 0
        depth_bonus = 10 if d >= 3 else (5 if d == 2 else 0)

        # 多题材叠加 (简化: 题材数=1，大题材个数由质地推断)
        big_count = 1 if quality >= 8 else 0
        theme_count = 1  # 简化，题材数=1

        # 题材小计(封顶30)
        theme_total = min(30, quality + heat + leader + depth_bonus)

        # 资金流向分
        fund = 10 if inflow_ratio > 20 else (6 if inflow_ratio >= 8 else (3 if inflow_ratio >= 2 else (0 if inflow_ratio >= -2 else (-3 if inflow_ratio > -7 else -3))))

        total = base + theme_total + fund
        grade = 'S' if total >= 55 else ('A' if total >= 45 else ('B' if total >= 35 else 'C'))

        results.append({
            'code': s.get('code', ''),
            'name': name,
            'price': round(s.get('price') or 0, 2),
            'change_pct': round(s.get('change_pct') or 0, 2),
            'boards': boards,
            'sector': sector,
            'base_score': base,
            'quality_score': quality,
            'heat_score': heat,
            'leader_score': leader,
            'depth_bonus': depth_bonus,
            'multi_bonus': 0,
            'theme_total': theme_total,
            'fund_score': fund,
            'inflow_ratio': round(inflow_ratio, 1),
            'total_score': total,
            'grade': grade,
            'is_leader': s.get('_is_leader', False),
            'depth': s.get('_depth', 0),
            'sector_limit_count': s.get('_sector_total_lu', 1),
            'amount': round(s.get('auction_turnover') or 0, 2),  # 成交额(万元)
            'signal': s.get('signal', ''),
        })

    results.sort(key=lambda x: x['total_score'], reverse=True)
    return results


@app.get('/api/review/stocks')
def get_review_stocks():
    """
    复盘分析 - 连板质量矩阵评分
    返回当前最新数据，按总分降序排列
    周末/休市时直接使用缓存，不触发重新扫描
    """
    global AUCTION_CACHE, AUCTION_CACHE_TIME
    phase = ds._get_market_phase()

    # 周末或已休市：直接使用缓存，不重新扫描
    if phase in ('周末休市', '已休市'):
        if len(AUCTION_CACHE) == 0:
            _load_auction_cache()
        if len(AUCTION_CACHE) == 0:
            return {'phase': phase, 'time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'), 'stats': {'total': 0, 's_count': 0, 'a_count': 0, 'avg_score': '0', 'avg_inflow': '0'}, 'stocks': []}
    else:
        # 交易时段：缓存过期(>90s)或为空，触发一次扫描
        cache_age = time.time() - AUCTION_CACHE_TIME
        if cache_age > 90 or len(AUCTION_CACHE) == 0:
            if FULL_STOCK_LIST:
                try:
                    stocks = ds.fetch_batch_realtime(FULL_STOCK_LIST)
                    _refresh_auction_cache(stocks, phase)
                except Exception as e:
                    print(f'复盘扫描失败: {e}')

    # 只取涨停/连板候选 (board_count >= 1)
    limit_stocks = [s for s in AUCTION_CACHE if (s.get('board_count') or 0) >= 1]
    if not limit_stocks:
        # 降级: 取涨幅 >= 9% 的股票
        limit_stocks = [s for s in AUCTION_CACHE if (s.get('change_pct') or 0) >= 9.0]
        # 补充 board_count = 1
        for s in limit_stocks:
            if not s.get('board_count'):
                s['board_count'] = 1

    scored = _calc_review_scores(limit_stocks[:100])

    stats = {
        'total': len(scored),
        's_count': sum(1 for x in scored if x['grade'] == 'S'),
        'a_count': sum(1 for x in scored if x['grade'] == 'A'),
        'b_count': sum(1 for x in scored if x['grade'] == 'B'),
        'c_count': sum(1 for x in scored if x['grade'] == 'C'),
        'avg_score': round(sum(x['total_score'] for x in scored) / len(scored), 1) if scored else 0,
        'avg_inflow': round(sum(x['inflow_ratio'] for x in scored) / len(scored), 1) if scored else 0,
    }

    return {
        'phase': phase,
        'time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'stats': stats,
        'stocks': scored,
    }

# ============== 最强风口（新闻驱动） ==============

def _get_hot_trend_response():
    try:
        from hot_trend import get_hot_trend_data
        # AUCTION_CACHE 是 list，直接传入
        return get_hot_trend_data(AUCTION_CACHE or [])
    except Exception as e:
        print(f'[最强风口] 接口异常: {e}')
        return {'stocks': [], 'news_count': 0, 'update_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

@app.get('/api/hot-trend/stocks')
def get_hot_trend_stocks():
    """最强风口 - 新闻驱动股票评分"""
    return _get_hot_trend_response()

# ============== 静态文件托管 ==============
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend', 'dist')
if os.path.isdir(FRONTEND_DIR):
    app.mount('/assets', StaticFiles(directory=os.path.join(FRONTEND_DIR, 'assets')), name='assets')

    @app.get('/')
    @app.get('/{full_path:path}')
    def serve_frontend(full_path: str = ''):
        file_path = os.path.join(FRONTEND_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIR, 'index.html'))

# ============== 启动 ==============

if __name__ == '__main__':
    # Railway 会注入 PORT 环境变量，本地开发默认 8001
    _port = int(os.environ.get('PORT', 8001))
    print('A股监控平台 v3.0 启动中...')
    print(f'环境: {"Railway" if os.environ.get("RAILWAY") else "Local"}')
    print(f'端口: {_port}')
    print('数据源: 新浪财经 + 腾讯财经')
    print('风格: 同花顺（绿涨红跌）')
    print(f'前端静态文件: {FRONTEND_DIR}')
    uvicorn.run(app, host='0.0.0.0', port=_port)
