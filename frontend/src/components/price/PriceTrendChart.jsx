const points = '0,70 42,58 84,62 126,43 168,50 210,31 252,39 294,16 336,26 378,9'
export default function PriceTrendChart() {
  return <div className="trend-chart" role="img" aria-label="최근 10주 가격 흐름">
    <div className="chart-grid"><span>₩180,000</span><span>₩150,000</span><span>₩120,000</span><span>₩90,000</span></div>
    <svg viewBox="0 0 378 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#d2ad7d" stopOpacity=".32"/><stop offset="100%" stopColor="#d2ad7d" stopOpacity="0"/></linearGradient></defs><polygon points={`0,100 ${points} 378,100`} fill="url(#chartFill)"/><polyline points={points} fill="none" stroke="#9b7259" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/><circle cx="378" cy="9" r="4" fill="#fff" stroke="#9b7259" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg>
    <div className="chart-labels"><span>1월 1주</span><span>1월 3주</span><span>2월 1주</span><span>2월 3주</span><span>3월 1주</span></div>
  </div>
}
