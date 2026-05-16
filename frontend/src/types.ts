/**
 * 同花顺风格 A股监控平台 - 类型定义
 */

// 五档盘口单档
export interface BidAskLevel {
  bid_price: number
  bid_vol: number    // 手
  ask_price: number
  ask_vol: number    // 手
}

// 股票基础信息
export interface StockInfo {
  code: string
  name: string
  price: number
  change: number
  change_pct: number
  volume: number      // 手
  amount: number      // 元
  turnover: number    // 换手率 %
  high: number
  low: number
  open: number
  pre_close: number
  volume_ratio: number
  pb: number
  pe: number
  mkt_cap: number    // 亿
  float_cap: number  // 亿
  limit_up: number
  limit_down: number
  seal_amount: number
  seal_ratio: number
  phase: string
  bid_ask: BidAskLevel[]   // 五档盘口
  wei_bi: number            // 委比%
  wei_cha: number          // 委差(手)
}

// 分时数据
export interface MinuteTick {
  time: string       // HH:MM
  price: number
  volume: number     // 手
  amount: number     // 元
  change_pct: number
  avg_price: number
}

// 指数数据
export interface IndexData {
  [key: string]: {
    name: string
    price: number
    change: number
    change_pct: number
    high?: number
    low?: number
  }
}

// 市场状态
export interface MarketStatus {
  phase: string
  time: string
  is_trading: boolean
  auction_status: string
  index_data: IndexData
}

// 打板候选
export interface DaBanStock {
  code: string
  name: string
  price: number
  change_pct: number
  distance_to_limit: number
  seal_amount: number
  seal_ratio: number
  volume_ratio: number
  turnover: number
  speed_score: number
  follow_score: number
  seal_score: number
  total_score: number
  reason: string
  phase: string
  time_to_seal: string
  board_count: number
  sector: string
  is_sealed: boolean
}

// 大单
export interface BigOrder {
  code: string
  name: string
  price: number
  volume: number
  amount: number
  change_pct: number
  is_up: boolean
  time: string
}

// 新闻/公告
export interface NewsItem {
  time: string
  title: string
  type: 'news' | 'announcement' | 'flash'
}
