import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import type { StockInfo } from '../types'

interface StockListProps {
  stocks: StockInfo[]
  onSelect: (code: string) => void
}

export function StockList({ stocks, onSelect }: StockListProps) {
  if (stocks.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-700 rounded w-1/3 mx-auto"></div>
          <div className="h-4 bg-gray-700 rounded w-1/2 mx-auto"></div>
        </div>
        <p className="text-gray-400 mt-4">正在加载市场数据...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="上涨家数"
          value={stocks.filter(s => s.change_percent > 0).length}
          color="red"
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          title="下跌家数"
          value={stocks.filter(s => s.change_percent < 0).length}
          color="green"
          icon={<TrendingDown className="w-5 h-5" />}
        />
        <StatCard
          title="涨停家数"
          value={stocks.filter(s => s.change_percent >= 9.9).length}
          color="red"
        />
        <StatCard
          title="跌停家数"
          value={stocks.filter(s => s.change_percent <= -9.9).length}
          color="green"
        />
      </div>

      {/* 股票列表 */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-stock-border flex items-center justify-between">
          <h3 className="text-lg font-semibold">市场行情</h3>
          <span className="text-sm text-gray-400">共 {stocks.length} 只</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-stock-bg/50">
              <tr className="text-left text-xs text-gray-400">
                <th className="px-4 py-3 font-medium">股票名称</th>
                <th className="px-4 py-3 font-medium text-right">最新价</th>
                <th className="px-4 py-3 font-medium text-right">涨跌幅</th>
                <th className="px-4 py-3 font-medium text-right">涨跌额</th>
                <th className="px-4 py-3 font-medium text-right">成交量</th>
                <th className="px-4 py-3 font-medium text-right">成交额</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stock-border">
              {stocks.map((stock) => {
                const changeAmount = stock.price - stock.pre_close
                const isUp = stock.change_percent >= 0
                
                return (
                  <tr
                    key={stock.code}
                    className="hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => onSelect(stock.code)}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-white">{stock.name}</div>
                        <div className="text-xs text-gray-500">{stock.code}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`number-font font-semibold ${isUp ? 'stock-up' : 'stock-down'}`}>
                        {stock.price.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                        isUp 
                          ? 'bg-red-500/20 text-red-400' 
                          : 'bg-green-500/20 text-green-400'
                      }`}>
                        {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {stock.change_percent >= 0 ? '+' : ''}{stock.change_percent.toFixed(2)}%
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right number-font ${isUp ? 'stock-up' : 'stock-down'}`}>
                      {changeAmount >= 0 ? '+' : ''}{changeAmount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300 number-font">
                      {formatVolume(stock.volume)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300 number-font">
                      {formatAmount(stock.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <button 
                        className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelect(stock.code)
                        }}
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: number
  color: 'red' | 'green'
  icon?: React.ReactNode
}

function StatCard({ title, value, color, icon }: StatCardProps) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${color === 'red' ? 'stock-up' : 'stock-down'}`}>
            {value}
          </p>
        </div>
        {icon && (
          <div className={`p-2 rounded-lg ${color === 'red' ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

// 格式化成交量
function formatVolume(volume: number): string {
  if (volume >= 100000000) {
    return (volume / 100000000).toFixed(2) + '亿'
  } else if (volume >= 10000) {
    return (volume / 10000).toFixed(2) + '万'
  }
  return volume.toString()
}

// 格式化成交额
function formatAmount(amount: number): string {
  if (amount >= 100000000) {
    return (amount / 100000000).toFixed(2) + '亿'
  } else if (amount >= 10000) {
    return (amount / 10000).toFixed(2) + '万'
  }
  return amount.toFixed(2)
}
