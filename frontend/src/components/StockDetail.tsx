import { useEffect, useState } from 'react'
import { ArrowLeft, TrendingUp, TrendingDown, Activity, BarChart3, RefreshCw } from 'lucide-react'
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'

interface StockDetailProps {
  code: string
  onBack: () => void
}

interface KLineData {
  date: string
  open: number
  high: number
  low: number
  close: number
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
  minute_data: { time: string; price: number; volume: number }[]
  daily_data: KLineData[]
  weekly_data: KLineData[]
}

type ChartType = 'minute' | 'daily' | 'weekly'

export function StockDetail({ code, onBack }: StockDetailProps) {
  const [stock, setStock] = useState<StockDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [chartType, setChartType] = useState<ChartType>('daily')

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
  }, [code])

  if (loading) {
    return (
      <div className="bg-[#16213e] rounded-lg p-8 text-center border border-[#2d3748]">
        <div className="animate-spin w-8 h-8 border-2 border-[#e74c3c] border-t-transparent rounded-full mx-auto"></div>
        <p className="text-[#718096] mt-4">加载中...</p>
      </div>
    )
  }

  if (!stock) {
    return (
      <div className="bg-[#16213e] rounded-lg p-8 text-center border border-[#2d3748]">
        <p className="text-[#718096]">未找到股票信息</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-[#e74c3c] text-white rounded-lg">返回</button>
      </div>
    )
  }

  const isUp = stock.change_percent >= 0

  // 准备K线数据
  const getChartData = () => {
    if (chartType === 'minute') {
      return stock.minute_data.map(d => ({
        time: d.time,
        price: d.price,
        volume: d.volume,
      }))
    } else if (chartType === 'daily') {
      return stock.daily_data.map(d => ({
        date: d.date.substring(5),  // MM-DD格式
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
      }))
    } else {
      return stock.weekly_data.map(d => ({
        date: d.date.substring(5),
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
      }))
    }
  }

  const chartData = getChartData()

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-[#718096] hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" />返回列表
      </button>

      {/* 基本信息 */}
      <div className="bg-[#16213e] rounded-lg p-6 border border-[#2d3748]">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">{stock.name}</h2>
            <p className="text-[#718096]">{stock.code}</p>
          </div>
          <div className="text-right">
            <div className={`text-4xl font-bold number-font ${isUp ? 'text-[#ef4444]' : 'text-[#22c55e]'}`}>
              {stock.price.toFixed(2)}
            </div>
            <div className={`flex items-center justify-end gap-2 mt-1 ${isUp ? 'text-[#ef4444]' : 'text-[#22c55e]'}`}>
              {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span className="number-font">{stock.change_amount >= 0 ? '+' : ''}{stock.change_amount.toFixed(2)}</span>
              <span className="number-font">({stock.change_percent >= 0 ? '+' : ''}{stock.change_percent.toFixed(2)}%)</span>
            </div>
          </div>
        </div>

        {/* 价格信息 */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mt-6 pt-6 border-t border-[#2d3748]">
          <PriceInfo label="今开" value={stock.open} />
          <PriceInfo label="昨收" value={stock.pre_close} />
          <PriceInfo label="最高" value={stock.high} color="red" />
          <PriceInfo label="最低" value={stock.low} color="green" />
          <PriceInfo label="涨停" value={stock.limit_up} color="red" />
          <PriceInfo label="跌停" value={stock.limit_down} color="green" />
        </div>
      </div>

      {/* 图表区域 */}
      <div className="bg-[#16213e] rounded-lg border border-[#2d3748]">
        {/* 图表类型切换 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2d3748]">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#e74c3c]" />
            <span className="font-medium text-white">
              {chartType === 'minute' ? '分时走势' : chartType === 'daily' ? '日K线' : '周K线'}
            </span>
            <span className="text-xs text-[#718096] ml-2">
              {chartType === 'minute' ? `${stock.minute_data?.length || 0}条数据` : 
               chartType === 'daily' ? `${stock.daily_data?.length || 0}天` : 
               `${stock.weekly_data?.length || 0}周`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-[#0f3460] rounded-lg p-1">
              <button
                onClick={() => setChartType('minute')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${chartType === 'minute' ? 'bg-[#e74c3c] text-white' : 'text-[#718096] hover:text-white'}`}
              >
                分时
              </button>
              <button
                onClick={() => setChartType('daily')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${chartType === 'daily' ? 'bg-[#e74c3c] text-white' : 'text-[#718096] hover:text-white'}`}
              >
                日线
              </button>
              <button
                onClick={() => setChartType('weekly')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${chartType === 'weekly' ? 'bg-[#e74c3c] text-white' : 'text-[#718096] hover:text-white'}`}
              >
                周线
              </button>
            </div>
            <button
              onClick={() => { setRefreshing(true); fetchDetail(); }}
              disabled={refreshing}
              className="p-1.5 hover:bg-[#2d3748] rounded-md transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 图表 */}
        <div className="p-4">
          {chartData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                  <XAxis 
                    dataKey={chartType === 'minute' ? 'time' : 'date'} 
                    stroke="#718096"
                    tick={{ fill: '#718096', fontSize: 11 }}
                    interval="preserveStartEnd"
                    minTickGap={30}
                  />
                  <YAxis 
                    yAxisId="price"
                    domain={['auto', 'auto']}
                    stroke="#718096"
                    tick={{ fill: '#718096', fontSize: 11 }}
                    tickFormatter={(v) => v.toFixed(2)}
                  />
                  <YAxis 
                    yAxisId="volume"
                    orientation="right"
                    stroke="#718096"
                    tick={{ fill: '#718096', fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f3460', border: '1px solid #2d3748', borderRadius: '8px' }}
                    labelStyle={{ color: '#a0aec0' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(value: number, name: string) => {
                      const names: Record<string, string> = { open: '开盘', high: '最高', low: '最低', close: '收盘', price: '价格', volume: '成交量' }
                      return [value.toFixed(2), names[name] || name]
                    }}
                  />
                  <Legend wrapperStyle={{ color: '#a0aec0' }} />
                  <ReferenceLine yAxisId="price" y={stock.pre_close} stroke="#718096" strokeDasharray="3 3" label={{ value: '昨收', fill: '#718096', fontSize: 11 }} />
                  
                  {/* K线蜡烛图 */}
                  {chartType !== 'minute' && (
                    <Bar yAxisId="price" dataKey="high" fill="transparent" />
                  )}
                  
                  {/* 价格线/柱状 */}
                  {chartType === 'minute' ? (
                    <Line yAxisId="price" type="monotone" dataKey="price" stroke={isUp ? '#ef4444' : '#22c55e'} strokeWidth={2} dot={false} />
                  ) : (
                    <>
                      <Bar yAxisId="price" dataKey="close" fill={isUp ? '#ef4444' : '#22c55e'} opacity={0.6} />
                      <Line yAxisId="price" type="monotone" dataKey="close" stroke={isUp ? '#ef4444' : '#22c55e'} strokeWidth={2} dot={false} />
                    </>
                  )}
                  
                  {/* 成交量柱状图 */}
                  <Bar yAxisId="volume" dataKey="volume" fill="#4a5568" opacity={0.5} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center text-[#718096]">
              <Activity className="w-8 h-8 mr-2" />
              <span>暂无{chartType === 'minute' ? '分时' : chartType === 'daily' ? '日K线' : '周K线'}数据</span>
            </div>
          )}
        </div>
      </div>

      {/* 成交量统计 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#2d3748]">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-[#e74c3c]" />
            <span className="text-sm font-medium text-white">成交量</span>
          </div>
          <p className="text-2xl font-bold text-white number-font">{formatVolume(stock.volume)}</p>
        </div>
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#2d3748]">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-[#e74c3c]" />
            <span className="text-sm font-medium text-white">成交额</span>
          </div>
          <p className="text-2xl font-bold text-white number-font">{formatAmount(stock.amount)}</p>
        </div>
      </div>
    </div>
  )
}

function PriceInfo({ label, value, color }: { label: string; value: number; color?: 'red' | 'green' }) {
  return (
    <div>
      <p className="text-xs text-[#718096] mb-1">{label}</p>
      <p className={`text-lg font-semibold number-font ${
        color === 'red' ? 'text-[#ef4444]' : color === 'green' ? 'text-[#22c55e]' : 'text-white'
      }`}>
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
