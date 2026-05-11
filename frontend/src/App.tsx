import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, Search, Activity, Target, Zap } from 'lucide-react'
import { StockList } from './components/StockList'
import { BigOrderPanel } from './components/BigOrderPanel'
import { DaBanPanel } from './components/DaBanPanel'
import { StockDetail } from './components/StockDetail'
import { WebSocketStatus } from './components/WebSocketStatus'
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

  // 使用相对 WebSocket 地址，兼容本地和生产环境
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProtocol}//${window.location.host}/ws/market`
  const { isConnected, marketData } = useWebSocket(wsUrl)

  // 初始加载数据（API轮询作为备用）
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // 并行请求多个接口
        const [stocksRes, dabanRes, ordersRes] = await Promise.all([
          fetch('/api/stocks?limit=20'),
          fetch('/api/daban'),
          fetch('/api/big-orders?limit=20')
        ])
        
        const [stocksData, dabanData, ordersData] = await Promise.all([
          stocksRes.json(),
          dabanRes.json(),
          ordersRes.json()
        ])
        
        if (stocksData.stocks) setStocks(stocksData.stocks)
        if (ordersData.orders) setBigOrders(ordersData.orders)
        if (dabanData.candidates) setDabanCandidates(dabanData.candidates)
        setLastUpdate(new Date().toLocaleTimeString())
      } catch (err) {
        console.error('获取初始数据失败:', err)
      }
    }
    
    fetchInitialData()
    // 每10秒刷新一次数据
    const interval = setInterval(fetchInitialData, 10000)
    return () => clearInterval(interval)
  }, [])

  // 处理 WebSocket 数据
  useEffect(() => {
    if (marketData) {
      if (marketData.type === 'market_update') {
        const data = marketData.data
        if (data.stocks) setStocks(data.stocks)
        if (data.big_orders) setBigOrders(data.big_orders)
        if (data.daban_candidates) setDabanCandidates(data.daban_candidates)
        if (data.timestamp) setLastUpdate(data.timestamp)
      }
    }
  }, [marketData])

  // 搜索股票
  const handleSearch = useCallback(async () => {
    if (!searchCode.trim()) return
    
    try {
      const res = await fetch(`/api/stocks?search=${encodeURIComponent(searchCode)}&limit=1`)
      const data = await res.json()
      if (data.stocks && data.stocks.length > 0) {
        setSelectedStock(data.stocks[0].code)
      }
    } catch (err) {
      console.error('搜索失败:', err)
    }
  }, [searchCode])

  // 键盘回车搜索
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }, [handleSearch])

  return (
    <div className="min-h-screen bg-stock-bg">
      {/* 头部 */}
      <header className="border-b border-stock-border bg-stock-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">A股监控</h1>
                <p className="text-xs text-gray-400">实时交易数据</p>
              </div>
            </div>

            {/* 搜索框 */}
            <div className="flex-1 max-w-md mx-8">
              <div className="relative">
                <input
                  type="text"
                  placeholder="输入股票代码或名称..."
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-stock-bg border border-stock-border rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <button
                  onClick={handleSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                >
                  查询
                </button>
              </div>
            </div>

            {/* 状态 */}
            <div className="flex items-center gap-4">
              <WebSocketStatus isConnected={isConnected} lastUpdate={lastUpdate} />
            </div>
          </div>
        </div>
      </header>

      {/* 标签页 */}
      <div className="border-b border-stock-border bg-stock-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1">
            <TabButton
              active={activeTab === 'market'}
              onClick={() => setActiveTab('market')}
              icon={<Activity className="w-4 h-4" />}
              label="市场行情"
            />
            <TabButton
              active={activeTab === 'bigorder'}
              onClick={() => setActiveTab('bigorder')}
              icon={<Zap className="w-4 h-4" />}
              label="大单监控"
              badge={bigOrders.length > 0 ? bigOrders.length : undefined}
            />
            <TabButton
              active={activeTab === 'daban'}
              onClick={() => setActiveTab('daban')}
              icon={<Target className="w-4 h-4" />}
              label="打板精选"
              badge={dabanCandidates.length > 0 ? dabanCandidates.length : undefined}
            />
          </nav>
        </div>
      </div>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {selectedStock ? (
          <StockDetail
            code={selectedStock}
            onBack={() => setSelectedStock(null)}
          />
        ) : (
          <>
            {activeTab === 'market' && (
              <StockList stocks={stocks} onSelect={setSelectedStock} />
            )}
            {activeTab === 'bigorder' && (
              <BigOrderPanel orders={bigOrders} onSelect={setSelectedStock} />
            )}
            {activeTab === 'daban' && (
              <DaBanPanel candidates={dabanCandidates} onSelect={setSelectedStock} />
            )}
          </>
        )}
      </main>
    </div>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
}

function TabButton({ active, onClick, icon, label, badge }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
        ${active 
          ? 'border-blue-500 text-blue-400 bg-blue-500/10' 
          : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
        }
      `}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && (
        <span className={`
          px-2 py-0.5 text-xs rounded-full
          ${active ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'}
        `}>
          {badge}
        </span>
      )}
    </button>
  )
}

export default App
