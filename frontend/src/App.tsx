import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, RefreshCw, Activity, Flame, TrendingUp, TrendingDown, Target, Clock, BarChart2, Zap, ChevronRight, ChevronDown } from 'lucide-react'
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

// 自选股列表（默认你关注的股票）
const watchList = ['600152', '002418', '600406', '600673', '600821', '600930', '002217', '600433', '000720', '300750', '002594', '300014']

function App() {

  // 实时数据
  const fetchAll = useCallback(async () => {
    // 非交易时段只拉一次，不重复刷新
    if (marketStatus?.phase === '已休市' || marketStatus?.phase === '周末休市') {
      if (stocks.length > 0) return
    }

    setIsRefreshing(true)
    try {
      const [stocksRes, dabanRes, statusRes] = await Promise.all([
        fetch(`${API_BASE}/api/stocks?limit=100&sort_by=${sortBy}`),
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
  }, [sortBy, marketStatus?.phase, stocks.length])

  // 初始化
  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // 自动刷新（交易时段每5秒，休市不刷新）
  useEffect(() => {
    if (autoRefresh && marketStatus?.is_trading) {
      refreshRef.current = setInterval(fetchAll, 5000)
    } else if (autoRefresh && marketStatus?.phase === '集合竞价') {
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

  // 自选股筛选
  const watchListStocks = stocks.filter(s => watchList.includes(s.code) || watchList.includes(s.code.replace(/^sh|^sz/, '')))

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col h-screen overflow-hidden">
      {/* 顶部状态栏 */}
      <div className="bg-[#0d1b3e] border-b border-[#1e293b] px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold text-[#f23645]">国信金太阳 · A股监控</span>
          <span className="text-xs text-[#94a3b8]">v2.0</span>
          {marketStatus && (
            <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded ${
              marketStatus.is_trading
                ? 'bg-green-500/20 text-green-400'
                : marketStatus.phase === '集合竞价'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-gray-500/20 text-gray-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${marketStatus.is_trading ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
              <span>{marketStatus.phase}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* 指数栏精简版 */}
          <IndexBanner />
          <div className="flex items-center gap-2 text-xs text-[#94a3b8]">
            <Clock className="w-3 h-3" />
            <span>{lastUpdate || '--'}</span>
          </div>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-1.5 rounded ${autoRefresh ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}
            title={autoRefresh ? '自动刷新中' : '已暂停'}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧自选股栏 */}
        <div className={`bg-[#0f172a] border-r border-[#1e293b] transition-all duration-300 ${
          leftPanelCollapsed ? 'w-8' : 'w-64'
        } flex flex-col`}>
          <div className="p-2 border-b border-[#1e293b] flex items-center justify-between">
            {!leftPanelCollapsed && <span className="text-sm font-medium">自选股</span>}
            <button
              onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
              className="p-1 hover:bg-[#1e293b] rounded"
            >
              {leftPanelCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {/* 搜索框 */}
          {!leftPanelCollapsed && (
            <div className="p-2 border-b border-[#1e293b]">
              <div className="flex items-center bg-[#1e293b] rounded-lg px-2 py-1">
                <Search className="w-3 h-3 text-[#64748b] mr-2" />
                <input
                  value={searchCode}
                  onChange={e => setSearchCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="代码/名称"
                  className="flex-1 bg-transparent text-xs outline-none text-white placeholder-[#64748b]"
                />
              </div>
            </div>
          )}

          {/* 自选股列表 */}
          {!leftPanelCollapsed && (
            <div className="flex-1 overflow-y-auto">
              <div className="bg-[#1e293b] py-1.5 px-2 grid grid-cols-[1fr_40px_50px] gap-1 text-[10px] text-[#94a3b8] font-medium">
                <div>名称</div>
                <div className="text-right">涨跌</div>
                <div className="text-right">现价</div>
              </div>

              <div className="divide-y divide-[#1e293b]">
                {watchListStocks.map(stock => {
                  const isUp = stock.change_pct > 0
                  const isSelected = selectedStock === stock.code
                  return (
                    <div
                      key={stock.code}
                      onClick={() => setSelectedStock(stock.code)}
                      className={`grid grid-cols-[1fr_40px_50px] gap-1 px-2 py-1.5 text-xs cursor-pointer ${
                        isSelected ? 'bg-[#1e3a8a]' : 'hover:bg-[#1e293b]'
                      }`}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className={`font-medium truncate ${isUp ? 'text-[#f23645]' : 'text-[#15b755]'}`}>
                          {stock.name}
                        </span>
                        <span className="text-[10px] text-[#64748b]">{stock.code}</span>
                      </div>
                      <div className={`flex items-center justify-end font-mono font-medium ${
                        isUp ? 'text-[#f23645]' : 'text-[#15b755]'
                      }`}>
                        {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct.toFixed(2)}%
                      </div>
                      <div className={`flex items-center justify-end font-mono ${
                        isUp ? 'text-[#f23645]' : 'text-[#15b755]'
                      }`}>
                        {stock.price.toFixed(2)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 中间核心区 - 个股详情/分时图 */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0f172a]">
          <StockDetail code={selectedStock} onBack={() => {}} hideBackButton />
        </div>

        {/* 右侧功能区 */}
        <div className="w-96 bg-[#0f172a] border-l border-[#1e293b] overflow-y-auto">
          <div className="sticky top-0 z-10 bg-[#0f172a] border-b border-[#1e293b]">
            <div className="flex">
              {[
                { key: 'daban', label: '打板精选', icon: Flame },
                { key: 'bigorder', label: '大单追踪', icon: Activity },
                { key: 'auction', label: '竞价监测', icon: Zap },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key as TabType)}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors ${
                    activeTab === key
                      ? 'text-white border-b-2 border-[#f23645] bg-[#1e293b]'
                      : 'text-[#94a3b8] hover:text-white hover:bg-[#1e293b]'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                  {key === 'daban' && dabanCandidates.length > 0 && (
                    <span className="bg-[#f23645] text-white text-[10px] px-1 rounded-full">
                      {dabanCandidates.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="p-2">
            {/* 打板精选 */}
            {activeTab === 'daban' && (
              <DaBanPanel candidates={dabanCandidates} onSelect={setSelectedStock} />
            )}
            {/* 大单追踪 */}
            {activeTab === 'bigorder' && (
              <BigOrderPanel />
            )}
            {/* 竞价监测 */}
            {activeTab === 'auction' && (
              <AuctionPanel />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
