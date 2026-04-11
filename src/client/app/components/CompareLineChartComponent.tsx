/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as moment from 'moment';
import * as React from 'react';
import Plot from 'react-plotly.js';
import { Icons } from 'plotly.js';
import { readingsApi, stableEmptyLineReadings } from '../redux/api/readingsApi';
import { useAppSelector } from '../redux/reduxHooks';
import { selectCompareLineQueryArgs } from '../redux/selectors/chartQuerySelectors';
import { selectLineUnitLabel } from '../redux/selectors/plotlyDataSelectors';
import { selectSelectedLanguage } from '../redux/slices/appStateSlice';
import Locales from '../types/locales';
import SpinnerComponent from './SpinnerComponent';
import { selectGraphState, selectShiftAmount } from '../redux/slices/graphSlice';
import ThreeDPillComponent from './ThreeDPillComponent';
import { selectThreeDComponentInfo } from '../redux/selectors/threeDSelectors';
import { selectPlotlyGroupData, selectPlotlyMeterData } from '../redux/selectors/lineChartSelectors';
import { MeterOrGroup, ShiftAmount } from '../types/redux/graph';
import { showInfoNotification, showWarnNotification } from '../utils/notifications';
import { setHelpLayout } from './ThreeDComponent';
import { toast } from 'react-toastify';
import { useTranslate } from '../redux/componentHooks';

/**
 * @returns plotlyLine graphic
 */
export default function CompareLineChartComponent() {
	const translate = useTranslate();
	const graphState = useAppSelector(selectGraphState);
	const meterOrGroupID = useAppSelector(selectThreeDComponentInfo).meterOrGroupID;
	const unitLabel = useAppSelector(selectLineUnitLabel);
	const locale = useAppSelector(selectSelectedLanguage);
	const shiftAmount = useAppSelector(selectShiftAmount);
	const { args, shouldSkipQuery, argsDeps } = useAppSelector(selectCompareLineQueryArgs);
	// getting the time interval of current data
	const timeInterval = graphState.queryTimeInterval;
	const shiftInterval = graphState.shiftTimeInterval;
	// Layout for the plot
	let layout = {};

	// Fetch original data, and derive plotly points
	const { data, isFetching } = graphState.threeD.meterOrGroup === MeterOrGroup.meters ?
		readingsApi.useLineQuery(args,
			{
				skip: shouldSkipQuery,
				selectFromResult: ({ data, ...rest }) => ({
					...rest,
					data: selectPlotlyMeterData(data ?? stableEmptyLineReadings,
						{ ...argsDeps, compatibleEntities: [meterOrGroupID!] })
				})
			})
		:
		readingsApi.useLineQuery(args,
			{
				skip: shouldSkipQuery,
				selectFromResult: ({ data, ...rest }) => ({
					...rest,
					data: selectPlotlyGroupData(data ?? stableEmptyLineReadings,
						{ ...argsDeps, compatibleEntities: [meterOrGroupID!] })
				})
			});

	// Getting the shifted data
	const { data: dataNew, isFetching: isFetchingNew } = graphState.threeD.meterOrGroup === MeterOrGroup.meters ?
		readingsApi.useLineQuery({ ...args, timeInterval: shiftInterval.toString() },
			{
				skip: shouldSkipQuery,
				selectFromResult: ({ data, ...rest }) => ({
					...rest,
					data: selectPlotlyMeterData(data ?? stableEmptyLineReadings,
						{ ...argsDeps, compatibleEntities: [meterOrGroupID!] })
				})
			})
		:
		readingsApi.useLineQuery({ ...args, timeInterval: shiftInterval.toString() },
			{
				skip: shouldSkipQuery,
				selectFromResult: ({ data, ...rest }) => ({
					...rest,
					data: selectPlotlyGroupData(data ?? stableEmptyLineReadings,
						{ ...argsDeps, compatibleEntities: [meterOrGroupID!] })
				})
			});

	// Find at least one valid trace for current data and shifted data (accept single-point traces)
	const foundOriginal = data.find(trace => (trace.x && (trace.x as any[]).length >= 1));
	const foundShifted = dataNew.find(trace => (trace.x && (trace.x as any[]).length >= 1));
	const enoughData = !!foundOriginal && !!foundShifted;

	// Display Plotly Buttons Feature
	// The number of items in defaultButtons and advancedButtons must differ as discussed below
	const defaultButtons: Plotly.ModeBarDefaultButtons[] = ['zoom2d', 'pan2d', 'select2d', 'lasso2d', 'zoomIn2d',
		'zoomOut2d', 'autoScale2d', 'resetScale2d'];
	const advancedButtons: Plotly.ModeBarDefaultButtons[] = ['zoom2d', 'select2d', 'lasso2d', 'autoScale2d', 'resetScale2d'];
	// Manage button states with useState
	const [listOfButtons, setListOfButtons] = React.useState(defaultButtons);

	// Customize the layout of the plot
	// See https://community.plotly.com/t/replacing-an-empty-graph-with-a-message/31497 for showing text `not plot.
	if (!meterOrGroupID) {
		layout = setHelpLayout(translate('select.meter.group'));
	} else if (!timeInterval.getIsBounded() || !shiftInterval.getIsBounded()) {
		layout = setHelpLayout(translate('please.set.the.date.range'));
	} else if (shiftAmount === ShiftAmount.none) {
		layout = setHelpLayout(translate('select.shift.amount'));
	} else if (!enoughData) {
		layout = setHelpLayout(translate('no.data.in.range'));
	} else {
		if (!isFetching && !isFetchingNew) {
			// Checks/warnings on received reading data (use the found traces)
			if (foundOriginal && foundShifted) {
				checkReceivedData(foundOriginal.x, foundShifted.x);
			}
		}
		// Calculate y-range for comparison
		let calcMin = Number.MAX_VALUE;
		let calcMax = -Number.MAX_VALUE;
		let hasData = false;
		[...data, ...dataNew].forEach(trace => {
			if (trace.y) {
				const yArr = (Array.isArray(trace.y[0]) ? (trace.y as any[]).flat() : trace.y) as number[];
				yArr.forEach(val => {
					if (typeof val === 'number') {
						if (val < calcMin) calcMin = val;
						if (val > calcMax) calcMax = val;
						hasData = true;
					}
				});
			}
		});

		let yRange: [number, number] | undefined = undefined;
		if (hasData) {
			const range = calcMax - calcMin;
			const padding = range === 0 ? 1 : range * 0.1;
			yRange = [calcMin - padding, calcMax + padding];
		}

		layout = {
			autosize: true, showlegend: true,
			legend: { x: 0, y: 1.1, orientation: 'h' },
			// 'fixedrange' on the yAxis means that dragging is only allowed on the xAxis which we utilize for selecting dateRanges
			yaxis: { title: unitLabel, gridcolor: '#ddd', fixedrange: true, range: yRange },
			xaxis: {
				// Set range for x-axis based on timeIntervalStr so that current data and shifted data is aligned
				range: timeInterval.getIsBounded()
					? [timeInterval.getStartTimestamp(), timeInterval.getEndTimestamp()]
					: undefined
			},
			xaxis2: {
				titlefont: { color: '#1AA5F0' },
				tickfont: { color: '#1AA5F0' },
				overlaying: 'x',
				side: 'top',
				// Set range for x-axis2 based on shiftIntervalStr so that current data and shifted data is aligned
				range: shiftInterval.getIsBounded()
					? [shiftInterval.getStartTimestamp(), shiftInterval.getEndTimestamp()]
					: undefined
			}
		};
	}

	const dashStyles = ['solid', 'dash', 'dot', 'dashdot', 'longdash', 'longdashdot'];

	const processedOriginalData = data.map((item, i) => ({
		...item,
		line: {
			...item.line,
			shape: 'spline',
			smoothing: 1,
			width: 2,
			dash: dashStyles[i % dashStyles.length] as any
		},
		fill: 'tozeroy',
		fillcolor: item.line?.color ? (item.line.color + '1A') : undefined
	}));

	const processedShiftedData = dataNew.map((item, i) => ({
		...item,
		name: 'Shifted ' + item.name,
		line: {
			...item.line,
			color: '#1AA5F0',
			shape: 'spline',
			smoothing: 1,
			width: 2,
			dash: dashStyles[(i + 1) % dashStyles.length] as any // Offset dash for shifted
		},
		xaxis: 'x2',
		fill: 'tozeroy',
		fillcolor: '#1AA5F01A',
		text: Array.isArray(item.text)
			? item.text.map(text => text.replace('<br>', '<br>Shifted '))
			: item.text?.replace('<br>', '<br>Shifted ')
	}));

	return (
		<>
			<ThreeDPillComponent />
			{isFetching || isFetchingNew
				? <SpinnerComponent loading height={50} width={50} />
				: <Plot
					// Only plot shifted data if the shiftAmount has been chosen
					data={(shiftAmount === ShiftAmount.none ? [] : [...processedOriginalData, ...processedShiftedData]) as any}
					// Fill the parent container and respond to resizes
					useResizeHandler={true}
					style={{ width: '100%', height: '100%' }}
					layout={layout}
					config={{
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
				/>
			}

		</>

	);

}

/**
 * If the number of points differs for the original and shifted lines, the data will not appear at the same places horizontally.
 * The time interval in the original and shifted line for the actual readings can have issues.
 * While the requested time ranges should be the same, the actually returned readings may differ.
 * This can happen if there are readings missing including start, end or between. If the number of readings vary then there is an issue.
 * If not, it is unlikely but can happen if there are missing readings in both lines that do not align but there are the same number missing in both.
 * This is an ugly edge case that OED is not going to try to catch now.
 * Use the last index in Redux state as a proxy for the number since need that below.
 * @param originalReading original data to compare
 * @param shiftedReading shifted data to compare
 */
function checkReceivedData(originalReading: any, shiftedReading: any) {
	let numberPointsSame = true;
	if (originalReading.length !== shiftedReading.length) {
		// If the number of points vary then then scales will not line up point by point. Warn the user.
		numberPointsSame = false;
		showWarnNotification(
			`The original line has ${originalReading.length} readings but the shifted line has ${shiftedReading.length}`
			+ ' readings which means the points will not align horizontally.'
		);
	}
	// Now see if the original and shifted lines overlap.
	if (moment(shiftedReading.at(-1).toString()) > moment(originalReading.at(0).toString())) {
		showInfoNotification(
			`The shifted line overlaps the original line starting at ${originalReading[0]}`,
			toast.POSITION.TOP_RIGHT,
			15000
		);
	}

	// Now see if day of the week aligns.
	// If the number of points is not the same then no horizontal alignment so do not tell user.
	const firstOriginReadingDay = moment(originalReading.at(0)?.toString());
	const firstShiftedReadingDay = moment(shiftedReading.at(0)?.toString());
	if (numberPointsSame && firstOriginReadingDay.day() === firstShiftedReadingDay.day()) {
		showInfoNotification('Days of week align (unless missing readings)',
			toast.POSITION.TOP_RIGHT,
			15000
		);
	}
	// Now see if the month and day align. If the number of points is not the same then no horizontal
	// alignment so do not tell user. Check if the first reading matches because only notify if this is true.
	if (numberPointsSame && monthDateSame(firstOriginReadingDay, firstShiftedReadingDay)) {
		// Loop over all readings but the first. Really okay to do first but just checked that one.
		// Note length of original and shifted same so just use original.
		let message = 'The month and day of the month align for the original and shifted readings';
		for (let i = 1; i < originalReading.length; i++) {
			if (!monthDateSame(moment(originalReading.at(i)?.toString()), moment(shiftedReading.at(i)?.toString()))) {
				// Mismatch so inform user. Should be due to leap year crossing and differing leap year.
				// Only tell first mistmatch
				message += ` until original reading at date ${moment(originalReading.at(i)?.toString()).format('ll')}`;
				break;
			}
		}
		showInfoNotification(message, toast.POSITION.TOP_RIGHT, 15000);
	}
}

/**
 * Check if the two dates have the same date and month
 * @param firstDate first date to compare
 * @param secondDate second date to compare
 * @returns true if the month and date are the same
 */
function monthDateSame(firstDate: moment.Moment, secondDate: moment.Moment) {
	// The month (0 up numbering) and date (day of month with 1 up numbering) must match.
	// The time could be checked but the granulatity should be the same for original and
	// shifted readings and only mismatch if there is missing readings. In the unlikely
	// event of having the same number of points but different missing readings then
	// the first one will mismatch the month or day unless those happen to match in which
	// case it is still true that they are generally okay so ignore all this.
	return firstDate.month() === secondDate.month() && firstDate.date() === secondDate.date();
}
