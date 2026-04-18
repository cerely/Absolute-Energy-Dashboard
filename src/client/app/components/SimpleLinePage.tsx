/* eslint-disable jsdoc/require-returns */
import * as React from 'react';
import Plot from 'react-plotly.js';
import 'plotly.js-dist-min';
import { getDashboardSettings } from '../hooks/useDashboardSettings';
import * as moment from 'moment';
import { useAppSelector } from '../redux/reduxHooks';
import { selectAllMeters } from '../redux/api/metersApi';
import { selectTheme } from '../redux/slices/appStateSlice';
import { useDashboardSettings } from '../hooks/useDashboardSettings';

// Fallback meters if no dashboard settings are configured
const FALLBACK_METERS = [
	{ id: 126, name: 'Absfloor2/30084_kWh1_(Imp)' },
	{ id: 132, name: 'Absfloor2/30086_kWh2_(Imp)' }
];

const COLORS = ['#5E5CE6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];

interface SimpleLinePageProps {
	selectedDeviceId?: string | null;
}

/**
 *
 */
export default function SimpleLinePage({ selectedDeviceId }: SimpleLinePageProps = {}) {
	const [data, setData] = React.useState<Partial<Plotly.PlotData>[]>([]);
	const [error, setError] = React.useState<string | null>(null);
	const [loaded, setLoaded] = React.useState(false);
	const allMeters = useAppSelector(selectAllMeters);
	const theme = useAppSelector(selectTheme);
	const isDarkMode = theme === 'dark';
	const { settings, isLoaded } = useDashboardSettings();

	const chartColors = React.useMemo(() => isDarkMode
		? ['#00f2ea', '#FF007F', '#FFCC00', '#5E5CE6', '#10B981']
		: COLORS, [isDarkMode]);
	const [rawData, setRawData] = React.useState<{ meter: any, readings: any[] }[]>([]);

	// Initial data load effect
	React.useEffect(() => {
		if (!isLoaded || !allMeters || allMeters.length === 0) return;

		let meters: { id: number; name: string }[];

		const customDevice = selectedDeviceId ? settings.customDashboardDevices?.find(d => d.id === selectedDeviceId) : null;

		if (customDevice && customDevice.energyConsumptionMeterIds && customDevice.energyConsumptionMeterIds.length > 0) {
			// Prefer custom device meters for the graph
			const customIds = [...customDevice.energyConsumptionMeterIds].filter(id => id != null) as number[];
			const idSet = new Set(customIds);
			meters = allMeters
				.filter(m => idSet.has(m.id))
				.map(m => ({
					id: m.id,
					name: m.identifier || m.name || `Meter #${m.id}`
				}));
		} else if (settings.dashboardMeterIds.length > 0 && allMeters.length > 0) {
			const idSet = new Set(settings.dashboardMeterIds);
			meters = allMeters
				.filter(m => idSet.has(m.id))
				.map(m => ({
					id: m.id,
					name: m.identifier || m.name || `Meter #${m.id}`
				}));
		} else {
			meters = FALLBACK_METERS;
		}

		if (meters.length === 0) meters = FALLBACK_METERS;

		async function load() {
			try {
				const days = settings.dashboardGraphDays || 1;
				const startTime = moment().subtract(days, 'days').format();
				const timeInterval = `${startTime}_`;

				const results = await Promise.allSettled(
					meters.map(m =>
						fetch(`/api/readings/line/raw/meter/${m.id}?timeInterval=${encodeURIComponent(timeInterval)}`).then(r => r.ok ? r.json() : null)
					)
				);

				const processedResults = meters.map((m, i) => {
					const result = results[i];
					return {
						meter: m,
						readings: (result.status === 'fulfilled' && Array.isArray(result.value)) ? result.value : []
					};
				});

				setRawData(processedResults);
				setLoaded(true);
			} catch (e: any) {
				setError(e.message ?? String(e));
				setLoaded(true);
			}
		}

		load();
	}, [allMeters, settings.dashboardMeterIds, selectedDeviceId, settings.customDashboardDevices]);

	// Trace generation effect - responds immediately to theme changes
	React.useEffect(() => {
		if (rawData.length === 0) return;

		const traces: Partial<Plotly.PlotData>[] = rawData.map(({ meter, readings }, i) => {
			const x: string[] = [];
			const y: number[] = [];
			const days = settings.dashboardGraphDays || 1;
			// Build a local-time threshold string for comparison.
			// Timestamps from the API are timezone-agnostic local times (e.g. "2026-04-18T18:30:00")
			// so we must compare against a local time string, NOT UTC.
			const now = new Date();
			const thresholdDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
			const thresholdStr = thresholdDate.getFullYear().toString().padStart(4, '0') + '-' +
				(thresholdDate.getMonth() + 1).toString().padStart(2, '0') + '-' +
				thresholdDate.getDate().toString().padStart(2, '0') + 'T00:00:00';

			readings.forEach((r: any) => {
				const timestamp = r.e ?? r.end_timestamp ?? r.endTimestamp;
				const reading = r.r ?? r.reading;
				if (timestamp != null && reading != null) {
					// The timestamp is already a timezone-agnostic local time string
					// from the server's patched moment.toJSON (format: "YYYY-MM-DDTHH:mm:ss").
					// Pass it directly to Plotly to avoid UTC re-interpretation.
					const tsStr = String(timestamp);
					if (tsStr >= thresholdStr) {
						x.push(tsStr);
						y.push(Number(reading));
					}
				}
			});

			return {
				x,
				y,
				type: 'scatter',
				mode: 'lines',
				line: {
					shape: 'spline',
					smoothing: 1,
					width: 2,
					color: chartColors[i % chartColors.length]
				},
				fill: 'tozeroy',
				fillcolor: chartColors[i % chartColors.length] + '1A',
				name: meter.name
			} as any;
		}).filter(t => (t.x as any[]).length > 0);

		setData(traces as Partial<Plotly.PlotData>[]);
	}, [rawData, chartColors, settings.dashboardGraphDays]);

	// Calculate y-axis range based on data for better comparison (avoids starting at 0)
	const yRange = React.useMemo(() => {
		if (data.length === 0) return undefined;
		let min = Infinity;
		let max = -Infinity;
		data.forEach(t => {
			(t.y as any[]).forEach(val => {
				if (val < min) min = val;
				if (val > max) max = val;
			});
		});
		if (min === Infinity) return undefined;
		const range = max - min;
		const padding = range === 0 ? 1 : range * 0.1;
		return [min - padding, max + padding];
	}, [data]);

	if (error) return <div style={{ padding: '20px', color: '#EF4444' }}>Error: {error}</div>;
	if (!isLoaded || !loaded) {
		return (
			<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '290px', gap: '12px' }}>
				<div className="spinner-border text-primary" role="status" style={{ width: '1.5rem', height: '1.5rem', borderRightColor: 'transparent' }}></div>
				<span style={{ fontSize: '12px', color: '#9CA3AF' }}>Loading energy data...</span>
			</div>
		);
	}
	if (data.length === 0) return <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', fontSize: '14px', height: '290px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No data available for the selected meters. Verify settings.</div>;

	return (
		<Plot
			divId="dashboard-current-day-graph"
			data={data}
			layout={{
				font: { family: 'Inter, sans-serif', color: isDarkMode ? '#8b949e' : '#6B7280' },
				autosize: true,
				paper_bgcolor: 'transparent',
				plot_bgcolor: 'transparent',
				margin: { l: 40, r: 20, t: 20, b: 40 },
				xaxis: {
					type: 'date',
					automargin: true,
					showgrid: false,
					showline: false,
					tickfont: { color: isDarkMode ? '#8b949e' : '#9CA3AF', size: 12 }
				},
				yaxis: {
					range: yRange,
					automargin: true,
					gridcolor: isDarkMode ? '#21262d' : '#F3F4F6',
					zeroline: false,
					tickfont: { color: isDarkMode ? '#8b949e' : '#9CA3AF', size: 12 }
				},
				hovermode: 'x unified',
				hoverlabel: {
					bgcolor: isDarkMode ? '#161b22' : '#FFFFFF',
					bordercolor: isDarkMode ? '#30363d' : 'transparent',
					font: { family: 'Inter', size: 13, color: isDarkMode ? '#e6edf3' : '#111111' }
				},
				legend: {
					orientation: 'h',
					x: 0,
					y: 1.1,
					font: { color: isDarkMode ? '#e6edf3' : '#6B7280' }
				}
			}}
			useResizeHandler
			style={{ width: '100%', height: '290px' }}
			config={{ responsive: true, displayModeBar: 'hover', scrollZoom: true }}
		/>
	);
}
