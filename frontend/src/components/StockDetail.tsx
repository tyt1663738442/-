import { useEffect, useState } from 'react'
import { ArrowLeft, TrendingUp, TrendingDown, Activity, BarChart3, Clock } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

interface StockDetailProps {
  code: string
  onBack: () => void
}

interface StockDetailData {
  code: string
  name: string
  price: number
  change_percent: number
  volume: number
  amount: number
  high: number
  low: number
  open: number
  pre_close: number
  limit_up: number
  limit_down: number
  minute_data?: Array<{
    时间: string
    开盘: number
    收盘: number
    最高: number
    最低: number
    成交量: number
    成交额: number
  }>
}

export function StockDetail({ code, onBack }: StockDetailProps) {
  const [stock, setStock] = useState<StockDetailData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
      }
    }

    fetchDetail()
    // 每5秒刷新
    const interval = setInterval(fetchDetail, 5000)
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
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          返回
        </button>
      </div>
    )
  }

  const isUp = stock.change_percent >= 0
  const changeAmount = stock.price - stock.pre_close

  // 处理分时数据
  const chartData = stock.minute_data?.map(item => ({
    time: item.时间,
    price: item.收盘,
    volume: item.成交量,
    avg: item.开盘,
  })) || []

  return (
    <div className="space-y-4">
      {/* 返回按钮 */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        返回列表
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
              <span className="number-font">{changeAmount >= 0 ? '+' : ''}{changeAmount.toFixed(2)}</span>
              <span className="number-font">({stock.change_percent >= 0 ? '+' : ''}{stock.change_percent.toFixed(2)}%)</span>
            </div>
          </div>
        </div>

        {/* 价格信息网格 */}
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
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold">分时走势</h3>
        </div>
        
        {chartData.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis 
                  dataKey="time" 
                  stroke="#64748b"
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  domain={['auto', 'auto']}
                  stroke="#64748b"
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  tickFormatter={(value) => value.toFixed(2)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#94a3b8' }}
                  itemStyle={{ color: '#fff' }}
                  formatter={(value: number) => [value.toFixed(2), '价格']}
                />
                <ReferenceLine 
                  y={stock.pre_close} 
                  stroke="#64748b" 
                  strokeDasharray="3 3"
                  label={{ value: '昨收', fill: '#64748b', fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke={isUp ? '#ef4444' : '#22c55e'}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-80 flex items-center justify-center text-gray-400">
            <Activity className="w-8 h-8 mr-2" />
            暂无分时数据
          </div>
        )}
      </div>

      {/* 成交量 */}
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
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium">成交额</span>
          </div>
          <p className="text-2xl font-bold number-font">{formatAmount(stock.amount)}</p>
        </div>
      </div>
    </div>
  )
}

interface PriceInfoProps {
  label: string
  value: number
  color?: 'red' | 'green'
}

function PriceInfo({ label, value, color }: PriceInfoProps) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-semibold number-font ${
        color === 'red' ? 'stock-up' : color === 'green' ? 'stock-down' : 'text-white'
      }`}>
        {value.toFixed(2)}
      </p>
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
  if (amount >= 100000000) {
    return (amount / 100000000).toFixed(2) + '亿'
  } else if (amount >= 10000) {
    return (amount / 10000).toFixed(2) + '万'
  }
  return amount.toFixed(2)
}
