import { ArrowUp, ArrowDown, Clock, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import type { BigOrder } from '../types'

interface BigOrderPanelProps {
  orders: BigOrder[]
  onSelect: (code: string) => void
}

export function BigOrderPanel({ orders, onSelect }: BigOrderPanelProps) {
  // 统计
  const buyOrders = orders.filter(o => o.type === 'buy')
  const sellOrders = orders.filter(o => o.type === 'sell')
  const totalBuyAmount = buyOrders.reduce((sum, o) => sum + o.amount, 0)
  const totalSellAmount = sellOrders.reduce((sum, o) => sum + o.amount, 0)

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">大单买入</p>
              <p className="text-xl font-bold stock-up mt-1">{buyOrders.length} 笔</p>
            </div>
            <div className="p-2 bg-red-500/20 rounded-lg">
              <TrendingUp className="w-5 h-5 stock-up" />
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">大单卖出</p>
              <p className="text-xl font-bold stock-down mt-1">{sellOrders.length} 笔</p>
            </div>
            <div className="p-2 bg-green-500/20 rounded-lg">
              <TrendingDown className="w-5 h-5 stock-down" />
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">买入金额</p>
              <p className="text-xl font-bold stock-up mt-1 number-font">{formatAmount(totalBuyAmount)}</p>
            </div>
            <div className="p-2 bg-red-500/20 rounded-lg">
              <Activity className="w-5 h-5 stock-up" />
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">卖出金额</p>
              <p className="text-xl font-bold stock-down mt-1 number-font">{formatAmount(totalSellAmount)}</p>
            </div>
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Activity className="w-5 h-5 stock-down" />
            </div>
          </div>
        </div>
      </div>

      {/* 大单列表 */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-stock-border flex items-center justify-between">
          <h3 className="text-lg font-semibold">实时大单监控</h3>
          <span className="text-sm text-gray-400">阈值: 100万+</span>
        </div>
        
        {orders.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>暂无大单数据，等待交易中...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stock-bg/50">
                <tr className="text-left text-xs text-gray-400">
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 font-medium">股票</th>
                  <th className="px-4 py-3 font-medium text-right">价格</th>
                  <th className="px-4 py-3 font-medium text-right">成交量</th>
                  <th className="px-4 py-3 font-medium text-right">成交金额</th>
                  <th className="px-4 py-3 font-medium">方向</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stock-border">
                {orders.map((order, index) => (
                  <tr
                    key={`${order.code}-${index}`}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-gray-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-sm">{order.timestamp}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${order.type === 'buy' ? 'bg-red-500' : 'bg-green-500'}`} />
                        <div>
                          <div className="font-medium">{order.name}</div>
                          <div className="text-xs text-gray-500">{order.code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="number-font font-medium">{order.price.toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300 number-font">
                      {formatVolume(order.volume)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`number-font font-semibold ${order.type === 'buy' ? 'stock-up' : 'stock-down'}`}>
                        {formatAmount(order.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                        order.type === 'buy'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-green-500/20 text-green-400'
                      }`}>
                        {order.type === 'buy' ? (
                          <><ArrowUp className="w-3 h-3" /> 买入</>
                        ) : (
                          <><ArrowDown className="w-3 h-3" /> 卖出</>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onSelect(order.code)}
                        className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                      >
                        查看
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 资金流向图 */}
      <div className="glass-card p-4">
        <h4 className="text-sm font-medium mb-4">大单资金流向</h4>
        <div className="h-4 bg-gray-700 rounded-full overflow-hidden flex">
          <div 
            className="h-full bg-red-500 transition-all duration-500"
            style={{ 
              width: `${totalBuyAmount + totalSellAmount > 0 
                ? (totalBuyAmount / (totalBuyAmount + totalSellAmount)) * 100 
                : 50}%` 
            }}
          />
          <div 
            className="h-full bg-green-500 transition-all duration-500"
            style={{ 
              width: `${totalBuyAmount + totalSellAmount > 0 
                ? (totalSellAmount / (totalBuyAmount + totalSellAmount)) * 100 
                : 50}%` 
            }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs">
          <span className="text-red-400">买入 {((totalBuyAmount / (totalBuyAmount + totalSellAmount)) * 100).toFixed(1)}%</span>
          <span className="text-green-400">卖出 {((totalSellAmount / (totalBuyAmount + totalSellAmount)) * 100).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  )
}

function formatVolume(volume: number): string {
  if (volume >= 100000000) {
    return (volume / 100000000).toFixed(2) + '亿'
  } else if (volume >= 10000) {
    return (volume / 10000).toFixed(2) + '万'
  }
  return volume.toString()
}

function formatAmount(amount: number): string {
  if (amount >= 10000) {
    return (amount / 10000).toFixed(2) + '亿'
  }
  return amount.toFixed(2) + '万'
}
