/**
 * 最强风口 - 新闻驱动股票评分
 * 参考复盘分析页面风格，展示风口股票及新闻详情
 */
import { useState, useEffect, useCallback } from 'react'
import { X, TrendingUp, TrendingDown, Globe, Shield, FileText, ArrowUpDown, ChevronDown, RefreshCw } from 'lucide-react'

// ============== 类型定义 ==============
interface NewsItem {
  title: string
  source: string
  type: 'domestic' | 'international'
  sentiment: 'bullish' | 'bearish'
  datetime?: string
}

interface HotStock {
  code: string
  name: string
  price: number
  change_pct: number
  score: number
  news: NewsItem[]
  sector: string
}

interface HotTrendResponse {
  stocks: HotStock[]
  news_count: number
  update_time: string
}

type SortColumn = 'score' | 'change_pct' | 'price' | 'name' | 'news_count' | null

// ============== 评分进度条 ==============
function ScoreBar({ score, max = 30 }: { score: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (score / max) * 100))
  const color = score >= 10 ? '#00ff88' : score >= 5 ? '#ffd700' : '#ff6b6b'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }}
        />
      </div>
      <span className="text-xs font-mono w-8 text-right" style={{ color }}>{score}</span>
    </div>
  )
}

// ============== 新闻详情弹窗 ==============
function NewsDetailModal({ stock, onClose }: { stock: HotStock; onClose: () => void }) {
  const intlNews = stock.news.filter(n => n.type === 'international')
  const domNews = stock.news.filter(n => n.type === 'domestic')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border"
        style={{
          background: 'linear-gradient(180deg, #0f1923 0%, #0a1520 100%)',
          borderColor: '#1a2a44',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="sticky top-0 flex items-center justify-between p-4 border-b" style={{ borderColor: '#1a2a44', background: 'rgba(10,15,26,0.95)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#00d4ff' }}>
              {stock.name} <span className="text-sm font-mono text-gray-400">{stock.code}</span>
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#7a8aa0' }}>{stock.sector}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-white/5"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* 盘面数据 */}
        <div className="grid grid-cols-4 gap-4 p-4 border-b" style={{ borderColor: '#1a2a44' }}>
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">现价</div>
            <div className="text-lg font-bold" style={{ color: '#00ff88' }}>
              {stock.price > 0 ? `¥${stock.price.toFixed(2)}` : '-'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">涨跌幅</div>
            <div className={`text-lg font-bold flex items-center justify-center gap-1 ${stock.change_pct >= 0 ? 'text-red-500' : 'text-green-500'}`}>
              {stock.change_pct >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {stock.change_pct > 0 ? '+' : ''}{stock.change_pct.toFixed(2)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">风口分数</div>
            <div className="text-lg font-bold" style={{ color: '#00d4ff' }}>{stock.score}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">新闻条数</div>
            <div className="text-lg font-bold" style={{ color: '#a855f7' }}>{stock.news.length}</div>
          </div>
        </div>

        {/* 分数来源 */}
        <div className="p-4 border-b" style={{ borderColor: '#1a2a44' }}>
          <div className="text-xs font-medium mb-2" style={{ color: '#7a8aa0' }}>风口强度</div>
          <ScoreBar score={stock.score} />
        </div>

        {/* 新闻详情 */}
        <div className="p-4 space-y-4">
          {/* 国际新闻 */}
          {intlNews.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-4 h-4" style={{ color: '#f59e0b' }} />
                <span className="text-sm font-medium" style={{ color: '#f59e0b' }}>国际新闻（{intlNews.length}条 × 10分）</span>
              </div>
              <div className="space-y-2">
                {intlNews.map((n, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg border"
                    style={{
                      background: 'rgba(245, 158, 11, 0.08)',
                      borderColor: 'rgba(245, 158, 11, 0.2)',
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${n.sentiment === 'bullish' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {n.sentiment === 'bullish' ? '📈利多' : '📉利空'}
                      </span>
                      <span className="text-xs text-gray-500">{n.source}</span>
                      {n.datetime && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#7a8aa0' }}>{n.datetime}</span>}
                    </div>
                    <p className="text-sm mt-1" style={{ color: '#e0e6f0' }}>{n.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 国内政策 */}
          {domNews.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4" style={{ color: '#06b6d4' }} />
                <span className="text-sm font-medium" style={{ color: '#06b6d4' }}>国内政策（{domNews.length}条 × 10分）</span>
              </div>
              <div className="space-y-2">
                {domNews.map((n, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg border"
                    style={{
                      background: 'rgba(6, 182, 212, 0.08)',
                      borderColor: 'rgba(6, 182, 212, 0.2)',
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${n.sentiment === 'bullish' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {n.sentiment === 'bullish' ? '📈利多' : '📉利空'}
                      </span>
                      <span className="text-xs text-gray-500">{n.source}</span>
                      {n.datetime && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#7a8aa0' }}>{n.datetime}</span>}
                    </div>
                    <p className="text-sm mt-1" style={{ color: '#e0e6f0' }}>{n.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stock.news.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              暂无相关新闻
            </div>
          )}
        </div>

        {/* 底部说明 */}
        <div className="p-4 border-t text-xs text-center" style={{ borderColor: '#1a2a44', color: '#7a8aa0' }}>
          国际新闻10分 | 国内政策10分 | 个股新闻5分 · 利多加分 · 利空减分
        </div>
      </div>
    </div>
  )
}

// ============== 主组件 ==============
export function HotTrendPage() {
  const [data, setData] = useState<HotTrendResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortCol, setSortCol] = useState<SortColumn>('score')
  const [sortDesc, setSortDesc] = useState(true)
  const [selectedStock, setSelectedStock] = useState<HotStock | null>(null)
  const [filterMode, setFilterMode] = useState<'all' | 'bullish'>('all')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/hot-trend/stocks')
      if (!res.ok) throw new Error('请求失败')
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (e: any) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 筛选 + 排序
  const filteredStocks = filterMode === 'bullish'
    ? (data?.stocks || []).filter(s => s.score > 0)
    : (data?.stocks || [])

  const sortedStocks = [...filteredStocks].sort((a, b) => {
    if (!sortCol) return 0
    let cmp = 0
    if (sortCol === 'name') {
      cmp = a.name.localeCompare(b.name)
    } else if (sortCol === 'change_pct') {
      cmp = a.change_pct - b.change_pct
    } else if (sortCol === 'price') {
      cmp = a.price - b.price
    } else if (sortCol === 'score') {
      cmp = a.score - b.score
    } else if (sortCol === 'news_count') {
      cmp = a.news.length - b.news.length
    }
    return sortDesc ? -cmp : cmp
  })

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDesc(!sortDesc)
    } else {
      setSortCol(col)
      setSortDesc(true)
    }
  }

  const SortHeader = ({ col, label }: { col: SortColumn; label: string }) => (
    <th
      className="px-3 py-2 text-left text-xs font-medium cursor-pointer select-none transition-colors"
      style={{ color: sortCol === col ? '#00d4ff' : '#7a8aa0' }}
      onClick={() => handleSort(col)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="w-3 h-3 opacity-50" />
      </div>
    </th>
  )

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: '#7a8aa0' }}>正在爬取财经新闻...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-3">{error}</p>
          <button onClick={fetchData} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: '#00d4ff', color: '#0a0f1a' }}>
            重试
          </button>
        </div>
      </div>
    )
  }

  const stats = {
    total: data?.stocks.length || 0,
    avgScore: data?.stocks.length ? (data!.stocks.reduce((s, x) => s + x.score, 0) / data!.stocks.length).toFixed(1) : '0',
    newsCount: data?.news_count || 0,
  }

  return (
    <div className="h-full flex flex-col p-4 gap-4 overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#00d4ff' }}>最强风口</h1>
          <p className="text-xs mt-0.5" style={{ color: '#7a8aa0' }}>
            新闻驱动 · 数据更新: {data?.update_time || '-'}
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: 'rgba(0, 212, 255, 0.1)',
            border: '1px solid rgba(0, 212, 255, 0.3)',
            color: '#00d4ff',
          }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          刷新
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        <div
          className="p-3 rounded-lg border cursor-pointer transition-all hover:bg-white/5"
          style={{
            background: filterMode === 'all' && sortCol === 'score' ? 'rgba(0,212,255,0.12)' : 'rgba(0,212,255,0.05)',
            borderColor: filterMode === 'all' && sortCol === 'score' ? 'rgba(0,212,255,0.4)' : '#1a2a44',
          }}
          onClick={() => { setFilterMode('all'); setSortCol('score'); setSortDesc(true) }}
        >
          <div className="text-xs text-gray-500 mb-1">风口股票</div>
          <div className="text-2xl font-bold" style={{ color: '#00d4ff' }}>{stats.total}</div>
        </div>
        <div
          className="p-3 rounded-lg border cursor-pointer transition-all hover:bg-white/5"
          style={{
            background: sortCol === 'score' && filterMode !== 'bullish' ? 'rgba(168,85,247,0.12)' : 'rgba(168,85,247,0.05)',
            borderColor: sortCol === 'score' && filterMode !== 'bullish' ? 'rgba(168,85,247,0.4)' : '#1a2a44',
          }}
          onClick={() => { setFilterMode('all'); handleSort('score') }}
        >
          <div className="text-xs text-gray-500 mb-1">平均分数</div>
          <div className="text-2xl font-bold" style={{ color: '#a855f7' }}>{stats.avgScore}</div>
        </div>
        <div
          className="p-3 rounded-lg border cursor-pointer transition-all hover:bg-white/5"
          style={{
            background: sortCol === 'news_count' ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.05)',
            borderColor: sortCol === 'news_count' ? 'rgba(245,158,11,0.4)' : '#1a2a44',
          }}
          onClick={() => { setFilterMode('all'); handleSort('news_count') }}
        >
          <div className="text-xs text-gray-500 mb-1">采集新闻</div>
          <div className="text-2xl font-bold" style={{ color: '#f59e0b' }}>{stats.newsCount}</div>
        </div>
        <div
          className="p-3 rounded-lg border cursor-pointer transition-all hover:bg-white/5"
          style={{
            background: filterMode === 'bullish' ? 'rgba(0,255,136,0.12)' : 'rgba(0,255,136,0.05)',
            borderColor: filterMode === 'bullish' ? 'rgba(0,255,136,0.4)' : '#1a2a44',
          }}
          onClick={() => { setFilterMode(filterMode === 'bullish' ? 'all' : 'bullish'); setSortCol('score'); setSortDesc(true) }}
        >
          <div className="text-xs text-gray-500 mb-1">利多股票</div>
          <div className="text-2xl font-bold" style={{ color: '#00ff88' }}>
            {data?.stocks.filter(s => s.score > 0).length || 0}
          </div>
        </div>
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-auto rounded-lg border" style={{ borderColor: '#1a2a44', background: 'rgba(10,15,26,0.5)' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0" style={{ background: 'rgba(15,25,35,0.98)' }}>
            <tr className="border-b" style={{ borderColor: '#1a2a44' }}>
              <SortHeader col="name" label="股票" />
              <SortHeader col="score" label="风口分" />
              <SortHeader col="change_pct" label="涨跌幅" />
              <SortHeader col="price" label="现价" />
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: '#7a8aa0' }}>评分趋势</th>
              <SortHeader col="news_count" label="新闻" />
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: '#7a8aa0' }}>新闻类型</th>
            </tr>
          </thead>
          <tbody>
            {sortedStocks.map((stock, idx) => {
              const isPositive = stock.score > 0
              const scoreColor = isPositive ? '#00ff88' : '#ff6b6b'
              const intlCount = stock.news.filter(n => n.type === 'international').length
              const domCount = stock.news.filter(n => n.type === 'domestic').length

              return (
                <tr
                  key={stock.code}
                  className="border-b cursor-pointer transition-colors hover:bg-white/5"
                  style={{ borderColor: '#1a2a44' }}
                  onClick={() => setSelectedStock(stock)}
                >
                  {/* 股票 */}
                  <td className="px-3 py-2.5">
                    <div className="font-medium" style={{ color: '#e0e6f0' }}>{stock.name}</div>
                    <div className="text-xs text-gray-500 font-mono">{stock.code}</div>
                  </td>
                  {/* 风口分 */}
                  <td className="px-3 py-2.5">
                    <span className="font-bold text-lg font-mono" style={{ color: scoreColor }}>
                      {stock.score > 0 ? '+' : ''}{stock.score}
                    </span>
                  </td>
                  {/* 涨跌幅 */}
                  <td className="px-3 py-2.5">
                    <div className={`flex items-center gap-1 font-medium ${stock.change_pct >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {stock.change_pct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {stock.change_pct > 0 ? '+' : ''}{stock.change_pct.toFixed(2)}%
                    </div>
                  </td>
                  {/* 现价 */}
                  <td className="px-3 py-2.5 font-mono" style={{ color: '#e0e6f0' }}>
                    {stock.price > 0 ? `¥${stock.price.toFixed(2)}` : '-'}
                  </td>
                  {/* 评分趋势 */}
                  <td className="px-3 py-2.5 w-36">
                    <ScoreBar score={stock.score} />
                  </td>
                  {/* 新闻数 */}
                  <td className="px-3 py-2.5 text-center">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>
                      {stock.news.length}
                    </span>
                  </td>
                  {/* 新闻类型 */}
                  <td className="px-3 py-2.5">
                    <div className="flex gap-2">
                      {intlCount > 0 && (
                        <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                          <Globe className="w-2.5 h-2.5" /> {intlCount}
                        </span>
                      )}
                      {domCount > 0 && (
                        <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}>
                          <Shield className="w-2.5 h-2.5" /> {domCount}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {sortedStocks.length === 0 && (
          <div className="flex items-center justify-center h-48 text-gray-500">
            暂无数据
          </div>
        )}
      </div>

      {/* 弹窗 */}
      {selectedStock && (
        <NewsDetailModal stock={selectedStock} onClose={() => setSelectedStock(null)} />
      )}
    </div>
  )
}
