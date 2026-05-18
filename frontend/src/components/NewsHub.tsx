/**
 * 新闻汇总中心 - 统一查看所有新闻
 * 分类：政策 / 国际 / 行业 / 市场资讯
 */
import { useState, useEffect } from 'react'
import { RefreshCw, Globe, Shield, TrendingUp, FileText, ExternalLink, Clock } from 'lucide-react'

const API_BASE = 'http://localhost:8000'

// 配色
const COLOR_BG = '#0a0f1a'
const COLOR_CARD = '#1a1d26'
const COLOR_BORDER = '#2a2d35'
const COLOR_TEXT = '#e0e6f0'
const COLOR_TEXT_DIM = '#7a8aa0'
const COLOR_ACCENT = '#00d4ff'

// 分类配置
const CATEGORY_CONFIG = {
  policy: { icon: '🏛️', label: '国内政策', color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
  macro: { icon: '🌍', label: '国际宏观', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  industry: { icon: '📊', label: '行业动态', color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
  general: { icon: '📰', label: '市场资讯', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
}

interface NewsItem {
  title: string
  time: string
  sentiment: number
  category: string
}

interface CategoryData {
  label: string
  icon: string
  count: number
  avg_sentiment: number
  news: NewsItem[]
}

interface NewsHubResponse {
  total: number
  update_time: string
  categories: Record<string, CategoryData>
  overall_sentiment: number
}

type CategoryKey = 'policy' | 'macro' | 'industry' | 'general' | 'all'

// 情绪指示器
function SentimentBadge({ sentiment }: { sentiment: number }) {
  const isPositive = sentiment > 0.55
  const isNegative = sentiment < 0.45
  const color = isPositive ? '#00ff88' : isNegative ? '#ff6b6b' : '#7a8aa0'
  const label = isPositive ? '利多' : isNegative ? '利空' : '中性'
  
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded font-medium"
      style={{ background: `${color}20`, color, fontSize: '10px' }}
    >
      {label}
    </span>
  )
}

// 单条新闻
function NewsCard({ item, category }: { item: NewsItem; category: string }) {
  const cfg = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.general
  
  // 格式化时间
  const formatTime = (timeStr: string) => {
    if (!timeStr) return '--:--'
    // 处理日期时间格式
    if (timeStr.includes('-') || timeStr.includes('/')) {
      const parts = timeStr.split(' ')
      return parts[1] || parts[0] || timeStr.slice(-5)
    }
    return timeStr.slice(-5)
  }
  
  return (
    <div
      className="p-3 rounded-lg border transition-colors hover:border-opacity-60 cursor-pointer"
      style={{
        background: COLOR_CARD,
        borderColor: COLOR_BORDER,
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1 shrink-0 w-2 h-2 rounded-full"
          style={{ backgroundColor: cfg.color }}
        />
        <div className="flex-1 min-w-0">
          <p
            className="text-sm leading-relaxed"
            style={{ color: COLOR_TEXT }}
          >
            {item.title}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs flex items-center gap-1" style={{ color: COLOR_TEXT_DIM }}>
              <Clock className="w-3 h-3" />
              {formatTime(item.time)}
            </span>
            <SentimentBadge sentiment={item.sentiment} />
          </div>
        </div>
      </div>
    </div>
  )
}

// 分类统计卡片
function CategoryCard({
  category,
  data,
  isActive,
  onClick
}: {
  category: CategoryKey
  data?: CategoryData
  isActive: boolean
  onClick: () => void
}) {
  const cfg = category === 'all' 
    ? { icon: '📋', label: '全部', color: COLOR_ACCENT, bg: `${COLOR_ACCENT}15` }
    : CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG]
  
  const sentimentColor = data 
    ? data.avg_sentiment > 0.55 ? '#00ff88' 
      : data.avg_sentiment < 0.45 ? '#ff6b6b' 
      : '#7a8aa0'
    : COLOR_TEXT_DIM

  return (
    <button
      onClick={onClick}
      className="flex-1 min-w-[120px] p-3 rounded-lg border transition-all text-left"
      style={{
        background: isActive ? cfg.bg : COLOR_CARD,
        borderColor: isActive ? cfg.color : COLOR_BORDER,
        borderWidth: isActive ? '2px' : '1px',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{cfg.icon}</span>
        <span className="text-sm font-medium" style={{ color: isActive ? cfg.color : COLOR_TEXT }}>
          {cfg.label}
        </span>
      </div>
      {data && (
        <>
          <div className="text-2xl font-bold mb-1" style={{ color: cfg.color }}>
            {data.count}
            <span className="text-xs font-normal ml-1" style={{ color: COLOR_TEXT_DIM }}>条</span>
          </div>
          <div className="text-xs" style={{ color: sentimentColor }}>
            情绪 {data.avg_sentiment}
          </div>
        </>
      )}
    </button>
  )
}

export function NewsHub() {
  const [data, setData] = useState<NewsHubResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all')

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/news/all`)
      if (!res.ok) throw new Error('请求失败')
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (e: any) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // 每5分钟自动刷新
    const interval = setInterval(fetchData, 300000)
    return () => clearInterval(interval)
  }, [])

  // 获取当前显示的新闻
  const getDisplayNews = () => {
    if (!data) return []
    if (activeCategory === 'all') {
      // 全部：按时间顺序合并所有分类
      return Object.entries(data.categories)
        .flatMap(([cat, catData]) => 
          catData.news.map(n => ({ ...n, category: cat }))
        )
        .sort((a, b) => {
          // 优先按时间排序
          return b.time.localeCompare(a.time)
        })
    }
    const catData = data.categories[activeCategory]
    return catData ? catData.news.map(n => ({ ...n, category: activeCategory })) : []
  }

  const displayNews = getDisplayNews()

  // 整体情绪
  const getOverallSentiment = () => {
    if (!data) return { color: '#7a8aa0', label: '中性' }
    const s = data.overall_sentiment
    if (s > 0.55) return { color: '#00ff88', label: '偏多' }
    if (s < 0.45) return { color: '#ff6b6b', label: '偏空' }
    return { color: '#7a8aa0', label: '中性' }
  }
  const overall = getOverallSentiment()

  if (loading && !data) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: COLOR_BG }}>
        <div className="text-center">
          <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin" style={{ color: COLOR_ACCENT }} />
          <p className="text-sm" style={{ color: COLOR_TEXT_DIM }}>正在抓取财经新闻...</p>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: COLOR_BG }}>
        <div className="text-center">
          <p className="text-red-400 mb-3">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: COLOR_ACCENT, color: COLOR_BG }}
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-4 gap-4 overflow-hidden" style={{ background: COLOR_BG }}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold" style={{ color: COLOR_ACCENT }}>新闻汇总</h1>
          <p className="text-xs mt-0.5" style={{ color: COLOR_TEXT_DIM }}>
            更新: {data?.update_time || '--:--'}
            <span className="ml-3" style={{ color: overall.color }}>
              市场情绪: {overall.label} ({data?.overall_sentiment || 0.5})
            </span>
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: 'rgba(0,212,255,0.1)',
            border: '1px solid rgba(0,212,255,0.3)',
            color: COLOR_ACCENT,
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 分类卡片 */}
      <div className="flex gap-3 shrink-0 overflow-x-auto pb-1">
        <CategoryCard
          category="all"
          data={data ? {
            label: '全部',
            icon: '📋',
            count: data.total,
            avg_sentiment: data.overall_sentiment,
            news: []
          } : undefined}
          isActive={activeCategory === 'all'}
          onClick={() => setActiveCategory('all')}
        />
        {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
          <CategoryCard
            key={key}
            category={key as CategoryKey}
            data={data?.categories[key]}
            isActive={activeCategory === key}
            onClick={() => setActiveCategory(key as CategoryKey)}
          />
        ))}
      </div>

      {/* 新闻列表 */}
      <div className="flex-1 overflow-y-auto">
        {displayNews.length > 0 ? (
          <div className="space-y-3">
            {displayNews.map((item, idx) => (
              <NewsCard
                key={`${item.category}-${idx}`}
                item={item}
                category={item.category}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-48" style={{ color: COLOR_TEXT_DIM }}>
            暂无新闻数据
          </div>
        )}
      </div>
    </div>
  )
}
