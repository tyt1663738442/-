// ============== 基础数据类型 ==============

export interface StockInfo {
  code: string
  name: string
  price: number
  change: number         // 涨跌额
  change_pct: number     // 涨跌幅 %
  volume: int            // 成交量 手
  amount: float          // 成交额 元
  turnover: float        // 换手率 %
  high: float
  low: float
  open: float
  pre_close: float
  bid1: float           // 买一价
  ask1: float           // 卖一价
  bid_vol1: int         // 买一量
  ask_vol1: int         // 卖一量
  volume_ratio: float   // 量比
  pb: float             // 市净率
  pe: float             // 市盈率
  mkt_cap: float        // 总市值 亿
  float_cap: float      // 流通市值 亿
  limit_up: float       // 涨停价
  limit_down: float     // 跌停价
  seal_amount: float    // 涨停封单金额 万
  seal_ratio: float     // 封单占比 %
  phase: string         // 交易阶段
}

export interface MinuteTick {
  time: string          // HH:MM:SS
  price: number
  volume: number
  amount: number
  change_pct: number
  avg_price: number
}

export interface DaBanStock {
  code: string
  name: string
  price: number
  change_pct: number
  distance_to_limit: number  // 距涨停 %
  seal_amount: number         // 封单金额 万
  seal_ratio: number          // 封单/成交比
  volume_ratio: number        // 量比
  turnover: number            // 换手率
  speed_score: number         // 涨停速度评分
  follow_score: number        // 跟风强度评分
  seal_score: number          // 封单质量评分
  total_score: number         // 综合评分
  reason: string              // 打板理由
  phase: string               // 所处阶段: 竞价/一板/二板/妖股
  time_to_seal: string        // 封板时间
  board_count: number         // 连板数
  sector: string              // 所属板块
  is_sealed: boolean          // 是否封板
}

export interface BigOrder {
  code: string
  name: string
  price: number
  volume: int
  amount: float
  change_pct: number
  is_up: boolean
  time: string
}

export interface MarketStatus {
  phase: string            // 市场阶段
  time: string             // 当前时间
  is_trading: boolean      // 是否交易中
  auction_status: string   // 竞价状态
  index_data: IndexData    // 主要指数
}

export interface IndexData {
  [key: string]: {
    name: string
    price: number
    change: number
    change_pct: number
    high: number
    low: number
  }
}

export interface KLineData {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  amount?: number
  turnover?: number
  change_pct?: number
}

export interface StockDetail {
  code: string
  name: string
  price: number
  change: number
  change_pct: number
  volume: number
  amount: number
  turnover: number
  high: number
  low: number
  open: number
  pre_close: number
  limit_up: number
  limit_down: number
  pe: number
  pb: number
  mkt_cap: number
  float_cap: number
  minute_data: MinuteTick[]
  daily_data: KLineData[]
  weekly_data: KLineData[]
}

// ============== WebSocket 消息 ==============

export interface MarketUpdate {
  type: 'market_update'
  data: {
    timestamp: string
    phase: string
    stocks: StockInfo[]
    daban_candidates: DaBanStock[]
    big_orders: BigOrder[]
    index_data: IndexData
  }
}

export interface WebSocketMessage {
  type: string
  data?: any
  message?: string
}
