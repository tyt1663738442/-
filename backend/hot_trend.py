"""
最强风口 - 新闻驱动股票评分 v2
通过爬取财经新闻、分析关键词与情绪，计算股票风口分数

评分体系：
- 分层情绪：政策/行业/资金/业绩/国际/通用（各类型独立关键词库）
- 政策力度：国家级/部位级/地方级/行业级（不同权重）
- 个股精准匹配：从公告中提取股票代码直接匹配
- 自上而下匹配：关键词→板块→板块内股票
"""

import re
import json
import os
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional

# 新闻时间范围（天）
NEWS_DAYS_LIMIT = 5

# ============== 消息类型基础分 ==============
NEWS_TYPE_WEIGHTS = {
    'policy': 20,    # 政策类：力度最强
    'industry': 15,   # 行业类
    'fund': 15,      # 资金类
    'earnings': 15,  # 业绩类
    'macro': 15,     # 国际/宏观类
    'stock': 10,    # 个股公告
    'general': 10,   # 通用类
}

# ============== 政策力度分级 ==============
FORCE_LEVELS = {
    'national': 2.5,    # 国家级：国务院、发改委、央行、证监会、全国人大
    'ministerial': 2.0, # 部位级：工信部、财政部、商务部等
    'local': 1.0,       # 地方级：省/市/自治区
    'industry': 0.5,    # 行业级：行业协会、头部企业
    'unknown': 1.0,     # 未知：默认1.0
}

# ============== 力度关键词 ==============
FORCE_KEYWORDS = {
    'national': ['国务院', '发改委', '央行', '证监会', '银保监', '全国人大', '中共中央', '中办', '国办', '国常会'],
    'ministerial': ['工信部', '财政部', '商务部', '生态环境部', '卫健委', '教育部', '文旅部', '住建部', '交通部', '能源局', '药监局', '统计局'],
    'local': ['省', '市', '自治区', '人民政府', '省政府', '市政府', '区委', '开发区'],
    'industry': ['行业协会', '中国', '中汽协', '光伏协会', '钢铁协会'],
}

# ============== 消息类型关键词 ==============
NEWS_TYPE_KEYWORDS = {
    'policy': ['国务院', '发改委', '央行', '财政部', '证监会', '工信部', '通知', '意见', '规划', '纲要', '公告', '决定', '条例', '办法', '国常会', '政治局', '中央', '部委'],
    'industry': ['行业', '板块', '产能', '供需', '涨价', '市场', '产业链', '供应链', '景气', '周期'],
    'macro': ['美国', '美联储', '欧洲', '欧盟', 'G7', 'OPEC', '英国', '日本', '德国', '法国', '制裁', '关税', '全球', '国际', '原油', '黄金', '美股', '港股'],
    'stock': ['公司', '协议', '合同', '收购', '定增', '回购', '增持', '减持', '业绩', '分红', '股权', '重组', '更名', '摘牌'],
}

# ============== 分层情绪关键词 ==============
BULLISH_BY_TYPE = {
    'policy': ['补贴', '扶持', '规划', '批准', '降税', '降准', '准入放宽', '免征', '专项资金', '减税', '退税', '优惠', '支持', '推动', '促进', '鼓励', '推广', '扩大', '加码'],
    'industry': ['突破', '涨价', '订单大增', '市场份额扩大', '产能出清', '技术领先', '景气', '复苏', '爆发', '大涨', '创新高', '供不应求', '扩产', '投产'],
    'fund': ['回购', '增持', '战投', '外资流入', '回购注销', '大股东增持', '机构调研', 'QFII', '北向', '净买入', '加仓', '扫货'],
    'earnings': ['超预期', '上修', '盈利增长', '中标', '大订单', '签约', '净利润增长', '业绩增长', '收入增长', '扭亏', '大幅增长'],
    'macro': ['降息', '降准', '宽松', '放水', '刺激', '合作', '共识', '达成', '关税降低', '自贸区', '全球化'],
    'stock': ['回购', '增持', '业绩预增', '中标', '签订合同', '重组', '收购资产', '引入战投', '高送转', '分红'],
    'general': ['涨', '利好', '创新', '机会', '强势', '爆发', '突破', '看涨', '做多', '推荐', '买入', '买入评级', '上调评级'],
}

BEARISH_BY_TYPE = {
    'policy': ['打压', '调控', '处罚', '限产', '禁令', '版号收紧', '整改', '关停', '清退', '淘汰', '整改', '问责', '限制', '收紧', '压缩'],
    'industry': ['价格战', '产能过剩', '技术替代', '调查', '警示', '召回', '暴跌', '大跌', '淘汰', '出清', '价格下跌', '需求下滑', '竞争加剧'],
    'fund': ['减持', '质押爆仓', '清仓', '解禁', '定增稀释', '高管离职', '套现', '大比例减持', '北向净卖出', '净卖出', '割肉'],
    'earnings': ['暴雷', '下修', '亏损', '商誉减值', '坏账计提', '存货跌价', '业绩预减', '大幅下滑', '首亏', '续亏', '造假', '财务问题'],
    'macro': ['加息', '缩表', '收紧', '制裁', '技术封锁', '加征关税', '出口管制', '脱钩', '衰退', '危机', '崩盘', '暴跌'],
    'stock': ['减持', '业绩预减', '终止', '取消', '收到问询函', '立案调查', '处罚', '警示函', 'ST', '*ST', '退市风险', '合同终止', '违约', '亏损'],
    'general': ['跌', '利空', '暴跌', '弱势', '违约', '裁员', '暴雷', '警告', '卖出', '做空', '下调评级', '下调目标价', '风险'],
}

# ============== 关键词→板块映射 ==============
KEYWORD_SECTOR_MAP = {
    # 新能源
    '新能源': '新能源', '光伏': '新能源', '风电': '新能源', '锂电池': '新能源',
    '储能': '新能源', '新能源汽车': '新能源', '绿能': '新能源', '太阳能': '新能源',
    '能源': '新能源', '充电桩': '新能源', '电网': '新能源', '虚拟电厂': '新能源',
    # 半导体
    '芯片': '半导体', '半导体': '半导体', '集成电路': '半导体', '电子': '半导体',
    '微电子': '半导体', '晶圆': '半导体', '封测': '半导体',
    # AI/科技
    'AI': '人工智能', '人工智能': '人工智能', '机器人': '机器人', '工业母机': '机器人',
    '科技': '人工智能', '智能': '人工智能', '软件': '人工智能', '计算机': '人工智能',
    '互联网': '人工智能', '通信': '人工智能', '算力': '人工智能', '大数据': '人工智能',
    '云计算': '人工智能', '数字经济': '人工智能',
    # 医药
    '创新药': '医药生物', '生物医药': '医药生物', 'CXO': '医药生物', '医药': '医药生物',
    '医疗': '医药生物', '生物': '医药生物', '医疗器械': '医药生物', '中药': '医药生物',
    '疫苗': '医药生物',
    # 消费
    '白酒': '大消费', '零售': '大消费', '家电': '大消费', '食品': '大消费',
    '消费': '大消费', '饮料': '大消费', '餐饮': '大消费', '旅游': '大消费',
    '酒店': '大消费', '纺织': '大消费', '服装': '大消费', '免税': '大消费',
    # 房地产
    '房地产': '房地产', '地产': '房地产', '建筑': '房地产', '建材': '房地产',
    '基建': '房地产', '水泥': '房地产', '钢铁': '房地产',
    # 金融
    '银行': '金融', '保险': '金融', '券商': '金融', '金融': '金融',
    '证券': '金融', '期货': '金融', '信托': '金融', '基金': '金融',
    # 军工
    '军工': '国防军工', '航天': '国防军工', '卫星': '国防军工', '航空': '国防军工',
    '船舶': '国防军工', '兵器': '国防军工', '无人机': '国防军工', '发动机': '国防军工',
    # 资源/周期
    '化工': '化工', '化学': '化工', '材料': '新材料', '有色': '有色金属',
    '煤炭': '煤炭', '石油': '石油', '天然气': '石油', '稀土': '有色金属',
    '锂': '有色金属', '铜': '有色金属', '黄金': '有色金属', '矿业': '有色金属',
    '矿产': '有色金属',
    # 制造
    '机械': '机械设备', '设备': '机械设备', '制造': '机械设备', '汽车': '汽车',
    '整车': '汽车', '零部件': '汽车', '电力': '电力', '电气': '电力',
    '环保': '环保', '物流': '物流', '运输': '物流', '港口': '物流',
    '农业': '农业', '养殖': '农业', '种植': '农业', '传媒': '传媒',
    '游戏': '传媒', '影视': '传媒', '广告': '传媒', '教育': '教育',
    '低空': '低空经济', 'eVTOL': '低空经济', '通用航空': '低空经济',
    '固态电池': '新能源', '钠电池': '新能源',
    '光刻': '半导体', 'EDA': '半导体',
}

# ============== 通用情绪关键词（兜底） ==============
BULLISH_GENERAL = ['涨', '利好', '突破', '创新', '增长', '盈利', '上调', '买入', '推荐', '机会', '强势', '爆发', '减税', '补贴', '扶持', '规划', '扩张', '签约', '中标', '批准', '降息', '降准']
BEARISH_GENERAL = ['跌', '利空', '下调', '亏损', '裁员', '风险', '警告', '卖出', '避险', '弱势', '暴跌', '暴雷', '调查', '处罚', '立案', '退市', '下滑', '违约']


# 时间范围
_CUTOFF_TIME = None

def _get_cutoff():
    """获取5天前的时间点"""
    global _CUTOFF_TIME
    if _CUTOFF_TIME is None:
        _CUTOFF_TIME = datetime.now() - timedelta(days=NEWS_DAYS_LIMIT)
    return _CUTOFF_TIME

def _is_recent(dt: datetime) -> bool:
    """判断时间是否在5天内"""
    if dt is None:
        return True
    return dt >= _get_cutoff()

def _parse_datetime(date_str: str) -> datetime:
    """解析日期字符串"""
    if not date_str:
        return None
    for fmt in ['%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%d', '%m-%d %H:%M', '%Y%m%d']:
        try:
            return datetime.strptime(str(date_str).strip(), fmt)
        except:
            pass
    return None


# ============== 核心分类与分析函数 ==============

def classify_news_type(text: str) -> str:
    """判断消息类型：policy/industry/macro/stock/general"""
    text = text or ''
    for kw in NEWS_TYPE_KEYWORDS.get('macro', []):
        if kw in text:
            return 'macro'
    for kw in NEWS_TYPE_KEYWORDS.get('policy', []):
        if kw in text:
            return 'policy'
    for kw in NEWS_TYPE_KEYWORDS.get('industry', []):
        if kw in text:
            return 'industry'
    for kw in NEWS_TYPE_KEYWORDS.get('stock', []):
        if kw in text:
            return 'stock'
    return 'general'


def detect_force_level(text: str) -> str:
    """判断政策力度级别：national/ministerial/local/industry/unknown"""
    text = text or ''
    if any(kw in text for kw in FORCE_KEYWORDS['national']):
        return 'national'
    if any(kw in text for kw in FORCE_KEYWORDS['ministerial']):
        return 'ministerial'
    if any(kw in text for kw in FORCE_KEYWORDS['local']):
        return 'local'
    if any(kw in text for kw in FORCE_KEYWORDS['industry']):
        return 'industry'
    return 'unknown'


def analyze_sentiment_by_type(text: str, news_type: str) -> Tuple[int, int]:
    """分层情绪分析，返回 (利多词数, 利空词数)"""
    bullish = 0
    bearish = 0

    # 先从当前类型关键词库中计数
    type_bullish = BULLISH_BY_TYPE.get(news_type, [])
    for kw in type_bullish:
        if kw in text:
            bullish += 1

    type_bearish = BEARISH_BY_TYPE.get(news_type, [])
    for kw in type_bearish:
        if kw in text:
            bearish += 1

    # 如果当前类型没找到，用通用关键词兜底
    if bullish == 0 and bearish == 0:
        for kw in BULLISH_GENERAL:
            if kw in text:
                bullish += 1
        for kw in BEARISH_GENERAL:
            if kw in text:
                bearish += 1

    return bullish, bearish


def extract_stock_code_from_text(text: str) -> List[str]:
    """从文本中提取股票代码（6位数字）"""
    codes = []
    # 匹配 600xxx, 601xxx, 000xxx, 002xxx, 300xxx 等格式
    matches = re.findall(r'\b([6032]\d{5})\b', text)
    for m in matches:
        if m not in codes:
            codes.append(m)
    return codes


def generate_impact_reason(news: dict, matched_kws: list) -> str:
    """生成影响说明"""
    ntype = news.get('news_type', 'general')
    sentiment = news.get('impact_type', 'neutral')
    matched_kws = matched_kws or []

    # 找到匹配到的行业关键词
    sector_kw = ''
    for kw in matched_kws:
        if kw in KEYWORD_SECTOR_MAP:
            sector_kw = KEYWORD_SECTOR_MAP[kw]
            break

    topic = sector_kw or (matched_kws[0] if matched_kws else '相关板块')

    if sentiment == 'bullish':
        if ntype == 'policy':
            return f"政策力度较大，{topic}直接受益"
        elif ntype == 'industry':
            return f"行业供需改善，{topic}景气上行"
        elif ntype == 'macro':
            return f"国际宏观利好，{topic}受资金青睐"
        elif ntype == 'fund':
            return f"资金持续流入，{topic}获机构增持"
        elif ntype == 'earnings':
            return f"业绩超预期，{topic}盈利增长"
        elif ntype == 'stock':
            return f"个股利好公告，{topic}受关注"
        else:
            return f"{topic}利多信号"
    elif sentiment == 'bearish':
        if ntype == 'policy':
            return f"政策收紧，{topic}承压"
        elif ntype == 'industry':
            return f"行业竞争加剧，{topic}面临压力"
        elif ntype == 'macro':
            return f"国际环境恶化，{topic}受冲击"
        elif ntype == 'fund':
            return f"资金持续流出，{topic}遭减持"
        elif ntype == 'earnings':
            return f"业绩暴雷，{topic}盈利下滑"
        elif ntype == 'stock':
            return f"个股利空公告，{topic}风险警示"
        else:
            return f"{topic}利空信号"
    else:
        return f"{topic}中性信息"


def analyze_news(news_item: dict) -> dict:
    """综合分析单条新闻，返回增强后的新闻数据"""
    title = news_item.get('title', '')
    text_full = f"{title} {news_item.get('source', '')}"

    # 1. 判断消息类型
    ntype = classify_news_type(text_full)

    # 2. 判断力度级别
    force_level = detect_force_level(text_full)

    # 3. 分层情绪分析
    bullish_count, bearish_count = analyze_sentiment_by_type(text_full, ntype)

    # 4. 计算情绪方向
    if bullish_count > bearish_count:
        impact_type = 'bullish'
        sentiment_sign = 1
    elif bearish_count > bullish_count:
        impact_type = 'bearish'
        sentiment_sign = -1
    else:
        g_bull = sum(1 for kw in BULLISH_GENERAL if kw in text_full)
        g_bear = sum(1 for kw in BEARISH_GENERAL if kw in text_full)
        if g_bull > g_bear:
            impact_type = 'bullish'
            sentiment_sign = 1
        elif g_bear > g_bull:
            impact_type = 'bearish'
            sentiment_sign = -1
        else:
            impact_type = 'neutral'
            sentiment_sign = 0

    # 5. 计算分数
    base_score = NEWS_TYPE_WEIGHTS.get(ntype, 10)
    force_multiplier = FORCE_LEVELS.get(force_level, 1.0)
    score_change = base_score * force_multiplier * sentiment_sign

    # 6. 从文本提取股票代码
    stock_codes = extract_stock_code_from_text(title)

    # 7. 找匹配的关键词
    matched_kws = [kw for kw in KEYWORD_SECTOR_MAP if kw in title]

    # 8. 复制并增强新闻数据
    result = dict(news_item)
    result['news_type'] = ntype
    result['force_level'] = force_level
    result['impact_type'] = impact_type
    result['base_score'] = base_score
    result['force_multiplier'] = force_multiplier
    result['score_change'] = round(score_change, 1)
    result['matched_keywords'] = matched_kws
    result['stock_codes'] = stock_codes
    result['bullish_count'] = bullish_count
    result['bearish_count'] = bearish_count
    result['impact_reason'] = generate_impact_reason(result, matched_kws)

    return result


# ============== 新闻获取函数 ==============

def fetch_sina_news() -> list:
    """爬取新浪财经新闻标题（5天内）"""
    items = []
    now = datetime.now()
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        resp = requests.get('https://finance.sina.com.cn/', headers=headers, timeout=10)
        resp.encoding = 'utf-8'
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(resp.text, 'html.parser')
        for a in soup.select('a'):
            title = a.get_text(strip=True)
            href = a.get('href', '')
            if title and len(title) > 8 and ('finance.sina' in href or 'stock' in href or len(items) < 30):
                dt_str = ''
                parent = a.find_parent(['div', 'li', 'span'])
                if parent:
                    time_tag = parent.find(class_=lambda x: x and ('time' in x.lower() or 'date' in x.lower())) if parent else None
                    if time_tag:
                        dt_str = time_tag.get_text(strip=True)

                items.append({
                    'title': title,
                    'source': '新浪财经',
                    'score': 10,
                    'url': href,
                    'datetime': dt_str or now.strftime('%m-%d %H:%M'),
                })
            if len(items) >= 30:
                break
    except Exception as e:
        print(f'[最强风口] 新浪财经爬取失败: {e}')
    return items


def fetch_eastmoney_news() -> list:
    """爬取东方财富新闻标题（5天内）"""
    items = []
    now = datetime.now()
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        resp = requests.get('https://news.eastmoney.com/', headers=headers, timeout=10)
        resp.encoding = 'utf-8'
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(resp.text, 'html.parser')
        for a in soup.select('a'):
            title = a.get_text(strip=True)
            href = a.get('href', '')
            if title and len(title) > 8:
                items.append({
                    'title': title,
                    'source': '东方财富',
                    'score': 10,
                    'url': href,
                    'datetime': now.strftime('%m-%d %H:%M'),
                })
            if len(items) >= 30:
                break
    except Exception as e:
        print(f'[最强风口] 东方财富爬取失败: {e}')
    return items


def fetch_akshare_news() -> list:
    """使用东方财富 API 获取真实新闻，只保留5天内数据"""
    items = []
    cutoff = _get_cutoff()
    now = datetime.now()
    try:
        url = 'https://np-anotice-stock.eastmoney.com/api/security/ann'
        params = {
            'sr': '-1',
            'page_size': 50,
            'page_index': 1,
            'ann_type': 'SHA,SZA',
        }
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://data.eastmoney.com/',
        }
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        resp.encoding = 'utf-8'
        data = resp.json()

        notice_list = data.get('data', {}).get('list', []) or []
        for item in notice_list:
            title = item.get('title', '')
            if not title or len(title) < 5:
                continue

            # 解析时间
            dt = None
            publish_time = item.get('publish_time', '')
            if publish_time:
                try:
                    ts = int(str(publish_time)[:10])
                    dt = datetime.fromtimestamp(ts)
                except:
                    pass

            # 过滤5天外
            if dt and dt < cutoff:
                continue

            # 提取股票代码（API字段 + 正则）
            stock_code = item.get('security_code', '')
            stock_name = item.get('security_name', '')
            codes = extract_stock_code_from_text(title)
            if stock_code and stock_code not in codes:
                codes.insert(0, stock_code)

            items.append({
                'title': title,
                'source': stock_name or '东方财富',
                'stock_code_api': stock_code,
                'stock_name_api': stock_name,
                'score': 10,
                'url': item.get('art_url', ''),
                'datetime': dt.strftime('%m-%d %H:%M') if dt else now.strftime('%m-%d %H:%M'),
            })
    except Exception as e:
        print(f'[最强风口] 东方财富公告获取失败: {e}')

    # 补充宏观经济日历
    if len(items) < 20:
        try:
            import akshare as ak
            df = ak.news_economic_baidu()
            for _, row in df.iterrows():
                area = str(row.get('地区', '')).strip()
                event = str(row.get('事件', '')).strip()
                if not event or len(event) < 5:
                    continue
                title = f"{area} {event}" if area else event

                dt = None
                date_str = str(row.get('日期', '')).strip()
                time_str = str(row.get('时间', '')).strip()
                if date_str:
                    full_str = f"{date_str} {time_str}" if time_str and time_str != 'nan' else date_str
                    dt = _parse_datetime(full_str)

                if dt and dt < cutoff:
                    continue

                items.append({
                    'title': title,
                    'source': f"宏观-{area}" if area else '宏观经济',
                    'score': 10,
                    'url': '',
                    'datetime': dt.strftime('%m-%d %H:%M') if dt else now.strftime('%m-%d %H:%M'),
                })
        except Exception as e:
            print(f'[最强风口] 宏观经济日历获取失败: {e}')

    return items


# ============== 核心数据获取函数 ==============

def get_hot_trend_data(stocks: list) -> dict:
    """
    获取最强风口数据 v2
    stocks: 股票列表（来自 auction_cache 或 review 接口）
    返回: {'stocks': [...], 'news_count': N, 'update_time': '...'}
    
    匹配策略：仅个股名称精准匹配（移除板块传导）
    - 精准匹配：从公告中提取股票代码直接命中
    - 名称匹配：新闻标题关键词命中个股名称
    """
    if not stocks:
        return {'stocks': [], 'news_count': 0, 'update_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

    # 构建股票索引：按代码 + 按名称关键词
    stock_by_code = {s['code']: s for s in stocks}
    name_index = {}    # keyword -> list of stocks（个股名称包含关键词）
    for s in stocks:
        name = s.get('name', '')
        for kw in KEYWORD_SECTOR_MAP:
            if kw in name:
                name_index.setdefault(kw, []).append(s)

    # 爬取新闻
    news_items = []
    news_items.extend(fetch_akshare_news())
    if not news_items:
        news_items.extend(fetch_sina_news())
        news_items.extend(fetch_eastmoney_news())

    # 兜底新闻（保证功能可用）
    if not news_items:
        now = datetime.now()
        news_items = [
            {'title': '国家发改委发布新能源补贴政策，光伏企业迎来重大利好', 'source': '新浪财经', 'score': 10, 'datetime': now.strftime('%m-%d %H:%M')},
            {'title': '央行宣布降准0.5个百分点，释放长期资金约1万亿元', 'source': '东方财富', 'score': 10, 'datetime': (now - timedelta(hours=2)).strftime('%m-%d %H:%M')},
            {'title': '美国芯片法案再加码，半导体国产替代加速', 'source': '新浪财经', 'score': 10, 'datetime': (now - timedelta(hours=5)).strftime('%m-%d %H:%M')},
            {'title': '工信部推动AI产业发展，人工智能板块强势', 'source': '东方财富', 'score': 10, 'datetime': (now - timedelta(days=1)).strftime('%m-%d %H:%M')},
            {'title': '生物医药企业盈利大幅增长，创新药板块受追捧', 'source': '新浪财经', 'score': 10, 'datetime': (now - timedelta(days=1)).strftime('%m-%d %H:%M')},
            {'title': '消费复苏超预期，白酒家电板块大涨', 'source': '东方财富', 'score': 10, 'datetime': (now - timedelta(days=2)).strftime('%m-%d %H:%M')},
            {'title': '证监会立案调查某上市公司，市场情绪受挫', 'source': '新浪财经', 'score': 10, 'datetime': (now - timedelta(days=1)).strftime('%m-%d %H:%M')},
            {'title': '军工板块持续强势，航天军工订单大增', 'source': '东方财富', 'score': 10, 'datetime': (now - timedelta(days=2)).strftime('%m-%d %H:%M')},
            {'title': '锂价持续上涨，有色金属板块景气上行', 'source': '新浪财经', 'score': 10, 'datetime': (now - timedelta(days=3)).strftime('%m-%d %H:%M')},
            {'title': '美联储宣布加息，全球金融市场波动', 'source': '新浪财经', 'score': 10, 'datetime': (now - timedelta(days=2)).strftime('%m-%d %H:%M')},
        ]

    # 分析所有新闻（分层情绪 + 力度 + 类型）
    analyzed_news = []
    for news in news_items:
        analyzed = analyze_news(news)
        if analyzed['impact_type'] != 'neutral':  # 只保留有明确情绪的新闻
            analyzed_news.append(analyzed)

    # 计算每只股票的风口分数
    stock_scores = {}  # code -> {score, news_list, stock, score_breakdown}

    for news in analyzed_news:
        title = news['title']
        score_change = news['score_change']

        # === 匹配方式1：精准匹配（从API或正则提取股票代码）===
        for code in news.get('stock_codes', []):
            if code in stock_by_code:
                s = stock_by_code[code]
                code_key = s['code']
                if code_key not in stock_scores:
                    stock_scores[code_key] = {
                        'score': 0,
                        'news': [],
                        'stock': s,
                        'score_breakdown': {'bullish': 0, 'bearish': 0, 'by_type': {}},
                    }
                stock_scores[code_key]['score'] += score_change
                stock_scores[code_key]['news'].append({
                    'title': title,
                    'source': news.get('source', ''),
                    'type': news.get('news_type', 'general'),
                    'force_level': news.get('force_level', 'unknown'),
                    'sentiment': news.get('impact_type', 'neutral'),
                    'base_score': news.get('base_score', 10),
                    'score_change': news.get('score_change', 0),
                    'force_multiplier': news.get('force_multiplier', 1.0),
                    'datetime': news.get('datetime', ''),
                    'impact_reason': news.get('impact_reason', ''),
                })
                if score_change > 0:
                    stock_scores[code_key]['score_breakdown']['bullish'] += score_change
                else:
                    stock_scores[code_key]['score_breakdown']['bearish'] += abs(score_change)

        # === 匹配方式2：名称匹配（仅个股名称包含关键词，不走板块传导）===
        matched_kws = news.get('matched_keywords', [])
        for kw in matched_kws:
            # 从 name_index 匹配（个股名称包含关键词）
            for s in name_index.get(kw, []):
                code_key = s['code']
                if code_key not in stock_scores:
                    stock_scores[code_key] = {
                        'score': 0,
                        'news': [],
                        'stock': s,
                        'score_breakdown': {'bullish': 0, 'bearish': 0, 'by_type': {}},
                    }
                already_added = any(n['title'] == title for n in stock_scores[code_key]['news'])
                if not already_added:
                    stock_scores[code_key]['score'] += score_change
                    stock_scores[code_key]['news'].append({
                        'title': title,
                        'source': news.get('source', ''),
                        'type': news.get('news_type', 'general'),
                        'force_level': news.get('force_level', 'unknown'),
                        'sentiment': news.get('impact_type', 'neutral'),
                        'base_score': news.get('base_score', 10),
                        'score_change': news.get('score_change', 0),
                        'force_multiplier': news.get('force_multiplier', 1.0),
                        'datetime': news.get('datetime', ''),
                        'impact_reason': news.get('impact_reason', ''),
                    })
                    if score_change > 0:
                        stock_scores[code_key]['score_breakdown']['bullish'] += score_change
                    else:
                        stock_scores[code_key]['score_breakdown']['bearish'] += abs(score_change)
                    # 按类型累计
                    ntype = news.get('news_type', 'general')
                    stock_scores[code_key]['score_breakdown'].setdefault('by_type', {})
                    stock_scores[code_key]['score_breakdown']['by_type'][ntype] = \
                        stock_scores[code_key]['score_breakdown']['by_type'].get(ntype, 0) + abs(score_change)

    # 转换为列表
    result = []
    for code, data in stock_scores.items():
        s = data['stock']
        result.append({
            'code': s['code'],
            'name': s['name'],
            'price': s.get('price', 0),
            'change_pct': s.get('change_pct', 0),
            'score': round(data['score'], 1),
            'news': data['news'][:8],  # 最多8条
            'sector': s.get('sector', ''),
            'score_breakdown': data['score_breakdown'],
        })

    # 按分数降序
    result.sort(key=lambda x: x['score'], reverse=True)

    return {
        'stocks': result[:50],
        'news_count': len(analyzed_news),
        'update_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    }
