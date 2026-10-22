import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Check, ChevronDown,
  Heart, Menu, Search, ShoppingBag, SlidersHorizontal, Sparkles, X,
} from 'lucide-react'

const icons = { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Check, ChevronDown, Heart, Menu, Search, ShoppingBag, SlidersHorizontal, Sparkles, X }

export default function Icon({ name, size = 18, strokeWidth = 1.7, ...props }) {
  const Component = icons[name] || Sparkles
  return <Component size={size} strokeWidth={strokeWidth} aria-hidden="true" {...props} />
}
