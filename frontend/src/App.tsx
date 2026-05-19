/**
 * A股实时监控系统 v3.0 - 同花顺风格
 * 单页面 + Tab 切换
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { AuctionPanel } from './components/AuctionPanel'
import { FormulaPanel } from './components/FormulaPanel'
import { SectorPanel } from './components/SectorPanel'
import { ReviewPanel } from './components/ReviewPanel'
import { HotTrendPage } from './components/HotTrendPage'
import { NewsHub } from './components/NewsHub'
import { Zap, Grid3x3, Flame, ClipboardList, Wind, Newspaper, Search, X } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8001'

interface SearchStock {
  code: string
  name: string
  price: number
  change_pct: number
  sector: string
}

type TabKey = 'auction' | 'formula' | 'sector' | 'review' | 'hottrend' | 'newshub'

// 科技风配色
const TABS: { key: TabKey; label: string; icon: any; color: string }[] = [
  { key: 'auction',    label: '竞价分析',   icon: Zap,              color: '#a855f7' },
  { key: 'formula',    label: '竞价选股',   icon: Flame,            color: '#f23645' },
  { key: 'sector',     label: '板块行情',   icon: Grid3x3,          color: '#06b6d4' },
  { key: 'review',     label: '复盘分析',   icon: ClipboardList,    color: '#00d4ff' },
  { key: 'hottrend',   label: '最强风口',   icon: Wind,             color: '#f59e0b' },
  { key: 'newshub',    label: '新闻汇总',   icon: Newspaper,       color: '#10b981' },
]

// 辅助函数：将十六进制颜色转换为RGB
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (result) {
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
  }
  return '255, 255, 255'
}

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('auction')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<SearchStock[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // 搜索防抖
  const doSearch = useCallback(async (term: string) => {
    if (!term.trim()) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }
    setSearching(true)
    try {
      const res = await fetch(`${API_BASE}/api/stocks?limit=10&search=${encodeURIComponent(term)}`)
      const data = await res.json()
      setSearchResults(data.stocks || [])
      setShowDropdown(true)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  // 输入时防抖搜索
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSearchTerm(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => doSearch(val), 300)
  }

  // 选中股票
  const handleSelectStock = (stock: SearchStock) => {
    window.dispatchEvent(new CustomEvent('qclaw-select-stock', { detail: stock.code }))
    setSearchTerm('')
    setSearchResults([])
    setShowDropdown(false)
  }

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="h-screen flex flex-col text-white overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a0f1a 0%, #0d1525 100%)' }}>
      {/* 顶部主Tab栏 - 科技风 */}
      <nav className="flex items-center gap-1 px-4 py-2 shrink-0 border-b"
        style={{
          background: 'linear-gradient(90deg, rgba(10, 15, 26, 0.98) 0%, rgba(13, 21, 37, 0.95) 100%)',
          borderColor: '#1a2a44',
        }}>
        {/* Logo区域 */}
        <div className="flex items-center gap-2 mr-4">
          <div className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: '#00ff88', boxShadow: '0 0 8px #00ff88' }} />
          <span className="font-bold text-sm tracking-wider"
            style={{ color: '#00d4ff', textShadow: '0 0 10px rgba(0, 212, 255, 0.3)' }}>
            A股监控
          </span>
        </div>

        {/* Tab按钮 */}
        {TABS.map(({ key, label, icon: Icon, color }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              color: activeTab === key ? '#e0e6f0' : '#7a8aa0',
              background: activeTab === key
                ? `linear-gradient(135deg, rgba(${hexToRgb(color)}, 0.15) 0%, rgba(${hexToRgb(color)}, 0.05) 100%)`
                : 'transparent',
              border: activeTab === key ? `1px solid ${color}40` : '1px solid transparent',
            }}
          >
            {activeTab === key && (
              <div className="absolute inset-x-0 -bottom-px h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
            )}
            <Icon className="w-3.5 h-3.5" style={{ color: activeTab === key ? color : undefined }} />
            <span>{label}</span>
          </button>
        ))}

        {/* 全局搜索栏 */}
        <div className="relative ml-4 mr-2" ref={searchRef}>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all"
            style={{
              background: searchTerm ? 'rgba(13,21,37,0.95)' : 'rgba(13,21,37,0.6)',
              borderColor: searchTerm ? '#00d4ff50' : '#1a2a44',
              minWidth: '200px',
            }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: '#7a8aa0' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearchChange}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
              placeholder="代码/名称搜索..."
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-[#5a6a7a]"
              style={{ color: '#e0e6f0', minWidth: 0 }}
            />
            {searchTerm && (
              <button onClick={() => { setSearchTerm(''); setSearchResults([]); setShowDropdown(false) }}
                className="shrink-0 hover:opacity-70 transition-opacity">
                <X className="w-3 h-3" style={{ color: '#7a8aa0' }} />
              </button>
            )}
          </div>
          {/* 搜索结果下拉 */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-full min-w-[280px] rounded-lg border overflow-hidden z-50"
              style={{ background: '#0d1525', borderColor: '#1a2a44', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              {searchResults.map(stock => {
                const chg = stock.change_pct ?? 0
                const isUp = chg >= 0
                const color = isUp ? '#ff4d6d' : '#00b826'
                return (
                  <div key={stock.code}
                    onClick={() => handleSelectStock(stock)}
                    className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#1a2a44]/50 transition-colors border-b last:border-0"
                    style={{ borderColor: '#1a2a4430' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium" style={{ color: '#e0e6f0' }}>{stock.name}</span>
                      <span className="text-[10px] font-mono" style={{ color: '#5a6a7a' }}>{stock.code}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {stock.price > 0 && (
                        <span className="text-xs font-mono font-bold" style={{ color }}>
                          {isUp ? '+' : ''}{chg.toFixed(2)}%
                        </span>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#1a2a4450', color: '#7a8aa0' }}>
                        {stock.sector ? stock.sector.slice(0, 4) : '其他'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {showDropdown && searchTerm && searchResults.length === 0 && !searching && (
            <div className="absolute top-full left-0 mt-1 w-full min-w-[200px] rounded-lg border px-3 py-2 z-50 text-xs"
              style={{ background: '#0d1525', borderColor: '#1a2a44', color: '#7a8aa0' }}>
              未找到 "{searchTerm}" 相关股票
            </div>
          )}
        </div>

        {/* 右侧状态 */}
        <div className="ml-auto flex items-center gap-4">
          <span className="text-[11px] font-mono" style={{ color: '#7a8aa0' }}>
            v3.0 科技风
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#00ff88' }} />
            <span className="text-[10px]" style={{ color: '#7a8aa0' }}>实时</span>
          </div>
        </div>
      </nav>

      {/* 内容区 */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'auction' && <AuctionPanel />}
        {activeTab === 'formula' && <FormulaPanel />}
        {activeTab === 'sector' && <SectorPanel />}
        {activeTab === 'review' && <ReviewPanel />}
        {activeTab === 'hottrend' && <HotTrendPage />}
        {activeTab === 'newshub' && <NewsHub />}
      </main>
    </div>
  )
}

export default App
