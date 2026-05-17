/**
 * 股票列表面板 v3.1
 * - 涨幅 | 名称 | 换手 | 量比 | 委比 | 现价
 * - 支持分页（行情列表模式）
 * - 搜索结果模式
 */
import { useMemo } from 'react'
import { ArrowUp, ArrowDown, Minus, ChevronLeft, ChevronRight } from 'lucide-react'
import { StockInfo } from '../types'

interface Props {
  stocks: StockInfo[]
  selectedCode: string
  onSelect: (code: string) => void
  loading: boolean
  watchlistMode?: boolean
  isSearchMode?: boolean
  searchTerm?: string
  page?: number
  totalPages?: number
  total?: number
  onPageChange?: (page: number) => void
  showPagination?: boolean
}

// ====== 科技风配色 ======
const COLOR_UP = '#ff4d4f'
const COLOR_DOWN = '#00b826'
const COLOR_FLAT = '#999999'
const COLOR_BG = '#0a0f1a'
const COLOR_HEADER_BG = '#0d1525'
const COLOR_FOOTER_BG = '#0d1525'
const COLOR_BORDER = '#1a2a44'
const COLOR_SELECTED = 'rgba(0, 212, 255, 0.10)'
const COLOR_HOVER = 'rgba(0, 212, 255, 0.04)'
const TEXT_PRIMARY = '#e0e6f0'
const TEXT_SECONDARY = '#7a8aa0'

export function StockListPanel({
  stocks,
  selectedCode,
  onSelect,
  loading,
  watchlistMode = false,
  isSearchMode = false,
  searchTerm = '',
  page = 1,
  totalPages = 1,
  total = 0,
  onPageChange,
  showPagination = false,
}: Props) {
  const priceColor = (pct: number) => pct > 0 ? COLOR_UP : pct < 0 ? COLOR_DOWN : COLOR_FLAT

  if (loading && stocks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: COLOR_BG }}>
        <div className="animate-spin w-6 h-6 border-2 rounded-full" style={{
          borderColor: '#00d4ff',
          borderTopColor: 'transparent',
        }} />
      </div>
    )
  }

  const empty = stocks.length === 0

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: COLOR_BG }}>
      {/* 表头 */}
      <div
        className="px-2 py-1.5 flex items-center text-[10px] font-medium shrink-0"
        style={{
          backgroundColor: COLOR_HEADER_BG,
          color: TEXT_SECONDARY,
          borderBottom: `1px solid ${COLOR_BORDER}`,
        }}
      >
        <div className="w-10">涨幅</div>
        <div className="w-[72px] px-1">名称</div>
        <div className="w-[40px] text-right pr-1">换手</div>
        <div className="w-[40px] text-right pr-1">量比</div>
        <div className="w-[40px] text-right pr-1">委比</div>
        <div className="w-[52px] text-right pr-1">现价</div>
      </div>

      {/* 股票列表 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {empty ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <span className="text-xs" style={{ color: TEXT_SECONDARY }}>
              {isSearchMode
                ? `未找到"${searchTerm}"相关股票`
                : watchlistMode
                  ? '暂无自选股，可在大单追踪中添加'
                  : '暂无数据'}
            </span>
          </div>
        ) : (
          stocks.map((stock) => {
            const color = priceColor(stock.change_pct)
            const isSelected = selectedCode === stock.code
            const bg = isSelected ? COLOR_SELECTED : 'transparent'

            return (
              <div
                key={stock.code}
                onClick={() => onSelect(stock.code)}
                className="px-2 py-[5px] flex items-center text-xs cursor-pointer transition-colors"
                style={{
                  backgroundColor: bg,
                  borderBottom: `1px solid ${COLOR_BORDER}20`,
                  borderLeft: isSelected ? `2px solid #00d4ff` : '2px solid transparent',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = COLOR_HOVER }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = bg }}
              >
                {/* 涨幅 */}
                <div className="w-10 flex items-center gap-0.5" style={{ color }}>
                  {stock.change_pct > 0
                    ? <ArrowUp className="w-2.5 h-2.5 shrink-0" />
                    : stock.change_pct < 0
                      ? <ArrowDown className="w-2.5 h-2.5 shrink-0" />
                      : <Minus className="w-2.5 h-2.5 opacity-30 shrink-0" />}
                  <span className="font-mono font-bold text-[10px]">
                    {stock.change_pct > 0 ? '+' : ''}{stock.change_pct.toFixed(2)}%
                  </span>
                </div>

                {/* 名称 + 代码 */}
                <div className="w-[72px] px-1">
                  <div
                    className="font-medium text-xs leading-tight overflow-hidden text-ellipsis whitespace-nowrap"
                    style={{ color: TEXT_PRIMARY }}
                    title={stock.name}
                  >
                    {stock.name || stock.code}
                  </div>
                  <div style={{ fontSize: '9px', color: TEXT_SECONDARY, lineHeight: '1.2' }}>{stock.code}</div>
                </div>

                {/* 换手率 */}
                <div className="w-[40px] text-right font-mono text-[10px] pr-1" style={{ color: TEXT_SECONDARY }}>
                  {stock.turnover > 0 ? stock.turnover.toFixed(1) + '%' : '--'}
                </div>

                {/* 量比 */}
                <div className="w-[40px] text-right font-mono text-[10px] pr-1" style={{ color: '#ff8c42' }}>
                  {stock.volume_ratio > 0 ? stock.volume_ratio.toFixed(2) : '--'}
                </div>

                {/* 委比 */}
                <div className="w-[40px] text-right font-mono text-[10px] pr-1" style={{ color: priceColor((stock as any).wei_bi || 0) }}>
                  {typeof (stock as any).wei_bi === 'number'
                    ? `${(stock as any).wei_bi >= 0 ? '+' : ''}${((stock as any).wei_bi).toFixed(1)}%`
                    : '--'}
                </div>

                {/* 现价 */}
                <div className="w-[52px] text-right font-mono font-bold text-sm pr-1" style={{ color }}>
                  {stock.price > 0 ? stock.price.toFixed(2) : '--'}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 底部：统计 + 分页 */}
      <div
        className="px-2 py-1.5 text-[10px] shrink-0"
        style={{
          backgroundColor: COLOR_FOOTER_BG,
          color: TEXT_SECONDARY,
          borderTop: `1px solid ${COLOR_BORDER}`,
        }}
      >
        {showPagination && totalPages > 1 ? (
          <div className="flex items-center justify-between">
            <span>共 {total} 只 · 第 {page}/{totalPages} 页</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPageChange?.(page - 1)}
                disabled={page <= 1}
                className="p-0.5 rounded disabled:opacity-30"
                style={{ color: page > 1 ? '#00d4ff' : TEXT_SECONDARY }}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              {/* 页码快速跳转 */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p: number
                if (totalPages <= 5) {
                  p = i + 1
                } else if (page <= 3) {
                  p = i + 1
                } else if (page >= totalPages - 2) {
                  p = totalPages - 4 + i
                } else {
                  p = page - 2 + i
                }
                return (
                  <button
                    key={p}
                    onClick={() => onPageChange?.(p)}
                    className="w-5 h-5 rounded text-[9px] font-mono"
                    style={{
                      backgroundColor: p === page ? 'rgba(0,212,255,0.2)' : 'transparent',
                      color: p === page ? '#00d4ff' : TEXT_SECONDARY,
                      border: p === page ? '1px solid rgba(0,212,255,0.4)' : '1px solid transparent',
                    }}
                  >
                    {p}
                  </button>
                )
              })}
              <button
                onClick={() => onPageChange?.(page + 1)}
                disabled={page >= totalPages}
                className="p-0.5 rounded disabled:opacity-30"
                style={{ color: page < totalPages ? '#00d4ff' : TEXT_SECONDARY }}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span>共 {stocks.length} 只</span>
            <span className="flex items-center gap-2">
              <span style={{ color: COLOR_UP }}>涨 {stocks.filter(s => s.change_pct > 0).length}</span>
              <span>平 {stocks.filter(s => s.change_pct === 0).length}</span>
              <span style={{ color: COLOR_DOWN }}>跌 {stocks.filter(s => s.change_pct < 0).length}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
