import { Target, Flame, TrendingUp, AlertCircle, ArrowRight } from 'lucide-react'
import type { DaBanStock } from '../types'

interface DaBanPanelProps {
  candidates: DaBanStock[]
  onSelect: (code: string) => void
}

export function DaBanPanel({ candidates, onSelect }: DaBanPanelProps) {
  const highScore = candidates.filter(c => c.score >= 70)
  const mediumScore = candidates.filter(c => c.score >= 50 && c.score < 70)

  return (
    <div className="space-y-4">
      {/* 说明 */}
      <div className="bg-[#16213e] rounded-lg p-4 border border-[#e74c3c]/30">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-[#e74c3c]/20 rounded-lg">
            <AlertCircle className="w-5 h-5 text-[#e74c3c]" />
          </div>
          <div>
            <h4 className="font-medium text-[#e74c3c]">打板策略说明</h4>
            <p className="text-sm text-[#718096] mt-1">
              筛选条件：涨停价附近(&lt;5%)、涨幅&gt;5%、成交量活跃。综合评分考虑距离涨停幅度、量比、封单金额等因素。
            </p>
          </div>
        </div>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#2d3748]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#718096]">强烈推荐</p>
              <p className="text-2xl font-bold text-[#ef4444] mt-1">{highScore.length}</p>
            </div>
            <div className="p-2 bg-red-500/20 rounded-lg">
              <Flame className="w-5 h-5 text-[#ef4444]" />
            </div>
          </div>
        </div>
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#2d3748]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#718096]">值得关注</p>
              <p className="text-2xl font-bold text-[#f59e0b] mt-1">{mediumScore.length}</p>
            </div>
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <TrendingUp className="w-5 h-5 text-[#f59e0b]" />
            </div>
          </div>
        </div>
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#2d3748]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#718096]">候选总数</p>
              <p className="text-2xl font-bold text-white mt-1">{candidates.length}</p>
            </div>
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Target className="w-5 h-5 text-blue-400" />
            </div>
          </div>
        </div>
      </div>

      {/* 候选列表 */}
      {candidates.length === 0 ? (
        <div className="bg-[#16213e] rounded-lg p-8 text-center border border-[#2d3748]">
          <Target className="w-12 h-12 mx-auto mb-3 text-[#718096] opacity-50" />
          <p className="text-[#718096]">暂无打板候选股</p>
        </div>
      ) : (
        <div className="bg-[#16213e] rounded-lg overflow-hidden border border-[#2d3748]">
          <div className="bg-[#0f3460] px-4 py-3">
            <h3 className="text-sm font-medium text-white">打板候选股</h3>
          </div>
          
          <div className="divide-y divide-[#2d3748]">
            {candidates.map((candidate, index) => (
              <div
                key={candidate.code}
                onClick={() => onSelect(candidate.code)}
                className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm hover:bg-[#1a4a7a]/30 cursor-pointer transition-colors"
              >
                <div className="col-span-1">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${
                    index === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                    index === 1 ? 'bg-gray-400/20 text-gray-300' :
                    index === 2 ? 'bg-orange-600/20 text-orange-400' :
                    'bg-[#2d3748] text-[#718096]'
                  }`}>
                    {index + 1}
                  </span>
                </div>
                <div className="col-span-2">
                  <div className="font-medium text-white">{candidate.name}</div>
                  <div className="text-xs text-[#718096]">{candidate.code}</div>
                </div>
                <div className={`col-span-1 text-right font-bold ${
                  candidate.change_percent >= 0 ? 'text-[#ef4444]' : 'text-[#22c55e]'
                }`}>
                  {candidate.price.toFixed(2)}
                </div>
                <div className={`col-span-1 text-right ${
                  candidate.change_percent >= 0 ? 'text-[#ef4444]' : 'text-[#22c55e]'
                }`}>
                  {candidate.change_percent >= 0 ? '+' : ''}{candidate.change_percent.toFixed(2)}%
                </div>
                <div className="col-span-1 text-right text-[#22c55e]">
                  {candidate.distance_to_limit.toFixed(2)}%
                </div>
                <div className="col-span-1 text-right text-[#a0aec0]">
                  {candidate.volume_ratio.toFixed(1)}
                </div>
                <div className="col-span-1 text-right text-[#a0aec0]">
                  {formatAmount(candidate.seal_amount)}万
                </div>
                <div className="col-span-2 text-right">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${
                    candidate.score >= 70 ? 'bg-red-500/20 text-[#ef4444]' :
                    candidate.score >= 50 ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-[#2d3748] text-[#718096]'
                  }`}>
                    {candidate.score.toFixed(1)}
                  </span>
                </div>
                <div className="col-span-3 flex justify-end">
                  <button className="inline-flex items-center gap-1 px-3 py-1 bg-[#e74c3c] hover:bg-[#c0392b] text-white text-xs rounded transition-colors">
                    详情 <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function formatAmount(v: number): string {
  if (v >= 10000) return (v / 10000).toFixed(2)
  return v.toFixed(2)
}
