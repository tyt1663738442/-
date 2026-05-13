import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, RefreshCw, Activity, Flame, TrendingUp, TrendingDown, Target, Wifi, WifiOff, Clock, BarChart2, Zap } from 'lucide-react'
import { StockList } from './components/StockList'
import { BigOrderPanel } from './components/BigOrderPanel'
import { DaBanPanel } from './components/DaBanPanel'
import { StockDetail } from './components/StockDetail'
import { IndexBanner } from './components/IndexBanner'
import { AuctionPanel } from './components/AuctionPanel'
import { useWebSocket } from './hooks/useWebSocket'
import type { StockInfo, DaBanStock, MarketStatus } from './types'

type TabType = 'market' | 'daban' | 'bigorder' | 'auction'

const API_BASE = ''

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('market')
  const [searchCode, setSearchCode] = useState('')
  const [selectedStock, setSelectedStock] = useState<string | null>(null)
  const [stocks, setStocks] = useState<StockInfo[]>([])
  const [dabanCandidates, setDabanCandidates] = useState<DaBanStock[]>([])
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null)
  const [lastUpdate, setLastUpdate] = useState<string>('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [sortBy, setSortBy] = useState<string>('change_pct')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const refreshRef = useRef<ReturnType<typeof setInterval>()

  // 实时数据
  const fetchAll = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const [stocksRes, dabanRes, statusRes] = await Promise.all([
        fetch(`${API_BASE}/api/stocks?limit=200&sort_by=${sortBy}`),
        fetch(`${API_BASE}/api/daban`),
        fetch(`${API_BASE}/api/market/status`),
      ])
      const [stocksData, dabanData, statusData] = await Promise.all([
        stocksRes.json(),
        dabanRes.json(),
        statusRes.json(),
      ])
      if (stocksData.stocks) setStocks(stocksData.stocks)
      if (dabanData.candidates) setDabanCandidates(dabanData.candidates)
      if (statusData) setMarketStatus(statusData)
      setLastUpdate(new Date().toLocaleTimeString())
    } catch (err) {
      console.error('获取数据失败:', err)
    } finally {
      setIsRefreshing(false)
    }
  }, [sortBy])

  // 初始化
  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // 自动刷新（交易时段每5秒）
  useEffect(() => {
    if (autoRefresh && marketStatus?.is_trading) {
      refreshRef.current = setInterval(fetchAll, 5000)
    } else if (autoRefresh && marketStatus?.phase === '集合竞价') {
      // 竞价期间每10秒
      refreshRef.current = setInterval(fetchAll, 10000)
    } else {
      clearInterval(refreshRef.current)
    }
    return () => clearInterval(refreshRef.current)
  }, [autoRefresh, marketStatus, fetchAll])

  // 搜索
  const handleSearch = useCallback(async () => {
    if (!searchCode.trim()) return
    try {
      const res = await fetch(`${API_BASE}/api/stocks?search=${encodeURIComponent(searchCode)}&limit=1`)
      const data = await res.json()
      if (data.stocks?.length > 0) setSelectedStock(data.stocks[0].code)
    } catch {}
  }, [searchCode])

  // 排序切换
  const handleSortChange = (field: string) => {
    setSortBy(field)
  }

  if (selectedStock) {
    return <StockDetail code={selectedStock} onBack={() => setSelectedStock(null)} />
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white">
      {/* 顶部指数栏 */}
      <IndexBanner />

      {/* 工具栏 */}
      <div className="sticky top-0 z-40 bg-[#1a1a2e] border-b border-[#2d3748] px-4 py-2">
        <div className="flex items-center gap-3">
          {/* 搜索 */}
          <div className="flex-1 flex items-center bg-[#0f1d3a] rounded-lg px-3 py-1.5">
            <Search className="w-4 h-4 text-[#718096] mr-2" />
            <input
              value={searchCode}
              onChange={e => setSearchCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="输入代码/名称搜索"
              className="flex-1 bg-transparent text-sm outline-none text-white placeholder-[#718096]"
            />
          </div>

          {/* 排序快捷键 */}
          <button
            onClick={() => handleSortChange('change_pct')}
            className={`px-2 py-1 rounded text-xs font-medium ${sortBy === 'change_pct' ? 'bg-[#f23645] text-white' : 'bg-[#0f1d3a] text-[#718096]'}`}
          >
            涨幅
          </button>
          <button
            onClick={() => handleSortChange('seal_amount')}
            className={`px-2 py-1 rounded text-xs font-medium ${sortBy === 'seal_amount' ? 'bg-[#f23645] text-white' : 'bg-[#0f1d3a] text-[#718096]'}`}
          >
            封单
          </button>

          {/* 自动刷新 */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-1.5 rounded ${autoRefresh ? 'bg-green-500/20 text-green-400' : 'bg-[#0f1d3a] text-[#718096]'}`}
            title={autoRefresh ? '自动刷新中' : '已暂停'}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* 时间 */}
          <div className="flex items-center gap-1 text-xs text-[#718096]">
            <Clock className="w-3 h-3" />
            <span>{lastUpdate || '--'}</span>
          </div>
        </div>
      </div>

      {/* 标签栏 */}
      <div className="flex border-b border-[#2d3748] bg-[#1a1a2e] sticky top-[48px] z-30">
        {[
          { key: 'market', label: '市场', icon: BarChart2 },
          { key: 'daban', label: '打板精选', icon: Flame },
          { key: 'bigorder', label: '大单追踪', icon: Activity },
          { key: 'auction', label: '竞价', icon: Zap },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as TabType)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'text-white border-b-2 border-[#f23645] bg-[#0f1d3a]'
                : 'text-[#718096] hover:text-white hover:bg-[#0f1d3a]/50'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {key === 'daban' && dabanCandidates.length > 0 && (
              <span className="bg-[#f23645] text-white text-xs px-1.5 rounded-full">
                {dabanCandidates.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="p-4">
        {/* 市场页面 */}
        {activeTab === 'market' && (
          <div className="space-y-4">
            {/* 市场状态提示 */}
            {marketStatus && (
              <div className={`flex items-center justify-between px-4 py-2 rounded-lg text-sm ${
                marketStatus.is_trading
                  ? 'bg-[#15b755]/10 text-[#15b755] border border-[#15b755]/30'
                  : marketStatus.phase === '集合竞价'
                  ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
                  : 'bg-[#2d3748]/50 text-[#718096]'
              }`}>
                <div className="flex items-center gap-2">
                  {marketStatus.is_trading ? (
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  ) : (
                    <span className="w-2 h-2 bg-gray-500 rounded-full" />
                  )}
                  <span className="font-medium">{marketStatus.phase}</span>
                  {marketStatus.auction_status && (
                    <span className="text-xs opacity-75">({marketStatus.auction_status})</span>
                  )}
                </div>
                <span>{marketStatus.time}</span>
              </div>
            )}

            {/* 股票列表 */}
            <StockList stocks={stocks} onSelect={setSelectedStock} />
          </div>
        )}

        {/* 打板精选 */}
        {activeTab === 'daban' && (
          <DaBanPanel candidates={dabanCandidates} onSelect={setSelectedStock} />
        )}

        {/* 大单追踪 */}
        {activeTab === 'bigorder' && (
          <BigOrderPanel />
        )}

        {/* 竞价 */}
        {activeTab === 'auction' && (
          <AuctionPanel />
        )}
      </div>
    </div>
  )
}

export default App
