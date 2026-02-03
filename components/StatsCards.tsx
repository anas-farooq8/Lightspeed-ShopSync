'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, AlertCircle, CheckCircle } from 'lucide-react'

interface StatsCardsProps {
  total: number
  missingDe: number
  missingBe: number
  existsBoth: number
}

export function StatsCards({ total, missingDe, missingBe, existsBoth }: StatsCardsProps) {
  const stats = [
    {
      title: 'Total .nl Variants',
      value: total.toLocaleString(),
      icon: Package,
      color: 'bg-blue-50',
      textColor: 'text-blue-600',
      borderColor: 'border-blue-200',
    },
    {
      title: 'Missing in .de',
      value: missingDe.toLocaleString(),
      icon: AlertCircle,
      color: 'bg-red-50',
      textColor: 'text-red-600',
      borderColor: 'border-red-200',
    },
    {
      title: 'Missing in .be',
      value: missingBe.toLocaleString(),
      icon: AlertCircle,
      color: 'bg-amber-50',
      textColor: 'text-amber-600',
      borderColor: 'border-amber-200',
    },
    {
      title: 'Exists in Both',
      value: existsBoth.toLocaleString(),
      icon: CheckCircle,
      color: 'bg-green-50',
      textColor: 'text-green-600',
      borderColor: 'border-green-200',
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <Card key={stat.title} className={`${stat.borderColor} border-2`}>
            <CardHeader className={`${stat.color} pb-3`}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-600">
                  {stat.title}
                </CardTitle>
                <Icon className={`h-5 w-5 ${stat.textColor}`} />
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
