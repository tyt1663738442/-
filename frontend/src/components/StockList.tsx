import { ArrowUp, ArrowDown, Fire, Lock } from 'lucide-react'
import type { StockInfo } from '../types'

interface StockListProps {
  stocks: StockInfo[]
  onSelect: (code: string) => void
}

export function StockList({ stocks, onSelect }: StockListProps) {
  if (stocks.length === 0) {
    return (
      <div className="bg-[#16213e] rounded-lg p-8 text-center">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-[#2d3748] rounded w-1/3 mx-auto" />
          <div className="h-4 bg-[#2d3748] rounded w-1/2 mx-auto" />
        </div>
        <p className="text-[#718096] mt-4">正在加载市场数据...</p>
      </div>
    )
  }

  return (
    <div className="bg-[#16213e] rounded-lg overflow-hidden">
      {/* 表头 - 同花顺风格 */}
      <div className="bg-[#0d1b3e]">
        <div className="grid grid-cols-[40px_1fr_70px_70px_70px_60px_80px] gap-1 px-3 py-2.5 text-xs text-[#8a8d93] font-medium">
          <div>序号</div>
          <div>股票名称</div>
          <div className="text-right">最新价</div>
          <div className="text-right">涨跌幅</div>
          <div className="text-right">涨跌额</div>
          <div className="text-right">成交量</div>
          <div className="text-right">成交额</div>
        </div>
      </div>

      {/* 数据行 */}
      <div className="divide-y divide-[#1e2d4a]">
        {stocks.map((stock, index) => {
          const isUp = stock.change_pct > 0
          const isDown = stock.change_pct < 0
          const isFlat = stock.change_pct === 0
          const isLimitUp = stock.change_pct >= 9.9
          const isLimitDown = stock.change_pct <= -9.9

          // 同花顺配色：绿涨红跌
          const upColor = '#15b755'
          const downColor = '#f23645'
          const flatColor = '#8a8d93'
          const color = isUp ? upColor : isDown ? downColor : flatColor

          return (
            <div
              key={stock.code}
              onClick={() => onSelect(stock.code)}
              className={`grid grid-cols-[40px_1fr_70px_70px_70px_60px_80px] gap-1 px-3 py-2.5 text-sm cursor-pointer transition-colors hover:bg-[#1e2d4a]/50 ${
                isLimitUp ? 'bg-[#f23645]/10' : isLimitDown ? 'bg-[#15b755]/10' : ''
              }`}
            >
              {/* 序号 */}
              <div className="flex items-center">
                {isLimitUp ? (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-[#f23645] text-white text-xs font-bold">
                    涨
                  </span>
                ) : isLimitDown ? (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-[#15b755] text-white text-xs font-bold">
                    跌
                  </span>
                ) : (
                  <span className="text-[#8a8d93] text-xs">{index + 1}</span>
                )}
              </div>

              {/* 名称+代码 */}
              <div className="flex flex-col justify-center min-w-0">
                <div className="flex items-center gap-1">
                  <span className={`font-medium truncate ${isLimitUp ? 'text-[#f23645] font-bold' : ''}`}>
                    {stock.name}
                  </span>
                  {stock.seal_amount > 1000 && (
                    <Lock className="w-3 h-3 text-[#f59e0b] flex-shrink-0" />
                  )}
                </div>
                <span className="text-[10px] text-[#8a8d93]">{stock.code}</span>
              </div>

              {/* 现价 */}
              <div className={`flex items-center justify-end font-mono font-bold text-base ${
                isLimitUp ? 'text-[#f23645]' : isLimitDown ? 'text-[#15b755]' : color
              }`}>
                {stock.price.toFixed(2)}
                {isLimitUp && <ArrowUp className="w-3 h-3 ml-0.5" />}
              </div>

              {/* 涨跌幅 */}
              <div className={`flex items-center justify-end gap-0.5 font-bold ${
                isLimitUp ? 'text-[#f23645]' : color
              }`}>
                {isUp && <ArrowUp className="w-3 h-3" />}
                {isDown && <ArrowDown className="w-3 h-3" />}
                <span className="font-mono">
                  {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct.toFixed(2)}%
                </span>
              </div>

              {/* 涨跌额 */}
              <div className={`flex items-center justify-end font-mono text-sm ${color}`}>
                {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}
              </div>

              {/* 成交量 */}
              <div className="flex items-center justify-end text-[#8a8d93] text-xs font-mono">
                {fmtVol(stock.volume)}
              </div>

              {/* 成交额 */}
              <div className="flex items-center justify-end text-[#8a8d93] text-xs font-mono">
                {fmtAmount(stock.amount)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function fmtVol(v: number): string {
  if (v >= 100000000) return (v / 100000000).toFixed(1) + '亿'
  if (v >= 10000) return (v / 10000).toFixed(0) + '万'
  return v.toString()
}

function fmtAmount(a: number): string {
  if (a >= 100000000) return (a / 100000000).toFixed(1) + '亿'
  if (a >= 10000) return (a / 10000).toFixed(0) + '万'
  return a.toFixed(0)
}
