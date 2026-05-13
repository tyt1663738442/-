import { Target, Flame, TrendingUp, Lock, Clock, Fire, AlertTriangle, ArrowUp, CheckCircle2 } from 'lucide-react'
import type { DaBanStock } from '../types'

interface DaBanPanelProps {
  candidates: DaBanStock[]
  onSelect: (code: string) => void
}

const PHASE_CONFIG = {
  '竞价': { color: '#f59e0b', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: '⚡' },
  '首板': { color: '#f23645', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: '🔥' },
  '一板': { color: '#f23645', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: '1️⃣' },
  '二板+': { color: '#dc2626', bg: 'bg-red-600/10', border: 'border-red-600/30', icon: '2️⃣' },
  '妖股': { color: '#7c3aed', bg: 'bg-purple-500/10', border: 'border-purple-500/30', icon: '👹' },
}

export function DaBanPanel({ candidates, onSelect }: DaBanPanelProps) {
  // 分组
  const sealed = candidates.filter(c => c.is_sealed)
  const approaching = candidates.filter(c => !c.is_sealed && c.distance_to_limit < 3)
  const watching = candidates.filter(c => !c.is_sealed && c.distance_to_limit >= 3)

  // 统计
  const highScore = candidates.filter(c => c.total_score >= 70)
  const mediumScore = candidates.filter(c => c.total_score >= 50 && c.total_score < 70)

  return (
    <div className="space-y-4">
      {/* 打板策略说明 */}
      <div className="bg-[#0d1b3e] rounded-lg p-4 border border-[#f23645]/30">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-[#f23645]/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-[#f23645]" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-[#f23645]">🎯 同花顺打板策略 v2.0</h4>
            <p className="text-sm text-[#8a8d93] mt-1">
              全时段监测：竞价抢筹 → 早盘首板 → 午盘二板 → 尾盘回封
            </p>
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
              <div className="text-[#15b755]">✓ 竞价阶段：9:15-9:25 监测竞价抢筹</div>
              <div className="text-[#15b755]">✓ 早盘阶段：9:25-10:30 首板爆发</div>
              <div className="text-[#15b755]">✓ 午盘阶段：13:00-14:30 二板接力</div>
              <div className="text-[#15b755]">✓ 尾盘阶段：14:30-15:00 回封机会</div>
            </div>
          </div>
        </div>
      </div>

      {/* 实时统计 */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-[#f23645]/10 border border-[#f23645]/30 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-[#8a8d93]">已封板</p>
              <p className="text-2xl font-bold text-[#f23645] mt-1">{sealed.length}</p>
            </div>
            <Lock className="w-5 h-5 text-[#f23645] opacity-50" />
          </div>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-[#8a8d93]">逼近涨停</p>
              <p className="text-2xl font-bold text-yellow-400 mt-1">{approaching.length}</p>
            </div>
            <TrendingUp className="w-5 h-5 text-yellow-400 opacity-50" />
          </div>
        </div>
        <div className="bg-[#16213e] border border-[#2d3748] rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-[#8a8d93]">强烈推荐</p>
              <p className="text-2xl font-bold text-[#f23645] mt-1">{highScore.length}</p>
            </div>
            <Flame className="w-5 h-5 text-[#f23645] opacity-50" />
          </div>
        </div>
        <div className="bg-[#16213e] border border-[#2d3748] rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-[#8a8d93]">候选总数</p>
              <p className="text-2xl font-bold text-white mt-1">{candidates.length}</p>
            </div>
            <Target className="w-5 h-5 text-[#8a8d93] opacity-50" />
          </div>
        </div>
      </div>

      {/* 分组展示 */}
      {sealed.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-[#f23645] font-medium">
            <Lock className="w-4 h-4" />
            <span>已封板 ({sealed.length})</span>
          </div>
          <StockCardList stocks={sealed} onSelect={onSelect} />
        </div>
      )}

      {approaching.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-yellow-400 font-medium">
            <TrendingUp className="w-4 h-4" />
            <span>逼近涨停 ({approaching.length})</span>
          </div>
          <StockCardList stocks={approaching} onSelect={onSelect} />
        </div>
      )}

      {watching.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-[#8a8d93] font-medium">
            <Target className="w-4 h-4" />
            <span>观望池 ({watching.length})</span>
          </div>
          <StockCardList stocks={watching} onSelect={onSelect} />
        </div>
      )}

      {candidates.length === 0 && (
        <div className="bg-[#16213e] rounded-lg p-8 text-center border border-[#2d3748]">
          <Target className="w-12 h-12 mx-auto mb-3 text-[#8a8d93] opacity-50" />
          <p className="text-[#8a8d93]">暂无打板候选股</p>
          <p className="text-xs text-[#718096] mt-1">开盘后自动刷新</p>
        </div>
      )}
    </div>
  )
}

function StockCardList({ stocks, onSelect }: { stocks: DaBanStock[], onSelect: (c: string) => void }) {
  return (
    <div className="bg-[#16213e] rounded-lg overflow-hidden border border-[#2d3748]">
      <div className="bg-[#0d1b3e] px-4 py-2.5">
        <div className="grid grid-cols-13 gap-2 text-xs text-[#8a8d93] font-medium">
          <div className="col-span-1">#</div>
          <div className="col-span-2">名称</div>
          <div className="col-span-1 text-right">现价</div>
          <div className="col-span-1 text-right">涨幅</div>
          <div className="col-span-1 text-right">距涨停</div>
          <div className="col-span-1 text-right">封单</div>
          <div className="col-span-2">阶段</div>
          <div className="col-span-1 text-right">评分</div>
          <div className="col-span-3">理由</div>
        </div>
      </div>
      <div className="divide-y divide-[#1e2d4a]">
        {stocks.map((stock, index) => {
          const phaseCfg = PHASE_CONFIG[stock.phase] || PHASE_CONFIG['首板']
          const scoreColor = stock.total_score >= 70 ? '#f23645' : stock.total_score >= 50 ? '#f59e0b' : '#8a8d93'

          return (
            <div
              key={stock.code}
              onClick={() => onSelect(stock.code)}
              className="grid grid-cols-13 gap-2 px-4 py-2.5 text-sm hover:bg-[#1e2d4a]/50 cursor-pointer transition-colors"
            >
              <div className="col-span-1">
                {stock.is_sealed ? (
                  <Lock className="w-4 h-4 text-[#f23645]" />
                ) : (
                  <span className="text-[#8a8d93] text-xs">{index + 1}</span>
                )}
              </div>
              <div className="col-span-2 flex flex-col">
                <span className={`font-medium ${stock.is_sealed ? 'text-[#f23645] font-bold' : 'text-white'}`}>
                  {stock.name}
                </span>
                <span className="text-[10px] text-[#8a8d93]">{stock.code}</span>
              </div>
              <div className={`col-span-1 text-right font-mono font-bold ${
                stock.change_pct > 0 ? 'text-[#f23645]' : 'text-[#15b755]'
              }`}>
                {stock.price.toFixed(2)}
              </div>
              <div className={`col-span-1 text-right font-mono font-bold ${
                stock.change_pct > 0 ? 'text-[#f23645]' : 'text-[#15b755]'
              }`}>
                {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct.toFixed(2)}%
              </div>
              <div className="col-span-1 text-right text-[#8a8d93] font-mono text-xs">
                {stock.distance_to_limit.toFixed(2)}%
              </div>
              <div className="col-span-1 text-right text-[#f59e0b] font-mono text-xs">
                {stock.seal_amount > 0 ? fmtAmount(stock.seal_amount) + '万' : '--'}
              </div>
              <div className="col-span-2 flex items-center">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border ${phaseCfg.bg} ${phaseCfg.border}`}
                  style={{ color: phaseCfg.color }}>
                  <span>{phaseCfg.icon}</span>
                  <span>{stock.phase}</span>
                  {stock.board_count > 1 && <span className="text-[10px] opacity-70">×{stock.board_count}</span>}
                </span>
              </div>
              <div className="col-span-1 flex justify-end">
                <span className="font-mono font-bold" style={{ color: scoreColor }}>
                  {stock.total_score.toFixed(0)}
                </span>
              </div>
              <div className="col-span-3 text-[#8a8d93] text-xs truncate">
                {stock.reason}
                {stock.time_to_seal && stock.time_to_seal !== '--' && (
                  <span className="ml-1 text-[#f59e0b]">({stock.time_to_seal})</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function fmtAmount(v: number): string {
  if (v >= 10000) return (v / 10000).toFixed(1) + '亿'
  return v.toFixed(0)
}
