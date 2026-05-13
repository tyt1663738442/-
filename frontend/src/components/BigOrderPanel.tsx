import { useEffect, useState, useCallback } from 'react'
import { Activity, ArrowUp, ArrowDown, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'

interface BigOrder {
  code: string
  name: string
  price: number
  volume: number
  amount: number
  change_pct: number
  is_up: boolean
  time: string
}

export function BigOrderPanel() {
  const [orders, setOrders] = useState<BigOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/big-orders')
      const data = await res.json()
      if (data.orders) setOrders(data.orders)
      setLastUpdate(data.time || new Date().toLocaleTimeString())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 5000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  const buyOrders = orders.filter(o => o.is_up)
  const sellOrders = orders.filter(o => !o.is_up)

  return (
    <div className="space-y-4">
      {/* 说明 */}
      <div className="bg-[#0d1b3e] rounded-lg p-4 border border-[#2d3748]">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-[#f23645]/20 rounded-lg">
            <Activity className="w-5 h-5 text-[#f23645]" />
          </div>
          <div>
            <h4 className="font-medium text-white">大单追踪</h4>
            <p className="text-sm text-[#8a8d93] mt-1">
              实时监测成交额 ≥ 500万的个股大单，快速发现主力资金动向
            </p>
          </div>
        </div>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#f23645]/10 border border-[#f23645]/30 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-[#8a8d93]">大单买入</p>
              <p className="text-2xl font-bold text-[#f23645] mt-1">{buyOrders.length}</p>
            </div>
            <TrendingUp className="w-5 h-5 text-[#f23645] opacity-50" />
          </div>
        </div>
        <div className="bg-[#15b755]/10 border border-[#15b755]/30 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-[#8a8d93]">大单卖出</p>
              <p className="text-2xl font-bold text-[#15b755] mt-1">{sellOrders.length}</p>
            </div>
            <TrendingDown className="w-5 h-5 text-[#15b755] opacity-50" />
          </div>
        </div>
        <div className="bg-[#16213e] border border-[#2d3748] rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-[#8a8d93]">大单总数</p>
              <p className="text-2xl font-bold text-white mt-1">{orders.length}</p>
            </div>
            <Activity className="w-5 h-5 text-[#8a8d93] opacity-50" />
          </div>
        </div>
      </div>

      {/* 大单列表 */}
      {loading ? (
        <div className="bg-[#16213e] rounded-lg p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-[#f23645] border-t-transparent rounded-full mx-auto"></div>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-[#16213e] rounded-lg p-8 text-center border border-[#2d3748]">
          <Activity className="w-12 h-12 mx-auto mb-3 text-[#8a8d93] opacity-50" />
          <p className="text-[#8a8d93]">暂无大单数据</p>
          <p className="text-xs text-[#718096] mt-1">交易时段自动刷新</p>
        </div>
      ) : (
        <div className="bg-[#16213e] rounded-lg overflow-hidden border border-[#2d3748]">
          <div className="bg-[#0d1b3e] px-4 py-2.5 flex items-center justify-between">
            <div className="grid grid-cols-8 gap-2 flex-1 text-xs text-[#8a8d93] font-medium">
              <div className="col-span-1">#</div>
              <div className="col-span-2">名称</div>
              <div className="col-span-1 text-right">现价</div>
              <div className="col-span-1 text-right">涨幅</div>
              <div className="col-span-2 text-right">成交额</div>
              <div className="col-span-1 text-right">时间</div>
            </div>
          </div>
          <div className="divide-y divide-[#1e2d4a]">
            {orders.map((order, i) => (
              <div key={`${order.code}-${i}`} className="grid grid-cols-8 gap-2 px-4 py-2.5 text-sm hover:bg-[#1e2d4a]/50">
                <div className="col-span-1 flex items-center">
                  {order.is_up ? (
                    <ArrowUp className="w-4 h-4 text-[#f23645]" />
                  ) : (
                    <ArrowDown className="w-4 h-4 text-[#15b755]" />
                  )}
                </div>
                <div className="col-span-2 flex flex-col">
                  <span className="font-medium text-white">{order.name}</span>
                  <span className="text-[10px] text-[#8a8d93]">{order.code}</span>
                </div>
                <div className={`col-span-1 text-right font-mono font-bold ${
                  order.change_pct >= 0 ? 'text-[#f23645]' : 'text-[#15b755]'
                }`}>
                  {order.price.toFixed(2)}
                </div>
                <div className={`col-span-1 text-right font-mono ${
                  order.change_pct >= 0 ? 'text-[#f23645]' : 'text-[#15b755]'
                }`}>
                  {order.change_pct >= 0 ? '+' : ''}{order.change_pct.toFixed(2)}%
                </div>
                <div className="col-span-2 text-right text-[#f59e0b] font-mono text-xs">
                  {fmtAmount(order.amount)}
                </div>
                <div className="col-span-1 text-right text-[#8a8d93] text-xs">
                  {order.time}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 更新时间 */}
      <div className="flex items-center justify-center gap-2 text-xs text-[#8a8d93]">
        <RefreshCw className="w-3 h-3" />
        <span>最后更新: {lastUpdate}</span>
      </div>
    </div>
  )
}

function fmtAmount(a: number): string {
  if (a >= 100000000) return (a / 100000000).toFixed(1) + '亿'
  if (a >= 10000) return (a / 10000).toFixed(0) + '万'
  return a.toFixed(0)
}
