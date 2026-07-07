import { memo, useEffect, useRef } from "react";

// Embeds the TradingView Advanced Real-Time Chart widget.
function TradingViewWidgetBase({ symbol, interval }: { symbol: string; interval: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = `
      <div class="tradingview-widget-container__widget" style="height:calc(100% - 32px);width:100%"></div>
      <div class="tradingview-widget-copyright" style="font-size:11px;line-height:32px;text-align:center;color:rgba(255,255,255,0.5)">
        <a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank" style="color:rgba(120,180,255,0.85)">Track all markets on TradingView</a>
      </div>
    `;
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      withdateranges: true,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      details: true,
      hotlist: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    container.current.querySelector(".tradingview-widget-container__widget")?.appendChild(script);
  }, [symbol, interval]);

  return (
    <div
      className="tradingview-widget-container h-full w-full"
      ref={container}
      style={{ height: "100%", width: "100%" }}
    />
  );
}

export const TradingViewWidget = memo(TradingViewWidgetBase);
