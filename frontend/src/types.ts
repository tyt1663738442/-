export interface StockInfo {
  code: string
  name: string
  price: number
  change_percent: number
  volume: number
  amount: number
  high: number
  low: number
  open: number
  pre_close: number
  limit_up: number
  limit_down: number
}

export interface BigOrder {
  code: string
  name: string
  price: number
  volume: number
  amount: number
  type: 'buy' | 'sell'
  timestamp: string
  is_bullish: boolean
}

export interface DaBanStock {
  code: string
  name: string
  price: number
  change_percent: number
  volume_ratio: number
  limit_up_price: number
  distance_to_limit: number
  seal_amount: number
  seal_ratio: number
  score: number
}

export interface MarketUpdate {
  type: 'market_update'
  data: {
    timestamp: string
    stocks: StockInfo[]
    big_orders: BigOrder[]
    daban_candidates: DaBanStock[]
  }
}

export interface WebSocketMessage {
  type: string
  data?: any
  message?: string
}
