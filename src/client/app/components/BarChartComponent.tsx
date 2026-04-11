/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { debounce } from 'lodash';
import { utc } from 'moment';
import { PlotRelayoutEvent } from 'plotly.js';
import * as React from 'react';
import Plot from 'react-plotly.js';
import { Icons } from 'plotly.js';
import { TimeInterval } from '../../../common/TimeInterval';
import { updateSliderRange } from '../redux/actions/extraActions';
import { readingsApi, stableEmptyBarReadings } from '../redux/api/readingsApi';
import { useAppDispatch, useAppSelector } from '../redux/reduxHooks';
import { selectPlotlyBarDataFromResult, selectPlotlyBarDeps } from '../redux/selectors/barChartSelectors';
import { selectBarChartQueryArgs } from '../redux/selectors/chartQuerySelectors';
import { selectBarUnitLabel, selectIsRaw } from '../redux/selectors/plotlyDataSelectors';
import { selectSelectedLanguage, selectTheme } from '../redux/slices/appStateSlice';
import { setInitialXAxisRange, selectQueryTimeInterval, selectBarStacking, selectSliderRangeInterval, selectYMin, selectYMax, setYMin, setYMax } from '../redux/slices/graphSlice';
import Locales from '../types/locales';
import { useTranslate } from '../redux/componentHooks';


/**
 * Passes the current redux state of the barchart, and turns it into props for the React
 * component, which is what will be visible on the page. Makes it possible to access
 * your reducer state objects from within your React components.
 * @returns Plotly BarChart
 */
export default function BarChartComponent() {
	const translate = useTranslate();
	const dispatch = useAppDispatch();
	const { barMeterDeps, barGroupDeps } = useAppSelector(selectPlotlyBarDeps);
	const { meterArgs, groupArgs, meterShouldSkip, groupShouldSkip } = useAppSelector(selectBarChartQueryArgs);
	const locale = useAppSelector(selectSelectedLanguage);
	const { data: meterReadings, isFetching: meterIsFetching } = readingsApi.useBarQuery(meterArgs, {
		pollingInterval: 10000,
		skip: meterShouldSkip,
		selectFromResult: ({ data, ...rest }) => ({
			...rest,
			data: selectPlotlyBarDataFromResult(data ?? stableEmptyBarReadings, barMeterDeps)
		})
	});

	const { data: groupData, isFetching: groupIsFetching } = readingsApi.useBarQuery(groupArgs, {
		pollingInterval: 10000,
		skip: groupShouldSkip,
		selectFromResult: ({ data, ...rest }) => ({
			...rest,
			data: selectPlotlyBarDataFromResult(data ?? stableEmptyBarReadings, barGroupDeps)
		})
	});

	const barStacking = useAppSelector(selectBarStacking);
	const sliderRangeInterval = useAppSelector(selectSliderRangeInterval);
	const yMin = useAppSelector(selectYMin);
	const yMax = useAppSelector(selectYMax);
	// The unit label depends on the unit which is in selectUnit state.
	const raw = useAppSelector(selectIsRaw);
	const unitLabel = useAppSelector(selectBarUnitLabel);

	// Display Plotly Buttons Feature
	// The number of items in defaultButtons and advancedButtons must differ as discussed below
	const defaultButtons: Plotly.ModeBarDefaultButtons[] = ['zoom2d', 'pan2d', 'select2d', 'lasso2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d',
		'resetScale2d'];
	const advancedButtons: Plotly.ModeBarDefaultButtons[] = ['select2d', 'lasso2d', 'autoScale2d', 'resetScale2d'];
	// Manage button states with useState
	const [listOfButtons, setListOfButtons] = React.useState(defaultButtons);

	const theme = useAppSelector(selectTheme);
	const isDarkMode = theme === 'dark';

	// Updated Palette: Cyan (L1), Pink (L2), Yellow (L3), etc.
	const themeColors = isDarkMode
		? ['#00f2ea', '#FF007F', '#FFCC00', '#5E5CE6', '#10B981']
		: ['#5E5CE6', '#E11D48', '#10B981', '#F59E0B', '#EF4444'];

	const currentData: Partial<Plotly.PlotData>[] = React.useMemo(() => {
		const rawData = meterReadings.concat(groupData);
		return rawData.map((trace, i) => {
			const color = themeColors[i % themeColors.length];
			return {
				...trace,
				type: 'bar',
				marker: {
					...trace.marker,
					color: color,
					line: {
						color: color,
						width: 0
					}
				},
				hoverinfo: 'text',
				textfont: {
					color: isDarkMode ? 'white' : '#111111'
				},
				insidetextfont: {
					color: isDarkMode ? 'white' : '#111111'
				}
			} as Partial<Plotly.PlotData>;
		});
	}, [meterReadings, groupData, isDarkMode, themeColors]);

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

	const datasets = displayedData;

	// Getting the entire x-axis range from all traces
	// This is used to set the initial x-axis range when the component mounts.
	// It ensures that the graph starts with a range that covers all data points. That would be used for querying the data.
	// If there are no data points, minX and maxX will be undefined.
	const allX = React.useMemo(
		() =>
			datasets.flatMap(trace => {
				if (!trace.x) return [];
				// If trace.x is an array of arrays, flatten it
				if (Array.isArray(trace.x[0])) {
					return (trace.x as any[][]).flat();
				}
				// Otherwise, it's a flat array
				return trace.x as (string | number | Date)[];
			}),
		[datasets]
	);

	const minX = allX.length ? utc(allX.reduce((a, b) => utc(a).isBefore(utc(b)) ? a : b)) : undefined;
	const maxX = allX.length ? utc(allX.reduce((a, b) => utc(a).isAfter(utc(b)) ? a : b)) : undefined;

	// If specific query range is set, use that for the initial view.
	const queryTimeInterval = useAppSelector(selectQueryTimeInterval);

	React.useEffect(() => {
		if (queryTimeInterval.getIsBounded()) {
			dispatch(setInitialXAxisRange(queryTimeInterval));
		} else if (minX && maxX) {
			dispatch(setInitialXAxisRange(new TimeInterval(minX, maxX)));
		}
	}, [minX, maxX, queryTimeInterval, dispatch]);

	// Assign all the parameters required to create the Plotly object (data, layout, config) to the variable props, returned by mapStateToProps
	// The Plotly toolbar is displayed if displayModeBar is set to true (not for bar charts)

	// At least one viable dataset.
	const enoughData = datasets.find(dataset => dataset.x && dataset.x.length >= 1);

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

	if (raw) {
		return <h1><b>{translate('bar.raw')}</b></h1>;
	} else if (datasets.length === 0 && displayedData.length === 0) {
		return <h1>
			{`${translate('select.meter.group')}`}
		</h1>;
	} else if (!enoughData) {
		return <h1>{`${translate('no.data.in.range')}`}</h1>;
	} else {
		let minDate = '';
		let maxDate = '';
		for (const trace of datasets) {
			if (trace.x && trace.x.length > 0) {
				const traceMin = trace.x[0] as string;
				const traceMax = trace.x[trace.x.length - 1] as string;
				if (minDate === '' || utc(traceMin).isBefore(utc(minDate))) {
					minDate = traceMin;
				}
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
		const xRange: [string, string] = sliderRange ?? [minDate, maxDate];

		let yRange: [number, number] | undefined = undefined;
		if (yMin !== undefined || yMax !== undefined) {
			let calcMin = Number.MAX_VALUE;
			let calcMax = -Number.MAX_VALUE;

			if (yMin === undefined || yMax === undefined) {
				for (const trace of datasets) {
					if (trace.y) {
						const yArr = (Array.isArray(trace.y[0]) ? (trace.y as any[]).flat() : trace.y) as number[];
						for (const val of yArr) {
							if (typeof val === 'number') {
								if (val < calcMin) calcMin = val;
								if (val > calcMax) calcMax = val;
							}
						}
					}
				}
				if (calcMin === Number.MAX_VALUE) calcMin = 0;
				if (calcMax === -Number.MAX_VALUE) calcMax = 10;
			}
			yRange = [
				yMin !== undefined ? yMin : calcMin,
				yMax !== undefined ? yMax : calcMax
			];
		}

		return (
			<Plot
				className="telemetry-bar-chart"
				useResizeHandler={true}
				data={datasets}
				style={{ width: '100%', height: '100%' }}
				layout={{
					font: { family: 'Inter, sans-serif', color: isDarkMode ? 'white' : '#111111' },
					paper_bgcolor: 'transparent',
					plot_bgcolor: 'transparent',
					margin: { t: 30, b: 40, r: 20, l: 40 },
					barmode: (barStacking ? 'stack' : 'group'),
					bargap: 0.1,
					bargroupgap: 0.05,
					showlegend: true,
					legend: {
						x: 0,
						y: 1.1,
						orientation: 'h',
						font: { size: 12, color: isDarkMode ? '#FFFFFF' : '#374151' }
					},
					yaxis: {
						title: { text: unitLabel, font: { size: 12, color: isDarkMode ? '#FFFFFF' : '#111111' } },
						showgrid: true,
						gridcolor: isDarkMode ? '#21262d' : '#F3F4F6',
						fixedrange: false,
						zeroline: false,
						tickfont: { color: isDarkMode ? 'white' : '#111111', size: 11 },
						range: yRange,
						autorange: !yRange
					},
					hoverlabel: {
						bgcolor: isDarkMode ? '#161b22' : '#FFFFFF',
						bordercolor: isDarkMode ? '#30363d' : 'transparent',
						font: { family: 'Inter', size: 13, color: isDarkMode ? 'white' : '#111111' },
						namelength: -1
					},
					xaxis: {
						type: "date",
						range: xRange,
						rangeslider: {
							visible: true,
							range: [minDate, maxDate],
							borderwidth: 0,
							bgcolor: isDarkMode ? '#161b22' : '#FAFAFA'
						},
						showgrid: false,
						gridcolor: isDarkMode ? '#21262d' : '#F3F4F6',
						tickfont: { color: isDarkMode ? 'white' : '#111111', size: 11 },
						zeroline: false
					}
				}}
				config={{
					scrollZoom: true,
					responsive: true,
					displayModeBar: true,
					modeBarButtonsToRemove: listOfButtons,
					modeBarButtonsToAdd: [
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
						},
						{
							name: 'toggle-options',
							title: translate('toggle.options'),
							icon: Icons.pencil,
							click: function () {
								// # of items must differ so the length can tell which list of buttons is being set
								setListOfButtons(listOfButtons.length === defaultButtons.length ? advancedButtons : defaultButtons); // Update the state
							}
						}],
					// Current Locale
					locale,
					// Available Locales
					locales: Locales
				}}
				onRelayout={handleRelayout}
			/>
		);
	}
}
