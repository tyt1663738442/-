import { ArrowUp, ArrowDown } from 'lucide-react'
import type { StockInfo } from '../types'

interface StockListProps {
  stocks: StockInfo[]
  onSelect: (code: string) => void
}

export function StockList({ stocks, onSelect }: StockListProps) {
  if (stocks.length === 0) {
    return (
      <div className="bg-[#16213e] rounded-lg p-8 text-center">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-[#2d3748] rounded w-1/3 mx-auto"></div>
          <div className="h-4 bg-[#2d3748] rounded w-1/2 mx-auto"></div>
        </div>
        <p className="text-[#718096] mt-4">正在加载市场数据...</p>
      </div>
    )
  }

  return (
    <div className="bg-[#16213e] rounded-lg overflow-hidden border border-[#2d3748]">
      {/* 表头 */}
      <div className="bg-[#0f3460]">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-medium text-[#a0aec0]">
          <div className="col-span-1">序号</div>
          <div className="col-span-2">股票名称</div>
          <div className="col-span-1 text-right">代码</div>
          <div className="col-span-1 text-right">现价</div>
          <div className="col-span-1 text-right">涨跌幅</div>
          <div className="col-span-1 text-right">涨跌额</div>
          <div className="col-span-1 text-right">今开</div>
          <div className="col-span-1 text-right">最高</div>
          <div className="col-span-1 text-right">最低</div>
          <div className="col-span-1 text-right">成交量</div>
          <div className="col-span-1 text-right">成交额</div>
        </div>
      </div>

      {/* 数据行 */}
      <div className="divide-y divide-[#2d3748]">
        {stocks.map((stock, index) => {
          const isUp = stock.change_percent >= 0
          const changeAmount = stock.price - stock.pre_close
          const isLimitUp = stock.change_percent >= 9.9
          const isLimitDown = stock.change_percent <= -9.9

          return (
            <div
              key={stock.code}
              onClick={() => onSelect(stock.code)}
              className={`grid grid-cols-12 gap-2 px-4 py-2.5 text-sm hover:bg-[#1a4a7a]/30 cursor-pointer transition-colors ${
                isLimitUp ? 'bg-red-500/10' : isLimitDown ? 'bg-green-500/10' : ''
              }`}
            >
              <div className="col-span-1 text-[#718096]">{index + 1}</div>
              <div className="col-span-2 font-medium text-white truncate">{stock.name}</div>
              <div className="col-span-1 text-right text-[#718096]">{stock.code}</div>
              <div className={`col-span-1 text-right font-bold number-font ${
                isLimitUp ? 'text-[#ef4444]' : isLimitDown ? 'text-[#22c55e]' : isUp ? 'text-[#ef4444]' : 'text-[#22c55e]'
              }`}>
                {stock.price.toFixed(2)}
              </div>
              <div className={`col-span-1 text-right font-medium ${
                isUp ? 'text-[#ef4444]' : 'text-[#22c55e]'
              }`}>
                <span className="inline-flex items-center gap-0.5">
                  {isUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  {stock.change_percent >= 0 ? '+' : ''}{stock.change_percent.toFixed(2)}%
                </span>
              </div>
              <div className={`col-span-1 text-right ${
                isUp ? 'text-[#ef4444]' : 'text-[#22c55e]'
              }`}>
                {changeAmount >= 0 ? '+' : ''}{changeAmount.toFixed(2)}
              </div>
              <div className="col-span-1 text-right text-[#a0aec0]">{stock.open.toFixed(2)}</div>
              <div className="col-span-1 text-right text-[#ef4444]">{stock.high.toFixed(2)}</div>
              <div className="col-span-1 text-right text-[#22c55e]">{stock.low.toFixed(2)}</div>
              <div className="col-span-1 text-right text-[#a0aec0]">{formatVolume(stock.volume)}</div>
              <div className="col-span-1 text-right text-[#a0aec0]">{formatAmount(stock.amount)}</div>
            </div>
          )
        })}
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
  if (amount >= 100000000) return (amount / 100000000).toFixed(2) + '亿'
  if (amount >= 10000) return (amount / 10000).toFixed(2) + '万'
  return amount.toFixed(0)
}
