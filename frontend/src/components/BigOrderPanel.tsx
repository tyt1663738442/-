import { ArrowUp, ArrowDown, Activity } from 'lucide-react'
import type { BigOrder } from '../types'

interface BigOrderPanelProps {
  orders: BigOrder[]
  onSelect: (code: string) => void
}

export function BigOrderPanel({ orders, onSelect }: BigOrderPanelProps) {
  const buyOrders = orders.filter(o => o.type === 'buy')
  const sellOrders = orders.filter(o => o.type === 'sell')
  const totalBuyAmount = buyOrders.reduce((sum, o) => sum + o.amount, 0)
  const totalSellAmount = sellOrders.reduce((sum, o) => sum + o.amount, 0)

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#2d3748]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#718096]">大单买入</p>
              <p className="text-xl font-bold text-[#ef4444] mt-1">{buyOrders.length} 笔</p>
            </div>
            <div className="p-2 bg-red-500/20 rounded-lg">
              <ArrowUp className="w-5 h-5 text-[#ef4444]" />
            </div>
          </div>
        </div>
        
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#2d3748]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#718096]">大单卖出</p>
              <p className="text-xl font-bold text-[#22c55e] mt-1">{sellOrders.length} 笔</p>
            </div>
            <div className="p-2 bg-green-500/20 rounded-lg">
              <ArrowDown className="w-5 h-5 text-[#22c55e]" />
            </div>
          </div>
        </div>
        
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#2d3748]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#718096]">买入金额</p>
              <p className="text-xl font-bold text-[#ef4444] mt-1 number-font">{formatAmount(totalBuyAmount)}</p>
            </div>
            <div className="p-2 bg-red-500/20 rounded-lg">
              <Activity className="w-5 h-5 text-[#ef4444]" />
            </div>
          </div>
        </div>
        
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#2d3748]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#718096]">卖出金额</p>
              <p className="text-xl font-bold text-[#22c55e] mt-1 number-font">{formatAmount(totalSellAmount)}</p>
            </div>
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Activity className="w-5 h-5 text-[#22c55e]" />
            </div>
          </div>
        </div>
      </div>

      {/* 资金流向图 */}
      <div className="bg-[#16213e] rounded-lg p-4 border border-[#2d3748]">
        <h4 className="text-sm font-medium mb-4 text-white">大单资金流向</h4>
        <div className="h-4 bg-[#2d3748] rounded-full overflow-hidden flex">
          <div 
            className="h-full bg-[#ef4444] transition-all duration-500"
            style={{ width: `${totalBuyAmount + totalSellAmount > 0 ? (totalBuyAmount / (totalBuyAmount + totalSellAmount)) * 100 : 50}%` }}
          />
          <div 
            className="h-full bg-[#22c55e] transition-all duration-500"
            style={{ width: `${totalBuyAmount + totalSellAmount > 0 ? (totalSellAmount / (totalBuyAmount + totalSellAmount)) * 100 : 50}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs">
          <span className="text-[#ef4444]">买入 {((totalBuyAmount / (totalBuyAmount + totalSellAmount)) * 100).toFixed(1)}%</span>
          <span className="text-[#22c55e]">卖出 {((totalSellAmount / (totalBuyAmount + totalSellAmount)) * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* 大单列表 */}
      <div className="bg-[#16213e] rounded-lg overflow-hidden border border-[#2d3748]">
        <div className="bg-[#0f3460] px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">实时大单监控</h3>
          <span className="text-xs text-[#718096]">阈值: 500万+</span>
        </div>
        
        {orders.length === 0 ? (
          <div className="p-8 text-center text-[#718096]">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>暂无大单数据</p>
          </div>
        ) : (
          <div className="divide-y divide-[#2d3748]">
            {orders.map((order, index) => (
              <div
                key={`${order.code}-${index}`}
                onClick={() => onSelect(order.code)}
                className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm hover:bg-[#1a4a7a]/30 cursor-pointer transition-colors"
              >
                <div className="col-span-1 text-[#718096]">{order.timestamp}</div>
                <div className="col-span-2 flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${order.type === 'buy' ? 'bg-[#ef4444]' : 'bg-[#22c55e]'}`} />
                  <span className="font-medium text-white truncate">{order.name}</span>
                </div>
                <div className="col-span-1 text-[#718096]">{order.code}</div>
                <div className={`col-span-1 text-right font-bold ${order.type === 'buy' ? 'text-[#ef4444]' : 'text-[#22c55e]'}`}>
                  {order.price.toFixed(2)}
                </div>
                <div className="col-span-1 text-right text-[#a0aec0]">{formatVolume(order.volume)}</div>
                <div className={`col-span-2 text-right font-bold ${order.type === 'buy' ? 'text-[#ef4444]' : 'text-[#22c55e]'}`}>
                  {formatAmount(order.amount)}
                </div>
                <div className="col-span-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                    order.type === 'buy' ? 'bg-red-500/20 text-[#ef4444]' : 'bg-green-500/20 text-[#22c55e]'
                  }`}>
                    {order.type === 'buy' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                    {order.type === 'buy' ? '买入' : '卖出'}
                  </span>
                </div>
                <div className="col-span-2 flex justify-end">
                  <button className="px-3 py-1 bg-[#e74c3c] hover:bg-[#c0392b] text-white text-xs rounded transition-colors">
                    查看
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatVolume(volume: number): string {
  if (volume >= 100000000) return (volume / 100000000).toFixed(2) + '亿'
  if (volume >= 10000) return (volume / 10000).toFixed(2) + '万'
  return volume.toString()
}

function formatAmount(amount: number): string {
  if (amount >= 10000) return (amount / 10000).toFixed(2) + '亿'
  return amount.toFixed(2) + '万'
}
