// ═══════════════════════════════════════════════════════════════
//   Chance.Staking — Centralized Theme Colors
//   Change brand colors here; all components import from this file.
//   Keep in sync with CSS variables in index.css.
// ═══════════════════════════════════════════════════════════════

export const colors = {
  // Primary brand
  primary: '#FDC70C',
  primaryLight: '#E9C46A',
  primaryDark: '#e3b209',

  // Primary with opacity helper
  primaryAlpha: (opacity: number) => `rgba(253, 199, 12, ${opacity})`,

  // Semantic
  secondary: '#38bdf8',
  accent: '#f472b6',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',

  // Surfaces
  background: '#0F0F13',
  surface: '#1A1A22',
  surfaceElevated: '#252530',
  border: '#2A2A38',

  // Text
  text: '#F0F0F5',
  textSecondary: '#8E8EA0',

  // Gradients
  primaryGradient: 'linear-gradient(135deg, #FDC70C, #e3b209)',
  heroGradient: 'linear-gradient(135deg, #26A17B 0%, #FDC70C 50%, #E9C46A 100%)',
}
