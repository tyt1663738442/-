import { useState, useEffect, useCallback, useMemo } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

const API_BASE = 'http://localhost:8000'

interface SectorInfo {
  key: string
  板块名称: string
  股票数: string
  [key: string]: any
}

interface SectorPanelProps {
  onSelectStock?: (code: string) => void
}

export function SectorPanel({ onSelectStock }: SectorPanelProps) {
  const [sectors, setSectors] = useState<SectorInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSector, setSelectedSector] = useState<string>('')
  const [selectedKey, setSelectedKey] = useState<string>('')
  const [sectorStocks, setSectorStocks] = useState<any[]>([])
  const [loadingStocks, setLoadingStocks] = useState(false)
  const [sortColumn, setSortColumn] = useState<'name' | 'price' | 'changePct' | 'changeAmt' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // 左侧板块列表排序
  const [sectorListSort, setSectorListSort] = useState<'name' | 'changePct' | 'flow' | null>(null)
  const [sectorListDir, setSectorListDir] = useState<'asc' | 'desc'>('desc')

  const fetchSectors = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/sectors`)
      const data = await res.json()
      setSectors(data.sectors || [])
    } catch (e) {
      console.error('获取板块列表失败', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSectors()
  }, [fetchSectors])

  const handleSectorClick = useCallback(async (sectorKey: string, sectorName: string) => {
    setSelectedKey(sectorKey)
    setSelectedSector(sectorName)
    setSortColumn(null)
    setSortDirection('desc')
    setLoadingStocks(true)
    try {
      const res = await fetch(`${API_BASE}/api/sector/${encodeURIComponent(sectorKey)}`)
      const data = await res.json()
      setSectorStocks(data.stocks || [])
    } catch (e) {
      console.error('获取板块成分股失败', e)
      setSectorStocks([])
    } finally {
      setLoadingStocks(false)
    }
  }, [])

  const handleSort = useCallback((col: 'name' | 'price' | 'changePct' | 'changeAmt') => {
    setSortColumn(prev => {
      if (prev === col) {
        setSortDirection(d => d === 'desc' ? 'asc' : 'desc')
        return prev
      } else {
        setSortDirection('desc')
        return col
      }
    })
  }, [])

  const sortedStocks = useMemo(() => {
    if (!sortColumn) return sectorStocks
    const list = [...sectorStocks]
    list.sort((a, b) => {
      let va: number, vb: number
      if (sortColumn === 'name') {
        return sortDirection === 'desc'
          ? String(b['名称'] || '').localeCompare(String(a['名称'] || ''))
          : String(a['名称'] || '').localeCompare(String(b['名称'] || ''))
      } else if (sortColumn === 'price') {
        va = parseFloat(a['最新价'] || 0)
        vb = parseFloat(b['最新价'] || 0)
      } else if (sortColumn === 'changePct') {
        va = parseFloat(a['涨跌幅'] || 0)
        vb = parseFloat(b['涨跌幅'] || 0)
      } else {
        va = parseFloat(a['涨跌额'] || 0)
        vb = parseFloat(b['涨跌额'] || 0)
      }
      return sortDirection === 'desc' ? vb - va : va - vb
    })
    return list
  }, [sectorStocks, sortColumn, sortDirection])

  // 板块列表排序
  const handleSectorListSort = useCallback((col: 'name' | 'changePct' | 'flow') => {
    setSectorListSort(prev => {
      if (prev === col) {
        setSectorListDir(d => d === 'desc' ? 'asc' : 'desc')
        return prev
      } else {
        setSectorListDir('desc')
        return col
      }
    })
  }, [])

  const sortedSectors = useMemo(() => {
    if (!sectorListSort) return sectors
    const list = [...sectors]
    list.sort((a, b) => {
      if (sectorListSort === 'name') {
        return sectorListDir === 'desc'
          ? String(b['板块名称'] || '').localeCompare(String(a['板块名称'] || ''))
          : String(a['板块名称'] || '').localeCompare(String(b['板块名称'] || ''))
      } else if (sectorListSort === 'changePct') {
        const va = parseFloat(a['涨跌幅'] || 0)
        const vb = parseFloat(b['涨跌幅'] || 0)
        return sectorListDir === 'desc' ? vb - va : va - vb
      } else {
        const va = parseFloat(a['主力净流入'] || a['成交额'] || 0)
        const vb = parseFloat(b['主力净流入'] || b['成交额'] || 0)
        return sectorListDir === 'desc' ? vb - va : va - vb
      }
    })
    return list
  }, [sectors, sectorListSort, sectorListDir])

  return (
    <div className="flex h-full overflow-hidden">
      {/* 左侧：板块列表 */}
      <div className="w-56 bg-[#0d1b3e] border-r border-[#2d3748] flex flex-col shrink-0">
        <div className="px-3 py-2 text-xs text-[#8a8d93] border-b border-[#2d3748]">
          板块列表 ({sectors.length})
        </div>
        {/* 表头 */}
        <div className="px-3 py-1.5 grid grid-cols-[1fr_50px_60px] gap-1 text-[10px] text-[#8a8d93] font-medium border-b border-[#2d3748] select-none">
          <div className="cursor-pointer flex items-center" onClick={() => handleSectorListSort('name')}>
            名称
            {sectorListSort === 'name'
              ? (sectorListDir === 'desc' ? <ArrowDown className="w-2.5 h-2.5 ml-0.5 inline" /> : <ArrowUp className="w-2.5 h-2.5 ml-0.5 inline" />)
              : <ArrowUpDown className="w-2.5 h-2.5 ml-0.5 inline opacity-30" />}
          </div>
          <div className="text-right cursor-pointer flex items-center justify-end" onClick={() => handleSectorListSort('changePct')}>
            涨幅
            {sectorListSort === 'changePct'
              ? (sectorListDir === 'desc' ? <ArrowDown className="w-2.5 h-2.5 ml-0.5 inline" /> : <ArrowUp className="w-2.5 h-2.5 ml-0.5 inline" />)
              : <ArrowUpDown className="w-2.5 h-2.5 ml-0.5 inline opacity-30" />}
          </div>
          <div className="text-right cursor-pointer flex items-center justify-end" onClick={() => handleSectorListSort('flow')}>
            资金流入
            {sectorListSort === 'flow'
              ? (sectorListDir === 'desc' ? <ArrowDown className="w-2.5 h-2.5 ml-0.5 inline" /> : <ArrowUp className="w-2.5 h-2.5 ml-0.5 inline" />)
              : <ArrowUpDown className="w-2.5 h-2.5 ml-0.5 inline opacity-30" />}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="text-center text-[#8a8d93] text-xs py-8">加载中...</div>
          )}
          {!loading && sectors.length === 0 && (
            <div className="text-center text-[#8a8d93] text-xs py-8">
              暂无板块数据
            </div>
          )}
          {sortedSectors.map((s) => {
            const chg = (s as any)['涨跌幅'] as number | undefined
            const flow = (s as any)['主力净流入'] as number | undefined
            const isUp = (chg ?? 0) >= 0
            const isFlowIn = (flow ?? 0) >= 0
            return (
              <div
                key={s.key}
                onClick={() => handleSectorClick(s.key, s['板块名称'])}
                className={`px-3 py-2 text-xs cursor-pointer border-l-2 transition-colors ${
                  selectedKey === s.key
                    ? 'border-[#06b6d4] bg-[#06b6d4]/10 text-white'
                    : 'border-transparent hover:bg-[#1e2d4a]/50 text-[#8a8d93]'
                }`}
              >
                <div className="grid grid-cols-[1fr_50px_60px] gap-1 items-center">
                  <div className="flex flex-col truncate">
                    <span className="truncate">{s['板块名称']}</span>
                    <span className="text-[10px] text-[#8a8d93]">{s['股票数']}只</span>
                  </div>
                  <div className="text-right">
                    {chg !== undefined ? (
                      <span className={`text-[10px] font-mono font-bold ${isUp ? 'text-[#ff4d6d]' : 'text-[#00b826]'}`}>
                        {isUp ? '+' : ''}{chg.toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#8a8d93]">--</span>
                    )}
                  </div>
                  <div className="text-right">
                    {flow !== undefined ? (
                      <span className={`text-[10px] font-mono ${isFlowIn ? 'text-[#ff4d6d]' : 'text-[#00b826]'}`}>
                        {isFlowIn ? '+' : ''}{fmtSectorFlow(flow)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#8a8d93]">--</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 右侧：板块成分股 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-2 border-b border-[#2d3748] flex items-center gap-3 shrink-0">
          <span className="text-sm font-medium text-white">
            {selectedSector || '请选择板块'}
          </span>
          {selectedSector && (
            <span className="text-xs text-[#8a8d93]">{sectorStocks.length} 只股票</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {!selectedSector && (
            <div className="flex items-center justify-center h-full text-[#8a8d93] text-sm">
              ← 请选择左侧板块
            </div>
          )}
          {selectedSector && loadingStocks && (
            <div className="text-center text-[#8a8d93] text-xs py-8">加载成分股中...</div>
          )}
          {selectedSector && !loadingStocks && sectorStocks.length === 0 && (
            <div className="text-center text-[#8a8d93] text-xs py-8">暂无成分股数据</div>
          )}
          {!loadingStocks && sectorStocks.length > 0 && (
            <div className="divide-y divide-[#1e2d4a]">
              {/* 表头 */}
              <div className="bg-[#0d1b3e] px-4 py-2 grid grid-cols-4 gap-2 text-[10px] text-[#8a8d93] font-medium sticky top-0 select-none">
                <div className="cursor-pointer flex items-center" onClick={() => handleSort('name')}>
                  名称
                  {sortColumn === 'name'
                    ? (sortDirection === 'desc' ? <ArrowDown className="w-2.5 h-2.5 ml-0.5 inline" /> : <ArrowUp className="w-2.5 h-2.5 ml-0.5 inline" />)
                    : <ArrowUpDown className="w-2.5 h-2.5 ml-0.5 inline opacity-30" />}
                </div>
                <div className="text-right cursor-pointer flex items-center justify-end" onClick={() => handleSort('price')}>
                  现价
                  {sortColumn === 'price'
                    ? (sortDirection === 'desc' ? <ArrowDown className="w-2.5 h-2.5 ml-0.5 inline" /> : <ArrowUp className="w-2.5 h-2.5 ml-0.5 inline" />)
                    : <ArrowUpDown className="w-2.5 h-2.5 ml-0.5 inline opacity-30" />}
                </div>
                <div className="text-right cursor-pointer flex items-center justify-end" onClick={() => handleSort('changePct')}>
                  涨幅
                  {sortColumn === 'changePct'
                    ? (sortDirection === 'desc' ? <ArrowDown className="w-2.5 h-2.5 ml-0.5 inline" /> : <ArrowUp className="w-2.5 h-2.5 ml-0.5 inline" />)
                    : <ArrowUpDown className="w-2.5 h-2.5 ml-0.5 inline opacity-30" />}
                </div>
                <div className="text-right cursor-pointer flex items-center justify-end" onClick={() => handleSort('changeAmt')}>
                  涨跌幅
                  {sortColumn === 'changeAmt'
                    ? (sortDirection === 'desc' ? <ArrowDown className="w-2.5 h-2.5 ml-0.5 inline" /> : <ArrowUp className="w-2.5 h-2.5 ml-0.5 inline" />)
                    : <ArrowUpDown className="w-2.5 h-2.5 ml-0.5 inline opacity-30" />}
                </div>
              </div>
              {sortedStocks.map((stock: any) => {
                const changePct = parseFloat(stock['涨跌幅'] || 0)
                const price = parseFloat(stock['最新价'] || 0)
                const code = String(stock['代码'] || '')
                const name = String(stock['名称'] || '')
                return (
                  <div
                    key={code}
                    onClick={() => onSelectStock(code)}
                    className="px-4 py-2 grid grid-cols-4 gap-2 text-xs hover:bg-[#1e2d4a]/50 cursor-pointer transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="text-white font-medium">{name}</span>
                      <span className="text-[10px] text-[#8a8d93]">{code}</span>
                    </div>
                    <div className={`text-right font-mono ${changePct >= 0 ? 'text-[#15b755]' : 'text-[#f23645]'}`}>
                      {price.toFixed(2)}
                    </div>
                    <div className={`text-right font-mono font-bold ${changePct >= 0 ? 'text-[#15b755]' : 'text-[#f23645]'}`}>
                      {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                    </div>
                    <div className="text-right text-[#8a8d93] font-mono">
                      {stock['涨跌额'] || '--'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function fmtSectorFlow(v: number): string {
  const absV = Math.abs(v)
  if (absV >= 100000000) return (v / 100000000).toFixed(1) + '亿'
  if (absV >= 10000) return (v / 10000).toFixed(0) + '万'
  return v.toFixed(0)
}
