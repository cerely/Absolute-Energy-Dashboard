/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { values } from 'lodash';
import * as moment from 'moment';
import * as React from 'react';
import Plot from 'react-plotly.js';
import { Icons } from 'plotly.js';
import { selectGroupDataById } from '../redux/api/groupsApi';
import { selectMeterDataById } from '../redux/api/metersApi';
import { readingsApi } from '../redux/api/readingsApi';
import { selectUnitDataById } from '../redux/api/unitsApi';
import { useAppSelector } from '../redux/reduxHooks';
import { selectRadarChartQueryArgs } from '../redux/selectors/chartQuerySelectors';
import { selectScalingFromEntity } from '../redux/selectors/entitySelectors';
import {
	selectAreaUnit, selectGraphAreaNormalization, selectLineGraphRate,
	selectSelectedGroups, selectSelectedMeters, selectSelectedUnit,
	selectYMin, selectYMax, selectChartRotation
} from '../redux/slices/graphSlice';
import { selectSelectedLanguage, selectTheme } from '../redux/slices/appStateSlice';
import { DataType } from '../types/Datasources';
import Locales from '../types/locales';
import { AreaUnitType } from '../utils/getAreaUnitConversion';
import getGraphColor from '../utils/getGraphColor';
import { lineUnitLabel } from '../utils/graphics';
import { useTranslate } from '../redux/componentHooks';
import SpinnerComponent from './SpinnerComponent';
import { setHelpLayout } from '../utils/setLayout';


// Display Plotly Buttons Feature
// The number of items in defaultButtons and advancedButtons must differ as discussed below
const defaultButtons: Plotly.ModeBarDefaultButtons[] = [
	'zoom2d', 'pan2d', 'select2d', 'lasso2d', 'zoomIn2d',
	'zoomOut2d', 'autoScale2d', 'resetScale2d'
];
const advancedButtons: Plotly.ModeBarDefaultButtons[] = ['select2d', 'lasso2d', 'autoScale2d', 'resetScale2d'];

/**
 * @returns radar plotly component
 */
export default function RadarChartComponent() {
	const translate = useTranslate();
	const { meterArgs, groupArgs, meterShouldSkip, groupShouldSkip } = useAppSelector(selectRadarChartQueryArgs);
	const { data: meterReadings, isLoading: meterIsLoading } = readingsApi.useLineQuery(meterArgs, { skip: meterShouldSkip });
	const { data: groupData, isLoading: groupIsLoading } = readingsApi.useLineQuery(groupArgs, { skip: groupShouldSkip });
	// graphic unit selected
	const graphingUnit = useAppSelector(selectSelectedUnit);
	// The current selected rate
	const currentSelectedRate = useAppSelector(selectLineGraphRate);
	const unitDataById = useAppSelector(selectUnitDataById);

	const areaNormalization = useAppSelector(selectGraphAreaNormalization);
	const selectedAreaUnit = useAppSelector(selectAreaUnit);
	const selectedMeters = useAppSelector(selectSelectedMeters);
	const selectedGroups = useAppSelector(selectSelectedGroups);
	const meterDataById = useAppSelector(selectMeterDataById);
	const groupDataById = useAppSelector(selectGroupDataById);
	const yMin = useAppSelector(selectYMin);
	const yMax = useAppSelector(selectYMax);
	const theme = useAppSelector(selectTheme);
	const isDarkMode = theme === 'dark';
	const rotation = useAppSelector(selectChartRotation) ?? 0;
	const selectedLanguage = useAppSelector(selectSelectedLanguage);
	const [listOfButtons, setListOfButtons] = React.useState(defaultButtons);
	
	const COLORS = ['#5E5CE6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];
	const chartColors = isDarkMode
		? ['#00f2ea', '#FF007F', '#FFCC00', '#5E5CE6', '#10B981']
		: COLORS;
		
	let colorIdx = 0;

	const datasets: any[] = [];

	if (meterIsLoading || groupIsLoading) {
		return <SpinnerComponent loading width={50} height={50} />;
	}

	let unitLabel = '';
	let needsRateScaling = false;
	// If graphingUnit is -99 then none selected and nothing to graph so label is empty.
	// This will probably happen when the page is first loaded.
	if (graphingUnit !== -99) {
		const selectUnitState = unitDataById[graphingUnit];
		if (selectUnitState !== undefined) {
			// Determine the r-axis label and if the rate needs to be scaled.
			const returned = lineUnitLabel(selectUnitState, currentSelectedRate, areaNormalization, selectedAreaUnit);
			unitLabel = returned.unitLabel;
			needsRateScaling = returned.needsRateScaling;
		}
	}
	// The rate will be 1 if it is per hour (since state readings are per hour) or no rate scaling so no change.
	const rateScaling = needsRateScaling ? currentSelectedRate.rate : 1;

	// Add all valid data from existing meters to the radar plot
	for (const meterID of selectedMeters) {
		if (meterReadings) {
			const entity = meterDataById[meterID];
			if (!entity) continue;
			// We either don't care about area, or we do in which case there needs to be a nonzero area.
			if (!areaNormalization || (entity.area > 0 && entity.areaUnit != AreaUnitType.none)) {
				const scaling = selectScalingFromEntity(entity, selectedAreaUnit, areaNormalization, rateScaling);
				const readingsData = meterReadings[meterID];
				if (readingsData) {
					const label = entity.identifier + 'ᴹ';
					const colorID = meterID;
					// Create two arrays for the distance (rData) and angle (thetaData) values. Fill the array with the data from the line readings.
					// HoverText is the popup value show for each reading.
					const thetaData: string[] = [];
					const rData: number[] = [];
					const hoverText: string[] = [];
					const readings = values(readingsData);
					readings.sort((a, b) => a.startTimestamp - b.startTimestamp);
					readings.forEach(reading => {
						// As usual, we want to interpret the readings in UTC. We lose the timezone as these start/endTimestamp
						// are equivalent to Unix timestamp in milliseconds.
						const st = moment.utc(reading.startTimestamp);
						// Time reading is in the middle of the start and end timestamp
						const timeReading = st.add(moment.utc(reading.endTimestamp).diff(st) / 2);
						// The angular value is the date, internationalized.
						const thetaVal = timeReading.format('ddd, ll LTS');
						thetaData.push(thetaVal);
						// The scaling is the factor to change the reading by.
						const readingValue = reading.reading * scaling;
						rData.push(readingValue);
						hoverText.push(`<b> ${thetaVal} </b> <br> ${label}: ${readingValue.toPrecision(6)} ${unitLabel}`);
					});

					// This variable contains all the elements (plot values, line type, etc.) assigned to the data parameter of the Plotly object
					datasets.push({
						name: label,
						theta: thetaData,
						r: rData,
						text: hoverText,
						hoverinfo: 'text',
						type: 'scatterpolar',
						mode: 'lines',
						line: {
							shape: 'spline',
							width: 2,
							color: chartColors[colorIdx % chartColors.length]
						},
						fill: 'toself',
						fillcolor: chartColors[colorIdx++ % chartColors.length] + '1A',
					});
				}
			}
		}
	}

	// Add all valid data from existing groups to the radar plot
	for (const groupID of selectedGroups) {
		// const byGroupID = state.readings.line.byGroupID[groupID];
		if (groupData) {
			const entity = groupDataById[groupID];
			if (!entity) continue;
			// We either don't care about area, or we do in which case there needs to be a nonzero area.
			if (!areaNormalization || (entity.area > 0 && entity.areaUnit != AreaUnitType.none)) {
				const scaling = selectScalingFromEntity(entity, selectedAreaUnit, areaNormalization, rateScaling);
				const readingsData = groupData[groupID];
				if (readingsData) {
					const label = entity.name + 'ᴳ';
					const colorID = groupID;
					// Create two arrays for the distance (rData) and angle (thetaData) values. Fill the array with the data from the line readings.
					// HoverText is the popup value show for each reading.
					const thetaData: string[] = [];
					const rData: number[] = [];
					const hoverText: string[] = [];
					const readings = values(readingsData);
					readings.sort((a, b) => a.startTimestamp - b.startTimestamp);
					readings.forEach(reading => {
						// As usual, we want to interpret the readings in UTC. We lose the timezone as these start/endTimestamp
						// are equivalent to Unix timestamp in milliseconds.
						const st = moment.utc(reading.startTimestamp);
						// Time reading is in the middle of the start and end timestamp
						const timeReading = st.add(moment.utc(reading.endTimestamp).diff(st) / 2);
						// The angular value is the date, internationalized.
						const thetaVal = timeReading.format('ddd, ll LTS');
						thetaData.push(thetaVal);
						// The scaling is the factor to change the reading by.
						const readingValue = reading.reading * scaling;
						rData.push(readingValue);
						hoverText.push(`<b> ${thetaVal} </b> <br> ${label}: ${readingValue.toPrecision(6)} ${unitLabel}`);
					});

					// This variable contains all the elements (plot values, line type, etc.) assigned to the data parameter of the Plotly object
					datasets.push({
						name: label,
						theta: thetaData,
						r: rData,
						text: hoverText,
						hoverinfo: 'text',
						type: 'scatterpolar',
						mode: 'lines',
						line: {
							shape: 'spline',
							width: 2,
							color: chartColors[colorIdx % chartColors.length]
						},
						fill: 'toself',
						fillcolor: chartColors[colorIdx++ % chartColors.length] + '1A',
					});
				}
			}
		}
	}

	let layout = {};
	// TODO See 3D code for functions that can be used for layout and notices.
	if (datasets.length === 0) {
		// There are no meters so tell user.
		// Customize the layout of the plot
		// See https://community.plotly.com/t/replacing-an-empty-graph-with-a-message/31497 for showing text not plot.
		layout = setHelpLayout(translate('select.meter.group'), 28);
	} else {
		// Plotly scatterpolar plots have the unfortunate attribute that if a smaller number of plotting
		// points is done first then that impacts the labeling of the polar coordinate where you can get
		// duplicated labels and the points on the separate lines are separated. It is unclear if this is
		// intentional or a bug that will go away. To deal with this, the lines are ordered by size.
		// Descending (reverse) sort datasets by size of readings. Use r but theta should be the same.
		datasets.sort((a, b) => {
			return b.r.length - a.r.length;
		});
		if (datasets[0].r.length === 0) {
			// The longest line (first one) has no data so there is no data in any of the lines.
			// Customize the layout of the plot
			// See https://community.plotly.com/t/replacing-an-empty-graph-with-a-message/31497 for showing text not plot.
			// There is no data so tell user - likely due to date range outside where readings.
			// Remove plotting data even though none there is an empty r & theta that gives empty graphic.
			datasets.splice(0, datasets.length);
			layout = setHelpLayout(translate('radar.no.data'), 28);
		} else {
			// Check if all the values for the dates are compatible. Plotly does not like having different dates in different
			// scatterpolar lines. Lots of attempts to get this to work failed so not going to allow since not that common.
			// Compare the dates (theta) for line with the max points (index 0) to see if it has all the points in all other lines.

			// We are removing the strict check here to allow partial generation as requested by user.
			// If data is mismatched, Plotly will handle it as best it can (likely plotting points at their respective angles).

			// Data available and okay so plot.
			// Maximum number of ticks, represents 12 months. Too many is cluttered so this seems good value.
			// Plotly shows less if only a few points.

			let yRange: [number, number] | undefined = undefined;
			if (yMin !== undefined || yMax !== undefined) {
				let calcMin = Number.MAX_VALUE;
				let calcMax = -Number.MAX_VALUE;

				// Only calculate if we need one of the bounds
				if (yMin === undefined || yMax === undefined) {
					for (const ds of datasets) {
						if (ds.r) {
							for (const val of ds.r) {
								if (typeof val === 'number') {
									if (val < calcMin) calcMin = val;
									if (val > calcMax) calcMax = val;
								}
							}
						}
					}
					// Fallbacks if no data found
					if (calcMin === Number.MAX_VALUE) calcMin = 0;
					if (calcMax === -Number.MAX_VALUE) calcMax = 10;
				}

				yRange = [
					yMin !== undefined ? yMin : calcMin,
					yMax !== undefined ? yMax : calcMax
				];
			}

			const maxTicks = 12;

			const uniqueThetas = new Set<string>();
			datasets.forEach(d => d.theta.forEach((t: string) => uniqueThetas.add(t)));

			const sortedCategories = Array.from(uniqueThetas).sort((a, b) => {
				const mA = moment(a, 'ddd, ll LTS');
				const mB = moment(b, 'ddd, ll LTS');
				return mA.valueOf() - mB.valueOf();
			});

			layout = {
				font: { family: 'Inter, sans-serif', color: isDarkMode ? 'white' : '#111111' },
				paper_bgcolor: 'transparent',
				plot_bgcolor: 'transparent',
				autosize: true,
				showlegend: true,
				legend: {
					x: 0,
					y: 1.1,
					orientation: 'h',
					font: { size: 12, color: isDarkMode ? '#FFFFFF' : '#374151' }
				},
				polar: {
					bgcolor: isDarkMode ? '#161b22' : '#FFFFFF',
					radialaxis: {
						title: { text: unitLabel, font: { size: 12, color: isDarkMode ? 'white' : '#111111' } },
						showgrid: true,
						gridcolor: isDarkMode ? '#334155' : '#D1D5DB',
						linecolor: isDarkMode ? '#475569' : '#9CA3AF',
						tickfont: { color: isDarkMode ? 'white' : '#111111', size: 11 },
						range: yRange,
						autorange: !yRange
					},
					angularaxis: {
						direction: 'clockwise',
						showgrid: true,
						gridcolor: isDarkMode ? '#334155' : '#D1D5DB',
						linecolor: isDarkMode ? '#475569' : '#9CA3AF',
						tickfont: { color: isDarkMode ? 'white' : '#111111', size: 11 },
						nticks: maxTicks,
						categoryorder: 'array',
						categoryarray: sortedCategories,
						rotation: rotation
					}
				},
				margin: {
					t: 40,
					b: 20,
					l: 40,
					r: 40
				}
			};
		}
	}

	// props.config.locale = state.options.selectedLanguage;
	return (
		<div style={{ width: '100%', height: '100%' }}>
			<Plot
				data={datasets}
				style={{ width: '100%', height: '100%' }}
				useResizeHandler={true}
				config={{
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
					responsive: true,
					locale: selectedLanguage,
					locales: Locales // makes locales available for use
				}}
				layout={layout}
			/>
		</div>
	);
}
