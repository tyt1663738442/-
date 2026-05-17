/**
 * 复盘分析面板 - 连板质量矩阵评分
 * 基于真实市场数据，按连板质量矩阵评分规则评分 (25~72分)
 */
import { useState, useEffect, useMemo } from 'react'
import { TrendingUp, Flame, Target, DollarSign, Award, ChevronDown, ChevronUp, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, X, BarChart2, Zap, Layers, Activity } from 'lucide-react'

// ===== 配色 =====
const COLOR_UP = '#ff4d4f'
const COLOR_DOWN = '#00b826'
const COLOR_CARD = '#111d33'
const COLOR_BORDER = '#1a2a44'
const COLOR_TEXT = '#e0e6f0'
const COLOR_TEXT_SEC = '#7a8aa0'
const COLOR_CYAN = '#00d4ff'
const COLOR_GOLD = '#fbbf24'

const API_BASE = 'http://localhost:8000'

interface ScoredStock {
  code: string
  name: string
  price: number
  change_pct: number
  boards: number
  sector: string
  base_score: number
  quality_score: number
  heat_score: number
  leader_score: number
  depth_bonus: number
  multi_bonus: number
  theme_total: number
  fund_score: number
  inflow_ratio: number
  total_score: number
  grade: string
  is_leader: boolean
  depth: number
  sector_limit_count: number
  amount: number
  signal: string
}

interface ReviewStats {
  total: number
  s_count: number
  a_count: number
  b_count?: number
  c_count?: number
  avg_score: string
  avg_inflow: string
}

type SortColumn = 'grade' | 'boards' | 'base_score' | 'quality_score' | 'heat_score' | 'leader_score' | 'depth_bonus' | 'theme_total' | 'fund_score' | 'total_score' | 'price' | 'change_pct' | null
type SortDirection = 'asc' | 'desc'

// ====== 个股深度分析弹窗 ======
function StockAnalysisModal({ stock, onClose }: { stock: ScoredStock; onClose: () => void }) {
  // 5维评分：基础分、质地、热度、龙头、资金
  const dims = [
    { label: '基础分', value: stock.base_score, max: 18, color: '#00d4ff' },
    { label: '质地', value: stock.quality_score, max: 10, color: '#fbbf24' },
    { label: '热度', value: stock.heat_score, max: 8, color: '#ff4d4f' },
    { label: '龙头', value: stock.leader_score, max: 8, color: '#a78bfa' },
    { label: '资金', value: stock.fund_score, max: 10, color: '#00ff88' },
  ]

  const gradeColor = (g: string) => {
    switch (g) {
      case 'S': return COLOR_GOLD
      case 'A': return COLOR_UP
      case 'B': return '#a78bfa'
      default: return COLOR_TEXT_SEC
    }
  }

  // 逻辑分析文案生成
  const getLogicText = () => {
    const lines: { icon: string; text: string; color: string }[] = []

    // 连板分析
    if (stock.boards >= 5) {
      lines.push({ icon: '🔥', text: `${stock.boards}连板强势标的，市场高度注意`, color: COLOR_UP })
    } else if (stock.boards >= 3) {
      lines.push({ icon: '📈', text: `${stock.boards}连板趋势延续，连板效应显著`, color: COLOR_UP })
    } else if (stock.boards >= 2) {
      lines.push({ icon: '📊', text: `${stock.boards}连板，具备一定惯性，关注量能配合`, color: COLOR_GOLD })
    } else {
      lines.push({ icon: '📌', text: `首板标的，关注是否有连板潜力`, color: COLOR_TEXT_SEC })
    }

    // 龙头分析
    if (stock.is_leader) {
      lines.push({ icon: '👑', text: `板块龙头地位，享有溢价效应（+${stock.leader_score}分）`, color: COLOR_GOLD })
    } else if (stock.depth_bonus > 0) {
      lines.push({ icon: '🏆', text: `板块梯队完整（${stock.depth}层），跟车机会好（+${stock.depth_bonus}分）`, color: '#a78bfa' })
    }

    // 题材质地分析
    if (stock.quality_score >= 10) {
      lines.push({ icon: '🎯', text: `大题材加持（质地满分10分），板块景气度高`, color: COLOR_GOLD })
    } else if (stock.quality_score >= 8) {
      lines.push({ icon: '🎪', text: `中等题材，板块有一定热度（质地${stock.quality_score}分）`, color: COLOR_TEXT })
    } else {
      lines.push({ icon: '⚠️', text: `题材质地偏弱（${stock.quality_score}分），注意情绪退潮风险`, color: COLOR_DOWN })
    }

    // 热度分析
    if (stock.heat_score >= 8) {
      lines.push({ icon: '🌡️', text: `板块热度极高（满分），同板块涨停家数多`, color: COLOR_UP })
    } else if (stock.heat_score >= 6) {
      lines.push({ icon: '🌡️', text: `板块热度较好（${stock.heat_score}分），情绪氛围良好`, color: COLOR_GOLD })
    } else {
      lines.push({ icon: '❄️', text: `板块热度一般（${stock.heat_score}分），需关注情绪变化`, color: COLOR_TEXT_SEC })
    }

    // 资金分析
    if (stock.fund_score >= 8) {
      lines.push({ icon: '💰', text: `主力资金净流入强劲（+${stock.fund_score}分），机构积极参与`, color: COLOR_UP })
    } else if (stock.fund_score >= 3) {
      lines.push({ icon: '💵', text: `资金流入温和（+${stock.fund_score}分），散户博弈为主`, color: COLOR_TEXT })
    } else if (stock.fund_score < 0) {
      lines.push({ icon: '🚨', text: `资金流出（${stock.fund_score}分），主力可能减仓，谨慎追涨`, color: COLOR_DOWN })
    }

    // 综合评级解读
    if (stock.grade === 'S') {
      lines.push({ icon: '⭐', text: `综合评级S级（${stock.total_score}分），具备打板核心标的资质`, color: COLOR_GOLD })
    } else if (stock.grade === 'A') {
      lines.push({ icon: '✅', text: `综合评级A级（${stock.total_score}分），较优质连板标的`, color: COLOR_UP })
    } else if (stock.grade === 'B') {
      lines.push({ icon: '🔵', text: `综合评级B级（${stock.total_score}分），一般质量，需结合大盘判断`, color: '#a78bfa' })
    } else {
      lines.push({ icon: '⚪', text: `综合评级C级（${stock.total_score}分），质量偏低，不建议追涨`, color: COLOR_TEXT_SEC })
    }

    return lines
  }

  const logicLines = getLogicText()

  // 涨停信号文案
  const signalMap: Record<string, { text: string; color: string; bg: string }> = {
    '极强': { text: '极强', color: '#ff4d4f', bg: 'rgba(255,77,79,0.15)' },
    '强': { text: '强', color: '#ff7a00', bg: 'rgba(255,122,0,0.15)' },
    '中': { text: '中', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
    '弱': { text: '弱', color: COLOR_TEXT_SEC, bg: 'rgba(122,138,160,0.15)' },
    '观望': { text: '观望', color: COLOR_TEXT_SEC, bg: 'rgba(122,138,160,0.1)' },
  }
  const sig = signalMap[stock.signal] || { text: stock.signal || '--', color: COLOR_TEXT_SEC, bg: 'rgba(122,138,160,0.1)' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          width: 680,
          maxHeight: '90vh',
          background: 'linear-gradient(160deg, #0d1a30 0%, #0a1220 100%)',
          border: `1px solid ${COLOR_BORDER}`,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
          style={{ background: 'linear-gradient(160deg, #0d1a30 0%, #0a1220 100%)', borderBottom: `1px solid ${COLOR_BORDER}` }}>
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 rounded text-xs font-bold"
              style={{ background: `${gradeColor(stock.grade)}20`, color: gradeColor(stock.grade), border: `1px solid ${gradeColor(stock.grade)}40` }}>
              {stock.grade}级
            </span>
            <div>
              <div className="font-bold text-base" style={{ color: COLOR_TEXT }}>{stock.name}</div>
              <div className="text-xs font-mono" style={{ color: COLOR_TEXT_SEC }}>{stock.code}</div>
            </div>
            <div className="flex items-center gap-2 ml-2">
              <span className="font-mono font-bold" style={{ color: stock.change_pct >= 0 ? COLOR_UP : COLOR_DOWN }}>
                {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct.toFixed(2)}%
              </span>
              <span className="font-mono" style={{ color: stock.change_pct >= 0 ? COLOR_UP : COLOR_DOWN }}>
                ¥{stock.price.toFixed(2)}
              </span>
              <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: 'rgba(255,77,79,0.15)', color: COLOR_UP }}>
                {stock.boards}板
              </span>
            </div>
            {stock.is_leader && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: `${COLOR_GOLD}20`, color: COLOR_GOLD }}>龙头</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: sig.bg, color: sig.color }}>
              信号：{sig.text}
            </span>
            <span className="text-2xl font-bold font-mono" style={{ color: gradeColor(stock.grade) }}>{stock.total_score}</span>
            <span className="text-xs" style={{ color: COLOR_TEXT_SEC }}>总分</span>
            <button onClick={onClose} className="p-1 rounded transition-colors hover:bg-white/10">
              <X className="w-4 h-4" style={{ color: COLOR_TEXT_SEC }} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* 评分维度可视化 */}
          <div className="rounded-lg p-4" style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${COLOR_BORDER}` }}>
            <div className="flex items-center gap-1.5 mb-3">
              <BarChart2 className="w-3.5 h-3.5" style={{ color: COLOR_CYAN }} />
              <span className="text-xs font-bold" style={{ color: COLOR_TEXT }}>评分维度拆解</span>
              <span className="text-[10px] ml-auto" style={{ color: COLOR_TEXT_SEC }}>满分：基础18 / 题材30 / 资金10</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {dims.map(d => (
                <div key={d.label} className="flex items-center gap-2">
                  <div className="text-[11px] w-10 shrink-0 text-right" style={{ color: COLOR_TEXT_SEC }}>{d.label}</div>
                  <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(0, d.value < 0 ? 0 : (d.value / d.max) * 100)}%`,
                        background: d.value < 0 ? COLOR_DOWN : `linear-gradient(90deg, ${d.color}88, ${d.color})`,
                        minWidth: d.value > 0 ? 8 : 0,
                      }} />
                  </div>
                  <div className="text-[11px] font-mono w-10 text-right font-bold" style={{ color: d.value < 0 ? COLOR_DOWN : d.color }}>
                    {d.value > 0 ? '+' : ''}{d.value}
                  </div>
                </div>
              ))}
              {/* 梯队加分 */}
              {stock.depth_bonus > 0 && (
                <div className="flex items-center gap-2">
                  <div className="text-[11px] w-10 shrink-0 text-right" style={{ color: COLOR_TEXT_SEC }}>梯队</div>
                  <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(stock.depth_bonus / 8) * 100}%`, background: 'linear-gradient(90deg, #a78bfa88, #a78bfa)' }} />
                  </div>
                  <div className="text-[11px] font-mono w-10 text-right font-bold" style={{ color: '#a78bfa' }}>+{stock.depth_bonus}</div>
                </div>
              )}
            </div>
            {/* 得分汇总条 */}
            <div className="mt-3 pt-3 flex items-center gap-3" style={{ borderTop: `1px solid ${COLOR_BORDER}` }}>
              <div className="text-[11px]" style={{ color: COLOR_TEXT_SEC }}>
                基础<span className="font-mono ml-1" style={{ color: COLOR_CYAN }}>{stock.base_score}</span>
                <span className="mx-1">+</span>
                题材<span className="font-mono ml-1" style={{ color: COLOR_GOLD }}>{stock.theme_total}</span>
                <span className="mx-1">+</span>
                资金<span className="font-mono ml-1" style={{ color: stock.fund_score >= 0 ? COLOR_UP : COLOR_DOWN }}>
                  {stock.fund_score >= 0 ? '+' : ''}{stock.fund_score}
                </span>
                <span className="mx-2">=</span>
                <span className="font-bold text-sm" style={{ color: gradeColor(stock.grade) }}>{stock.total_score}分</span>
              </div>
              <div className="ml-auto text-[10px] px-2 py-0.5 rounded font-bold"
                style={{ background: `${gradeColor(stock.grade)}20`, color: gradeColor(stock.grade) }}>
                {stock.grade === 'S' ? 'S级 ≥55' : stock.grade === 'A' ? 'A级 45~54' : stock.grade === 'B' ? 'B级 35~44' : 'C级 <35'}
              </div>
            </div>
          </div>

          {/* 市场数据 */}
          <div className="grid grid-cols-2 gap-3">
            {/* 盘面数据 */}
            <div className="rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${COLOR_BORDER}` }}>
              <div className="flex items-center gap-1.5 mb-3">
                <Activity className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} />
                <span className="text-xs font-bold" style={{ color: COLOR_TEXT }}>盘面数据</span>
              </div>
              <div className="grid grid-cols-2 gap-y-2 gap-x-2 text-[11px]">
                <span style={{ color: COLOR_TEXT_SEC }}>现价</span>
                <span className="font-mono text-right font-bold" style={{ color: stock.change_pct >= 0 ? COLOR_UP : COLOR_DOWN }}>¥{stock.price.toFixed(2)}</span>
                <span style={{ color: COLOR_TEXT_SEC }}>涨幅</span>
                <span className="font-mono text-right" style={{ color: stock.change_pct >= 0 ? COLOR_UP : COLOR_DOWN }}>
                  {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct.toFixed(2)}%
                </span>
                <span style={{ color: COLOR_TEXT_SEC }}>成交额</span>
                <span className="font-mono text-right" style={{ color: COLOR_TEXT }}>
                  {stock.amount >= 10000 ? (stock.amount / 10000).toFixed(2) + '亿' : stock.amount.toFixed(0) + '万'}
                </span>
                <span style={{ color: COLOR_TEXT_SEC }}>主力净流入</span>
                <span className="font-mono text-right" style={{ color: stock.inflow_ratio >= 0 ? COLOR_UP : COLOR_DOWN }}>
                  {stock.inflow_ratio >= 0 ? '+' : ''}{stock.inflow_ratio.toFixed(1)}%
                </span>
                <span style={{ color: COLOR_TEXT_SEC }}>连板数</span>
                <span className="font-mono text-right font-bold" style={{ color: stock.boards >= 3 ? COLOR_UP : COLOR_GOLD }}>
                  {stock.boards}板
                </span>
                <span style={{ color: COLOR_TEXT_SEC }}>梯队深度</span>
                <span className="font-mono text-right" style={{ color: COLOR_TEXT }}>{stock.depth}层</span>
              </div>
            </div>

            {/* 题材与板块 */}
            <div className="rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${COLOR_BORDER}` }}>
              <div className="flex items-center gap-1.5 mb-3">
                <Layers className="w-3.5 h-3.5" style={{ color: COLOR_GOLD }} />
                <span className="text-xs font-bold" style={{ color: COLOR_TEXT }}>题材与板块</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="px-2 py-1 rounded text-[10px] font-bold"
                  style={{ background: 'rgba(0,212,255,0.1)', color: COLOR_CYAN, border: `1px solid ${COLOR_CYAN}30` }}>
                  {stock.sector || '未知板块'}
                </span>
                {stock.is_leader && (
                  <span className="px-2 py-1 rounded text-[10px] font-bold"
                    style={{ background: `${COLOR_GOLD}15`, color: COLOR_GOLD, border: `1px solid ${COLOR_GOLD}30` }}>
                    板块龙头
                  </span>
                )}
                <span className="px-2 py-1 rounded text-[10px]"
                  style={{ background: 'rgba(168,85,247,0.1)', color: '#a78bfa', border: '1px solid rgba(168,85,247,0.2)' }}>
                  同板块{stock.sector_limit_count}只
                </span>
              </div>
              <div className="grid grid-cols-2 gap-y-2 gap-x-2 text-[11px]">
                <span style={{ color: COLOR_TEXT_SEC }}>题材质地</span>
                <span className="font-mono text-right" style={{ color: stock.quality_score >= 8 ? COLOR_GOLD : COLOR_TEXT_SEC }}>
                  {stock.quality_score >= 10 ? '大题材' : stock.quality_score >= 8 ? '中等题材' : '小题材'}（{stock.quality_score}分）
                </span>
                <span style={{ color: COLOR_TEXT_SEC }}>题材热度</span>
                <span className="font-mono text-right" style={{ color: stock.heat_score >= 7 ? COLOR_UP : COLOR_TEXT }}>
                  {stock.heat_score >= 7 ? '极热' : stock.heat_score >= 5 ? '较热' : '一般'}（{stock.heat_score}分）
                </span>
                <span style={{ color: COLOR_TEXT_SEC }}>龙头加分</span>
                <span className="font-mono text-right" style={{ color: stock.leader_score > 0 ? COLOR_GOLD : COLOR_TEXT_SEC }}>
                  {stock.leader_score > 0 ? `+${stock.leader_score}分` : '无'}
                </span>
                <span style={{ color: COLOR_TEXT_SEC }}>题材小计</span>
                <span className="font-mono text-right font-bold" style={{ color: COLOR_CYAN }}>{stock.theme_total}/30分</span>
              </div>
            </div>
          </div>

          {/* 涨停深度逻辑分析 */}
          <div className="rounded-lg p-4" style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${COLOR_BORDER}` }}>
            <div className="flex items-center gap-1.5 mb-3">
              <Zap className="w-3.5 h-3.5" style={{ color: COLOR_UP }} />
              <span className="text-xs font-bold" style={{ color: COLOR_TEXT }}>涨停深度逻辑分析</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded ml-auto"
                style={{ background: `${gradeColor(stock.grade)}15`, color: gradeColor(stock.grade), border: `1px solid ${gradeColor(stock.grade)}30` }}>
                {stock.grade}级标的
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {logicLines.map((line, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
                  <span className="shrink-0">{line.icon}</span>
                  <span style={{ color: line.color }}>{line.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 操作建议 */}
          <div className="rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.2)', border: `1px solid ${COLOR_BORDER}` }}>
            <div className="text-[11px] leading-relaxed" style={{ color: COLOR_TEXT_SEC }}>
              <span className="font-bold" style={{ color: COLOR_TEXT }}>操作建议：</span>
              {stock.grade === 'S' && ' 核心标的，连板逻辑清晰，可积极参与；关注是否有情绪退潮风险，严格止损。'}
              {stock.grade === 'A' && ' 质量较好，可在回调时布局；注意成交量配合，避免高位追涨。'}
              {stock.grade === 'B' && ' 质量一般，建议等待更好的进场时机；若大盘情绪良好可小仓参与。'}
              {stock.grade === 'C' && ' 质量偏低，不建议追涨；若已持有注意及时止盈止损。'}
              <span className="block mt-1 text-[10px]" style={{ color: '#7a8aa040' }}>
                * 以上分析仅供参考，不构成投资建议。股市有风险，投资需谨慎。
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ReviewPanel() {
  const [stocks, setStocks] = useState<ScoredStock[]>([])
  const [stats, setStats] = useState<ReviewStats>({ total: 0, s_count: 0, a_count: 0, avg_score: '0', avg_inflow: '0' })
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [filterGrade, setFilterGrade] = useState<string>('all')
  const [sortColumn, setSortColumn] = useState<SortColumn>('total_score')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [lastUpdate, setLastUpdate] = useState('')
  const [phase, setPhase] = useState('')
  const [selectedStock, setSelectedStock] = useState<ScoredStock | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/review/stocks`)
      const data = await res.json()
      if (data.stocks) setStocks(data.stocks)
      if (data.stats) setStats(data.stats)
      if (data.time) setLastUpdate(data.time)
      if (data.phase) setPhase(data.phase)
    } catch (e) {
      console.error('复盘数据获取失败', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const iv = setInterval(fetchData, 30000)
    return () => clearInterval(iv)
  }, [])

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc')
    } else {
      setSortColumn(col)
      setSortDirection('desc')
    }
  }

  const filteredStocks = useMemo(() => {
    let list = filterGrade === 'all' ? [...stocks] : stocks.filter(s => s.grade === filterGrade)

    if (sortColumn) {
      list.sort((a, b) => {
        let va: number, vb: number
        if (sortColumn === 'grade') {
          const order = { 'S': 4, 'A': 3, 'B': 2, 'C': 1 }
          va = order[a.grade as keyof typeof order] || 0
          vb = order[b.grade as keyof typeof order] || 0
        } else {
          va = (a as any)[sortColumn] as number
          vb = (b as any)[sortColumn] as number
        }
        return sortDirection === 'desc' ? vb - va : va - vb
      })
    }
    return list
  }, [stocks, filterGrade, sortColumn, sortDirection])

  const gradeColor = (g: string) => {
    switch (g) {
      case 'S': return COLOR_GOLD
      case 'A': return COLOR_UP
      case 'B': return COLOR_CYAN
      default: return COLOR_TEXT_SEC
    }
  }

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) return <ArrowUpDown className="w-2.5 h-2.5 inline-block ml-0.5 opacity-30" style={{ color: COLOR_TEXT_SEC }} />
    if (sortDirection === 'desc') return <ArrowDown className="w-2.5 h-2.5 inline-block ml-0.5" style={{ color: COLOR_GOLD }} />
    return <ArrowUp className="w-2.5 h-2.5 inline-block ml-0.5" style={{ color: COLOR_GOLD }} />
  }

  const filterCards = [
    { key: 'all', label: '全部标的', value: stats.total, icon: Flame, color: COLOR_CYAN },
    { key: 'S', label: 'S级标的', value: stats.s_count, icon: Award, color: COLOR_GOLD },
    { key: 'A', label: 'A级标的', value: stats.a_count, icon: TrendingUp, color: COLOR_UP },
    { key: 'B', label: 'B级标的', value: (stats as any).b_count ?? 0, icon: Target, color: '#a78bfa' },
    { key: 'C', label: 'C级标的', value: (stats as any).c_count ?? 0, icon: DollarSign, color: COLOR_TEXT_SEC },
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a0f1a 0%, #0d1525 100%)' }}>
      {/* 个股深度分析弹窗 */}
      {selectedStock && <StockAnalysisModal stock={selectedStock} onClose={() => setSelectedStock(null)} />}
      {/* 顶部标题栏 */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2"
        style={{ borderBottom: `1px solid ${COLOR_BORDER}` }}>
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4" style={{ color: COLOR_GOLD }} />
          <span className="text-sm font-bold" style={{ color: COLOR_TEXT }}>每日市场复盘</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,212,255,0.1)', color: COLOR_CYAN, border: `1px solid ${COLOR_CYAN}30` }}>
            连板质量矩阵
          </span>
          {phase && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: `1px solid rgba(0,255,136,0.3)` }}>
              {phase}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-[11px] font-mono" style={{ color: COLOR_TEXT_SEC }}>{lastUpdate}</span>
          )}
          <button
            onClick={fetchData}
            className="p-1 rounded transition-all"
            style={{ background: 'rgba(0,212,255,0.1)', border: `1px solid ${COLOR_BORDER}` }}
          >
            <RefreshCw className="w-3.5 h-3.5" style={{ color: COLOR_CYAN, opacity: loading ? 0.5 : 1 }} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* 统计卡片 + 筛选 */}
        <div className="grid grid-cols-5 gap-3 px-4 py-3">
          {filterCards.map((card, i) => (
            <div
              key={i}
              onClick={() => setFilterGrade(card.key)}
              className="rounded-lg p-3 flex items-center gap-3 cursor-pointer transition-all"
              style={{
                background: filterGrade === card.key ? `${card.color}18` : COLOR_CARD,
                border: `1px solid ${filterGrade === card.key ? `${card.color}50` : COLOR_BORDER}`,
              }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${card.color}20` }}>
                <card.icon className="w-4.5 h-4.5" style={{ color: card.color }} />
              </div>
              <div>
                <div className="text-lg font-bold font-mono" style={{ color: card.color }}>{loading ? '--' : card.value}</div>
                <div className="text-[10px]" style={{ color: COLOR_TEXT_SEC }}>{card.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 评分规则说明 */}
        <div className="px-4 pb-2">
          <div className="rounded-lg p-3 text-[11px]" style={{ background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}` }}>
            <div className="flex items-center gap-1 mb-2">
              <Target className="w-3 h-3" style={{ color: COLOR_CYAN }} />
              <span className="font-bold" style={{ color: COLOR_TEXT }}>评分规则</span>
            </div>
            <div className="grid grid-cols-4 gap-2" style={{ color: COLOR_TEXT_SEC }}>
              <div>连板基础分: 1板5分 → 5板+18分</div>
              <div>题材评分: 质地+热度+龙头+叠加 (封顶30)</div>
              <div>多题材叠加: 2题材+2~5 / 3题材+2~8</div>
              <div>资金流向: -5 ~ +10 (主力净流入/成交额)</div>
            </div>
          </div>
        </div>

        {/* 筛选提示 */}
        <div className="px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px]" style={{ color: COLOR_TEXT_SEC }}>
            {filterGrade === 'all' ? '显示全部' : `已筛选 ${filterGrade} 级标的`}
          </span>
          <span className="text-[10px]" style={{ color: COLOR_TEXT_SEC }}>· 共{filteredStocks.length}只</span>
          {filterGrade !== 'all' && (
            <button
              onClick={() => setFilterGrade('all')}
              className="text-[10px] px-1.5 py-0.5 rounded ml-1 transition-all"
              style={{ background: `${COLOR_CYAN}15`, color: COLOR_CYAN, border: `1px solid ${COLOR_CYAN}30` }}
            >
              清除筛选
            </button>
          )}
        </div>

        {/* 连板股评分表 */}
        <div className="px-4 pb-4">
          {loading && stocks.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm" style={{ color: COLOR_TEXT_SEC }}>正在加载复盘数据...</div>
            </div>
          ) : filteredStocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Flame className="w-8 h-8" style={{ color: COLOR_TEXT_SEC }} />
              <div className="text-sm" style={{ color: COLOR_TEXT_SEC }}>暂无连板数据</div>
              <div className="text-[10px]" style={{ color: COLOR_TEXT_SEC }}>请在交易时段刷新查看实时复盘</div>
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden" style={{ background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}` }}>
              {/* 表头 */}
              <div className="grid gap-1 px-3 py-2 text-[10px] font-bold select-none"
                style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))', background: 'rgba(0,0,0,0.3)', color: COLOR_TEXT_SEC, borderBottom: `1px solid ${COLOR_BORDER}` }}>
                <div className="col-span-1 cursor-pointer flex items-center" onClick={() => handleSort('grade')}>
                  评级<SortIcon col="grade" />
                </div>
                <div className="col-span-2">股票</div>
                <div className="col-span-1 text-center cursor-pointer flex items-center justify-center" onClick={() => handleSort('price')}>
                  股价<SortIcon col="price" />
                </div>
                <div className="col-span-1 text-center cursor-pointer flex items-center justify-center" onClick={() => handleSort('change_pct')}>
                  涨幅<SortIcon col="change_pct" />
                </div>
                <div className="col-span-1 text-center cursor-pointer flex items-center justify-center" onClick={() => handleSort('boards')}>
                  连板<SortIcon col="boards" />
                </div>
                <div className="col-span-1 text-center cursor-pointer flex items-center justify-center" onClick={() => handleSort('base_score')}>
                  基础分<SortIcon col="base_score" />
                </div>
                <div className="col-span-1 text-center cursor-pointer flex items-center justify-center" onClick={() => handleSort('quality_score')}>
                  质地<SortIcon col="quality_score" />
                </div>
                <div className="col-span-1 text-center cursor-pointer flex items-center justify-center" onClick={() => handleSort('heat_score')}>
                  热度<SortIcon col="heat_score" />
                </div>
                <div className="col-span-1 text-center cursor-pointer flex items-center justify-center" onClick={() => handleSort('leader_score')}>
                  龙头<SortIcon col="leader_score" />
                </div>
                <div className="col-span-1 text-center cursor-pointer flex items-center justify-center" onClick={() => handleSort('depth_bonus')}>
                  梯队<SortIcon col="depth_bonus" />
                </div>
                <div className="col-span-1 text-center cursor-pointer flex items-center justify-center" onClick={() => handleSort('theme_total')}>
                  题材小计<SortIcon col="theme_total" />
                </div>
                <div className="col-span-1 text-center cursor-pointer flex items-center justify-center" onClick={() => handleSort('fund_score')}>
                  资金<SortIcon col="fund_score" />
                </div>
                <div className="col-span-1 text-center cursor-pointer flex items-center justify-center" onClick={() => handleSort('total_score')}>
                  总分<SortIcon col="total_score" />
                </div>
              </div>

              {/* 表体 */}
              {filteredStocks.map((s) => (
                <div key={s.code}>
                  <div
                    className="grid gap-1 px-3 py-2 text-[11px] items-center cursor-pointer transition-colors hover:bg-white/5"
                    style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))', borderBottom: `1px solid ${COLOR_BORDER}` }}
                    onClick={() => setSelectedStock(s)}
                  >
                    <div className="col-span-1">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                        style={{ background: `${gradeColor(s.grade)}20`, color: gradeColor(s.grade) }}>
                        {s.grade}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <div className="font-bold" style={{ color: COLOR_TEXT }}>{s.name}</div>
                      <div className="flex items-center gap-1">
                        <div className="text-[10px] font-mono" style={{ color: COLOR_TEXT_SEC }}>{s.code}</div>
                        {s.is_leader && (
                          <span className="px-1 py-0 rounded text-[9px] font-bold" style={{ background: `${COLOR_GOLD}20`, color: COLOR_GOLD }}>
                            龙头
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="col-span-1 text-center font-mono" style={{ color: s.change_pct >= 0 ? COLOR_UP : COLOR_DOWN }}>
                      {s.price.toFixed(2)}
                    </div>
                    <div className="col-span-1 text-center font-mono" style={{ color: s.change_pct >= 0 ? COLOR_UP : COLOR_DOWN }}>
                      {s.change_pct >= 0 ? '+' : ''}{s.change_pct.toFixed(2)}%
                    </div>
                    <div className="col-span-1 text-center font-bold font-mono" style={{ color: s.boards >= 3 ? COLOR_UP : COLOR_TEXT }}>
                      {s.boards}板
                    </div>
                    <div className="col-span-1 text-center font-mono" style={{ color: COLOR_TEXT_SEC }}>{s.base_score}</div>
                    <div className="col-span-1 text-center font-mono" style={{ color: COLOR_TEXT_SEC }}>{s.quality_score}</div>
                    <div className="col-span-1 text-center font-mono" style={{ color: COLOR_TEXT_SEC }}>{s.heat_score}</div>
                    <div className="col-span-1 text-center font-mono" style={{ color: s.leader_score > 0 ? COLOR_GOLD : COLOR_TEXT_SEC }}>
                      {s.leader_score > 0 ? `+${s.leader_score}` : 0}
                    </div>
                    <div className="col-span-1 text-center font-mono" style={{ color: s.depth_bonus > 0 ? COLOR_CYAN : COLOR_TEXT_SEC }}>
                      {s.depth_bonus > 0 ? `+${s.depth_bonus}` : 0}
                    </div>
                    <div className="col-span-1 text-center font-bold font-mono" style={{ color: COLOR_CYAN }}>{s.theme_total}</div>
                    <div className="col-span-1 text-center font-mono" style={{ color: s.fund_score >= 0 ? COLOR_UP : COLOR_DOWN }}>
                      {s.fund_score >= 0 ? `+${s.fund_score}` : s.fund_score}
                    </div>
                    <div className="col-span-1 text-center flex items-center justify-center gap-0.5">
                      <span className="font-bold font-mono text-sm" style={{ color: gradeColor(s.grade) }}>{s.total_score}</span>
                      <button
                        onClick={e => { e.stopPropagation(); setExpandedRow(expandedRow === s.code ? null : s.code) }}
                        className="ml-0.5 p-0.5 rounded hover:bg-white/10"
                      >
                        {expandedRow === s.code ? <ChevronUp className="w-3 h-3" style={{ color: COLOR_TEXT_SEC }} /> : <ChevronDown className="w-3 h-3" style={{ color: COLOR_TEXT_SEC }} />}
                      </button>
                    </div>
                  </div>

                  {/* 展开详情 */}
                  {expandedRow === s.code && (
                    <div className="px-3 py-2 text-[11px]" style={{ background: 'rgba(0,0,0,0.2)', borderBottom: `1px solid ${COLOR_BORDER}` }}>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="mb-1 font-bold" style={{ color: COLOR_TEXT_SEC }}>题材板块</div>
                          <div className="flex flex-wrap gap-1">
                            <span className="px-1.5 py-0.5 rounded text-[10px]"
                              style={{ background: 'rgba(0,212,255,0.1)', color: COLOR_CYAN, border: `1px solid ${COLOR_CYAN}30` }}>
                              {s.sector || '未知板块'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'rgba(168,85,247,0.1)', color: '#a78bfa' }}>
                              同板块{s.sector_limit_count}只
                            </span>
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 font-bold" style={{ color: COLOR_TEXT_SEC }}>盘面数据</div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                            <span style={{ color: COLOR_TEXT_SEC }}>价格:</span>
                            <span className="font-mono text-right" style={{ color: COLOR_TEXT }}>{s.price.toFixed(2)}</span>
                            <span style={{ color: COLOR_TEXT_SEC }}>涨幅:</span>
                            <span className="font-mono text-right" style={{ color: s.change_pct >= 0 ? COLOR_UP : COLOR_DOWN }}>
                              {s.change_pct >= 0 ? '+' : ''}{s.change_pct.toFixed(2)}%
                            </span>
                            <span style={{ color: COLOR_TEXT_SEC }}>成交额:</span>
                            <span className="font-mono text-right" style={{ color: COLOR_TEXT }}>
                              {s.amount >= 10000 ? (s.amount / 10000).toFixed(2) + '亿' : s.amount.toFixed(0) + '万'}
                            </span>
                            <span style={{ color: COLOR_TEXT_SEC }}>主力净流入:</span>
                            <span className="font-mono text-right" style={{ color: s.inflow_ratio >= 0 ? COLOR_UP : COLOR_DOWN }}>
                              {s.inflow_ratio >= 0 ? '+' : ''}{s.inflow_ratio.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 font-bold" style={{ color: COLOR_TEXT_SEC }}>评分明细</div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                            <span style={{ color: COLOR_TEXT_SEC }}>梯队层数:</span>
                            <span className="font-mono text-right" style={{ color: COLOR_TEXT }}>{s.depth}层</span>
                            <span style={{ color: COLOR_TEXT_SEC }}>信号:</span>
                            <span className="font-mono text-right" style={{ color: COLOR_CYAN }}>{s.signal || '--'}</span>
                            <span style={{ color: COLOR_TEXT_SEC }}>大题材:</span>
                            <span className="font-mono text-right" style={{ color: s.quality_score >= 8 ? COLOR_GOLD : COLOR_TEXT_SEC }}>
                              {s.quality_score >= 10 ? '是' : s.quality_score >= 8 ? '中等' : '否'}
                            </span>
                            <span style={{ color: COLOR_TEXT_SEC }}>龙头:</span>
                            <span className="font-mono text-right" style={{ color: s.is_leader ? COLOR_GOLD : COLOR_TEXT_SEC }}>
                              {s.is_leader ? '是' : '否'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
