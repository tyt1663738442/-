import { useEffect, useRef, useState, useCallback } from 'react'
import type { WebSocketMessage } from '../types'

export function useWebSocket(url: string) {
  const [isConnected, setIsConnected] = useState(false)
  const [marketData, setMarketData] = useState<WebSocketMessage | null>(null)
  const ws = useRef<WebSocket | null>(null)
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    try {
      ws.current = new WebSocket(url)

      ws.current.onopen = () => {
        console.log('WebSocket 已连接')
        setIsConnected(true)
      }

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setMarketData(data)
        } catch (err) {
          console.error('解析消息失败:', err)
        }
      }

      ws.current.onclose = () => {
        console.log('WebSocket 已断开')
        setIsConnected(false)
        // 自动重连
        reconnectTimeout.current = setTimeout(connect, 3000)
      }

      ws.current.onerror = (error) => {
        console.error('WebSocket 错误:', error)
      }
    } catch (err) {
      console.error('连接失败:', err)
      reconnectTimeout.current = setTimeout(connect, 3000)
    }
  }, [url])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current)
      }
      if (ws.current) {
        ws.current.close()
      }
    }
  }, [connect])

  const sendMessage = useCallback((message: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message))
    }
  }, [])

  return { isConnected, marketData, sendMessage }
}
