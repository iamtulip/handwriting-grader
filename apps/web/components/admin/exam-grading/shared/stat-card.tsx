type Props = {
  label: string
  value: string | number
  tone?: 'default' | 'emerald' | 'amber' | 'sky'
}

export function StatCard({ label, value, tone = 'default' }: Props) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50'
      : tone === 'amber'
      ? 'border-amber-200 bg-amber-50'
      : tone === 'sky'
      ? 'border-sky-200 bg-sky-50'
      : 'border-neutral-200 bg-white'

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${toneClass}`}>
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-neutral-900">{value}</p>
    </div>
  )
}