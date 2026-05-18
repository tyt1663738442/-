/**
 * 最强风口 v2 - 新闻驱动股票评分
 * 分层情绪分析：政策/行业/资金/业绩/宏观/个股
 */
import { useState, useEffect, useCallback } from 'react'
import { X, TrendingUp, TrendingDown, Globe, Shield, FileText, ArrowUpDown, RefreshCw, Zap, TrendingUpIcon, TrendingDownIcon } from 'lucide-react'

// ============== 类型定义 ==============
type NewsType = 'all' | 'policy' | 'industry' | 'macro' | 'fund' | 'earnings' | 'stock' | 'general'
type Sentiment = 'bullish' | 'bearish' | 'neutral'

interface ScoreBreakdown {
  bullish: number
  bearish: number
  by_type?: Record<string, number>
}

interface NewsItem {
  title: string
  source: string
  type: string
  sentiment: Sentiment
  force_level?: string
  base_score?: number
  score_change?: number
  force_multiplier?: number
  datetime?: string
  impact_reason?: string
}

interface HotStock {
  code: string
  name: string
  price: number
  change_pct: number
  score: number
  news: NewsItem[]
  sector: string
  score_breakdown?: ScoreBreakdown
}

interface HotTrendResponse {
  stocks: HotStock[]
  news_count: number
  update_time: string
}

type SortColumn = 'score' | 'change_pct' | 'price' | 'name' | 'news_count' | null

// ============== 常量 ==============
const NEWS_TYPE_LABELS: Record<string, string> = {
  policy: '政策',
  industry: '行业',
  macro: '国际',
  fund: '资金',
  earnings: '业绩',
  stock: '个股',
  general: '通用',
}

const NEWS_TYPE_COLORS: Record<string, string> = {
  policy: '#06b6d4',
  industry: '#a855f7',
  macro: '#f59e0b',
  fund: '#10b981',
  earnings: '#ec4899',
  stock: '#6366f1',
  general: '#7a8aa0',
}

const FORCE_LABELS: Record<string, string> = {
  national: '国家级',
  ministerial: '部位级',
  local: '地方级',
  industry: '行业级',
  unknown: '一般',
}

// ============== 评分进度条 ==============
function ScoreBar({ score, max = 50 }: { score: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (Math.abs(score) / max) * 100))
  const isPositive = score >= 0
  const color = isPositive
    ? (score >= 30 ? '#00ff88' : score >= 10 ? '#ffd700' : '#7a8aa0')
    : '#ff6b6b'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: isPositive
              ? `linear-gradient(90deg, rgba(0,255,136,0.4), ${color})`
              : `linear-gradient(90deg, rgba(255,107,107,0.4), ${color})`,
          }}
        />
      </div>
      <span className="text-xs font-mono w-10 text-right" style={{ color }}>
        {isPositive ? '+' : ''}{score}
      </span>
    </div>
  )
}

// ============== 分数构成条 ==============
function ScoreBreakdownBar({ breakdown }: { breakdown?: ScoreBreakdown }) {
  if (!breakdown) return null
  const total = breakdown.bullish + breakdown.bearish
  if (total === 0) return null

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.05)' }}>
        {breakdown.bullish > 0 && (
          <div
            style={{
              width: `${(breakdown.bullish / total) * 100}%`,
              background: '#00ff88',
            }}
          />
        )}
        {breakdown.bearish > 0 && (
          <div
            style={{
              width: `${(breakdown.bearish / total) * 100}%`,
              background: '#ff6b6b',
            }}
          />
        )}
      </div>
      {breakdown.by_type && Object.keys(breakdown.by_type).length > 0 && (
        <div className="flex gap-1">
          {Object.entries(breakdown.by_type).slice(0, 3).map(([type, val]) => (
            <span
              key={type}
              className="text-xs px-1 py-0.5 rounded"
              style={{
                background: `${NEWS_TYPE_COLORS[type] || '#7a8aa0'}20`,
                color: NEWS_TYPE_COLORS[type] || '#7a8aa0',
                fontSize: '9px',
              }}
            >
              {NEWS_TYPE_LABELS[type] || type}:{Math.round(val)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ============== 新闻类型标签 ==============
function NewsTypeTag({ type }: { type: string }) {
  const color = NEWS_TYPE_COLORS[type] || '#7a8aa0'
  const label = NEWS_TYPE_LABELS[type] || type
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded font-medium"
      style={{ background: `${color}20`, color, fontSize: '10px' }}
    >
      {label}
    </span>
  )
}

// ============== 力度标签 ==============
function ForceLevelTag({ level }: { level?: string }) {
  if (!level || level === 'unknown') return null
  const labels: Record<string, string> = {
    national: '🏛️国家级',
    ministerial: '📋部位级',
    local: '🏢地方级',
    industry: '🏭行业级',
  }
  return (
    <span className="text-xs" style={{ color: '#7a8aa0' }}>
      {labels[level] || level}
    </span>
  )
}

// ============== 新闻详情弹窗 ==============
function NewsDetailModal({ stock, onClose }: { stock: HotStock; onClose: () => void }) {
  const intlNews = stock.news.filter(n => n.type === 'macro')
  const policyNews = stock.news.filter(n => n.type === 'policy')
  const industryNews = stock.news.filter(n => n.type === 'industry' || n.type === 'earnings' || n.type === 'fund')
  const stockNews = stock.news.filter(n => n.type === 'stock' || n.type === 'general')
  const bullishNews = stock.news.filter(n => n.sentiment === 'bullish')
  const bearishNews = stock.news.filter(n => n.sentiment === 'bearish')

  const breakdown = stock.score_breakdown
  const bullishTotal = breakdown?.bullish || 0
  const bearishTotal = breakdown?.bearish || 0

  const renderNewsSection = (title: string, items: NewsItem[], icon: React.ReactNode, color: string) => {
    if (items.length === 0) return null
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span style={{ color }}>{icon}</span>
          <span className="text-sm font-medium" style={{ color }}>{title}（{items.length}条）</span>
        </div>
        <div className="space-y-2">
          {items.map((n, i) => (
            <div
              key={i}
              className="p-3 rounded-lg border"
              style={{
                background: `${color}08`,
                borderColor: `${color}25`,
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  n.sentiment === 'bullish' ? 'bg-green-500/20 text-green-400' :
                  n.sentiment === 'bearish' ? 'bg-red-500/20 text-red-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {n.sentiment === 'bullish' ? '📈利多' : n.sentiment === 'bearish' ? '📉利空' : '➡️中性'}
                </span>
                <span className="text-xs text-gray-500">{n.source}</span>
                <ForceLevelTag level={n.force_level} />
                {n.score_change !== undefined && (
                  <span className={`text-xs font-mono ml-auto ${n.score_change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {n.score_change >= 0 ? '+' : ''}{n.score_change}
                  </span>
                )}
                {n.datetime && <span className="text-xs text-gray-600">{n.datetime}</span>}
              </div>
              <p className="text-sm" style={{ color: '#e0e6f0' }}>{n.title}</p>
              {n.impact_reason && (
                <p className="text-xs mt-1.5 px-2 py-1 rounded" style={{ background: `${color}10`, color: '#7a8aa0' }}>
                  💡 {n.impact_reason}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border"
        style={{
          background: 'linear-gradient(180deg, #0f1923 0%, #0a1520 100%)',
          borderColor: '#1a2a44',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b" style={{ borderColor: '#1a2a44', background: 'rgba(10,15,26,0.95)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#00d4ff' }}>
              {stock.name} <span className="text-sm font-mono text-gray-400">{stock.code}</span>
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#7a8aa0' }}>{stock.sector}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg transition-colors hover:bg-white/5">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* 盘面数据 */}
        <div className="grid grid-cols-5 gap-4 p-4 border-b" style={{ borderColor: '#1a2a44' }}>
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
            <div className="text-lg font-bold" style={{ color: stock.score >= 0 ? '#00ff88' : '#ff6b6b' }}>
              {stock.score > 0 ? '+' : ''}{stock.score}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">利多/利空</div>
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="font-bold text-green-400">+{bullishNews.length}</span>
              <span className="text-gray-600">/</span>
              <span className="font-bold text-red-400">-{bearishNews.length}</span>
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">利多贡献</div>
            <div className="flex items-center justify-center gap-1">
              <TrendingUpIcon className="w-4 h-4 text-green-400" />
              <span className="font-bold text-green-400">{bullishTotal > 0 ? '+' : ''}{bullishTotal}</span>
            </div>
            <div className="flex items-center justify-center gap-1">
              <TrendingDownIcon className="w-4 h-4 text-red-400" />
              <span className="font-bold text-red-400">-{bearishTotal}</span>
            </div>
          </div>
        </div>

        {/* 分数构成 */}
        {breakdown && (breakdown.bullish > 0 || breakdown.bearish > 0) && (
          <div className="p-4 border-b" style={{ borderColor: '#1a2a44' }}>
            <div className="text-xs font-medium mb-2" style={{ color: '#7a8aa0' }}>分数构成</div>
            <ScoreBreakdownBar breakdown={breakdown} />
            <div className="flex gap-3 mt-2">
              <span className="text-xs text-green-400">+{bullishTotal} 利多贡献</span>
              {bearishTotal > 0 && <span className="text-xs text-red-400">-{bearishTotal} 利空拖累</span>}
              <span className="text-xs ml-auto" style={{ color: '#7a8aa0' }}>
                净分: <span style={{ color: stock.score >= 0 ? '#00ff88' : '#ff6b6b' }}>{stock.score > 0 ? '+' : ''}{stock.score}</span>
              </span>
            </div>
          </div>
        )}

        {/* 新闻详情 */}
        <div className="p-4 space-y-4">
          {renderNewsSection('国内政策', policyNews, <Shield className="w-4 h-4" />, '#06b6d4')}
          {renderNewsSection('国际宏观', intlNews, <Globe className="w-4 h-4" />, '#f59e0b')}
          {renderNewsSection('行业动态', industryNews, <Zap className="w-4 h-4" />, '#a855f7')}
          {renderNewsSection('个股公告', stockNews, <FileText className="w-4 h-4" />, '#6366f1')}

          {stock.news.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              暂无相关新闻
            </div>
          )}
        </div>

        {/* 底部说明 */}
        <div className="p-4 border-t text-xs text-center" style={{ borderColor: '#1a2a44', color: '#7a8aa0' }}>
          政策(20分) · 行业(15分) · 资金(15分) · 业绩(15分) · 国际(15分) · 通用(10分) · 国家级力度×2.5
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
  const [newsTypeFilter, setNewsTypeFilter] = useState<NewsType>('all')
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'bullish' | 'bearish'>('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
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
  const filteredStocks = (data?.stocks || []).filter(s => {
    if (sentimentFilter === 'bullish' && s.score <= 0) return false
    if (sentimentFilter === 'bearish' && s.score >= 0) return false
    if (newsTypeFilter !== 'all') {
      const hasType = s.news.some(n => n.type === newsTypeFilter)
      if (!hasType) return false
    }
    return true
  })

  const sortedStocks = [...filteredStocks].sort((a, b) => {
    if (!sortCol) return 0
    let cmp = 0
    if (sortCol === 'name') cmp = a.name.localeCompare(b.name)
    else if (sortCol === 'change_pct') cmp = a.change_pct - b.change_pct
    else if (sortCol === 'price') cmp = a.price - b.price
    else if (sortCol === 'score') cmp = a.score - b.score
    else if (sortCol === 'news_count') cmp = a.news.length - b.news.length
    return sortDesc ? -cmp : cmp
  })

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) setSortDesc(!sortDesc)
    else { setSortCol(col); setSortDesc(true) }
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
    bullishCount: data?.stocks.filter(s => s.score > 0).length || 0,
  }

  const typeFilters: { key: NewsType; label: string; color: string }[] = [
    { key: 'all', label: '全部', color: '#7a8aa0' },
    { key: 'policy', label: '政策', color: '#06b6d4' },
    { key: 'industry', label: '行业', color: '#a855f7' },
    { key: 'macro', label: '国际', color: '#f59e0b' },
    { key: 'fund', label: '资金', color: '#10b981' },
    { key: 'earnings', label: '业绩', color: '#ec4899' },
  ]

  return (
    <div className="h-full flex flex-col p-4 gap-3 overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#00d4ff' }}>最强风口</h1>
          <p className="text-xs mt-0.5" style={{ color: '#7a8aa0' }}>
            分层评分 v2 · 数据更新: {data?.update_time || '-'}
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

      {/* 类型过滤 */}
      <div className="flex gap-2 shrink-0 overflow-x-auto pb-1">
        {typeFilters.map(f => (
          <button
            key={f.key}
            onClick={() => setNewsTypeFilter(f.key)}
            className="px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all"
            style={{
              background: newsTypeFilter === f.key ? `${f.color}25` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${newsTypeFilter === f.key ? `${f.color}60` : '#1a2a44'}`,
              color: newsTypeFilter === f.key ? f.color : '#7a8aa0',
            }}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setSentimentFilter(sentimentFilter === 'bullish' ? 'all' : 'bullish')}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
            style={{
              background: sentimentFilter === 'bullish' ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${sentimentFilter === 'bullish' ? 'rgba(0,255,136,0.5)' : '#1a2a44'}`,
              color: sentimentFilter === 'bullish' ? '#00ff88' : '#7a8aa0',
            }}
          >
            📈利多
          </button>
          <button
            onClick={() => setSentimentFilter(sentimentFilter === 'bearish' ? 'all' : 'bearish')}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
            style={{
              background: sentimentFilter === 'bearish' ? 'rgba(255,107,107,0.15)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${sentimentFilter === 'bearish' ? 'rgba(255,107,107,0.5)' : '#1a2a44'}`,
              color: sentimentFilter === 'bearish' ? '#ff6b6b' : '#7a8aa0',
            }}
          >
            📉利空
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        <div
          className="p-3 rounded-lg border cursor-pointer transition-all hover:bg-white/5"
          style={{
            background: sortCol === 'score' && sentimentFilter === 'all' && newsTypeFilter === 'all' ? 'rgba(0,212,255,0.12)' : 'rgba(0,212,255,0.05)',
            borderColor: sortCol === 'score' && sentimentFilter === 'all' && newsTypeFilter === 'all' ? 'rgba(0,212,255,0.4)' : '#1a2a44',
          }}
          onClick={() => { setNewsTypeFilter('all'); setSentimentFilter('all'); handleSort('score') }}
        >
          <div className="text-xs text-gray-500 mb-1">风口股票</div>
          <div className="text-2xl font-bold" style={{ color: '#00d4ff' }}>{stats.total}</div>
        </div>
        <div className="p-3 rounded-lg border" style={{ background: 'rgba(168,85,247,0.05)', borderColor: '#1a2a44' }}>
          <div className="text-xs text-gray-500 mb-1">平均分数</div>
          <div className="text-2xl font-bold" style={{ color: '#a855f7' }}>{stats.avgScore}</div>
        </div>
        <div className="p-3 rounded-lg border" style={{ background: 'rgba(245,158,11,0.05)', borderColor: '#1a2a44' }}>
          <div className="text-xs text-gray-500 mb-1">采集新闻</div>
          <div className="text-2xl font-bold" style={{ color: '#f59e0b' }}>{stats.newsCount}</div>
        </div>
        <div className="p-3 rounded-lg border cursor-pointer transition-all hover:bg-white/5"
          style={{
            background: stats.bullishCount > 0 ? 'rgba(0,255,136,0.08)' : 'rgba(0,255,136,0.03)',
            borderColor: '#1a2a44',
          }}
          onClick={() => { setNewsTypeFilter('all'); setSentimentFilter('bullish') }}
        >
          <div className="text-xs text-gray-500 mb-1">利多股票</div>
          <div className="text-2xl font-bold" style={{ color: '#00ff88' }}>{stats.bullishCount}</div>
        </div>
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-auto rounded-lg border" style={{ borderColor: '#1a2a44', background: 'rgba(10,15,26,0.5)' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10" style={{ background: 'rgba(15,25,35,0.98)' }}>
            <tr className="border-b" style={{ borderColor: '#1a2a44' }}>
              <SortHeader col="name" label="股票" />
              <SortHeader col="score" label="风口分" />
              <SortHeader col="change_pct" label="涨跌幅" />
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: '#7a8aa0' }}>分数构成</th>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: '#7a8aa0' }}>类型分布</th>
              <SortHeader col="news_count" label="新闻" />
            </tr>
          </thead>
          <tbody>
            {sortedStocks.map((stock) => {
              const scoreColor = stock.score > 0 ? '#00ff88' : stock.score < 0 ? '#ff6b6b' : '#7a8aa0'
              const breakdown = stock.score_breakdown
              const typeCount: Record<string, number> = {}
              stock.news.forEach(n => { typeCount[n.type] = (typeCount[n.type] || 0) + 1 })

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
                  {/* 分数构成 */}
                  <td className="px-3 py-2.5 w-40">
                    <ScoreBreakdownBar breakdown={breakdown} />
                  </td>
                  {/* 类型分布 */}
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(typeCount).slice(0, 4).map(([type, cnt]) => (
                        <NewsTypeTag key={type} type={type} />
                      ))}
                    </div>
                  </td>
                  {/* 新闻数 */}
                  <td className="px-3 py-2.5 text-center">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>
                      {stock.news.length}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {sortedStocks.length === 0 && (
          <div className="flex items-center justify-center h-48 text-gray-500">
            暂无数据，请尝试调整筛选条件
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
