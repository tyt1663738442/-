import { useEffect, useState, useCallback } from 'react'
import { Zap, Clock, RefreshCw, AlertTriangle, TrendingUp, Target, Lock, Flame, ArrowUpDown, Newspaper, BarChart3 } from 'lucide-react'

const API_BASE = 'http://localhost:8000'

interface AuctionStock {
  code: string
  name: string
  price: number
  pre_close: number
  change_pct: number        // 涨幅%
  auction_turnover: number  // 成交额（万元）
  signal: string            // '极强'|'强'|'中'|'弱'|'观望'|'极弱'
  score: number             // 0-100 总分
  sector: string
  board_count: number
  net_ratio: number         // 主力净买入占比%
  net_amount: number        // 主力净买入额（万元）
  next_day_prob: number     // 次日打板概率%
  // 5维评分明细
  change_score?: number     // 涨幅分 (0-30)
  main_force_score?: number // 主力抢筹分 (0-25)
  amount_score?: number     // 竞价金额分 (0-20)
  volume_score?: number     // 竞价成交量分 (0-15)
  sector_score?: number     // 板块效应分 (0-10)
  sector_change?: number    // 板块今日涨跌幅（%）
  float_cap?: number        // 流通市值（亿）
  mkt_cap?: number          // 总市值（亿）
  turnover_pct?: number     // 换手率%
}

interface Props {
  onSelectStock?: (code: string) => void
}

// 科技风配色
const SIGNAL_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  '极强': { label: '极强', color: '#ff4d6d', bg: 'rgba(255,77,109,0.15)', border: 'rgba(255,77,109,0.3)' },
  '强':  { label: '强',   color: '#ff8c42', bg: 'rgba(255,140,66,0.12)', border: 'rgba(255,140,66,0.25)' },
  '中':  { label: '中',   color: '#ffd700', bg: 'rgba(255,215,0,0.1)', border: 'rgba(255,215,0,0.2)' },
  '弱':  { label: '弱',   color: '#7a8aa0', bg: 'rgba(122,138,160,0.1)', border: 'rgba(122,138,160,0.2)' },
  '观望':{ label: '观望', color: '#7a8aa0', bg: 'rgba(122,138,160,0.1)', border: 'rgba(122,138,160,0.2)' },
  '极弱':{ label: '极弱', color: '#00ff88', bg: 'rgba(0,255,136,0.1)', border: 'rgba(0,255,136,0.2)' },
}

const SIGNAL_ORDER: Record<string, number> = {
  '极强': 6, '强': 5, '中': 4, '弱': 3, '观望': 2, '极弱': 1,
}

type FilterTab = 'all' | 'sealed' | 'hot' | 'recommended' | 'high_prob'

type SortKey = 'change_pct' | 'score' | 'signal' | 'net_amount' | 'next_day_prob' | 'volume_score' | 'sector_score'

const FILTER_TABS: { key: FilterTab; label: string; icon: React.ReactNode; color: string; desc: string }[] = [
  { key: 'all',          label: '全部',       icon: <Target className="w-4 h-4" />,     color: '#00d4ff', desc: '' },
  { key: 'sealed',       label: '已涨停',     icon: <Lock className="w-4 h-4" />,        color: '#ff4d6d', desc: '涨幅≥9.5%' },
  { key: 'hot',          label: '强势股',     icon: <TrendingUp className="w-4 h-4" />,  color: '#ffd700', desc: '涨幅5%~9.5%' },
  { key: 'recommended',  label: '强烈推荐',   icon: <Flame className="w-4 h-4" />,       color: '#ff8c42', desc: '评分≥70' },
  { key: 'high_prob',    label: '高概率',     icon: <BarChart3 className="w-4 h-4" />,   color: '#a855f7', desc: '次日概率≥60%' },
]

export function AuctionPanel({ onSelectStock }: Props) {
  const [candidates, setCandidates] = useState<AuctionStock[]>([])
  const [phase, setPhase] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')
  const [strongCount, setStrongCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [fromCache, setFromCache] = useState(true)
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')

  // 排序状态
  const [sortKey, setSortKey] = useState<SortKey>('change_pct')
  const [sortAsc, setSortAsc] = useState(false)

  const fetchAuction = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auction/scan`)
      const data = await res.json()
      setPhase(data.phase || '')
      setCandidates(data.candidates || [])
      setStrongCount(data.strong_count || 0)
      setTotalCount(data.count || 0)
      setFromCache(data.from_cache !== false)
      setLastUpdate(data.time || new Date().toLocaleTimeString())
    } catch (e) {
      console.error('竞价扫描失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAuction()
    const interval = setInterval(fetchAuction, 10000)
    return () => clearInterval(interval)
  }, [fetchAuction])

  // 分组统计
  const sealed = candidates.filter(c => c.change_pct >= 9.5)
  const hot = candidates.filter(c => c.change_pct >= 5 && c.change_pct < 9.5)
  const recommended = candidates.filter(c => c.score >= 70)
  const highProb = candidates.filter(c => (c.next_day_prob || 0) >= 60)

  // 根据筛选过滤
  let filteredList: AuctionStock[]
  switch (activeFilter) {
    case 'sealed':
      filteredList = sealed
      break
    case 'hot':
      filteredList = hot
      break
    case 'recommended':
      filteredList = recommended
      break
    case 'high_prob':
      filteredList = highProb
      break
    default:
      filteredList = candidates
  }

  // 排序
  const displayList = [...filteredList].sort((a, b) => {
    let va: number, vb: number
    if (sortKey === 'change_pct') { va = a.change_pct; vb = b.change_pct }
    else if (sortKey === 'score') { va = a.score; vb = b.score }
    else if (sortKey === 'net_amount') { va = a.net_amount; vb = b.net_amount }
    else if (sortKey === 'next_day_prob') { va = a.next_day_prob || 0; vb = b.next_day_prob || 0 }
    else if (sortKey === 'volume_score') { va = a.turnover_pct || 0; vb = b.turnover_pct || 0 }
    else if (sortKey === 'sector_score') { va = a.sector_change || 0; vb = b.sector_change || 0 }
    else { va = SIGNAL_ORDER[a.signal] || 0; vb = SIGNAL_ORDER[b.signal] || 0 }
    return sortAsc ? va - vb : vb - va
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  const isAuctionTime = phase === '集合竞价'

  const handleRowClick = (stock: AuctionStock) => {
    if (onSelectStock) {
      onSelectStock(stock.code)
    } else {
      window.dispatchEvent(new CustomEvent('qclaw-select-stock', { detail: stock.code }))
    }
  }

  return (
    <div className="h-full flex flex-col p-4 space-y-4 overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a0f1a 0%, #0d1525 100%)' }}>
      {/* 竞价状态栏 - 科技风 */}
      <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
        isAuctionTime
          ? 'border-[#ff4d6d]/30 text-[#ff4d6d]'
          : phase === '连续竞价'
          ? 'border-[#00ff88]/30 text-[#00ff88]'
          : 'border-[#1a2a44] text-[#7a8aa0]'
      }`} style={{
        background: isAuctionTime
          ? 'linear-gradient(90deg, rgba(255,77,109,0.1) 0%, rgba(255,77,109,0.05) 100%)'
          : phase === '连续竞价'
          ? 'linear-gradient(90deg, rgba(0,255,136,0.08) 0%, rgba(0,255,136,0.03) 100%)'
          : 'rgba(13, 21, 37, 0.8)'
      }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full animate-pulse"
            style={{
              background: isAuctionTime ? '#ff4d6d' : '#00ff88',
              boxShadow: `0 0 8px ${isAuctionTime ? '#ff4d6d' : '#00ff88'}`
            }} />
          <Zap className="w-5 h-5" />
          <span className="font-bold tracking-wide">{phase || '数据加载中'}</span>
          {isAuctionTime && (
            <span className="text-xs opacity-70 ml-2">竞价时间 9:15-9:25</span>
          )}
          {!isAuctionTime && phase === '连续竞价' && (
            <span className="text-xs opacity-70 ml-2">实时监控中</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm font-mono">
          <div className="flex items-center gap-2">
            {fromCache ? (
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(122,138,160,0.1)', color: '#7a8aa0' }}>缓存</span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88' }}>实时</span>
            )}
          </div>
          <span style={{ color: '#7a8aa0' }}>{lastUpdate}</span>
        </div>
      </div>

      {/* 筛选按钮 - 科技风卡片 */}
      <div className="grid grid-cols-5 gap-3">
        {FILTER_TABS.map(tab => {
          const isActive = activeFilter === tab.key
          const count = tab.key === 'all' ? totalCount
            : tab.key === 'sealed' ? sealed.length
            : tab.key === 'hot' ? hot.length
            : tab.key === 'recommended' ? recommended.length
            : highProb.length
          return (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className="rounded-xl p-3 text-left transition-all cursor-pointer border"
              style={{
                background: isActive
                  ? `linear-gradient(135deg, rgba(${hexToRgb(tab.color)}, 0.15) 0%, rgba(${hexToRgb(tab.color)}, 0.05) 100%)`
                  : 'rgba(13, 21, 37, 0.6)',
                borderColor: isActive ? `${tab.color}50` : '#1a2a44',
                boxShadow: isActive ? `0 0 20px ${tab.color}20` : 'none'
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium" style={{ color: '#7a8aa0' }}>{tab.label}</p>
                  <p className="text-2xl font-bold mt-1" style={{
                    color: tab.color,
                    textShadow: `0 0 10px ${tab.color}40`
                  }}>{count}</p>
                </div>
                <div style={{ color: isActive ? tab.color : '#7a8aa0' }}>{tab.icon}</div>
              </div>
              {tab.desc && <p className="text-[10px] mt-2" style={{ color: '#5a6a7a' }}>{tab.desc}</p>}
            </button>
          )
        })}
      </div>

      {/* 打板策略说明 - 科技风 */}
      <div className="rounded-xl p-4 border" style={{
        background: 'linear-gradient(90deg, rgba(255,77,109,0.08) 0%, rgba(168,85,247,0.05) 100%)',
        borderColor: 'rgba(255,77,109,0.2)'
      }}>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg flex-shrink-0" style={{ background: 'rgba(255,77,109,0.15)' }}>
            <AlertTriangle className="w-5 h-5" style={{ color: '#ff4d6d' }} />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold tracking-wide" style={{ color: '#ff4d6d' }}>竞价打板评分体系 v4.0（5维） + 次日打板概率</h4>
            <p className="text-sm mt-1" style={{ color: '#7a8aa0' }}>
              全市场扫描（{totalCount}只），主力动能+涨幅动能+成交活跃度综合分析
            </p>
            <div className="grid grid-cols-5 gap-2 mt-3 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#ff4d6d', boxShadow: '0 0 4px #ff4d6d' }} />
                <span style={{ color: '#ff4d6d' }}>涨幅（30分）</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#ff4d6d', boxShadow: '0 0 4px #ff4d6d' }} />
                <span style={{ color: '#ff4d6d' }}>主力抢筹（25分）</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#ff8c42', boxShadow: '0 0 4px #ff8c42' }} />
                <span style={{ color: '#ff8c42' }}>金额（20分）</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#ff8c42', boxShadow: '0 0 4px #ff8c42' }} />
                <span style={{ color: '#ff8c42' }}>成交量（15分）</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#ff8c42', boxShadow: '0 0 4px #ff8c42' }} />
                <span style={{ color: '#ff8c42' }}>板块（10分）</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 可滚动表格区域 */}
      <div className="flex-1 min-h-0 overflow-hidden rounded-xl border" style={{
        background: 'rgba(13, 21, 37, 0.8)',
        borderColor: '#1a2a44'
      }}>
        {loading ? (
          <div className="space-y-3 p-4">
            {[1,2,3].map(i => (
              <div key={i} className="rounded-lg p-4 animate-pulse" style={{ background: 'rgba(26, 42, 68, 0.5)' }}>
                <div className="h-4 rounded w-24 mb-3" style={{ background: '#2a3a55' }} />
                {[1,2,3].map(j => <div key={j} className="h-10 rounded mb-1" style={{ background: '#2a3a55' }} />)}
              </div>
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-12">
            <Target className="w-16 h-16 mb-4" style={{ color: '#2a3a55' }} />
            <p style={{ color: '#7a8aa0' }}>
              {isAuctionTime ? '竞价数据采集中，请稍候...' : '非竞价时间段，暂无数据'}
            </p>
            <p className="text-xs mt-2" style={{ color: '#5a6a7a' }}>竞价时间：9:15-9:25</p>
          </div>
        ) : (
          <div className="h-full flex flex-col overflow-hidden">
            {/* 当前筛选标题 */}
            <div className="flex items-center justify-between px-4 py-2 border-b shrink-0" style={{ borderColor: '#1a2a44', background: 'rgba(10, 15, 26, 0.5)' }}>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#00d4ff' }}>
                <span>{FILTER_TABS.find(t => t.key === activeFilter)?.label || '全部'}</span>
                <span className="text-xs opacity-60">({displayList.length}只)</span>
              </div>
              {activeFilter !== 'all' && (
                <button
                  onClick={() => setActiveFilter('all')}
                  className="text-xs transition-colors"
                  style={{ color: '#00d4ff' }}
                >
                  返回全部
                </button>
              )}
            </div>

            {/* 表格 */}
            <div className="flex-1 overflow-y-auto">
              {/* 表头 */}
              <div className="sticky top-0 z-10 grid gap-1 px-4 py-2.5 text-[11px] font-bold border-b shrink-0"
                   style={{
                     gridTemplateColumns: '1.5fr 2.5fr 1.3fr 1.4fr 1.2fr 1.6fr 1.6fr 1fr 1.2fr 1fr 1fr 1fr 1fr 1fr',
                     background: 'rgba(13, 21, 37, 0.95)',
                     borderColor: '#1a2a44',
                     color: '#7a8aa0'
                   }}>
                <div className="text-right">现价</div>
                <div className="pl-2">名称</div>
                <div className="text-right cursor-pointer hover:text-white select-none flex items-center justify-end gap-0.5"
                     onClick={() => toggleSort('change_pct')}>
                  涨幅 <ArrowUpDown className="w-3 h-3" style={{ opacity: sortKey === 'change_pct' ? 1 : 0.3 }} />
                </div>
                <div className="text-right">成交额</div>
                <div className="text-center cursor-pointer hover:text-white select-none flex items-center justify-center gap-0.5"
                     onClick={() => toggleSort('signal')}>
                  信号 <ArrowUpDown className="w-3 h-3" style={{ opacity: sortKey === 'signal' ? 1 : 0.3 }} />
                </div>
                <div className="text-right cursor-pointer hover:text-white select-none flex items-center justify-end gap-0.5"
                     onClick={() => toggleSort('net_amount')}>
                  主力净买 <ArrowUpDown className="w-3 h-3" style={{ opacity: sortKey === 'net_amount' ? 1 : 0.3 }} />
                </div>
                <div className="text-right cursor-pointer hover:text-white select-none flex items-center justify-end gap-0.5"
                     onClick={() => toggleSort('next_day_prob')}>
                  次日概率 <ArrowUpDown className="w-3 h-3" style={{ opacity: sortKey === 'next_day_prob' ? 1 : 0.3 }} />
                </div>
                <div className="text-right cursor-pointer hover:text-white select-none flex items-center justify-end gap-0.5"
                     onClick={() => toggleSort('score')}>
                  总分 <ArrowUpDown className="w-3 h-3" style={{ opacity: sortKey === 'score' ? 1 : 0.3 }} />
                </div>
                <div className="text-right" style={{ color: '#ff4d6d80' }}>涨幅分</div>
                <div className="text-right" style={{ color: '#ff4d6d80' }}>抢筹分</div>
                <div className="text-right" style={{ color: '#ff8c4280' }}>金额分</div>
                <div className="text-right cursor-pointer hover:text-white select-none flex items-center justify-end gap-0.5"
                     onClick={() => toggleSort('volume_score')}>
                  量能<ArrowUpDown className="w-3 h-3" style={{ opacity: sortKey === 'volume_score' ? 1 : 0.3 }} />
                </div>
                <div className="text-right cursor-pointer hover:text-white select-none flex items-center justify-end gap-0.5"
                     onClick={() => toggleSort('sector_score')}>
                  板块<ArrowUpDown className="w-3 h-3" style={{ opacity: sortKey === 'sector_score' ? 1 : 0.3 }} />
                </div>
              </div>

              {/* 数据行 */}
              {displayList.map((stock, index) => {
                const cfg = SIGNAL_CONFIG[stock.signal] || SIGNAL_CONFIG['弱']
                return <StockRow key={stock.code} stock={stock} index={index} cfg={cfg} onClick={() => handleRowClick(stock)} />
              })}

              {displayList.length === 0 && (
                <div className="py-16 text-center text-sm" style={{ color: '#5a6a7a' }}>
                  该筛选条件下暂无股票
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// 辅助函数：将十六进制颜色转换为RGB
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (result) {
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
  }
  return '255, 255, 255'
}

function StockRow({ stock, index, cfg, onClick }: { stock: AuctionStock; index: number; cfg: typeof SIGNAL_CONFIG[string]; onClick: () => void }) {
  const isUp = stock.change_pct >= 0
  const color = isUp ? '#ff4d6d' : '#00b826'
  const scoreColor = stock.score >= 70 ? '#ff4d6d' : stock.score >= 50 ? '#ff8c42' : '#7a8aa0'
  const netColor = stock.net_amount >= 0 ? '#ff4d6d' : '#00b826'

  // 次日概率颜色
  const prob = stock.next_day_prob || 0
  const probColor = prob >= 70 ? '#ff4d6d' : prob >= 50 ? '#ff8c42' : prob >= 30 ? '#ffd700' : '#7a8aa0'
  const probBarWidth = Math.min(prob, 100)

  return (
    <div
      className="grid gap-1 px-4 py-2.5 text-sm cursor-pointer transition-all border-t"
      onClick={onClick}
      style={{
        gridTemplateColumns: '1.5fr 2.5fr 1.3fr 1.4fr 1.2fr 1.6fr 1.6fr 1fr 1.2fr 1fr 1fr 1fr 1fr 1fr',
        background: index % 2 === 0 ? 'rgba(13, 21, 37, 0.3)' : 'transparent',
        borderColor: '#1a2a44'
      }}
    >
      <div className="text-right font-mono font-bold" style={{ color }}>
        {stock.price > 0 ? stock.price.toFixed(2) : '--'}
      </div>
      <div className="flex flex-col pl-2">
        <span className="font-medium" style={{ color: stock.change_pct >= 9.5 ? '#ff4d6d' : '#e0e6f0' }}>
          {stock.name}
        </span>
        <span className="text-[10px]" style={{ color: '#5a6a7a' }}>{stock.code}</span>
      </div>
      <div className="text-right font-mono font-bold" style={{ color }}>
        {isUp ? '+' : ''}{stock.change_pct.toFixed(2)}%
      </div>
      <div className="text-right font-mono text-xs" style={{ color: '#ff8c42' }}>
        {stock.auction_turnover > 0 ? fmtAmount(stock.auction_turnover) : '--'}
      </div>
      <div className="flex justify-center">
        <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold border"
          style={{ background: cfg.bg, borderColor: cfg.border, color: cfg.color }}>
          {cfg.label}
        </span>
      </div>
      <div className="text-right font-mono text-xs font-bold" style={{ color: netColor }}>
        {stock.net_amount !== undefined && stock.net_amount !== 0
          ? (stock.net_amount > 0 ? '+' : '') + fmtAmount(Math.abs(stock.net_amount))
          : '--'}
      </div>
      {/* 次日概率 - 带进度条 */}
      <div className="flex flex-col items-end justify-center gap-0.5">
        <span className="font-mono font-bold text-xs" style={{ color: probColor }}>
          {prob.toFixed(0)}%
        </span>
        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: '#1a2a44' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${probBarWidth}%`, backgroundColor: probColor, opacity: 0.8 }}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <span className="font-mono font-bold" style={{ color: scoreColor }}>
          {stock.score.toFixed(0)}
        </span>
      </div>
      {/* 5维评分明细 */}
      <ScoreCell value={stock.change_score} max={30} color='#ff4d6d' />
      <ScoreCell value={stock.main_force_score} max={25} color='#ff4d6d' />
      <ScoreCell value={stock.amount_score} max={20} color='#ff8c42' />
      {/* 量能分(换手率) - 显示实际数据 */}
      <div className="flex flex-col items-end justify-center gap-0.5">
        <span className="font-mono text-[10px] font-bold" style={{ color: (stock.turnover_pct || 0) > 0 ? '#ff8c42' : '#2a3a55' }}>
          {(stock.turnover_pct || 0).toFixed(2)}%
        </span>
        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: '#1a2a44' }}>
          <div className="h-full rounded-full" style={{
            width: `${Math.min((stock.turnover_pct || 0) / 5 * 100, 100)}%`,
            backgroundColor: '#ff8c42',
            opacity: (stock.turnover_pct || 0) > 0 ? 0.7 : 0.15
          }} />
        </div>
      </div>
      {/* 板块分(板块涨跌幅) - 显示实际数据 */}
      <div className="flex flex-col items-end justify-center gap-0.5">
        <span className="font-mono text-[10px] font-bold" style={{ color: (stock.sector_change || 0) >= 0 ? '#ff4d6d' : '#00b826' }}>
          {(stock.sector_change || 0) >= 0 ? '+' : ''}{(stock.sector_change || 0).toFixed(1)}%
        </span>
        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: '#1a2a44' }}>
          <div className="h-full rounded-full" style={{
            width: `${Math.min(Math.abs(stock.sector_change || 0) / 5 * 100, 100)}%`,
            backgroundColor: (stock.sector_change || 0) >= 0 ? '#ff4d6d' : '#00b826',
            opacity: (stock.sector_change || 0) !== 0 ? 0.7 : 0.15
          }} />
        </div>
      </div>
    </div>
  )
}

function ScoreCell({ value, max, color }: { value?: number; max: number; color: string }) {
  const v = value ?? 0
  const pct = max > 0 ? (v / max) * 100 : 0
  return (
    <div className="flex flex-col items-end justify-center gap-0.5">
      <span className="font-mono text-[10px] font-bold" style={{ color: v > 0 ? color : '#2a3a55' }}>
        {v.toFixed(0)}
      </span>
      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: '#1a2a44' }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color, opacity: v > 0 ? 0.7 : 0.15 }}
        />
      </div>
    </div>
  )
}

function fmtAmount(v: number): string {
  if (v >= 10000) return (v / 10000).toFixed(1) + '亿'
  if (v >= 1) return v.toFixed(0) + '万'
  return '0'
}
