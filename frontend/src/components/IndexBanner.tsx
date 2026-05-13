import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react'

interface IndexData {
  [key: string]: {
    name: string
    price: number
    change: number
    change_pct: number
    high: number
    low: number
  }
}

export function IndexBanner() {
  const [data, setData] = useState<IndexData>({})
  const [loading, setLoading] = useState(true)

  const fetchIndex = async () => {
    try {
      const res = await fetch('/api/market/status')
      const result = await res.json()
      if (result.index_data) {
        setData(result.index_data)
      }
      if (result.market_status) {
        // ...
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchIndex()
    const interval = setInterval(fetchIndex, 10000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-[#0d1b3e] px-4 py-2.5 flex items-center gap-4 overflow-x-auto">
        {[1,2,3,4].map(i => (
          <div key={i} className="animate-pulse h-8 w-28 bg-[#1e2d4a] rounded" />
        ))}
      </div>
    )
  }

  const indices = Object.entries(data)

  return (
    <div className="bg-[#0d1b3e] px-4 py-2.5">
      <div className="flex items-center gap-3 overflow-x-auto">
        {indices.map(([key, idx]) => {
          const isUp = idx.change_pct >= 0
          const color = isUp ? '#f23645' : '#15b755'  // 同花顺：指数绿涨红跌
          return (
            <div key={key} className="flex-shrink-0 flex items-center gap-2 px-3 py-1 rounded bg-[#1e2d4a]/50">
              <div>
                <div className="text-[10px] text-[#8a8d93]">{idx.name}</div>
                <div className="text-sm font-mono font-bold" style={{ color }}>{idx.price.toFixed(2)}</div>
              </div>
              <div className={`flex flex-col items-end ${isUp ? 'text-[#f23645]' : 'text-[#15b755]'}`}>
                <div className="flex items-center gap-0.5 text-xs font-mono">
                  {isUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  <span>{idx.change_pct >= 0 ? '+' : ''}{idx.change_pct.toFixed(2)}%</span>
                </div>
                <div className="text-[10px] font-mono opacity-70">
                  {idx.change >= 0 ? '+' : ''}{idx.change.toFixed(2)}
                </div>
              </div>
            </div>
          )
        })}

        {/* 更新时间 */}
        <div className="ml-auto flex items-center gap-1.5 text-xs text-[#8a8d93] flex-shrink-0">
          <RefreshCw className="w-3 h-3" />
          <span>{new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  )
}
