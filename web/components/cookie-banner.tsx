"use client"

import { useEffect, useState } from "react"

const GA_ID = "G-EXBWHMSY2X"
const STORAGE_KEY = "cookie-consent"

function loadGA() {
  if (typeof window === "undefined") return
  const script = document.createElement("script")
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  script.async = true
  document.head.appendChild(script)
  ;(window as any).dataLayer = (window as any).dataLayer || []
  ;(window as any).gtag = function() { (window as any).dataLayer.push(arguments) }
  ;(window as any).gtag("js", new Date())
  ;(window as any).gtag("config", GA_ID)
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem(STORAGE_KEY)
    if (consent === "accepted") { loadGA(); return }
    if (consent === "declined") return
    setVisible(true)
  }, [])

  function accept() {
    localStorage.setItem(STORAGE_KEY, "accepted")
    setVisible(false)
    loadGA()
  }

  function decline() {
    localStorage.setItem(STORAGE_KEY, "declined")
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-6 left-6 z-50 w-80 bg-background border border-foreground/[0.15] p-5 shadow-sm">
      <p className="text-sm text-foreground font-medium mb-1">We use cookies</p>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        We use analytics cookies to understand how visitors use this site. No personal data is sold or shared with third parties.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={accept}
          className="flex-1 h-8 bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
        >
          Accept
        </button>
        <button
          onClick={decline}
          className="flex-1 h-8 border border-foreground/[0.12] text-xs text-muted-foreground hover:text-foreground hover:border-foreground/25 transition-colors"
        >
          Decline
        </button>
      </div>
    </div>
  )
}
