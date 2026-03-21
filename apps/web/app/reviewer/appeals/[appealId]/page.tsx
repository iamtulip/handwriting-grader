'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function ReviewerAppealsPage() {

  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function loadData() {

    const res = await fetch('/api/reviewer/appeals')

    const json = await res.json()

    setItems(json.items ?? [])

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  if (loading) {
    return <div className="p-8">Loading appeals...</div>
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">

      <h1 className="text-3xl font-bold">Appeals Dashboard</h1>

      <table className="w-full text-sm">

        <thead>
          <tr>
            <th>Student</th>
            <th>Assignment</th>
            <th>Reason</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>

        <tbody>

          {items.map(item => (

            <tr key={item.id}>

              <td>{item.user_profiles?.full_name}</td>

              <td>{item.submissions?.assignments?.title}</td>

              <td>{item.reason}</td>

              <td>{item.status}</td>

              <td>

                <Link
                  href={`/reviewer/appeals/${item.id}`}
                  className="text-blue-600"
                >
                  Review
                </Link>

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>
  )
}