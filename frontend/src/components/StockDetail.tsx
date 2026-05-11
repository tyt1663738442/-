import { useEffect, useState } from 'react'
import { ArrowLeft, TrendingUp, TrendingDown, Activity, BarChart3, RefreshCw } from 'lucide-react'
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts'

interface StockDetailProps {
  code: string
  onBack: () => void
}

interface MinuteData {
  time: string
  price: number
  volume: number
}

interface StockDetailData {
  code: string
  name: string
  price: number
  change_percent: number
  change_amount: number
  volume: number
  amount: number
  high: number
  low: number
  open: number
  pre_close: number
  limit_up: number
  limit_down: number
  minute_data: MinuteData[]
}

export function StockDetail({ code, onBack }: StockDetailProps) {
  const [stock, setStock] = useState<StockDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchDetail = async () => {
    try {
      const res = await fetch(`/api/stock/${code}`)
      if (res.ok) {
        const data = await res.json()
        setStock(data)
      }
    } catch (err) {
      console.error('获取详情失败:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchDetail()
    // 每30秒自动刷新
    const interval = setInterval(fetchDetail, 30000)
    return () => clearInterval(interval)
  }, [code])

  if (loading) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
        <p className="text-gray-400 mt-4">加载中...</p>
      </div>
    )
  }

  if (!stock) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-gray-400">未找到股票信息</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg">返回</button>
      </div>
    )
  }

  const isUp = stock.change_percent >= 0
  const chartData = stock.minute_data || []

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-gray-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" />返回列表
      </button>

      {/* 基本信息 */}
      <div className="glass-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">{stock.name}</h2>
            <p className="text-gray-400">{stock.code}</p>
          </div>
          <div className="text-right">
            <div className={`text-4xl font-bold number-font ${isUp ? 'stock-up' : 'stock-down'}`}>
              {stock.price.toFixed(2)}
            </div>
            <div className={`flex items-center justify-end gap-2 mt-1 ${isUp ? 'stock-up' : 'stock-down'}`}>
              {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span className="number-font">{stock.change_amount >= 0 ? '+' : ''}{stock.change_amount.toFixed(2)}</span>
              <span className="number-font">({stock.change_percent >= 0 ? '+' : ''}{stock.change_percent.toFixed(2)}%)</span>
            </div>
          </div>
        </div>

        {/* 价格信息 */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-6 pt-6 border-t border-stock-border">
          <PriceInfo label="今开" value={stock.open} />
          <PriceInfo label="昨收" value={stock.pre_close} />
          <PriceInfo label="最高" value={stock.high} color="red" />
          <PriceInfo label="最低" value={stock.low} color="green" />
          <PriceInfo label="涨停" value={stock.limit_up} color="red" />
          <PriceInfo label="跌停" value={stock.limit_down} color="green" />
        </div>
      </div>

      {/* 分时图 */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold">分时走势</h3>
            <button 
              onClick={() => { setRefreshing(true); fetchDetail(); }}
              disabled={refreshing}
              className="ml-2 p-1 hover:bg-white/10 rounded disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <span className="text-xs text-gray-400">{chartData.length > 0 ? `${chartData.length}条数据` : '暂无数据'}</span>
        </div>
        
        {chartData.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis 
                  dataKey="time" 
                  stroke="#64748b"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  interval="preserveStartEnd"
                  minTickGap={50}
                />
                <YAxis 
                  domain={['auto', 'auto']}
                  stroke="#64748b"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(v) => v.toFixed(2)}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8' }}
                  itemStyle={{ color: '#fff' }}
                  formatter={(value: number) => [value.toFixed(2), '价格']}
                />
                <ReferenceLine 
                  y={stock.pre_close} 
                  stroke="#64748b" 
                  strokeDasharray="3 3"
                  label={{ value: '昨收', fill: '#64748b', fontSize: 11 }}
                />
                <Area type="monotone" dataKey="price" fill={isUp ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)'} stroke="none" />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke={isUp ? '#ef4444' : '#22c55e'}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-80 flex items-center justify-center text-gray-400">
            <Activity className="w-8 h-8 mr-2" />
            <span>暂无分时数据（交易时间内更新）</span>
          </div>
        )}
      </div>

      {/* 成交量统计 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium">成交量</span>
          </div>
          <p className="text-2xl font-bold number-font">{formatVolume(stock.volume)}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium">成交额</span>
          </div>
          <p className="text-2xl font-bold number-font">{formatAmount(stock.amount)}</p>
        </div>
      </div>
    </div>
  )
}

function PriceInfo({ label, value, color }: { label: string; value: number; color?: 'red' | 'green' }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-semibold number-font ${color === 'red' ? 'stock-up' : color === 'green' ? 'stock-down' : 'text-white'}`}>
        {value.toFixed(2)}
      </p>
    </div>
  )
}

function formatVolume(v: number): string {
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return v.toString()
}

function formatAmount(v: number): string {
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return v.toFixed(2)
}
