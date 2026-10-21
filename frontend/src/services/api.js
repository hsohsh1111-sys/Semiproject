const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'

export const mockProducts = [
  { id: 'p1', name: 'Sculpted Knit Top', category: 'TOP · OATMEAL', price: 89000, image: 'https://images.unsplash.com/photo-1551163943-3f6a855d1153?auto=format&fit=crop&w=900&q=85', tag: 'YOUR COLOR', tone: 'warm' },
  { id: 'p2', name: 'Everyday Leather Tote', category: 'BAG · ESPRESSO', price: 178000, image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85', tag: 'BEST MATCH', tone: 'sand' },
  { id: 'p3', name: 'Soft Form Sneakers', category: 'SHOES · CLOUD', price: 129000, image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85', tag: 'TRENDING', tone: 'coral' },
  { id: 'p4', name: 'Luna Gold Earrings', category: 'JEWELRY · 14K GOLD', price: 64000, image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=900&q=85', tag: 'JUST FOR YOU', tone: 'lilac' },
]

export async function getRecommendations(profile = {}) {
  try {
    const response = await fetch(`${API_BASE}/outfits/recommendations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile),
    })
    if (!response.ok) throw new Error('API unavailable')
    return await response.json()
  } catch {
    return mockProducts
  }
}

export { API_BASE }
