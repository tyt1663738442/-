import { useEffect, useState, useCallback, useRef } from 'react'
import { Activity, ArrowUp, ArrowDown, RefreshCw, TrendingUp, TrendingDown, Filter, Settings, Plus, X, Star, ChevronUp, ChevronDown } from 'lucide-react'

const API_BASE = 'http://localhost:8000'

interface BigOrder {
  code: string
  name: string
  price: number
  volume: number
  amount: number
  change_pct: number
  is_up: boolean
  time: string
  buy_vol: number
  sell_vol: number
  buy_amount: number
  sell_amount: number
  net_vol: number
  net_amount: number
}

interface WatchlistStock {
  code: string
  name: string
  price: number
  change_pct: number
  amount: number
}

interface Props {
  onSelectStock?: (code: string) => void
}

type OrderFilter = 'all' | 'buy' | 'sell'
type SortField = 'amount' | 'buy_vol' | 'sell_vol' | 'buy_amount' | 'sell_amount' | 'net_vol' | 'net_amount' | 'change_pct'
type SortDir = 'asc' | 'desc'

const SORT_LABELS: Record<SortField, string> = {
  amount: '成交额',
  buy_vol: '买入量',
  sell_vol: '卖出量',
  buy_amount: '买入额',
  sell_amount: '卖出额',
  net_vol: '净买入量',
  net_amount: '净买入额',
  change_pct: '涨跌幅',
}

export function BigOrderPanel({ onSelectStock }: Props) {
  const [orders, setOrders] = useState<BigOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')
  const [activeFilter, setActiveFilter] = useState<OrderFilter>('all')
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>([])
  const [watchlistMode, setWatchlistMode] = useState(true)  // 默认自选股模式
  const [showSettings, setShowSettings] = useState(false)
  const [addInput, setAddInput] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  const [sortField, setSortField] = useState<SortField>('net_vol')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const fetchOrders = useCallback(async () => {
    try {
      const mode = watchlistMode ? 'watchlist' : 'all'
      const res = await fetch(`${API_BASE}/api/big-orders?mode=${mode}&sort=net_vol&dir=desc`)
      const data = await res.json()
      if (data.orders) {
        setOrders(data.orders)
        if (data.time) setLastUpdate(data.time)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [watchlistMode])

  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/big-orders/watchlist`)
      const data = await res.json()
      if (data.stocks) setWatchlist(data.stocks)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
    fetchWatchlist()
    const interval = setInterval(fetchOrders, 1000)
    return () => clearInterval(interval)
  }, [fetchOrders, fetchWatchlist])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  // 大单买入 = 净买入额>0（真正的主力净买入）
  const buyOrders = orders.filter(o => o.net_amount > 0)
  // 大单卖出 = 净买入额<0（真正的主力净卖出）
  const sellOrders = orders.filter(o => o.net_amount < 0)

  let displayList: BigOrder[]
  switch (activeFilter) {
    case 'buy': displayList = buyOrders; break
    case 'sell': displayList = sellOrders; break
    default: displayList = orders
  }

  // 排序
  displayList = [...displayList].sort((a, b) => {
    const av = a[sortField] ?? 0
    const bv = b[sortField] ?? 0
    if (typeof av === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av
    }
    return 0
  })

  const totalBuyAmt = displayList.reduce((s, o) => s + o.buy_amount, 0)
  const totalSellAmt = displayList.reduce((s, o) => s + o.sell_amount, 0)

  const handleRowClick = (order: BigOrder) => {
    if (onSelectStock) {
      onSelectStock(order.code)
    } else {
      window.dispatchEvent(new CustomEvent('qclaw-select-stock', { detail: order.code }))
    }
  }

  const handleAddStock = async () => {
    const code = addInput.trim().replace(/[^\d]/g, '').slice(0, 6)
    if (!code) return
    setAddLoading(true)
    try {
      await fetch(`${API_BASE}/api/big-orders/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: [code] }),
      })
      setAddInput('')
      await fetchWatchlist()
    } finally {
      setAddLoading(false)
    }
  }

  const handleRemoveStock = async (code: string) => {
    await fetch(`${API_BASE}/api/big-orders/watchlist/${code}`, { method: 'DELETE' })
    await fetchWatchlist()
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-[#3a3a4a] ml-1">⇅</span>
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 ml-1 inline" />
      : <ChevronDown className="w-3 h-3 ml-1 inline" />
  }

  return (
    <div className="h-full flex flex-col p-4 space-y-4 overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a0f1a 0%, #0d1525 100%)' }}>
      {/* 说明 - 科技风 */}
      <div className="rounded-xl p-4 border" style={{
        background: 'linear-gradient(90deg, rgba(255,140,66,0.08) 0%, rgba(255,140,66,0.03) 100%)',
        borderColor: 'rgba(255,140,66,0.2)'
      }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg shrink-0" style={{ background: 'rgba(255,140,66,0.15)' }}>
              <Activity className="w-5 h-5" style={{ color: '#ff8c42' }} />
            </div>
            <div>
              <h4 className="font-semibold" style={{ color: '#e0e6f0' }}>大单追踪</h4>
              <p className="text-sm mt-1" style={{ color: '#7a8aa0' }}>
                {watchlistMode
                  ? `自选股模式 · ${watchlist.length} 只（无金额门槛）`
                  : `实时监测成交额 ≥ 500万的个股大单，全市场扫描`}
              </p>
            </div>
          </div>
          {/* 模式切换 + 设置 */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setWatchlistMode(m => !m)}
              className="text-xs px-3 py-1.5 rounded-full border transition-all"
              style={{
                background: watchlistMode ? 'rgba(255,140,66,0.15)' : 'rgba(13, 21, 37, 0.6)',
                borderColor: watchlistMode ? '#ff8c4260' : '#1a2a44',
                color: watchlistMode ? '#ff8c42' : '#7a8aa0'
              }}
            >
              <Star className="w-3 h-3 inline mr-1" />
              {watchlistMode ? '自选股' : '全市场'}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-1.5 rounded-lg border transition-all"
              style={{
                background: 'rgba(13, 21, 37, 0.6)',
                borderColor: '#1a2a44',
                color: '#7a8aa0'
              }}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 统计卡片 - 科技风 */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => setActiveFilter('buy')}
          className="rounded-xl p-3 text-left transition-all cursor-pointer border"
          style={{
            background: activeFilter === 'buy'
              ? 'linear-gradient(135deg, rgba(255,77,109,0.2) 0%, rgba(255,77,109,0.05) 100%)'
              : 'rgba(13, 21, 37, 0.6)',
            borderColor: activeFilter === 'buy' ? '#ff4d6d60' : '#1a2a44',
            boxShadow: activeFilter === 'buy' ? '0 0 20px rgba(255,77,109,0.2)' : 'none'
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px]" style={{ color: '#7a8aa0' }}>大单买入</p>
              <p className="text-2xl font-bold mt-1" style={{
                color: '#ff4d6d',
                textShadow: '0 0 10px rgba(255,77,109,0.3)'
              }}>{buyOrders.length}</p>
            </div>
            <TrendingUp className="w-5 h-5 opacity-50" style={{ color: '#ff4d6d' }} />
          </div>
          <p className="text-[10px] mt-1" style={{ color: '#5a6a7a' }}>主力净买入</p>
        </button>

        <button
          onClick={() => setActiveFilter('sell')}
          className="rounded-xl p-3 text-left transition-all cursor-pointer border"
          style={{
            background: activeFilter === 'sell'
              ? 'linear-gradient(135deg, rgba(0,255,136,0.15) 0%, rgba(0,255,136,0.03) 100%)'
              : 'rgba(13, 21, 37, 0.6)',
            borderColor: activeFilter === 'sell' ? '#00ff8860' : '#1a2a44',
            boxShadow: activeFilter === 'sell' ? '0 0 20px rgba(0,255,136,0.15)' : 'none'
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px]" style={{ color: '#7a8aa0' }}>大单卖出</p>
              <p className="text-2xl font-bold mt-1" style={{
                color: '#00ff88',
                textShadow: '0 0 10px rgba(0,255,136,0.3)'
              }}>{sellOrders.length}</p>
            </div>
            <TrendingDown className="w-5 h-5 opacity-50" style={{ color: '#00ff88' }} />
          </div>
          <p className="text-[10px] mt-1" style={{ color: '#5a6a7a' }}>主力净卖出</p>
        </button>

        <button
          onClick={() => setActiveFilter('all')}
          className="rounded-xl p-3 text-left transition-all cursor-pointer border"
          style={{
            background: activeFilter === 'all'
              ? 'linear-gradient(135deg, rgba(0,212,255,0.12) 0%, rgba(0,212,255,0.03) 100%)'
              : 'rgba(13, 21, 37, 0.6)',
            borderColor: activeFilter === 'all' ? '#00d4ff40' : '#1a2a44',
            boxShadow: activeFilter === 'all' ? '0 0 20px rgba(0,212,255,0.15)' : 'none'
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px]" style={{ color: '#7a8aa0' }}>大单总数</p>
              <p className="text-2xl font-bold mt-1" style={{ color: '#e0e6f0' }}>{orders.length}</p>
            </div>
            <Activity className="w-5 h-5" style={{ color: '#7a8aa0' }} />
          </div>
          <p className="text-[10px] mt-1" style={{ color: '#5a6a7a' }}>
            {activeFilter === 'all' ? '全市场' : '点击查看全部'}
          </p>
        </button>
      </div>

      {/* 合计对比 */}
      {displayList.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-3 border" style={{
            background: 'rgba(13, 21, 37, 0.6)',
            borderColor: 'rgba(255,77,109,0.2)'
          }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px]" style={{ color: '#7a8aa0' }}>合计买入</p>
                <p className="text-lg font-bold mt-0.5" style={{ color: '#ff4d6d' }}>{fmtAmount(totalBuyAmt)}</p>
              </div>
              <ArrowUp className="w-5 h-5" style={{ color: '#ff4d6d' }} />
            </div>
          </div>
          <div className="rounded-xl p-3 border" style={{
            background: 'rgba(13, 21, 37, 0.6)',
            borderColor: 'rgba(0,255,136,0.2)'
          }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px]" style={{ color: '#7a8aa0' }}>合计卖出</p>
                <p className="text-lg font-bold mt-0.5" style={{ color: '#00ff88' }}>{fmtAmount(totalSellAmt)}</p>
              </div>
              <ArrowDown className="w-5 h-5" style={{ color: '#00ff88' }} />
            </div>
          </div>
        </div>
      )}

      {/* 列表 - 科技风 */}
      <div className="flex-1 min-h-0 overflow-hidden rounded-xl border" style={{
        background: 'rgba(13, 21, 37, 0.6)',
        borderColor: '#1a2a44'
      }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto" style={{ borderColor: '#00d4ff' }}></div>
          </div>
        ) : displayList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <Activity className="w-16 h-16 mb-4" style={{ color: '#2a3a55' }} />
            <p style={{ color: '#7a8aa0' }}>
              {watchlistMode && watchlist.length === 0 ? '自选股列表为空，请点击设置添加' : '暂无大单数据'}
            </p>
            <p className="text-xs mt-2" style={{ color: '#5a6a7a' }}>交易时段自动刷新</p>
          </div>
        ) : (
          <div className="h-full flex flex-col overflow-hidden">
            {/* 筛选 + 排序状态 */}
            <div className="flex items-center justify-between px-4 py-2 border-b shrink-0" style={{ borderColor: '#1a2a44', background: 'rgba(10, 15, 26, 0.5)' }}>
              <div className="flex items-center gap-2 text-sm font-semibold"
                   style={{ color: activeFilter === 'buy' ? '#ff4d6d' : activeFilter === 'sell' ? '#00ff88' : '#00d4ff' }}>
                <Filter className="w-4 h-4" />
                <span>{activeFilter === 'buy' ? '大单买入' : activeFilter === 'sell' ? '大单卖出' : '全部大单'}</span>
                <span className="text-xs opacity-60">({displayList.length}条)</span>
              </div>
              <div className="flex items-center gap-3 text-xs" style={{ color: '#7a8aa0' }}>
                <span>排序：<span style={{ color: '#ff8c42' }}>{SORT_LABELS[sortField]}</span></span>
                {activeFilter !== 'all' && (
                  <button onClick={() => setActiveFilter('all')} className="transition-colors" style={{ color: '#00d4ff' }}>
                    返回全部
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* 表头 */}
              <div className="sticky top-0 z-10 grid grid-cols-11 gap-1 px-3 py-2.5 text-[11px] font-bold border-b shrink-0"
                   style={{
                     background: 'rgba(13, 21, 37, 0.95)',
                     borderColor: '#1a2a44',
                     color: '#7a8aa0'
                   }}>
                <div className="col-span-1">方向</div>
                <div className="col-span-2">名称</div>
                <div className="col-span-1 text-right">现价</div>
                <button className="col-span-1 text-right hover:text-white transition-colors" onClick={() => handleSort('change_pct')}>
                  涨幅<SortIcon field="change_pct" />
                </button>
                <button className="col-span-1 text-right transition-colors" style={{ color: '#ff4d6d80' }} onClick={() => handleSort('buy_vol')}>
                  买入<SortIcon field="buy_vol" />
                </button>
                <button className="col-span-1 text-right transition-colors" style={{ color: '#00ff8880' }} onClick={() => handleSort('sell_vol')}>
                  卖出<SortIcon field="sell_vol" />
                </button>
                <button className="col-span-2 text-right transition-colors" style={{ color: '#ff8c4280' }} onClick={() => handleSort('net_vol')}>
                  净买入量<SortIcon field="net_vol" />
                </button>
                <button className="col-span-2 text-right transition-colors" style={{ color: '#ff8c4280' }} onClick={() => handleSort('net_amount')}>
                  净买入额<SortIcon field="net_amount" />
                </button>
              </div>

              {/* 数据行 */}
              {displayList.map((order, i) => (
                <div
                  key={`${order.code}-${i}`}
                  className="grid grid-cols-11 gap-1 px-3 py-2.5 text-sm cursor-pointer transition-all border-t"
                  style={{
                    background: i % 2 === 0 ? 'rgba(13, 21, 37, 0.3)' : 'transparent',
                    borderColor: '#1a2a44'
                  }}
                  onClick={() => handleRowClick(order)}
                >
                  <div className="col-span-1 flex items-center">
                    {order.is_up
                      ? <ArrowUp className="w-4 h-4" style={{ color: '#ff4d6d' }} />
                      : <ArrowDown className="w-4 h-4" style={{ color: '#00ff88' }} />
                    }
                  </div>
                  <div className="col-span-2 flex flex-col">
                    <span className="font-medium" style={{ color: '#e0e6f0' }}>{order.name}</span>
                    <span className="text-[10px]" style={{ color: '#5a6a7a' }}>{order.code}</span>
                  </div>
                  <div className={`col-span-1 text-right font-mono font-bold ${
                    order.change_pct >= 0 ? '' : ''
                  }`} style={{ color: order.change_pct >= 0 ? '#ff4d6d' : '#00ff88' }}>
                    {order.price.toFixed(2)}
                  </div>
                  <div className="col-span-1 text-right font-mono" style={{ color: order.change_pct >= 0 ? '#ff4d6d' : '#00ff88' }}>
                    {order.change_pct >= 0 ? '+' : ''}{order.change_pct.toFixed(2)}%
                  </div>
                  <div className="col-span-1 text-right">
                    <div className="font-mono text-xs" style={{ color: '#ff4d6d' }}>{fmtVol(order.buy_vol)}</div>
                  </div>
                  <div className="col-span-1 text-right">
                    <div className="font-mono text-xs" style={{ color: '#00ff88' }}>{fmtVol(order.sell_vol)}</div>
                  </div>
                  <div className={`col-span-2 text-right font-mono text-xs`} style={{ color: order.net_vol >= 0 ? '#ff4d6d' : '#00ff88' }}>
                    {order.net_vol >= 0 ? '+' : ''}{fmtVol(Math.abs(order.net_vol))}
                  </div>
                  <div className={`col-span-2 text-right font-mono text-xs`} style={{ color: order.net_amount >= 0 ? '#ff4d6d' : '#00ff88' }}>
                    {order.net_amount >= 0 ? '+' : ''}{fmtAmount(Math.abs(order.net_amount))}
                  </div>
                </div>
              ))}

              {displayList.length === 0 && (
                <div className="py-16 text-center text-sm" style={{ color: '#5a6a7a' }}>
                  该筛选条件下暂无数据
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 更新时间 */}
      <div className="flex items-center justify-center gap-2 text-xs shrink-0" style={{ color: '#7a8aa0' }}>
        <RefreshCw className="w-3 h-3" />
        <span>最后更新: {lastUpdate}</span>
      </div>

      {/* 自选股设置弹窗 - 科技风 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
             style={{ background: 'rgba(0, 0, 0, 0.7)' }}
             onClick={() => setShowSettings(false)}>
          <div className="rounded-xl w-[500px] max-h-[70vh] flex flex-col shadow-2xl border"
               style={{
                 background: 'linear-gradient(135deg, #0d1525 0%, #0a0f1a 100%)',
                 borderColor: '#1a2a44'
               }}
               onClick={e => e.stopPropagation()}>
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#1a2a44' }}>
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4" style={{ color: '#ff8c42' }} />
                <h3 className="font-bold" style={{ color: '#e0e6f0' }}>大单自选股设置</h3>
              </div>
              <button onClick={() => setShowSettings(false)} className="transition-colors" style={{ color: '#7a8aa0' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* 添加股票 */}
              <div>
                <p className="text-xs mb-2" style={{ color: '#7a8aa0' }}>添加股票代码</p>
                <div className="flex gap-2">
                  <input
                    value={addInput}
                    onChange={e => setAddInput(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                    onKeyDown={e => e.key === 'Enter' && handleAddStock()}
                    placeholder="例如：600519"
                    className="flex-1 rounded-lg px-3 py-2 text-sm placeholder-[#3a4a5a] focus:outline-none transition-all"
                    style={{
                      background: 'rgba(13, 21, 37, 0.8)',
                      border: '1px solid #1a2a44',
                      color: '#e0e6f0'
                    }}
                  />
                  <button
                    onClick={handleAddStock}
                    disabled={addLoading || addInput.length < 6}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1"
                    style={{
                      background: '#ff8c42',
                      opacity: (addLoading || addInput.length < 6) ? 0.4 : 1
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    {addLoading ? '添加中' : '添加'}
                  </button>
                </div>
              </div>

              {/* 分割线 */}
              <div className="border-t" style={{ borderColor: '#1a2a44' }} />

              {/* 当前自选股列表 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs" style={{ color: '#7a8aa0' }}>我的自选股 ({watchlist.length}只)</p>
                  {watchlist.length === 0 && (
                    <p className="text-xs" style={{ color: '#ff8c42' }}>点击上方添加股票</p>
                  )}
                </div>
                {watchlist.length === 0 ? (
                  <div className="text-center py-8 text-sm" style={{ color: '#3a4a5a' }}>
                    <Star className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>暂未添加任何股票</p>
                    <p className="text-xs mt-1">输入股票代码即可添加，支持6位数代码</p>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[250px] overflow-y-auto">
                    {watchlist.map(s => (
                      <div key={s.code} className="flex items-center justify-between px-3 py-2 rounded-lg border"
                           style={{ background: 'rgba(13, 21, 37, 0.5)', borderColor: '#1a2a44' }}>
                        <div className="flex items-center gap-3">
                          <Star className="w-3 h-3 shrink-0" style={{ color: '#ff8c42' }} />
                          <span className="font-mono text-sm" style={{ color: '#e0e6f0' }}>{s.code}</span>
                          <span className="text-sm" style={{ color: '#e0e6f0' }}>{s.name}</span>
                          <span className="text-xs font-mono" style={{ color: s.change_pct >= 0 ? '#ff4d6d' : '#00ff88' }}>
                            {s.change_pct >= 0 ? '+' : ''}{s.change_pct.toFixed(2)}%
                          </span>
                          <span className="font-mono text-xs" style={{ color: '#ff8c42' }}>{fmtAmount(s.amount)}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveStock(s.code)}
                          className="p-1 transition-colors"
                          style={{ color: '#7a8aa0' }}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 说明 */}
              <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(13, 21, 37, 0.5)', color: '#5a6a7a' }}>
                <p><span style={{ color: '#ff8c42' }}>全市场模式</span>：自动扫描所有股票，筛选成交额 ≥ 500万的个股</p>
                <p className="mt-1"><span style={{ color: '#ff8c42' }}>自选股模式</span>：仅监控您添加的股票，无金额门槛</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function fmtAmount(a: number): string {
  if (a >= 100000000) return (a / 100000000).toFixed(1) + '亿'
  if (a >= 10000) return (a / 10000).toFixed(0) + '万'
  return a.toFixed(0) + '元'
}

function fmtVol(v: number): string {
  if (v >= 10000) return (v / 10000).toFixed(1) + '万手'
  return v.toFixed(0) + '手'
}
