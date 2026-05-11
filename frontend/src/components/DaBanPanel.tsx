import { Target, Flame, TrendingUp, AlertCircle, ArrowRight } from 'lucide-react'
import type { DaBanStock } from '../types'

interface DaBanPanelProps {
  candidates: DaBanStock[]
  onSelect: (code: string) => void
}

export function DaBanPanel({ candidates, onSelect }: DaBanPanelProps) {
  // 分类
  const highScore = candidates.filter(c => c.score >= 70)  // 强烈推荐
  const mediumScore = candidates.filter(c => c.score >= 50 && c.score < 70)  // 值得关注
  const lowScore = candidates.filter(c => c.score < 50)  // 观察

  return (
    <div className="space-y-4">
      {/* 说明卡片 */}
      <div className="glass-card p-4 bg-gradient-to-r from-orange-500/10 to-red-500/10 border-orange-500/30">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-orange-500/20 rounded-lg">
            <AlertCircle className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h4 className="font-medium text-orange-400">打板策略说明</h4>
            <p className="text-sm text-gray-400 mt-1">
              筛选条件：涨停价附近(&lt;5%)、涨幅&gt;5%、成交量活跃。综合评分考虑距离涨停幅度、量比、封单金额等因素。
            </p>
          </div>
        </div>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="候选总数"
          value={candidates.length}
          icon={<Target className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="强烈推荐"
          value={highScore.length}
          icon={<Flame className="w-5 h-5" />}
          color="red"
        />
        <StatCard
          title="值得关注"
          value={mediumScore.length}
          icon={<TrendingUp className="w-5 h-5" />}
          color="orange"
        />
        <StatCard
          title="继续观察"
          value={lowScore.length}
          icon={<AlertCircle className="w-5 h-5" />}
          color="gray"
        />
      </div>

      {/* 候选列表 */}
      {candidates.length === 0 ? (
        <div className="glass-card p-8 text-center text-gray-400">
          <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>暂无打板候选股，等待开盘...</p>
          <p className="text-sm mt-2">只在交易时间更新数据</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 强烈推荐 */}
          {highScore.length > 0 && (
            <div className="glass-card overflow-hidden border-red-500/30">
              <div className="px-4 py-3 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2">
                <Flame className="w-5 h-5 text-red-400" />
                <h3 className="font-semibold text-red-400">强烈推荐 ({highScore.length})</h3>
              </div>
              <CandidateTable candidates={highScore} onSelect={onSelect} />
            </div>
          )}

          {/* 值得关注 */}
          {mediumScore.length > 0 && (
            <div className="glass-card overflow-hidden border-orange-500/30">
              <div className="px-4 py-3 bg-orange-500/10 border-b border-orange-500/20 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-orange-400" />
                <h3 className="font-semibold text-orange-400">值得关注 ({mediumScore.length})</h3>
              </div>
              <CandidateTable candidates={mediumScore} onSelect={onSelect} />
            </div>
          )}

          {/* 继续观察 */}
          {lowScore.length > 0 && (
            <div className="glass-card overflow-hidden">
              <div className="px-4 py-3 border-b border-stock-border flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-gray-400" />
                <h3 className="font-semibold text-gray-400">继续观察 ({lowScore.length})</h3>
              </div>
              <CandidateTable candidates={lowScore} onSelect={onSelect} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface CandidateTableProps {
  candidates: DaBanStock[]
  onSelect: (code: string) => void
}

function CandidateTable({ candidates, onSelect }: CandidateTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-stock-bg/50">
          <tr className="text-left text-xs text-gray-400">
            <th className="px-4 py-3 font-medium">排名</th>
            <th className="px-4 py-3 font-medium">股票</th>
            <th className="px-4 py-3 font-medium text-right">当前价</th>
            <th className="px-4 py-3 font-medium text-right">涨跌幅</th>
            <th className="px-4 py-3 font-medium text-right">涨停价</th>
            <th className="px-4 py-3 font-medium text-right">距离涨停</th>
            <th className="px-4 py-3 font-medium text-right">量比</th>
            <th className="px-4 py-3 font-medium text-right">封单金额</th>
            <th className="px-4 py-3 font-medium text-right">综合评分</th>
            <th className="px-4 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stock-border/50">
          {candidates.map((candidate, index) => (
            <tr
              key={candidate.code}
              className="hover:bg-white/5 transition-colors"
            >
              <td className="px-4 py-3">
                <span className={`
                  inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold
                  ${index === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                    index === 1 ? 'bg-gray-400/20 text-gray-300' :
                    index === 2 ? 'bg-orange-600/20 text-orange-400' :
                    'bg-gray-700/50 text-gray-500'}
                `}>
                  {index + 1}
                </span>
              </td>
              <td className="px-4 py-3">
                <div>
                  <div className="font-medium">{candidate.name}</div>
                  <div className="text-xs text-gray-500">{candidate.code}</div>
                </div>
              </td>
              <td className="px-4 py-3 text-right number-font font-medium">
                {candidate.price.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right">
                <span className={`number-font ${candidate.change_percent >= 0 ? 'stock-up' : 'stock-down'}`}>
                  {candidate.change_percent >= 0 ? '+' : ''}{candidate.change_percent.toFixed(2)}%
                </span>
              </td>
              <td className="px-4 py-3 text-right number-font text-gray-300">
                {candidate.limit_up_price.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right">
                <span className={`number-font ${candidate.distance_to_limit < 2 ? 'text-red-400 font-semibold' : 'text-gray-300'}`}>
                  {candidate.distance_to_limit.toFixed(2)}%
                </span>
              </td>
              <td className="px-4 py-3 text-right number-font text-gray-300">
                {candidate.volume_ratio.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right">
                <span className="number-font text-gray-300">
                  {(candidate.seal_amount / 10000).toFixed(2)}万
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className={`
                  inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold
                  ${candidate.score >= 70 ? 'bg-red-500/20 text-red-400' :
                    candidate.score >= 50 ? 'bg-orange-500/20 text-orange-400' :
                    'bg-gray-700 text-gray-400'}
                `}>
                  {candidate.score.toFixed(1)}
                </span>
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onSelect(candidate.code)}
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  详情 <ArrowRight className="w-3 h-3" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: number
  icon: React.ReactNode
  color: 'blue' | 'red' | 'orange' | 'gray'
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  const colorClasses = {
    blue: 'text-blue-400 bg-blue-500/20',
    red: 'text-red-400 bg-red-500/20',
    orange: 'text-orange-400 bg-orange-500/20',
    gray: 'text-gray-400 bg-gray-700',
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${colorClasses[color].split(' ')[0]}`}>
            {value}
          </p>
        </div>
        <div className={`p-2 rounded-lg ${colorClasses[color].split(' ')[1]}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
