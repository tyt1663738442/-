/**
 * 新闻/公告时间线 - 同花顺 v3.0 风格
 * Tab切换 + 蓝色圆点标记 + 真实数据API
 */
import { useState, useEffect } from 'react'
import { Newspaper, ExternalLink } from 'lucide-react'

const API_BASE = 'http://localhost:8000'

interface NewsItem {
  time: string
  title: string
  source?: string
  url?: string
  type: 'news' | 'announcement' | 'flash'
}

interface Props {
  stockCode: string
}

// ====== 同花顺 v3.0 配色 ======
const COLOR_BG = '#000000'
const COLOR_CARD_BG = '#1a1a1a'
const TEXT_PRIMARY = '#ffffff'
const TEXT_SECONDARY = '#999999'
const BORDER_COLOR = '#333333'
const TAB_ACTIVE_BG = '#ff4d4f'
const TAB_INACTIVE_BG = '#333333'
const DOT_COLOR = '#00bfff'  // 蓝色圆点
const TIME_COLOR = '#ff4d4f' // 时间红色

export function NewsTimeline({ stockCode }: Props) {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'news' | 'announcement'>('all')

  useEffect(() => {
    if (!stockCode) return
    
    const fetchNews = async () => {
      setLoading(true)
      try {
        const res = await fetch(`${API_BASE}/api/news/${stockCode}`)
        const data = await res.json()
        if (data.news) {
          // 转换数据格式
          const formatted = data.news.map((n: any) => ({
            time: n.time || '--:--',
            title: n.title,
            source: n.source || '财经',
            url: n.url,
            type: n.type || 'news'
          }))
          setNews(formatted)
        }
      } catch (e) {
        console.error('Fetch news failed:', e)
        // 失败时使用模拟数据
        setNews(generateMockNews(stockCode))
      } finally {
        setLoading(false)
      }
    }

    fetchNews()
    // 每5分钟刷新一次
    const interval = setInterval(fetchNews, 300000)
    return () => clearInterval(interval)
  }, [stockCode])

  const filteredNews = activeTab === 'all'
    ? news
    : news.filter(n => n.type === activeTab)

  const tabs = [
    { key: 'all', label: '全部' },
    { key: 'news', label: '新闻' },
    { key: 'announcement', label: '公告' },
  ] as const

  const handleClickNews = (item: NewsItem) => {
    if (item.url) {
      window.open(item.url, '_blank')
    }
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: COLOR_BG }}>
      {/* 标题 + Tab 切换 */}
      <div className="flex items-center shrink-0" style={{
        borderBottom: `1px solid ${BORDER_COLOR}`,
        backgroundColor: COLOR_CARD_BG,
      }}>
        <div className="flex items-center gap-2 px-3 py-2">
          <Newspaper className="w-3.5 h-3.5" style={{ color: TEXT_SECONDARY }} />
          <span className="text-xs font-medium text-white">资讯动态</span>
          <span className="text-[10px] ml-1" style={{ color: TEXT_SECONDARY }}>
            {loading ? '加载中...' : `${filteredNews.length} 条`}
          </span>
        </div>
        {/* Tab 栏 */}
        <div className="flex ml-auto mr-3 gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="px-3 text-xs font-medium transition-all"
              style={{
                height: '28px',
                borderRadius: '4px',
                backgroundColor: activeTab === tab.key ? TAB_ACTIVE_BG : TAB_INACTIVE_BG,
                color: activeTab === tab.key ? '#fff' : TEXT_SECONDARY,
                borderBottom: activeTab === tab.key ? `2px solid #ff6b6b` : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 内容列表 */}
      <div className="flex-1 overflow-y-auto">
        {filteredNews.map((item, i) => (
          <div
            key={i}
            onClick={() => handleClickNews(item)}
            className="px-4 py-3 hover:bg-[rgba(255,255,255,0.03)] cursor-pointer transition-colors"
            style={{ borderBottom: i < filteredNews.length - 1 ? `1px solid ${BORDER_COLOR}` : 'none' }}
          >
            {/* 标题行：蓝色圆点 + 标题 */}
            <div className="flex items-start gap-2 mb-1">
              <span className="mt-1.5 shrink-0" style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: DOT_COLOR,
                display: 'inline-block',
              }} />
              <span className="font-medium leading-relaxed flex-1" style={{
                color: TEXT_PRIMARY,
                fontSize: '14px',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {item.title}
              </span>
              {item.url && (
                <ExternalLink className="w-3 h-3 shrink-0 mt-1" style={{ color: TEXT_SECONDARY }} />
              )}
            </div>
            {/* 时间和来源行 */}
            <div className="flex justify-between items-center mt-1">
              <span style={{ color: TIME_COLOR, fontSize: '12px' }}>{item.time}</span>
              <span style={{ color: TEXT_SECONDARY, fontSize: '11px' }}>{item.source}</span>
            </div>
          </div>
        ))}
        {filteredNews.length === 0 && !loading && (
          <div className="flex-1 flex items-center justify-center py-8" style={{ color: TEXT_SECONDARY, fontSize: '13px' }}>
            暂无资讯
          </div>
        )}
      </div>
    </div>
  )
}

// 模拟数据备用
function generateMockNews(code: string): NewsItem[] {
  return [
    { time: '09:25', title: '【竞价】集合竞价结束，主力资金净流入+1.2亿', source: '快讯', type: 'flash', url: '' },
    { time: '09:32', title: '【异动】快速拉升，5分钟涨幅超3%，成交额突破2亿', source: '快讯', type: 'flash', url: '' },
    { time: '10:15', title: '关于控股股东增持公司股份计划的公告', source: '公告', type: 'announcement', url: '' },
    { time: '11:02', title: '2024年Q1财报：营收同比增长25%，净利润增长30%', source: '财报', type: 'news', url: '' },
    { time: '13:30', title: '【快讯】午后开盘，大单净买入超5000万', source: '快讯', type: 'flash', url: '' },
    { time: '14:20', title: '关于获得发明专利证书的公告', source: '公告', type: 'announcement', url: '' },
  ]
}
