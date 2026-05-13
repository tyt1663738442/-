import { useEffect, useState, useCallback } from 'react'
import { Zap, Clock, ArrowUp, ArrowDown, RefreshCw, AlertTriangle } from 'lucide-react'

interface AuctionData {
  [code: string]: {
    auction_open: number
    auction_vol: number
    pre_close: number
    current_price: number
  }
}

interface AuctionStock {
  code: string
  name: string
  auction_open: number
  current_price: number
  pre_close: number
  change_pct: number
  auction_vol: number
  status: 'up' | 'down' | 'flat'
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell'
}

const SIGNAL_CONFIG = {
  strong_buy: { label: '强势买入', color: '#f23645', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  buy: { label: '买入', color: '#f59e0b', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  neutral: { label: '观望', color: '#8a8d93', bg: 'bg-gray-500/10', border: 'border-gray-500/30' },
  sell: { label: '卖出', color: '#15b755', bg: 'bg-green-500/10', border: 'border-green-500/30' },
  strong_sell: { label: '强势卖出', color: '#dc2626', bg: 'bg-red-600/10', border: 'border-red-600/30' },
}

export function AuctionPanel() {
  const [data, setData] = useState<AuctionStock[]>([])
  const [phase, setPhase] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')

  const fetchAuction = useCallback(async () => {
    try {
      const [auctionRes, stocksRes] = await Promise.all([
        fetch('/api/auction'),
        fetch('/api/stocks?limit=200'),
      ])
      const [auctionResult, stocksResult] = await Promise.all([
        auctionRes.json(),
        stocksRes.json(),
      ])

      setPhase(auctionResult.phase || '')

      const stocks: { [code: string]: any } = {}
      if (stocksResult.stocks) {
        for (const s of stocksResult.stocks) {
          stocks[s.code] = s
        }
      }

      const auction: AuctionData = auctionResult.data || {}
      const auctionStocks: AuctionStock[] = Object.entries(auction)
        .filter(([code]) => stocks[code])
        .map(([code, ad]) => {
          const stock = stocks[code]
          const auctionChange = ad.current_price && ad.pre_close
            ? ((ad.current_price - ad.pre_close) / ad.pre_close * 100)
            : 0

          const signal = calcSignal(ad.auction_open, ad.pre_close, ad.auction_vol, auctionChange)

          return {
            code,
            name: stock.name,
            auction_open: ad.auction_open,
            current_price: ad.current_price || stock.price,
            pre_close: ad.pre_close || stock.pre_close,
            change_pct: stock.change_pct || auctionChange,
            auction_vol: ad.auction_vol,
            status: stock.change_pct > 0 ? 'up' : stock.change_pct < 0 ? 'down' : 'flat',
            signal,
          }
        })

      // 按竞价涨幅排序
      auctionStocks.sort((a, b) => b.change_pct - a.change_pct)
      setData(auctionStocks.slice(0, 30))
      setLastUpdate(new Date().toLocaleTimeString())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAuction()
    const interval = setInterval(fetchAuction, 10000)  // 竞价期间10秒刷新
    return () => clearInterval(interval)
  }, [fetchAuction])

  const strongBuys = data.filter(s => s.signal === 'strong_buy')
  const buys = data.filter(s => s.signal === 'buy')

  return (
    <div className="space-y-4">
      {/* 竞价状态栏 */}
      <div className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
        phase === '集合竞价'
          ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
          : phase === '连续竞价'
          ? 'bg-[#15b755]/10 border-[#15b755]/30 text-[#15b755]'
          : 'bg-[#2d3748]/50 border-[#2d3748] text-[#8a8d93]'
      }`}>
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5" />
          <span className="font-bold">{phase || '数据加载中'}</span>
          {phase === '集合竞价' && (
            <span className="text-xs opacity-70 ml-2">竞价时间 9:15-9:25 | 9:25产生开盘价</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <RefreshCw className="w-3 h-3" />
          <span>{lastUpdate}</span>
        </div>
      </div>

      {/* 竞价摘要 */}
      {phase === '集合竞价' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#f23645]/10 border border-[#f23645]/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUp className="w-4 h-4 text-[#f23645]" />
              <span className="text-xs text-[#f23645] font-medium">竞价抢筹</span>
            </div>
            <p className="text-2xl font-bold text-[#f23645]">{strongBuys.length + buys.length}</p>
            <p className="text-xs text-[#8a8d93] mt-1">强势竞价股</p>
          </div>
          <div className="bg-[#16213e] border border-[#2d3748] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-[#f59e0b]" />
              <span className="text-xs text-[#f59e0b] font-medium">竞价总量</span>
            </div>
            <p className="text-2xl font-bold text-white">{data.length}</p>
            <p className="text-xs text-[#8a8d93] mt-1">监测股票数</p>
          </div>
        </div>
      )}

      {/* 说明 */}
      <div className="bg-[#0d1b3e] rounded-lg p-4 border border-[#2d3748]">
        <h4 className="text-sm font-medium text-white mb-2">📌 竞价阶段说明</h4>
        <div className="grid grid-cols-2 gap-2 text-xs text-[#8a8d93]">
          <div>• <span className="text-[#f23645]">强势买入</span>：竞价涨幅{'>'}7%且量比高</div>
          <div>• <span className="text-[#f59e0b]">买入</span>：竞价涨幅3-7%</div>
          <div>• <span className="text-[#8a8d93]">观望</span>：竞价涨幅0-3%</div>
          <div>• <span className="text-[#15b755]">卖出</span>：竞价涨幅{'<'}0</div>
        </div>
        <p className="text-xs text-[#f59e0b] mt-2">⚠️ 竞价数据仅供参考，开盘价以9:25分最终成交价为准</p>
      </div>

      {/* 竞价列表 */}
      {loading ? (
        <div className="bg-[#16213e] rounded-lg p-8 text-center">
          <div className="animate-pulse space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-10 bg-[#2d3748] rounded" />)}
          </div>
        </div>
      ) : data.length === 0 ? (
        <div className="bg-[#16213e] rounded-lg p-8 text-center border border-[#2d3748]">
          <Zap className="w-12 h-12 mx-auto mb-3 text-[#8a8d93] opacity-50" />
          <p className="text-[#8a8d93]">
            {phase === '集合竞价' ? '竞价数据采集中...' : '非竞价时间段，无数据'}
          </p>
          <p className="text-xs text-[#718096] mt-1">竞价时间：9:15-9:25</p>
        </div>
      ) : (
        <div className="bg-[#16213e] rounded-lg overflow-hidden border border-[#2d3748]">
          <div className="bg-[#0d1b3e] px-4 py-2.5">
            <div className="grid grid-cols-12 gap-2 text-xs text-[#8a8d93] font-medium">
              <div className="col-span-1">#</div>
              <div className="col-span-2">名称</div>
              <div className="col-span-2 text-right">竞价价</div>
              <div className="col-span-2 text-right">涨幅</div>
              <div className="col-span-3 text-right">信号</div>
              <div className="col-span-2 text-right">竞价量</div>
            </div>
          </div>
          <div className="divide-y divide-[#1e2d4a]">
            {data.map((stock, i) => {
              const cfg = SIGNAL_CONFIG[stock.signal]
              const isUp = stock.change_pct > 0
              return (
                <div
                  key={stock.code}
                  className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm hover:bg-[#1e2d4a]/50 cursor-pointer transition-colors"
                >
                  <div className="col-span-1 text-[#8a8d93] text-xs">{i + 1}</div>
                  <div className="col-span-2 flex flex-col">
                    <span className="font-medium text-white">{stock.name}</span>
                    <span className="text-[10px] text-[#8a8d93]">{stock.code}</span>
                  </div>
                  <div className={`col-span-2 text-right font-mono font-bold ${
                    isUp ? 'text-[#f23645]' : 'text-[#15b755]'
                  }`}>
                    {stock.auction_open > 0 ? stock.auction_open.toFixed(2) : '--'}
                  </div>
                  <div className={`col-span-2 text-right font-mono font-bold ${
                    isUp ? 'text-[#f23645]' : 'text-[#15b755]'
                  }`}>
                    {isUp ? '+' : ''}{stock.change_pct.toFixed(2)}%
                  </div>
                  <div className="col-span-3 flex justify-end">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold border ${cfg.bg} ${cfg.border}`}
                      style={{ color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="col-span-2 text-right text-[#8a8d93] text-xs font-mono">
                    {stock.auction_vol > 0 ? fmtVol(stock.auction_vol) : '--'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function calcSignal(open: number, pre_close: number, vol: number, change_pct: number): AuctionStock['signal'] {
  if (!open || !pre_close) return 'neutral'
  if (change_pct >= 7 && vol > 10000) return 'strong_buy'
  if (change_pct >= 3) return 'buy'
  if (change_pct >= 0) return 'neutral'
  if (change_pct >= -3) return 'sell'
  return 'strong_sell'
}

function fmtVol(v: number): string {
  if (v >= 100000000) return (v / 100000000).toFixed(1) + '亿'
  if (v >= 10000) return (v / 10000).toFixed(0) + '万'
  return v.toString()
}
