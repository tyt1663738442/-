import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, TrendingDown, Search, RefreshCw, AlertTriangle } from 'lucide-react'
import { StockList } from './components/StockList'
import { BigOrderPanel } from './components/BigOrderPanel'
import { DaBanPanel } from './components/DaBanPanel'
import { StockDetail } from './components/StockDetail'
import { useWebSocket } from './hooks/useWebSocket'
import type { StockInfo, BigOrder, DaBanStock } from './types'

type TabType = 'market' | 'bigorder' | 'daban'

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('market')
  const [searchCode, setSearchCode] = useState('')
  const [selectedStock, setSelectedStock] = useState<string | null>(null)
  const [stocks, setStocks] = useState<StockInfo[]>([])
  const [bigOrders, setBigOrders] = useState<BigOrder[]>([])
  const [dabanCandidates, setDabanCandidates] = useState<DaBanStock[]>([])
  const [lastUpdate, setLastUpdate] = useState<string>('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isTrading, setIsTrading] = useState(false)

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProtocol}//${window.location.host}/ws/market`
  const { isConnected, marketData } = useWebSocket(wsUrl)

  useEffect(() => {
    if (marketData?.type === 'market_update') {
      const data = marketData.data
      if (data.stocks) setStocks(data.stocks)
      if (data.big_orders) setBigOrders(data.big_orders)
      if (data.daban_candidates) setDabanCandidates(data.daban_candidates)
      if (data.timestamp) setLastUpdate(data.timestamp)
      if (typeof data.is_trading === 'boolean') setIsTrading(data.is_trading)
    }
  }, [marketData])

  useEffect(() => {
    const fetchData = async () => {
      setIsRefreshing(true)
      try {
        const [stocksRes, ordersRes] = await Promise.all([
          fetch('/api/stocks?limit=100'),
          fetch('/api/big-orders?limit=30')
        ])
        const [stocksData, ordersData] = await Promise.all([
          stocksRes.json(),
          ordersRes.json()
        ])
        if (stocksData.stocks) setStocks(stocksData.stocks)
        if (stocksData.is_trading !== undefined) setIsTrading(stocksData.is_trading)
        if (ordersData.orders) setBigOrders(ordersData.orders)
        setLastUpdate(new Date().toLocaleTimeString())
      } catch (err) {
        console.error('获取数据失败:', err)
      } finally {
        setIsRefreshing(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleSearch = useCallback(async () => {
    if (!searchCode.trim()) return
    try {
      const res = await fetch(`/api/stocks?search=${encodeURIComponent(searchCode)}&limit=1`)
      const data = await res.json()
      if (data.stocks?.length > 0) {
        setSelectedStock(data.stocks[0].code)
      }
    } catch (err) {
      console.error('搜索失败:', err)
    }
  }, [searchCode])

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    fetch('/api/stocks?limit=100')
      .then(r => r.json())
      .then(d => {
        if (d.stocks) setStocks(d.stocks)
        if (d.is_trading !== undefined) setIsTrading(d.is_trading)
        setLastUpdate(new Date().toLocaleTimeString())
      })
      .finally(() => setIsRefreshing(false))
  }, [])

  // 统计数据
  const upCount = stocks.filter(s => s.change_percent > 0).length
  const downCount = stocks.filter(s => s.change_percent < 0).length
  const limitUpCount = stocks.filter(s => s.change_percent >= 9.9).length
  const limitDownCount = stocks.filter(s => s.change_percent <= -9.9).length

  return (
    <div className="min-h-screen bg-[#1a1a2e]">
      {/* 头部 */}
      <header className="bg-[#16213e] border-b border-[#2d3748]">
        <div className="max-w-[1800px] mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-[#e74c3c] to-[#c0392b] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">AH</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">同花顺风格 A股监控</h1>
                <p className="text-[10px] text-[#718096]">实时行情 · 专业数据</p>
              </div>
            </div>

            {/* 搜索 */}
            <div className="flex-1 max-w-xl mx-8">
              <div className="relative">
                <input
                  type="text"
                  placeholder="输入股票代码或名称..."
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full bg-[#0f3460] border border-[#2d3748] rounded-lg pl-10 pr-20 py-2 text-sm text-white placeholder-[#718096] focus:outline-none focus:border-[#e74c3c]"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#718096]" />
                <button
                  onClick={handleSearch}
                  className="absolute right-1 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-[#e74c3c] hover:bg-[#c0392b] text-white text-xs rounded-md font-medium transition-colors"
                >
                  搜索
                </button>
              </div>
            </div>

            {/* 刷新和时间 */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#0f3460] hover:bg-[#1a4a7a] rounded-md text-sm text-white transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? '刷新中' : '刷新'}</span>
              </button>
              <div className="text-right">
                <div className="text-sm text-white font-medium">{lastUpdate || '--:--:--'}</div>
                <div className={`text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                  {isConnected ? '● 已连接' : '○ 连接中'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 行情统计 */}
      <div className="bg-[#16213e] border-b border-[#2d3748]">
        <div className="max-w-[1800px] mx-auto px-4 py-3">
          <div className="flex items-center gap-6">
            <StatItem label="上涨" value={upCount} color="up" icon={<TrendingUp className="w-4 h-4" />} />
            <StatItem label="下跌" value={downCount} color="down" icon={<TrendingDown className="w-4 h-4" />} />
            <StatItem label="涨停" value={limitUpCount} color="limit-up" />
            <StatItem label="跌停" value={limitDownCount} color="limit-down" />
            <StatItem label="股票数" value={stocks.length} color="neutral" />
            <div className="ml-auto flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${isTrading ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                {isTrading ? '● 实时' : '○ 收盘'}
              </span>
              <span className="text-xs text-[#718096]">
                交易时间: 9:30-11:30 / 13:00-15:00
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 标签页 */}
      <div className="bg-[#16213e] border-b border-[#2d3748]">
        <div className="max-w-[1800px] mx-auto px-4">
          <nav className="flex gap-1">
            <TabButton active={activeTab === 'market'} onClick={() => setActiveTab('market')} label="市场行情" />
            <TabButton active={activeTab === 'bigorder'} onClick={() => setActiveTab('bigorder')} label="大单监控" badge={bigOrders.length} />
            <TabButton active={activeTab === 'daban'} onClick={() => setActiveTab('daban')} label="打板精选" badge={dabanCandidates.length} />
          </nav>
        </div>
      </div>

      {/* 警告提示 */}
      <div className="bg-yellow-500/10 border-b border-yellow-500/30">
        <div className="max-w-[1800px] mx-auto px-4 py-2 flex items-center gap-2 text-xs text-yellow-400">
          <AlertTriangle className="w-4 h-4" />
          <span>数据来源：新浪财经 | 已过滤：ST、科创板(688)、创业板(300)、北交所(8)</span>
        </div>
      </div>

      {/* 主内容 */}
      <main className="max-w-[1800px] mx-auto px-4 py-4">
        {selectedStock ? (
          <StockDetail code={selectedStock} onBack={() => setSelectedStock(null)} />
        ) : (
          <>
            {activeTab === 'market' && <StockList stocks={stocks} onSelect={setSelectedStock} />}
            {activeTab === 'bigorder' && <BigOrderPanel orders={bigOrders} onSelect={setSelectedStock} />}
            {activeTab === 'daban' && <DaBanPanel candidates={dabanCandidates} onSelect={setSelectedStock} />}
          </>
        )}
      </main>
    </div>
  )
}

function StatItem({ label, value, color, icon }: { label: string; value: number; color: 'up' | 'down' | 'limit-up' | 'limit-down' | 'neutral'; icon?: React.ReactNode }) {
  const colors = {
    up: 'text-[#ef4444] bg-red-500/10',
    down: 'text-[#22c55e] bg-green-500/10',
    'limit-up': 'text-[#ef4444] bg-red-500/20',
    'limit-down': 'text-[#22c55e] bg-green-500/20',
    neutral: 'text-white bg-gray-500/10'
  }
  return (
    <div className="flex items-center gap-2">
      {icon && <span className={colors[color]}>{icon}</span>}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0f3460]">
        <span className="text-xs text-[#718096]">{label}</span>
        <span className={`text-sm font-bold ${colors[color].split(' ')[0]}`}>{value}</span>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, label, badge }: { active: boolean; onClick: () => void; label: string; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-3 text-sm font-medium border-b-2 transition-all ${
        active 
          ? 'border-[#e74c3c] text-[#e74c3c] bg-[#e74c3c]/5' 
          : 'border-transparent text-[#718096] hover:text-white hover:bg-white/5'
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
          active ? 'bg-[#e74c3c] text-white' : 'bg-[#4a5568] text-white'
        }`}>
          {badge}
        </span>
      )}
    </button>
  )
}

export default App
