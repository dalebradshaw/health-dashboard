"use client"
import { CardTitle, CardDescription, CardHeader, CardContent, Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ResponsiveLine } from "@nivo/line"
import { ResponsiveBar } from "@nivo/bar"
import { ClassAttributes, HTMLAttributes, JSX, SVGProps, useEffect, useMemo, useState } from "react"

type ApiPoint = { t0: string; t1: string; value: number | string; unit?: string }

export function HealthCardRow() {
  const [hrPoints, setHrPoints] = useState<ApiPoint[]>([])
  const [stepsTotal, setStepsTotal] = useState<number>(0)
  const [hr7Series, setHr7Series] = useState<{ name: string; count: number }[]>([])
  const [stepsSeries, setStepsSeries] = useState<{ name: string; count: number }[]>([])
  const [hrUpdated, setHrUpdated] = useState<string>("")
  const [stepsUpdated, setStepsUpdated] = useState<string>("")
  const [sleepText, setSleepText] = useState<string>("No data")
  const [sleepSeries, setSleepSeries] = useState<{ name: string; count: number }[]>([])

  useEffect(() => {
    const now = new Date()
    const fromHR = new Date(now.getTime() - 6 * 60 * 60 * 1000) // last 6 hours
    const fromSteps = new Date()
    fromSteps.setHours(0, 0, 0, 0)

    const fetchHR = fetch(`/api/health/query?type=heartRate&from=${fromHR.toISOString()}&to=${now.toISOString()}`)
      .then(r => r.json())
      .then(async (j) => {
        let dp = (j?.datapoints ?? []) as ApiPoint[]
        // Fallback: if empty, fetch latest without range
        if (!dp.length) {
          const j2 = await fetch(`/api/health/query?type=heartRate`).then(r => r.json()).catch(() => ({}))
          dp = (j2?.datapoints ?? []) as ApiPoint[]
        }
        setHrPoints(dp)
        if (dp.length) setHrUpdated(new Date(dp[dp.length - 1].t1).toLocaleTimeString())
      }).catch(() => {})

    const fetchSteps = fetch(`/api/health/summary?type=steps&days=7`)
      .then(r => r.json())
      .then((j) => {
        const series = (j?.series ?? []) as { name: string; count: number }[]
        setStepsSeries(series)
        const last = series[series.length - 1]
        const val = last ? Number(last.count) : 0
        setStepsTotal(Number.isFinite(val) ? val : 0)
        setStepsUpdated(new Date().toLocaleTimeString())
      }).catch(() => {})

    const fetchHR7 = fetch(`/api/health/summary?type=heartRate&days=7&agg=avg`)
      .then(r => r.json())
      .then((j) => {
        const s = (j?.series ?? []) as { name: string; count: number }[]
        setHr7Series(s)
      }).catch(() => {})

    // Sleep: fetch last 7 days and show bars; also compute last night
    const fetchSleep = fetch(`/api/health/summary?type=sleep&days=7`)
      .then(r => r.json())
      .then((j) => {
        const series = (j?.series ?? []) as { name: string; count: number }[]
        setSleepSeries(series)
        const y = series.length >= 2 ? series[series.length - 2] : series[0]
        const mins = Math.round(Number(y?.count || 0))
        const h = Math.floor(mins / 60)
        const m = mins % 60
        if (mins > 0) setSleepText(`${h}h ${m}m`)
      }).catch(() => {})

    void Promise.all([fetchHR, fetchSteps, fetchHR7, fetchSleep])
  }, [])

  const hrChartData = useMemo(() => {
    const series = hrPoints.map(p => ({ x: new Date(p.t0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), y: Number(p.value) }))
    return [{ id: "Heart Rate", data: series }]
  }, [hrPoints])

  const stepsChartData = useMemo(() => stepsSeries.map(s => ({ name: s.name.slice(5), count: s.count })), [stepsSeries])
  const hr7ChartData = useMemo(() => [{ id: '7D Avg HR', data: hr7Series.map(p => ({ x: p.name.slice(5), y: Number(p.count.toFixed(0)) })) }], [hr7Series])
  const sleepChartData = useMemo(() => sleepSeries.map(s => ({ name: s.name.slice(5), count: Number((s.count/60).toFixed(1)) })), [sleepSeries])

  return (
    <div className="flex flex-col gap-6">
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="rounded-2xl bg-yellow-500 dark:bg-yellow-400">
          <CardHeader className="flex flex-row items-start gap-4 p-6">
            <div className="grid gap-1.5">
              <CardTitle className="text-black">Heart Rate</CardTitle>
              <CardDescription className="text-black">{hrUpdated ? `Last updated ${hrUpdated}` : 'No data yet'}</CardDescription>
            </div>
            <Button className="ml-auto w-8 h-8 rounded-full border" size="icon" variant="outline">
              <PlusIcon className="w-4 h-4" />
              <span className="sr-only">Add</span>
            </Button>
          </CardHeader>
          <CardContent className="flex items-center justify-center p-6">
            <CurvedlineChart className="h-[100px] w-full aspect-[2/1]" data={hrChartData} />
          </CardContent>
        </Card>
        <Card className="rounded-2xl bg-yellow-500 dark:bg-yellow-400">
          <CardHeader className="flex flex-row items-start gap-4 p-6">
            <div className="grid gap-1.5">
              <CardTitle className="text-black-500">Steps Taken</CardTitle>
              <CardDescription className="text-black-500">{stepsUpdated ? `Today · updated ${stepsUpdated}` : 'Today'}</CardDescription>
            </div>
            <Button className="ml-auto w-8 h-8 rounded-full border" size="icon" variant="outline">
              <PlusIcon className="w-4 h-4" />
              <span className="sr-only">Add</span>
            </Button>
          </CardHeader>
          <CardContent className="flex items-center justify-center p-6">
            <BarChart className="h-[100px] w-full aspect-[2/1]" data={stepsChartData} hideXAxis />
          </CardContent>
        </Card>
        <Card className="rounded-2xl bg-yellow-500 dark:bg-yellow-400">
          <CardHeader className="flex flex-row items-start gap-4 p-6">
            <div className="grid gap-1.5">
              <CardTitle>HR 7‑Day Avg</CardTitle>
              <CardDescription>BPM daily averages</CardDescription>
            </div>
            <Button className="ml-auto w-8 h-8 rounded-full border" size="icon" variant="outline">
              <PlusIcon className="w-4 h-4" />
              <span className="sr-only">Add</span>
            </Button>
          </CardHeader>
          <CardContent className="flex items-center justify-center p-6">
            <CurvedlineChart className="h-[100px] w-full aspect-[2/1]" data={hr7ChartData} />
          </CardContent>
        </Card>
        <Card className="rounded-2xl bg-yellow-500 dark:bg-yellow-400">
          <CardHeader className="flex flex-row items-start gap-4 p-6">
            <div className="grid gap-1.5">
              <CardTitle>Sleep Analysis</CardTitle>
              <CardDescription>Last night {sleepText !== 'No data' ? `• ${sleepText}` : ''}</CardDescription>
            </div>
            <Button className="ml-auto w-8 h-8 rounded-full border" size="icon" variant="outline">
              <PlusIcon className="w-4 h-4" />
              <span className="sr-only">Add</span>
            </Button>
          </CardHeader>
          <CardContent className="flex items-center justify-center p-6">
            <BarChart className="h-[100px] w-full aspect-[2/1]" data={sleepChartData} hideXAxis />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


function PlusIcon(props: JSX.IntrinsicAttributes & SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}


function CurvedlineChart(props: (JSX.IntrinsicAttributes & ClassAttributes<HTMLDivElement> & HTMLAttributes<HTMLDivElement>) & { data?: any[] }) {
  return (
    <div {...props}>
      <ResponsiveLine
        data={props.data ?? []}
        margin={{ top: 10, right: 10, bottom: 40, left: 40 }}
        xScale={{
          type: "point",
        }}
        yScale={{
          type: "linear",
          min: 0,
          max: "auto",
        }}
        curve="monotoneX"
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickSize: 0,
          tickPadding: 16,
        }}
        axisLeft={{
          tickSize: 0,
          tickValues: 5,
          tickPadding: 16,
        }}
        colors={["#2563eb", "#e11d48"]}
        pointSize={6}
        useMesh={true}
        gridYValues={6}
        theme={{
          tooltip: {
            chip: {
              borderRadius: "9999px",
            },
            container: {
              fontSize: "12px",
              textTransform: "capitalize",
              borderRadius: "6px",
            },
          },
          grid: {
            line: {
              stroke: "#f3f4f6",
            },
          },
        }}
        role="application"
      />
    </div>
  )
}


function BarChart(props: (JSX.IntrinsicAttributes & ClassAttributes<HTMLDivElement> & HTMLAttributes<HTMLDivElement>) & { data?: any[], hideXAxis?: boolean }) {
  return (
    <div {...props}>
      <ResponsiveBar
        data={props.data ?? []}
        keys={["count"]}
        indexBy="name"
        margin={{ top: 0, right: 0, bottom: 30, left: 30 }}
        padding={0.3}
        colors={["#2563eb"]}
        axisBottom={props.hideXAxis ? null : {
          tickSize: 0,
          tickPadding: 8,
          tickRotation: 0,
        }}
        axisLeft={{
          tickSize: 0,
          tickValues: 3,
          tickPadding: 8,
        }}
        gridYValues={4}
        theme={{
          tooltip: {
            chip: {
              borderRadius: "9999px",
            },
            container: {
              fontSize: "12px",
              textTransform: "capitalize",
              borderRadius: "6px",
            },
          },
          grid: {
            line: {
              stroke: "#f3f4f6",
            },
          },
        }}
        tooltipLabel={({ id }) => `${id}`}
        enableLabel={false}
        role="application"
        ariaLabel="A bar chart showing data"
      />
    </div>
  )
}
