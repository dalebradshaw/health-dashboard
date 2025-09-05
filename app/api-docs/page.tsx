"use client"
import Script from "next/script"
import { useEffect, useRef, useState } from "react"

export default function ApiDocsPage() {
  const ref = useRef<HTMLDivElement>(null)
  const [token, setToken] = useState<string>("")
  const [userId, setUserId] = useState<string>("demo-user")
  const [deviceId, setDeviceId] = useState<string>("")
  useEffect(() => {
    setToken(localStorage.getItem("swaggerToken") || "")
    setUserId(localStorage.getItem("swaggerUserId") || "demo-user")
    setDeviceId(localStorage.getItem("swaggerDeviceId") || "")
  }, [])
  useEffect(() => {
    const iv = setInterval(() => {
      const w = globalThis as any
      if (w.SwaggerUIBundle && ref.current) {
        w.SwaggerUIBundle({
          url: "/openapi.yaml",
          domNode: ref.current,
          presets: [w.SwaggerUIBundle.presets.apis],
          layout: "BaseLayout",
          deepLinking: true,
          persistAuthorization: true,
          requestInterceptor: (req: any) => {
            const t = localStorage.getItem('swaggerToken')
            if (t) req.headers['Authorization'] = req.headers['Authorization'] || `Bearer ${t}`
            return req
          },
        })
        clearInterval(iv)
      }
    }, 100)
    return () => clearInterval(iv)
  }, [])
  const save = () => {
    localStorage.setItem("swaggerToken", token)
    localStorage.setItem("swaggerUserId", userId)
    localStorage.setItem("swaggerDeviceId", deviceId)
  }
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text) } catch {} }
  const ingestCurl = `curl -X POST http://localhost:3000/api/health/ingest \\\n+  -H 'Authorization: Bearer ${token || "<TOKEN>"}' \\\n+  -H 'Content-Type: application/json' \\\n+  -d '{\n  "userId": "${userId}",\n  "deviceId": "${deviceId || "<DEVICE_ID>"}",\n  "samples": [\n    {"uuid":"demo-hr-1","type":"heartRate","unit":"count/min","start":"2025-09-03T10:00:00Z","end":"2025-09-03T10:00:30Z","value":72}\n  ]\n}'`
  return (
    <div style={{ padding: 16 }}>
      <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
      <Script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js" strategy="afterInteractive" />
      <div style={{ marginBottom: 12, display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 1fr auto' }}>
        <input placeholder="Bearer token" value={token} onChange={(e)=>setToken(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
        <input placeholder="userId" value={userId} onChange={(e)=>setUserId(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
        <input placeholder="deviceId" value={deviceId} onChange={(e)=>setDeviceId(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
        <button onClick={save} style={{ padding: '8px 12px', borderRadius: 6, background: '#111', color: '#fff' }}>Save</button>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Quick curl (ingest)</div>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#0b1020', color: '#e6e6e6', padding: 12, borderRadius: 6 }}>{ingestCurl}</pre>
        <button onClick={()=>copy(ingestCurl)} style={{ padding: '6px 10px', borderRadius: 6, background: '#2563eb', color: '#fff' }}>Copy</button>
      </div>
      <div ref={ref} />
    </div>
  )
}
