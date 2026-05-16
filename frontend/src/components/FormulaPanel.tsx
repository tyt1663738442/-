import { useEffect, useState, useCallback } from 'react'
import { Zap, Target, Flame, TrendingUp, AlertTriangle, ArrowUpDown, RefreshCw, ChevronDown } from 'lucide-react'

const API_BASE = 'http://localhost:8000'

interface FormulaStock {
  code: string
  name: string
  price: number
  pre_close: number
  change_pct: number
  auction_turnover: number   // 万元
  turnover_pct: number       // 换手率%
  float_cap: number          // 流通市值（亿）
  score: number              // 公式匹配得分 0-100
  formula_id: number
}

const FORMULAS = [
  {
    id: 1,
    name: '竞价爆量选谷',
    icon: <Flame className="w-4 h-4" />,
    color: '#f23645',
    desc: '金额>3000万 | 涨幅0~3% | 市值<200亿 | 主板非ST',
    conditions: ['竞价金额 > 3000万', '竞价涨幅 0% ~ 3%', '流通市值 < 200亿', '主板 / 非ST'],
  },
  {
    id: 2,
    name: '竞价抓首板选谷',
    icon: <Target className="w-4 h-4" />,
    color: '#f97316',
    desc: '昨日非涨停/跌停 + 前日非涨停 | 金额>350万 | 涨幅3~6%',
    conditions: ['昨日非涨停 + 昨日非跌停', '前日非涨停', '竞价金额 > 350万', '竞价涨幅 3% ~ 6%', '换手率 > 0.1%'],
  },
  {
    id: 3,
    name: '竞价爆量抢筹选谷',
    icon: <TrendingUp className="w-4 h-4" />,
    color: '#eab308',
    desc: '涨幅3~6% | 金额>2500万 | 换手>0.1% | 主力抢筹(j>d)',
    conditions: ['竞价涨幅 3% ~ 6%', '竞价金额 > 2500万', '换手率 > 0.1%', '主力净买入 (j值 > d值)'],
  },
  {
    id: 4,
    name: '竞价异动选谷',
    icon: <Zap className="w-4 h-4" />,
    color: '#a855f7',
    desc: '有异动 | 金额>3000万 | 换手>0.2% | 涨幅0~2% | 市值<130亿',
    conditions: ['竞价异动信号', '竞价金额 > 3000万', '换手率 > 0.2%', '竞价涨幅 0% ~ 2%', '流通市值 < 130亿'],
  },
  {
    id: 5,
    name: '竞价砸盘异动选谷',
    icon: <AlertTriangle className="w-4 h-4" />,
    color: '#15b755',
    desc: '砸盘 | 金额>350万 | 跌幅<-4% | 20天振幅<30%',
    conditions: ['竞价砸盘信号', '竞价金额 > 350万', '竞价跌幅 < -4%', '过去20天区间振幅 < 30%'],
  },
]

type SortKey = 'score' | 'change_pct' | 'auction_turnover' | 'turnover_pct'

export function FormulaPanel() {
  const [activeFormula, setActiveFormula] = useState(1)
  const [candidates, setCandidates] = useState<FormulaStock[]>([])
  const [phase, setPhase] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortAsc, setSortAsc] = useState(false)

  const formula = FORMULAS.find(f => f.id === activeFormula)!

  const fetchScan = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/auction/formula?formula_id=${activeFormula}`)
      const data = await res.json()
      setCandidates(data.candidates || [])
      setPhase(data.phase || '')
      setLastUpdate(data.time || new Date().toLocaleTimeString())
    } catch (e) {
      console.error('公式扫描失败:', e)
    } finally {
      setLoading(false)
    }
  }, [activeFormula])

  useEffect(() => { fetchScan() }, [fetchScan])

  // 排序
  const displayList = [...candidates].sort((a, b) => {
    let va: number, vb: number
    if (sortKey === 'score') { va = a.score; vb = b.score }
    else if (sortKey === 'change_pct') { va = a.change_pct; vb = b.change_pct }
    else if (sortKey === 'auction_turnover') { va = a.auction_turnover; vb = b.auction_turnover }
    else { va = a.turnover_pct; vb = b.turnover_pct }
    return sortAsc ? va - vb : vb - va
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: '#f23645' }}>
          <Zap className="w-5 h-5" />
          五大竞价选股公式
        </h3>
        <button onClick={fetchScan} className="flex items-center gap-1.5 text-xs text-[#718096] hover:text-white transition-colors">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 公式选择器 */}
      <div className="grid grid-cols-5 gap-2">
        {FORMULAS.map(f => {
          const isActive = activeFormula === f.id
          return (
            <button
              key={f.id}
              onClick={() => { setActiveFormula(f.id); setSortKey('score'); setSortAsc(false) }}
              className={`rounded-lg p-2.5 text-left transition-all cursor-pointer ${
                isActive
                  ? `border-2 ring-1` : 'bg-[#16213e] border-[#2d3748] hover:bg-[#1e2d4a]/80'
              }`}
              style={isActive ? { borderColor: f.color, backgroundColor: `${f.color}/10`, boxShadow: `0 0 12px ${f.color}/20` } : {}}
            >
              <div className="flex items-center justify-between">
                <span style={{ color: isActive ? f.color : '#8a8d93' }}>{f.icon}</span>
                <span className="text-[10px] font-bold" style={{ color: isActive ? f.color : '#4a5568' }}>#{f.id}</span>
              </div>
              <p className="text-xs font-bold mt-1 truncate" style={{ color: isActive ? '#fff' : '#8a8d93' }}>{f.name}</p>
            </button>
          )
        })}
      </div>

      {/* 当前公式详情 */}
      <div className="bg-[#0d1b3e] rounded-lg p-4 border" style={{ borderColor: `${formula.color}/40` }}>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: `${formula.color}/20` }}>
            <span style={{ color: formula.color }}>{formula.icon}</span>
          </div>
          <div className="flex-1">
            <h4 className="font-bold" style={{ color: formula.color }}>#{formula.id} {formula.name}</h4>
            <p className="text-sm text-[#8a8d93] mt-0.5">{formula.desc}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1 mt-2">
              {formula.conditions.map((cond, i) => (
                <div key={i} className="flex items-center gap-1 text-[11px]" style={{ color: `${formula.color}/80` }}>
                  <span className="w-1 h-1 rounded-full" style={{ backgroundColor: formula.color }} />
                  {cond}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 结果统计 */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-bold" style={{ color: formula.color }}>{candidates.length} 只</span>
          <span className="text-[#718096]">符合条件</span>
          <span className="text-[10px] text-[#4a5568]">|</span>
          <span className="text-xs text-[#718096]">{phase || '--'} · {lastUpdate}</span>
        </div>
      </div>

      {/* 表格 */}
      {loading && candidates.length === 0 ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="bg-[#16213e] rounded-lg p-4 animate-pulse">
              <div className="h-4 bg-[#2d3748] rounded w-24 mb-3" />
              {[1,2,3].map(j => <div key={j} className="h-10 bg-[#2d3748] rounded mb-1" />)}
            </div>
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <div className="bg-[#16213e] rounded-lg p-12 text-center border border-[#2d3748]">
          <Target className="w-12 h-12 mx-auto mb-3 text-[#8a8d93] opacity-50" />
          <p className="text-[#8a8d93]">当前无符合条件的股票</p>
          <p className="text-xs text-[#718096] mt-1">交易时间内数据更丰富</p>
        </div>
      ) : (
        <div className="bg-[#16213e] rounded-lg overflow-hidden border border-[#2d3748]"
             style={{ maxHeight: 'calc(100vh - 420px)', minHeight: '300px', overflowY: 'auto' }}>
          {/* 表头 */}
          <div className="sticky top-0 z-10 grid gap-1 px-4 py-2.5 bg-[#0d1b3e] text-[11px] text-[#8a8d93] font-bold border-b border-[#2d3748]"
               style={{ gridTemplateColumns: '1.5fr 2.5fr 1.5fr 1.5fr 1.5fr 1.5fr 1.5fr 1.5fr' }}>
            <div className="text-right">现价</div>
            <div className="pl-2">名称</div>
            <div className="text-right cursor-pointer hover:text-white select-none flex items-center justify-end gap-0.5"
                 onClick={() => toggleSort('change_pct')}>
              涨幅 <ArrowUpDown className="w-3 h-3" style={{ opacity: sortKey === 'change_pct' ? 1 : 0.3 }} />
            </div>
            <div className="text-right cursor-pointer hover:text-white select-none flex items-center justify-end gap-0.5"
                 onClick={() => toggleSort('auction_turnover')}>
              竞价金额 <ArrowUpDown className="w-3 h-3" style={{ opacity: sortKey === 'auction_turnover' ? 1 : 0.3 }} />
            </div>
            <div className="text-right cursor-pointer hover:text-white select-none flex items-center justify-end gap-0.5"
                 onClick={() => toggleSort('turnover_pct')}>
              换手率 <ArrowUpDown className="w-3 h-3" style={{ opacity: sortKey === 'turnover_pct' ? 1 : 0.3 }} />
            </div>
            <div className="text-right">市值(亿)</div>
            <div className="text-right cursor-pointer hover:text-white select-none flex items-center justify-end gap-0.5"
                 onClick={() => toggleSort('score')}>
              匹配度 <ArrowUpDown className="w-3 h-3" style={{ opacity: sortKey === 'score' ? 1 : 0.3 }} />
            </div>
            <div className="text-right">操作</div>
          </div>

          {/* 数据行 */}
          {displayList.map((stock, index) => {
            const isUp = stock.change_pct >= 0
            const color = isUp ? '#f23645' : '#15b755'
            const scorePct = Math.min(stock.score, 100)
            return (
              <div
                key={stock.code}
                className="grid gap-1 px-4 py-2.5 text-sm hover:bg-[#1e2d4a]/50 cursor-pointer transition-colors border-t border-[#1e2d4a]/50"
                style={{ gridTemplateColumns: '1.5fr 2.5fr 1.5fr 1.5fr 1.5fr 1.5fr 1.5fr 1.5fr' }}
                onClick={() => window.dispatchEvent(new CustomEvent('qclaw-select-stock', { detail: stock.code }))}
              >
                <div className="text-right font-mono font-bold" style={{ color }}>
                  {stock.price > 0 ? stock.price.toFixed(2) : '--'}
                </div>
                <div className="flex flex-col pl-2">
                  <span className={`font-medium ${stock.change_pct >= 9.5 ? 'text-[#f23645] font-bold' : 'text-white'}`}>
                    {stock.name}
                  </span>
                  <span className="text-[10px] text-[#8a8d93]">{stock.code}</span>
                </div>
                <div className={`text-right font-mono font-bold`} style={{ color }}>
                  {isUp ? '+' : ''}{stock.change_pct.toFixed(2)}%
                </div>
                <div className="text-right text-[#f59e0b] font-mono text-xs">
                  {fmtAmount(stock.auction_turnover)}
                </div>
                <div className="text-right text-[#a855f7] font-mono text-xs">
                  {stock.turnover_pct > 0 ? stock.turnover_pct.toFixed(2) + '%' : '--'}
                </div>
                <div className="text-right text-[#718096] font-mono text-xs">
                  {stock.float_cap > 0 ? stock.float_cap.toFixed(0) : '--'}
                </div>
                {/* 匹配度进度条 */}
                <div className="flex flex-col items-end justify-center gap-0.5">
                  <span className="font-mono font-bold text-xs" style={{ color: formula.color }}>
                    {stock.score.toFixed(0)}
                  </span>
                  <div className="w-full h-1.5 rounded-full bg-[#2d3748] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${scorePct}%`,
                        backgroundColor: formula.color,
                        opacity: 0.8,
                      }}
                    />
                  </div>
                </div>
                <div className="flex justify-center">
                  <ChevronDown className="w-4 h-4 text-[#4a5568]" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function fmtAmount(v: number): string {
  if (v >= 10000) return (v / 10000).toFixed(1) + '亿'
  if (v >= 1) return v.toFixed(0) + '万'
  return '0'
}
