/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { debounce } from 'lodash';
import { utc } from 'moment';
import { PlotRelayoutEvent } from 'plotly.js';
import * as React from 'react';
import Plot from 'react-plotly.js';
import { TimeInterval } from '../../../common/TimeInterval';
import { updateSliderRange } from '../redux/actions/extraActions';
import { readingsApi, stableEmptyLineReadings } from '../redux/api/readingsApi';
import { useAppDispatch, useAppSelector } from '../redux/reduxHooks';
import { selectLineChartQueryArgs } from '../redux/selectors/chartQuerySelectors';
import { selectLineChartDeps, selectPlotlyGroupData, selectPlotlyMeterData } from '../redux/selectors/lineChartSelectors';
import { selectLineUnitLabel } from '../redux/selectors/plotlyDataSelectors';
import { selectSelectedLanguage, selectTheme } from '../redux/slices/appStateSlice';
import Locales from '../types/locales';
import { useTranslate } from '../redux/componentHooks';
import { setInitialXAxisRange, selectSliderRangeInterval, selectYMin, selectYMax, setYMin, setYMax, selectQueryTimeInterval } from '../redux/slices/graphSlice';


/**
 * @returns plotlyLine graphic
 */
export default function LineChartComponent() {
	const translate = useTranslate();
	const dispatch = useAppDispatch();
	// get current data fetching arguments
	const { meterArgs, groupArgs, meterShouldSkip, groupShouldSkip } = useAppSelector(selectLineChartQueryArgs);
	// get data needed to derive/ format data from query response
	const { meterDeps, groupDeps } = useAppSelector(selectLineChartDeps);
	const locale = useAppSelector(selectSelectedLanguage);
	// initial slider range
	const sliderRangeInterval = useAppSelector(selectSliderRangeInterval);
	const yMin = useAppSelector(selectYMin);
	const yMax = useAppSelector(selectYMax);
	const queryTimeInterval = useAppSelector(selectQueryTimeInterval);

	// Fetch data, and derive plotly points
	const { data: meterPlotlyData, isFetching: meterIsFetching } = readingsApi.useLineQuery(meterArgs,
		{
			pollingInterval: 10000,
			skip: meterShouldSkip,
			// Custom Data Derivation with query hook properties.
			selectFromResult: ({ data, ...rest }) => ({
				...rest,
				// use query data as selector parameter, pass in data dependencies.
				// Data may still be in transit, so pass a stable empty reference if needed for memoization.
				data: selectPlotlyMeterData(data ?? stableEmptyLineReadings, meterDeps)
			})
		});

	const { data: groupPlotlyData = stableEmptyLineReadings, isFetching: groupIsFetching } = readingsApi.useLineQuery(groupArgs,
		{
			pollingInterval: 10000,
			skip: groupShouldSkip,
			selectFromResult: ({ data, ...rest }) => ({
				...rest,
				data: selectPlotlyGroupData(data ?? stableEmptyLineReadings, groupDeps)
			})
		});

	// Use Query Data to derive plotly datasets memoized selector
	const unitLabel = useAppSelector(selectLineUnitLabel);

	const theme = useAppSelector(selectTheme);
	const isDarkMode = theme === 'dark';

	// Updated Palette: Cyan (L1), Pink (L2), Yellow (L3), etc.
	const themeColors = React.useMemo(() => isDarkMode
		? ['#FF007F', '#FFCC00', '#00f2ea', '#5E5CE6', '#10B981']
		: ['#5E5CE6', '#E11D48', '#10B981', '#F59E0B', '#EF4444'], [isDarkMode]);

	const currentData: Partial<Plotly.PlotData>[] = React.useMemo(() => {
		const rawData = meterPlotlyData.concat(groupPlotlyData);

		const mappedData = rawData.map((trace, i) => {
			const color = themeColors[i % themeColors.length];

			return {
				...trace,
				mode: 'lines',
				type: 'scatter',
				line: {
					shape: 'spline',
					smoothing: 1,
					width: 2,          // uniform thin lines
					color: color,
					dash: 'solid'      // no dashed/dotted lines
				},
				fill: 'tozeroy',
				fillcolor: color + '1A' // soft fill (10% opacity)
			} as Partial<Plotly.PlotData>;
		});

		// ✅ Global Average — flat line, computed from 2-minute resampled data
		if (meterPlotlyData.length > 1 && groupArgs.ids.length > 0) {
			const allX = new Set<string>();
			let totalSum = 0;
			let totalCount = 0;
			const BUCKET_MS = 2 * 60 * 1000; // 2 minutes

			meterPlotlyData.forEach(trace => {
				if (trace.x && Array.isArray(trace.x)) {
					trace.x.forEach((x: any) => allX.add(String(x)));
				}
				// Resample into 2-min buckets: take one value per bucket
				if (trace.x && trace.y && Array.isArray(trace.x) && Array.isArray(trace.y)) {
					const buckets: Record<number, { sum: number; count: number }> = {};
					for (let i = 0; i < trace.x.length; i++) {
						const ts = new Date(String(trace.x[i])).getTime();
						const y = Number(trace.y[i]);
						if (isNaN(y) || isNaN(ts)) continue;
						const bucketKey = Math.floor(ts / BUCKET_MS);
						if (!buckets[bucketKey]) {
							buckets[bucketKey] = { sum: 0, count: 0 };
						}
						buckets[bucketKey].sum += y;
						buckets[bucketKey].count++;
					}
					// Average each bucket, then add to the overall total
					Object.values(buckets).forEach(b => {
						totalSum += b.sum / b.count; // avg reading in this 2-min window
						totalCount++;
					});
				}
			});

			const overallAvg = totalCount > 0 ? totalSum / totalCount : 0;
			const xArray = Array.from(allX).sort();

			const averageTrace: Partial<Plotly.PlotData> = {
				name: `Average (${overallAvg.toPrecision(5)})`,
				x: xArray,
				y: xArray.map(() => overallAvg),
				type: 'scatter',
				mode: 'lines',
				line: {
					shape: 'spline',
					smoothing: 1.2,
					width: 2,
					color: '#6B7280',
					dash: 'dash'
				},
				fill: 'none',
				hoverinfo: 'text',
				text: xArray.map(
					x => `<b>${x}</b><br>Average: ${overallAvg.toPrecision(6)}`
				) as any
			};

			mappedData.unshift(averageTrace);
		}

		return mappedData;
	}, [meterPlotlyData, groupPlotlyData, themeColors]);

	// Persistent Data Buffer to prevent flashing
	const [displayedData, setDisplayedData] = React.useState<Partial<Plotly.PlotData>[]>([]);

	React.useEffect(() => {
		// If we have data, always update
		if (currentData.length > 0) {
			setDisplayedData(currentData);
		}
		// If we define "no data" but we are NOT fetching, then it's truly empty, so clear
		else if (!meterIsFetching && !groupIsFetching) {
			setDisplayedData([]);
		}
		// If data is empty BUT we are fetching, do nothing (keep previous displayedData)
	}, [currentData, meterIsFetching, groupIsFetching]);

	const data = displayedData;

	// Getting the entire x-axis range from all traces
	// This is used to set the initial x-axis range when the component mounts.
	// It ensures that the graph starts with a range that covers all data points. That would be used for querying the data.
	// If there are no data points, minX and maxX will be undefined.
	const allX = React.useMemo(
		() =>
			data.flatMap(trace => {
				if (!trace.x) return [];
				// If trace.x is an array of arrays, flatten it
				if (Array.isArray(trace.x[0])) {
					return (trace.x as any[][]).flat();
				}
				// Otherwise, it's a flat array
				return trace.x as (string | number | Date)[];
			}),
		[data]
	);

	const minX = allX.length ? utc(allX.reduce((a, b) => utc(a).isBefore(utc(b)) ? a : b)) : undefined;
	const maxX = allX.length ? utc(allX.reduce((a, b) => utc(a).isAfter(utc(b)) ? a : b)) : undefined;

	React.useEffect(() => {
		if (minX && maxX) {
			dispatch(setInitialXAxisRange(new TimeInterval(minX, maxX)));
		}
	}, [minX, maxX]);




	// Check if there is at least one valid graph
	const enoughData = data.find(trace => (trace.x && (trace.x as any[]).length >= 1));

	const handleRelayout = React.useMemo(() => debounce(
		(e: PlotRelayoutEvent) => {
			// Handle X-Axis changes (Time)
			if (e['xaxis.range[0]'] && e['xaxis.range[1]']) {
				const startTS = utc(e['xaxis.range[0]']);
				const endTS = utc(e['xaxis.range[1]']);
				const workingTimeInterval = new TimeInterval(startTS, endTS);
				dispatch(updateSliderRange(workingTimeInterval));
			}
			else if (e['xaxis.range']) {
				const range = e['xaxis.range']!;
				const startTS = range && range[0];
				const endTS = range && range[1];
				dispatch(updateSliderRange(new TimeInterval(utc(startTS), utc(endTS))));
			} else if (e['xaxis.autorange'] === true || (e as any)['autorange'] === true) {
				dispatch(updateSliderRange(TimeInterval.unbounded()));
			}

			// Handle Y-Axis changes (Data Range), persists user pan/zoom
			if (e['yaxis.range[0]'] && e['yaxis.range[1]']) {
				dispatch(setYMin(e['yaxis.range[0]']));
				dispatch(setYMax(e['yaxis.range[1]']));
			} else if (e['yaxis.autorange'] === true || (e as any)['autorange'] === true) {
				// If user double clicks to reset, clear manual ranges
				dispatch(setYMin(undefined));
				dispatch(setYMax(undefined));
			}
		}, 500, { leading: false, trailing: true }
	), [dispatch]);

	// Customize the layout of the plot
	// See https://community.plotly.com/t/replacing-an-empty-graph-with-a-message/31497 for showing text not plot.
	if (data.length === 0) {
		return <h1>{`${translate('select.meter.group')}`}	</h1>;
	} else if (!enoughData) {
		return <h1>{`${translate('no.data.in.range')}`}</h1>;
	} else {
		let minDate = '';
		let maxDate = '';
		for (const trace of data) {
			if (trace.x && trace.x.length > 0) {
				const traceMin = trace.x[0] as string;
				const traceMax = trace.x[trace.x.length - 1] as string;
				// Update minX if this is the first trace or has an earlier date
				if (minDate === '' || utc(traceMin).isBefore(utc(minDate))) {
					minDate = traceMin;
				}
				// Update maxX if this is the first trace or has a later date
				if (maxDate === '' || utc(traceMax).isAfter(utc(maxDate))) {
					maxDate = traceMax;
				}
			}
		}
		const sliderRange: [string, string] | undefined = sliderRangeInterval?.getIsBounded()
			? [
				sliderRangeInterval.getStartTimestamp()!.utc().toISOString(),
				sliderRangeInterval.getEndTimestamp()!.utc().toISOString()
			]
			: undefined;
		// Either sets the xRange to the minDate maxDate or the saved slider range. This keeps the range from resetting when we toggle error bars.
		const xRange: [string, string] = sliderRange ?? [minDate, maxDate];

		let yRange: [number, number] | undefined = undefined;
		let calcMin = Number.MAX_VALUE;
		let calcMax = -Number.MAX_VALUE;
		let hasData = false;

		for (const trace of data) {
			if (trace.y) {
				const yArr = (Array.isArray(trace.y[0]) ? (trace.y as any[]).flat() : trace.y) as number[];
				for (const val of yArr) {
					if (typeof val === 'number') {
						if (val < calcMin) calcMin = val;
						if (val > calcMax) calcMax = val;
						hasData = true;
					}
				}
			}
		}

		if (hasData) {
			const range = calcMax - calcMin;
			const padding = range === 0 ? 1 : range * 0.1;
			yRange = [
				yMin !== undefined ? yMin : calcMin - padding,
				yMax !== undefined ? yMax : calcMax + padding
			];
		}

		// ── Max / Min dotted lines & Band ──
		// Compute per-trace peak values (skip the Average trace)
		let globalMax = -Number.MAX_VALUE;
		let globalMin = Number.MAX_VALUE;
		let maxTraceName = '';
		let minTraceName = '';

		for (const trace of data) {
			if (!trace.y || !trace.name) continue;
			// Skip the average line
			if (typeof trace.name === 'string' && trace.name.startsWith('Average')) continue;
			const yArr = (Array.isArray(trace.y[0]) ? (trace.y as any[]).flat() : trace.y) as number[];
			for (const val of yArr) {
				if (typeof val === 'number') {
					if (val > globalMax) { globalMax = val; maxTraceName = String(trace.name); }
					if (val < globalMin) { globalMin = val; minTraceName = String(trace.name); }
				}
			}
		}

		const bandValue = hasData && globalMax > -Number.MAX_VALUE ? globalMax - globalMin : 0;

		// Plotly horizontal line shapes for max and min
		const bandShapes: Partial<Plotly.Shape>[] = hasData && globalMax > -Number.MAX_VALUE ? [
			{
				type: 'line',
				xref: 'paper',
				yref: 'y',
				x0: 0, x1: 1,
				y0: globalMax, y1: globalMax,
				line: { color: isDarkMode ? '#EF4444' : '#DC2626', width: 1.5, dash: 'dot' }
			},
			{
				type: 'line',
				xref: 'paper',
				yref: 'y',
				x0: 0, x1: 1,
				y0: globalMin, y1: globalMin,
				line: { color: isDarkMode ? '#3B82F6' : '#2563EB', width: 1.5, dash: 'dot' }
			}
		] : [];

		// Annotations for max/min labels on the right edge
		const bandAnnotations: Partial<Plotly.Annotations>[] = hasData && globalMax > -Number.MAX_VALUE ? [
			{
				xref: 'paper', yref: 'y',
				x: 1.0, y: globalMax,
				text: `Max: ${globalMax.toPrecision(5)}`,
				showarrow: false,
				font: { size: 10, color: isDarkMode ? '#EF4444' : '#DC2626' },
				xanchor: 'right',
				yshift: 10
			},
			{
				xref: 'paper', yref: 'y',
				x: 1.0, y: globalMin,
				text: `Min: ${globalMin.toPrecision(5)}`,
				showarrow: false,
				font: { size: 10, color: isDarkMode ? '#3B82F6' : '#2563EB' },
				xanchor: 'right',
				yshift: -10
			}
		] : [];

		return (
			<div style={{ position: 'relative', width: '100%', height: '100%' }}>
				{/* Band info box */}
				{hasData && globalMax > -Number.MAX_VALUE && (
					<div style={{
						position: 'absolute',
						top: '4px',
						right: '60px',
						zIndex: 10,
						display: 'flex',
						gap: '12px',
						alignItems: 'center',
						padding: '6px 14px',
						borderRadius: '10px',
						background: isDarkMode ? 'rgba(22,27,34,0.85)' : 'rgba(255,255,255,0.9)',
						border: isDarkMode ? '1px solid #30363d' : '1px solid #E5E7EB',
						backdropFilter: 'blur(6px)',
						fontFamily: 'Inter, sans-serif',
						fontSize: '10px'
					}}>
						<span style={{ color: isDarkMode ? '#EF4444' : '#DC2626', fontWeight: 600 }}>
							▲ Max: {globalMax.toPrecision(5)}{maxTraceName ? ` (${maxTraceName})` : ''}
						</span>
						<span style={{ color: isDarkMode ? '#3B82F6' : '#2563EB', fontWeight: 600 }}>
							▼ Min: {globalMin.toPrecision(5)}{minTraceName ? ` (${minTraceName})` : ''}
						</span>
						<span style={{
							padding: '2px 8px',
							borderRadius: '6px',
							background: isDarkMode ? 'rgba(139,92,246,0.15)' : 'rgba(99,102,241,0.1)',
							color: isDarkMode ? '#A78BFA' : '#6366F1',
							fontWeight: 700
						}}>
							Band: {bandValue.toPrecision(5)}
						</span>
					</div>
				)}
				<Plot
					useResizeHandler={true}
					data={data}
					style={{ width: '100%', height: '100%' }}
					layout={{
						font: { family: 'Inter, sans-serif', color: isDarkMode ? '#FFFFFF' : '#111111' },
						paper_bgcolor: 'transparent',
						plot_bgcolor: 'transparent',
						margin: { t: 30, b: 40, r: 20, l: 40 },
						autosize: true,
						showlegend: true,
						legend: {
							x: 0,
							y: 1.1,
							orientation: 'h',
							font: { size: 12, color: isDarkMode ? '#FFFFFF' : '#374151' }
						},
						modebar: { orientation: 'v' },
						shapes: bandShapes as any,
						annotations: bandAnnotations as any,
						yaxis: {
							title: { text: unitLabel, font: { size: 12, color: isDarkMode ? '#FFFFFF' : '#111111' } },
							gridcolor: isDarkMode ? '#21262d' : '#F3F4F6',
							fixedrange: false,
							zeroline: false,
							tickfont: { color: isDarkMode ? 'white' : '#111111', size: 11 },
							range: yRange,
							autorange: !yRange
						},
						xaxis: {
						rangeslider: { visible: false },
						range: xRange,
						showgrid: false,
						gridcolor: isDarkMode ? '#21262d' : '#F3F4F6',
						tickfont: { color: isDarkMode ? 'white' : '#111111', size: 11 },
						zeroline: false
					},
						hovermode: 'x unified',
						hoverlabel: {
							bgcolor: isDarkMode ? '#161b22' : '#FFFFFF',
							bordercolor: isDarkMode ? '#30363d' : 'transparent',
							font: { family: 'Inter', size: 13, color: isDarkMode ? 'white' : '#111111' },
							namelength: -1
						}
					}}
					config={{
						scrollZoom: true,
						responsive: true,
						displayModeBar: true,
						displaylogo: false,
						modeBarButtons: [[
							{
								name: 'fullscreen',
								title: translate('fullscreen') || 'Toggle Full Screen',
								icon: {
									width: 24,
									height: 24,
									path: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z'
								},
								click: function (gd: any) {
									const elt = gd.parentElement; // Get Plotly container
									if (!document.fullscreenElement) {
										if (elt?.requestFullscreen) {
											elt.requestFullscreen().catch((err: Error) => {
												alert(`Error attempting to enable fullscreen mode: ${err.message}`);
											});
										}
									} else {
										if (document.exitFullscreen) {
											document.exitFullscreen();
										}
									}
								}
							}
						]],
						locale,
						// Available Locales
						locales: Locales
					}}
					onRelayout={handleRelayout}
				/>
			</div>
		);
	}
}
