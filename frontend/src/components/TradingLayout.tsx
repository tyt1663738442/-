/**
 * 科技风主布局 v3.1
 * 三栏：左（股票列表）| 中（分时图+新闻）| 右（五档盘口）
 * - 行情列表：分页加载全量股票（100条/页）
 * - 自选股：与大单自选同步
 * - 搜索：支持实时搜索全量股票
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, RefreshCw, Radio } from 'lucide-react'
import { StockInfo, MinuteTick, IndexData } from '../types'
import { StockListPanel } from './StockListPanel'
import { MinuteChart } from './MinuteChart'
import { QuotePanel } from './QuotePanel'
import { NewsTimeline } from './NewsTimeline'
import { StatusBar } from './StatusBar'

// API 基础 URL
const API_BASE = 'http://localhost:8000'

// ====== 科技风配色 ======
const COLORS = {
  up: '#ff4d4f',
  down: '#00b826',
  flat: '#999999',
  bg_primary: '#0a0f1a',
  bg_secondary: '#0d1525',
  bg_tertiary: '#111d33',
  bg_hover: 'rgba(0, 212, 255, 0.08)',
  border: '#1a2a44',
  text_primary: '#e0e6f0',
  text_secondary: '#7a8aa0',
  cyan: '#00d4ff',
  green: '#00ff88',
}

interface Props {
  pendingStockCode?: string | null
  onClearPending?: () => void
}

export function TradingLayout({ pendingStockCode, onClearPending }: Props) {
  // 自选股（与大单共享）
  const [watchlistStocks, setWatchlistStocks] = useState<StockInfo[]>([])
  const [watchlistCodes, setWatchlistCodes] = useState<string[]>([])

  // 行情列表（分页）
  const [allStocks, setAllStocks] = useState<StockInfo[]>([])
  const [allPage, setAllPage] = useState(1)
  const [allTotalPages, setAllTotalPages] = useState(1)
  const [allTotal, setAllTotal] = useState(0)
  const [allLoading, setAllLoading] = useState(false)

  // 搜索
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<StockInfo[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Tab
  const [activeListTab, setActiveListTab] = useState<'watchlist' | 'all'>('watchlist')

  // 选中股票
  const [selectedCode, setSelectedCode] = useState<string>('600519')
  const [selectedStock, setSelectedStock] = useState<StockInfo | null>(null)
  const [minuteData, setMinuteData] = useState<MinuteTick[]>([])
  const [indexData, setIndexData] = useState<IndexData>({})
  const [phase, setPhase] = useState('连续竞价')
  const [lastUpdate, setLastUpdate] = useState('')
  const [loading, setLoading] = useState(true)

  // ===== 获取自选股 =====
  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/big-orders/watchlist`)
      const data = await res.json()
      const stocks: StockInfo[] = (data.stocks || []).map((s: any) => ({
        code: s.code,
        name: s.name,
        price: s.price || 0,
        change_pct: s.change_pct || 0,
        change: s.change || 0,
        volume: s.volume || 0,
        amount: s.amount || 0,
        turnover: s.turnover || 0,
        volume_ratio: s.volume_ratio || 0,
        pre_close: s.pre_close || 0,
        wei_bi: s.wei_bi || 0,
        bid_ask: s.bid_ask || [],
      }))
      setWatchlistStocks(stocks)
      setWatchlistCodes(stocks.map(s => s.code))
    } catch (e) {
      console.error('Watchlist fetch failed', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // ===== 获取行情列表（分页） =====
  const fetchAllStocks = useCallback(async (page: number) => {
    setAllLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/stocks?limit=100&page=${page}`)
      const data = await res.json()
      setAllStocks(data.stocks || [])
      setAllPage(data.page || page)
      setAllTotalPages(data.total_pages || 1)
      setAllTotal(data.total || 0)
      setPhase(data.phase || '')
      setLastUpdate(data.time || '')
    } catch (e) {
      console.error('All stocks fetch failed', e)
    } finally {
      setAllLoading(false)
    }
  }, [])

  // ===== 搜索 =====
  const doSearch = useCallback(async (term: string) => {
    if (!term.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    try {
      const res = await fetch(`${API_BASE}/api/stocks?limit=100&search=${encodeURIComponent(term)}`)
      const data = await res.json()
      setSearchResults(data.stocks || [])
    } catch (e) {
      console.error('Search failed', e)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleSearchChange = (val: string) => {
    setSearchTerm(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!val.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    searchTimer.current = setTimeout(() => doSearch(val), 300)
  }

  // ===== 分时数据 =====
  const fetchMinute = useCallback(async (code?: string) => {
    const c = code || selectedCode
    if (!c) return
    try {
      const res = await fetch(`${API_BASE}/api/minute/${c}?count=500`)
      const data = await res.json()
      if (data.data) setMinuteData(data.data)
    } catch (e) {
      console.error('Minute fetch failed', e)
    }
  }, [selectedCode])

  // ===== 单只股票详情 =====
  const fetchSingleStock = useCallback(async (code: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/stock/${code}`)
      const data = await res.json()
      if (data && data.code) {
        setSelectedStock(data as StockInfo)
      }
    } catch (e) {
      console.error('Single stock fetch failed', e)
    }
  }, [])

  // ===== 初始化 =====
  useEffect(() => {
    fetchWatchlist()
    fetchAllStocks(1)
    fetchMinute()
    fetchSingleStock('600519')
    // 定时刷新
    const iv1 = setInterval(fetchWatchlist, 5000)
    const iv2 = setInterval(() => {
      if (activeListTab === 'all' && !searchTerm) fetchAllStocks(allPage)
      fetchMinute()
    }, 5000)
    return () => { clearInterval(iv1); clearInterval(iv2) }
  }, [])

  // activeListTab 切换时刷新行情列表
  useEffect(() => {
    if (activeListTab === 'all' && !searchTerm) {
      fetchAllStocks(allPage)
    }
  }, [activeListTab])

  // ===== pendingStockCode =====
  useEffect(() => {
    if (pendingStockCode) {
      setSelectedCode(pendingStockCode)
      setMinuteData([])
      onClearPending?.()
      fetchMinute(pendingStockCode)
      fetchSingleStock(pendingStockCode)
    }
  }, [pendingStockCode])

  // ===== 监听全局选股事件 =====
  useEffect(() => {
    const handler = (e: CustomEvent<string>) => {
      if (e.detail) {
        const code = e.detail
        setSelectedCode(code)
        fetchMinute(code)
        fetchSingleStock(code)
      }
    }
    window.addEventListener('qclaw-select-stock', handler as any)
    return () => window.removeEventListener('qclaw-select-stock', handler as any)
  }, [fetchMinute, fetchSingleStock])

  // ===== 选择股票 =====
  const handleSelectStock = (code: string) => {
    setSelectedCode(code)
    // 先在已有数据里找
    const from = [...watchlistStocks, ...allStocks, ...searchResults]
    const found = from.find(s => s.code === code)
    if (found) setSelectedStock(found)
    fetchMinute(code)
    fetchSingleStock(code)
  }

  // ===== 决定当前显示列表 =====
  const isSearchMode = searchTerm.trim().length > 0
  const currentStocks = isSearchMode
    ? searchResults
    : activeListTab === 'watchlist'
      ? watchlistStocks
      : allStocks

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a0f1a 0%, #0d1525 100%)' }}>
      {/* ====== 顶部状态栏 ====== */}
      <div className="shrink-0 flex items-center justify-between px-4"
        style={{
          height: '36px',
          background: 'linear-gradient(90deg, rgba(0,212,255,0.08) 0%, rgba(0,255,136,0.05) 50%, rgba(0,212,255,0.08) 100%)',
          borderBottom: '1px solid #1a2a44',
        }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5" style={{ color: COLORS.green }} />
            <span className="text-xs font-medium" style={{ color: COLORS.green }}>实时行情</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: COLORS.green, boxShadow: `0 0 6px ${COLORS.green}` }} />
            <span className="text-[10px]" style={{ color: COLORS.text_secondary }}>数据连接正常</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-px h-4" style={{ background: COLORS.border }} />
          <span className="text-sm font-semibold tracking-wider" style={{ color: COLORS.cyan, textShadow: `0 0 10px ${COLORS.cyan}40` }}>
            行情看板
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-mono" style={{ color: COLORS.text_secondary }}>{lastUpdate}</span>
          <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'rgba(0,255,136,0.1)', color: COLORS.green, border: `1px solid ${COLORS.green}30` }}>
            {phase}
          </span>
        </div>
      </div>

      {/* ====== 工具栏 ====== */}
      <header className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ backgroundColor: 'rgba(13,21,37,0.8)', borderBottom: `1px solid ${COLORS.border}` }}
      >
        <div className="flex items-center gap-2">
          {[
            { key: 'watchlist', label: `自选股(${watchlistCodes.length})` },
            { key: 'all', label: `行情列表` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveListTab(tab.key as 'watchlist' | 'all'); setSearchTerm(''); setSearchResults([]) }}
              className="relative px-3 py-1 rounded text-xs font-medium transition-all"
              style={{
                backgroundColor: activeListTab === tab.key && !isSearchMode ? 'rgba(0,212,255,0.12)' : 'transparent',
                color: activeListTab === tab.key && !isSearchMode ? COLORS.cyan : COLORS.text_secondary,
                border: `1px solid ${activeListTab === tab.key && !isSearchMode ? 'rgba(0,212,255,0.3)' : 'transparent'}`,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: isSearching ? COLORS.cyan : COLORS.text_secondary }} />
            <input
              type="text"
              placeholder="搜代码/名称..."
              value={searchTerm}
              onChange={e => handleSearchChange(e.target.value)}
              className="rounded pl-7 pr-3 py-1.5 text-xs w-44 focus:outline-none transition-all"
              style={{
                backgroundColor: 'rgba(17,29,51,0.8)',
                border: `1px solid ${searchTerm ? COLORS.cyan : COLORS.border}`,
                color: COLORS.text_primary,
              }}
            />
            {searchTerm && (
              <button
                onClick={() => { setSearchTerm(''); setSearchResults([]) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs"
                style={{ color: COLORS.text_secondary }}
              >×</button>
            )}
          </div>
          <button
            onClick={() => { fetchWatchlist(); fetchAllStocks(allPage); fetchMinute() }}
            className="p-1.5 rounded transition-all"
            style={{ backgroundColor: 'rgba(0,212,255,0.1)', border: `1px solid ${COLORS.border}` }}
          >
            <RefreshCw className="w-4 h-4" style={{ color: COLORS.cyan }} />
          </button>
        </div>
      </header>

      {/* ====== 主内容区 ====== */}
      <main className="flex flex-1 overflow-hidden">
        {/* 左栏：股票列表 */}
        <div className="w-[280px] flex flex-col shrink-0" style={{ borderRight: `1px solid ${COLORS.border}` }}>
          <StockListPanel
            stocks={currentStocks}
            selectedCode={selectedCode}
            onSelect={handleSelectStock}
            loading={loading || (activeListTab === 'all' && allLoading)}
            watchlistMode={activeListTab === 'watchlist' && !isSearchMode}
            isSearchMode={isSearchMode}
            searchTerm={searchTerm}
            // 分页 props（仅行情列表使用）
            page={allPage}
            totalPages={allTotalPages}
            total={isSearchMode ? searchResults.length : (activeListTab === 'all' ? allTotal : watchlistCodes.length)}
            onPageChange={(p) => fetchAllStocks(p)}
            showPagination={activeListTab === 'all' && !isSearchMode}
          />
        </div>

        {/* 中栏：分时图 + 新闻 */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0 p-3">
            <MinuteChart data={minuteData} stock={selectedStock} height={340} />
          </div>
          <div className="h-[200px]" style={{ borderTop: `1px solid ${COLORS.border}` }}>
            <NewsTimeline stockCode={selectedCode} />
          </div>
        </div>

        {/* 右栏：五档盘口 */}
        <div className="w-[240px] flex flex-col shrink-0" style={{ borderLeft: `1px solid ${COLORS.border}` }}>
          <QuotePanel stock={selectedStock} />
        </div>
      </main>

      <StatusBar indexData={indexData} phase={phase} />
    </div>
  )
}
